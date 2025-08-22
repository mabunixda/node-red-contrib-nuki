/**
 * NukiBridge class for managing Nuki Bridge connections
 */

const BridgeAPI = require("nuki-bridge-api");
const WebNuki = require("nuki-web-api");

/**
 * NukiBridge class for handling bridge connections and device management
 */
class NukiBridge {
  /**
   * Creates a new NukiBridge instance
   * @param {object} RED - Node-RED runtime object
   * @param {object} config - Node configuration
   */
  constructor(RED, config) {
    RED.nodes.createNode(this, config);

    this.RED = RED;
    this.host = config.host;
    this.port = config.port;
    this.webUpdateTimeout = config.webUpdateTimeout;
    this.callbackHost = config.callbackHost;
    this.clearCallbacks = config.clearCallbacks;

    this._bridgeNodes = [];
    this._nukiNodes = [];
    this._webNodes = [];
    this.nukis = [];

    this.setupEventHandlers();
    this.initializeBridge();
    this.initializeWebAPI();
  }

  /**
   * Sets up event handlers for the node
   */
  setupEventHandlers() {
    this.on("close", (done) => {
      if (this.timer) {
        clearInterval(this.timer);
      }
      done();
    });
  }

  /**
   * Initializes the bridge connection
   */
  async initializeBridge() {
    try {
      this.bridge = new BridgeAPI.Bridge(
        this.host,
        this.port,
        this.credentials.token,
      );

      if (this.clearCallbacks) {
        await this.clearBridgeCallbacks();
      }

      const nukis = await this.bridge.list();
      this.nukis = nukis;

      this.RED.log.debug(
        `Got ${this.nukis.length} nukis from bridge ${this.host} ` +
          `at already registered ${this._nukiNodes.length}`,
      );

      this.registerNukiCallbacks();
    } catch (error) {
      this.RED.log.error(`Failed to initialize bridge: ${error.message}`);
    }
  }

  /**
   * Initializes the web API if credentials are available
   */
  initializeWebAPI() {
    const { webToken } = this.credentials || {};

    if (webToken && webToken !== "") {
      this.web = new WebNuki(webToken);

      if (this.webUpdateTimeout > 0) {
        this.timer = setInterval(
          () => this.updateWebAPI(),
          this.webUpdateTimeout * 1000,
        );
      }
    }
  }

  /**
   * Notifies a Nuki node with a message
   * @param {object} msg - Message to send
   */
  notifyNukiNode(msg) {
    const targetNode = this.getNode(msg.nukiId);
    if (targetNode) {
      targetNode.send(msg);
    }
  }

  /**
   * Clears all callbacks from the bridge
   */
  async clearBridgeCallbacks() {
    try {
      const callbacks = await this.bridge.getCallbacks();
      await Promise.all(callbacks.map((callback) => callback.remove()));
    } catch (error) {
      this.RED.log.error(`Failed to clear callbacks: ${error.message}`);
    }
  }

  /**
   * Registers callbacks for all Nuki nodes
   */
  registerNukiCallbacks() {
    this._nukiNodes.forEach((node) => {
      node.attachHandlers();
    });
  }

  /**
   * Updates web API data
   */
  updateWebAPI() {
    const { webToken } = this.credentials || {};

    if (this.webUpdateTimeout <= 0 || !webToken || webToken === "") {
      return;
    }

    // Web API update logic will be implemented in the web API module
  }

  /**
   * Gets a Nuki device by ID
   * @param {string} nukiId - Nuki device ID
   * @returns {object|undefined} Nuki device or undefined
   */
  getNuki(nukiId) {
    const nukiData = this.nukis.find((nuki) => nuki.nukiId === nukiId);
    return nukiData?.nuki;
  }

  /**
   * Gets a node by Nuki ID
   * @param {string} nukiId - Nuki device ID
   * @returns {object|undefined} Node or undefined
   */
  getNode(nukiId) {
    const webNode = this._webNodes.find((node) => node.nukiId === nukiId);
    return webNode?.nuki;
  }

  /**
   * Registers a Nuki node
   * @param {object} handler - Node handler
   */
  registerNukiNode(handler) {
    this._nukiNodes.push(handler);
  }

  /**
   * Deregisters a Nuki node
   * @param {object} handler - Node handler
   */
  deregisterNukiNode(handler) {
    const index = this._nukiNodes.indexOf(handler);
    if (index !== -1) {
      this._nukiNodes.splice(index, 1);
    }
  }

  /**
   * Registers a bridge node
   * @param {object} handler - Node handler
   */
  registerBridgeNode(handler) {
    this._bridgeNodes.push(handler);
  }

  /**
   * Deregisters a bridge node
   * @param {object} handler - Node handler
   */
  deregisterBridgeNode(handler) {
    const index = this._bridgeNodes.indexOf(handler);
    if (index !== -1) {
      this._bridgeNodes.splice(index, 1);
    }
  }
}

/**
 * Factory function to create NukiBridge instances
 * @param {object} RED - Node-RED runtime object
 * @returns {Function} Constructor function
 */
const createNukiBridge = (RED) => {
  return function (config) {
    return new NukiBridge(RED, config);
  };
};

module.exports = {
  NukiBridge,
  createNukiBridge,
};
