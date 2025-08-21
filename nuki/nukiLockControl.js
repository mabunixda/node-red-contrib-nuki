/**
 * NukiLockControl class for managing individual Nuki smart locks
 */

const BridgeAPI = require("nuki-bridge-api");
const { getLockState } = require("./utils/lockState");

/**
 * NukiLockControl class for handling individual lock operations
 */
class NukiLockControl {
  /**
   * Creates a new NukiLockControl instance
   * @param {object} RED - Node-RED runtime object
   * @param {object} config - Node configuration
   */
  constructor(RED, config) {
    RED.nodes.createNode(this, config);

    this.RED = RED;
    this.nukiId = config.nuki;
    this.bridge = RED.nodes.getNode(config.bridge);

    this.setupNode();
  }

  /**
   * Sets up the node with event handlers and bridge registration
   */
  setupNode() {
    if (this.bridge) {
      this.bridge.registerNukiNode(this);
    }

    this.attachHandlers();
    this.setupEventHandlers();
    this.setupWebAPITimer();
  }

  /**
   * Sets up event handlers for the node
   */
  setupEventHandlers() {
    this.on("close", (done) => {
      if (this.bridge) {
        this.bridge.deregisterNukiNode(this);
      }
      if (this.timer) {
        clearInterval(this.timer);
      }
      done();
    });

    this.on("input", (msg) => {
      this.handleEvent(msg);
    });
  }

  /**
   * Sets up web API update timer if configured
   */
  setupWebAPITimer() {
    if (this.bridge?.webUpdateTimeout > 0) {
      this.timer = setInterval(
        () => this.updateWebAPI(),
        this.bridge.webUpdateTimeout * 1000,
      );
    }
  }

  /**
   * Sets connection status message
   * @param {string} color - Status color
   * @param {string} text - Status text
   * @param {string} shape - Status shape (default: 'dot')
   */
  setConnectionStatusMsg(color, text, shape = "dot") {
    this.status({
      fill: color,
      shape,
      text,
    });
  }

  /**
   * Attaches handlers and callbacks for the Nuki device
   */
  async attachHandlers() {
    if (!this.bridge) {
      this.setConnectionStatusMsg("red", "Cannot access bridge");
      return;
    }

    this.setConnectionStatusMsg("blue", "");
    const currentNuki = this.bridge.getNuki(this.nukiId);

    if (!currentNuki) {
      this.setConnectionStatusMsg(
        "orange",
        "attachHandlers::Could not get Nuki",
      );
      return;
    }

    this.setConnectionStatusMsg("green", "");

    if (!this.bridge.callbackHost) {
      this.setConnectionStatusMsg("green", "web api is not connected");
      setTimeout(() => {
        this.setConnectionStatusMsg("green", "");
      }, 1000);
      return;
    }

    await this.setupCallback(currentNuki);
  }

  /**
   * Sets up callback for the Nuki device
   * @param {object} currentNuki - Current Nuki device
   */
  async setupCallback(currentNuki) {
    const url = `${this.bridge.callbackHost}/nuki-bridge/callback-node`;
    this.RED.log.debug(`node::adding callback to ${url}`);

    try {
      if (this.clearCallbacks) {
        await this.clearCallbacks();
      }

      const callbackRes = await currentNuki.addCallbackUrl(url, false);

      if (!callbackRes?.url) {
        throw new Error(JSON.stringify(callbackRes));
      }

      this.RED.log.debug(
        `Callback (with URL ${callbackRes.url}) attached to Nuki node`,
      );
      this.setupCallbackHandlers(callbackRes);
    } catch (error) {
      this.log(`Callback not attached due to error: ${JSON.stringify(error)}`);
    }
  }

  /**
   * Sets up callback event handlers
   * @param {object} callbackRes - Callback response object
   */
  setupCallbackHandlers(callbackRes) {
    callbackRes.on("action", (state, response) => {
      const msg = {
        payload: {
          state,
          response,
        },
      };
      this.send(msg);
    });

    callbackRes.on(BridgeAPI.lockState.LOCKED, (response) => {
      const msg = {
        payload: {
          state: BridgeAPI.lockAction.LOCKED,
          response,
        },
      };
      this.send(msg);
    });

    callbackRes.on(BridgeAPI.lockState.UNLOCKED, (response) => {
      const msg = {
        payload: {
          state: BridgeAPI.lockAction.LOCKED,
          response,
        },
      };
      this.send(msg);
    });
  }

  /**
   * Clears all callbacks for this device
   */
  async clearCallbacks() {
    const currentNuki = this.bridge.getNuki(this.nukiId);

    if (!currentNuki) {
      this.warn("Could not get nuki");
      return;
    }

    try {
      const callbacks = await currentNuki.getCallbacks();
      await Promise.all(callbacks.map((callback) => callback.remove()));
    } catch (error) {
      this.RED.log.error(`Failed to clear callbacks: ${error.message}`);
    }
  }

  /**
   * Updates web API data for this device
   */
  async updateWebAPI() {
    const { webToken } = this.bridge?.credentials || {};

    if (this.bridge?.webUpdateTimeout <= 0 || !webToken) {
      return;
    }

    try {
      const res = await this.bridge.web.getSmartlock(this.nukiId);

      if (this.webState?.state?.state === res.state.state) {
        return;
      }

      const msg = {
        topic: "webUpdate",
        nukiId: this.nukiId,
        nukiName: this.name,
        payload: {
          webState: res.state,
        },
      };

      this.send(msg);
      this.webState = res;
    } catch (error) {
      this.log(
        `${this.nukiId}-error: could not get web lock state: ${JSON.stringify(error)}`,
      );
    }
  }

  /**
   * Handles incoming events/messages
   * @param {object} event - Incoming event/message
   */
  async handleEvent(event) {
    let msg;

    try {
      msg = typeof event === "string" ? JSON.parse(event) : event;
    } catch (error) {
      msg = event;
    }

    const currentNuki = this.bridge.getNuki(this.nukiId);

    if (!currentNuki) {
      this.warn("Could not get nuki");
      return;
    }

    msg.nukiId = this.nukiId;
    msg.nukiName = this.name;

    const topic = msg.topic?.toLowerCase();

    switch (topic) {
      case "lockaction":
        await this.handleLockAction(msg, currentNuki);
        break;
      case "lockstatus":
        await this.handleLockStatus(msg, currentNuki);
        break;
      case "webinfo":
        this.handleWebInfo(msg);
        break;
      case "clearcallbacks":
        await this.handleClearCallbacks(msg);
        break;
      case "setupcallback":
        await this.handleSetupCallback(msg);
        break;
      case "getcallbacks":
        await this.handleGetCallbacks(msg, currentNuki);
        break;
      default:
        this.warn(`Unknown topic: ${topic}`);
    }
  }

  /**
   * Handles lock action requests
   * @param {object} msg - Message object
   * @param {object} currentNuki - Current Nuki device
   */
  async handleLockAction(msg, currentNuki) {
    const BridgeAPI = require("nuki-bridge-api");
    const action = BridgeAPI.lockAction[msg.payload];

    if (!action) {
      this.warn(
        `Could not transform payload into action: ${JSON.stringify(msg.payload)}`,
      );
      return;
    }

    try {
      const lockState = await currentNuki.lockState();

      if (
        lockState === BridgeAPI.lockState.UNCALIBRATED ||
        lockState === BridgeAPI.lockState.UNDEFINED
      ) {
        msg.payload = {
          error: `could not process action! lock is in state ${lockState}`,
        };
        this.send(msg);
        return;
      }

      const status = await currentNuki.lockAction(action);
      msg.payload = status;
      this.send(msg);
    } catch (error) {
      msg.payload = {
        error: `failed sending lock action command: ${JSON.stringify(error)}`,
      };
      this.send(msg);
    }
  }

  /**
   * Handles lock status requests
   * @param {object} msg - Message object
   * @param {object} currentNuki - Current Nuki device
   */
  async handleLockStatus(msg, currentNuki) {
    try {
      const lockState = await currentNuki.lockState();
      const state = getLockState(BridgeAPI.lockState, lockState);
      const webState = this.webState?.state;

      msg.payload = {
        state,
        value: lockState,
        webState,
      };

      this.send(msg);
    } catch (error) {
      msg.payload = {
        error: `can not get lock state: ${JSON.stringify(error)}`,
      };
      this.send(msg);
    }
  }

  /**
   * Handles web info requests
   * @param {object} msg - Message object
   */
  handleWebInfo(msg) {
    msg.payload = this.webState;
    this.send(msg);
  }

  /**
   * Handles clear callbacks requests
   * @param {object} msg - Message object
   */
  async handleClearCallbacks(msg) {
    await this.clearCallbacks();
    msg.payload = "cleared";
    this.send(msg);
  }

  /**
   * Handles setup callback requests
   * @param {object} msg - Message object
   */
  async handleSetupCallback(msg) {
    await this.attachHandlers();
    this.send(msg);
  }

  /**
   * Handles get callbacks requests
   * @param {object} msg - Message object
   * @param {object} currentNuki - Current Nuki device
   */
  async handleGetCallbacks(msg, currentNuki) {
    try {
      const callbacks = await currentNuki.getCallbacks(true);
      msg.payload = callbacks;
      this.send(msg);
    } catch (error) {
      this.RED.log.error(`Failed to get callbacks: ${error.message}`);
    }
  }
}

/**
 * Factory function to create NukiLockControl instances
 * @param {object} RED - Node-RED runtime object
 * @returns {Function} Constructor function
 */
const createNukiLockControl = (RED) => {
  return function (config) {
    return new NukiLockControl(RED, config);
  };
};

module.exports = {
  NukiLockControl,
  createNukiLockControl,
};
