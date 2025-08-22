/**
 * Base class for Nuki control nodes
 * Provides common functionality shared between lock and bridge control nodes
 */

/**
 * Base class for Nuki control nodes
 */
class BaseNukiControl {
  /**
   * Creates a new BaseNukiControl instance
   * @param {object} RED - Node-RED runtime object
   * @param {object} config - Node configuration
   */
  constructor(RED, config) {
    RED.nodes.createNode(this, config);

    this.RED = RED;
    this.bridge = RED.nodes.getNode(config.bridge);

    this.setupBaseNode();
  }

  /**
   * Sets up base node functionality
   */
  setupBaseNode() {
    this.setupEventHandlers();
    this.registerWithBridge();
  }

  /**
   * Sets up basic event handlers
   */
  setupEventHandlers() {
    this.on("close", (done) => {
      this.cleanup();
      done();
    });

    this.on("input", (msg) => {
      this.handleEvent(msg);
    });
  }

  /**
   * Registers this node with the bridge (to be overridden)
   */
  registerWithBridge() {
    // Override in subclasses
  }

  /**
   * Cleanup when node is closed (to be overridden)
   */
  cleanup() {
    // Override in subclasses
  }

  /**
   * Handle incoming events (to be overridden)
   * @param {object} event - Incoming event
   */
  handleEvent(event) {
    // Override in subclasses
    throw new Error("handleEvent must be implemented in subclass");
  }

  /**
   * Sets connection status message
   * @param {string} color - Status color
   * @param {string} text - Status text
   * @param {string} shape - Status shape (default: 'dot')
   */
  setConnectionStatusMsg(color, text, shape = "dot") {
    this.status({ fill: color, shape, text });
  }

  /**
   * Parse incoming message, handling both string and object formats
   * @param {string|object} event - Event to parse
   * @returns {object} Parsed message object
   */
  parseMessage(event) {
    try {
      return typeof event === "string" ? JSON.parse(event) : event;
    } catch (error) {
      return event;
    }
  }

  /**
   * Send error response
   * @param {object} msg - Message object
   * @param {string} error - Error message
   */
  sendError(msg, error) {
    msg.payload = { error };
    this.send(msg);
  }

  /**
   * Send successful response
   * @param {object} msg - Message object
   * @param {*} payload - Response payload
   */
  sendSuccess(msg, payload) {
    msg.payload = payload;
    this.send(msg);
  }
}

module.exports = { BaseNukiControl };
