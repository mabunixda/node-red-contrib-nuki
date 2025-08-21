/**
 * NukiBridgeControl class for managing Nuki bridge operations
 */

/**
 * NukiBridgeControl class for handling bridge-level operations
 */
class NukiBridgeControl {
  /**
   * Creates a new NukiBridgeControl instance
   * @param {object} RED - Node-RED runtime object
   * @param {object} config - Node configuration
   */
  constructor(RED, config) {
    RED.nodes.createNode(this, config);

    this.RED = RED;
    this.bridge = RED.nodes.getNode(config.bridge);

    this.setupNode();
  }

  /**
   * Sets up the node with event handlers and bridge registration
   */
  setupNode() {
    if (this.bridge) {
      this.bridge.registerBridgeNode(this);
    }

    this.setupEventHandlers();
    this.setupCallback();
  }

  /**
   * Sets up event handlers for the node
   */
  setupEventHandlers() {
    this.on("close", (done) => {
      if (this.bridge) {
        this.bridge.deregisterBridgeNode(this);
      }
      done();
    });

    this.on("input", (msg) => {
      this.handleBridgeEvent(msg);
    });
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
   * Sets up callback for bridge events
   */
  async setupCallback() {
    if (!this.bridge?.callbackHost) {
      return;
    }

    const url = `${this.bridge.callbackHost}/nuki-bridge/callback-bridge`;
    this.RED.log.debug(`bridge::adding callback to ${url}`);

    try {
      const res = await this.bridge.bridge.addCallbackUrl(url, false);

      if (!res?.url) {
        throw new Error(JSON.stringify(res));
      }

      this.RED.log.debug(
        `Callback (with URL ${res.url}) attached to Nuki bridge`,
      );
    } catch (error) {
      this.log(`Could not register callback: ${JSON.stringify(error)}`);
    }
  }

  /**
   * Clears all callbacks for the bridge
   */
  async clearCallbacks() {
    try {
      const callbacks = await this.bridge.bridge.getCallbacks(true);
      await Promise.all(callbacks.map((callback) => callback.remove()));
    } catch (error) {
      this.RED.log.error(`Failed to clear callbacks: ${error.message}`);
    }
  }

  /**
   * Handles incoming bridge events/messages
   * @param {object} event - Incoming event/message
   */
  async handleBridgeEvent(event) {
    let msg;

    try {
      msg = typeof event === "string" ? JSON.parse(event) : event;
    } catch (error) {
      msg = event;
    }

    const topic = msg.topic?.toLowerCase();

    switch (topic) {
      case "reboot":
        await this.handleReboot(msg);
        break;
      case "fwupdate":
        await this.handleFirmwareUpdate(msg);
        break;
      case "info":
        await this.handleInfo(msg);
        break;
      case "log":
        await this.handleLog(msg);
        break;
      case "clearlog":
        await this.handleClearLog(msg);
        break;
      case "list":
        await this.handleList(msg);
        break;
      case "setupcallback":
        await this.handleSetupCallback(msg);
        break;
      case "clearcallbacks":
        await this.handleClearCallbacks(msg);
        break;
      case "getcallbacks":
        await this.handleGetCallbacks(msg);
        break;
      default:
        this.warn(`Unknown bridge topic: ${topic}`);
    }
  }

  /**
   * Handles bridge reboot request
   * @param {object} msg - Message object
   */
  async handleReboot(msg) {
    try {
      const response = await this.bridge.bridge.reboot();
      msg.payload = response;
      this.send(msg);
    } catch (error) {
      msg.payload = { error: `Reboot failed: ${error.message}` };
      this.send(msg);
    }
  }

  /**
   * Handles firmware update request
   * @param {object} msg - Message object
   */
  async handleFirmwareUpdate(msg) {
    try {
      const response = await this.bridge.bridge.fwupdate();
      msg.payload = response;
      this.send(msg);
    } catch (error) {
      msg.payload = { error: `Firmware update failed: ${error.message}` };
      this.send(msg);
    }
  }

  /**
   * Handles bridge info request
   * @param {object} msg - Message object
   */
  async handleInfo(msg) {
    try {
      const response = await this.bridge.bridge.info();
      msg.payload = response;
      this.send(msg);
    } catch (error) {
      msg.payload = { error: `Info request failed: ${error.message}` };
      this.send(msg);
    }
  }

  /**
   * Handles bridge log request
   * @param {object} msg - Message object
   */
  async handleLog(msg) {
    try {
      const logLines = await this.bridge.bridge.log(undefined, undefined);
      msg.payload = logLines;
      this.send(msg);
    } catch (error) {
      msg.payload = { error: `Log request failed: ${error.message}` };
      this.send(msg);
    }
  }

  /**
   * Handles clear log request
   * @param {object} msg - Message object
   */
  async handleClearLog(msg) {
    try {
      const response = await this.bridge.bridge.clearlog();
      msg.payload = response;
      this.send(msg);
    } catch (error) {
      msg.payload = { error: `Clear log failed: ${error.message}` };
      this.send(msg);
    }
  }

  /**
   * Handles device list request
   * @param {object} msg - Message object
   */
  async handleList(msg) {
    try {
      const response = await this.bridge.bridge.list();
      msg.payload = response;
      this.send(msg);
    } catch (error) {
      msg.payload = { error: `List request failed: ${error.message}` };
      this.send(msg);
    }
  }

  /**
   * Handles setup callback request
   * @param {object} msg - Message object
   */
  async handleSetupCallback(msg) {
    await this.setupCallback();
    this.send(msg);
  }

  /**
   * Handles clear callbacks request
   * @param {object} msg - Message object
   */
  async handleClearCallbacks(msg) {
    await this.clearCallbacks();
    await this.setupCallback();
    msg.payload = "cleared and reset";
    this.send(msg);
  }

  /**
   * Handles get callbacks request
   * @param {object} msg - Message object
   */
  async handleGetCallbacks(msg) {
    try {
      const callbacks = await this.bridge.bridge.getCallbacks(true);
      msg.payload = callbacks;
      this.send(msg);
    } catch (error) {
      msg.payload = { error: `Get callbacks failed: ${error.message}` };
      this.send(msg);
    }
  }
}

/**
 * Factory function to create NukiBridgeControl instances
 * @param {object} RED - Node-RED runtime object
 * @returns {Function} Constructor function
 */
const createNukiBridgeControl = (RED) => {
  return function (config) {
    return new NukiBridgeControl(RED, config);
  };
};

module.exports = {
  NukiBridgeControl,
  createNukiBridgeControl,
};
