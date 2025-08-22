/**
 * Simplified Lock Control with efficient operation handling
 */
const {
  LOCK_ACTIONS,
  STATUS_COLORS,
  STATUS_SHAPES,
  TOPICS,
} = require("./constants");

class NukiLockControl {
  constructor(RED, config) {
    RED.nodes.createNode(this, config);

    this.nukiId = config.nuki;
    this.bridge = RED.nodes.getNode(config.bridge);

    if (!this.bridge) {
      this.status({
        fill: STATUS_COLORS.RED,
        shape: STATUS_SHAPES.RING,
        text: "Missing bridge config",
      });
      return;
    }

    // Efficient topic handlers mapping for cleaner dispatch
    this.TOPIC_HANDLERS = {
      [TOPICS.LOCK_STATE]: this.handleLockState.bind(this),
      [TOPICS.LOCK]: this.handleLock.bind(this),
      [TOPICS.UNLOCK]: this.handleUnlock.bind(this),
      [TOPICS.UNLATCH]: this.handleUnlatch.bind(this),
      [TOPICS.CALIBRATE]: this.handleCalibrate.bind(this),
      [TOPICS.INFO]: this.handleInfo.bind(this),
    };

    // Register with bridge and setup input handler
    this.bridge.registerNukiNode(this);
    this.nukiInfo = this.bridge.getNuki(this.nukiId) || {};

    this.on("input", this.handleInput.bind(this));
    this.on("close", this.handleClose.bind(this));

    this.status({
      fill: STATUS_COLORS.GREEN,
      shape: STATUS_SHAPES.DOT,
      text: "Ready",
    });
  }

  /**
   * Unified input handler using efficient topic dispatch
   */
  async handleInput(msg) {
    const topic = msg.topic;
    const handler = this.TOPIC_HANDLERS[topic];

    if (!handler) {
      this.sendResponse(msg, `Unknown topic: ${topic}`, true);
      return;
    }

    try {
      await handler(msg);
    } catch (error) {
      this.error(error.message);
      this.sendResponse(msg, `Lock operation failed: ${error.message}`, true);
    }
  }

  /**
   * Efficient response sender - unified method for all responses
   */
  sendResponse(msg, payload, isError = false) {
    msg.payload = isError ? { error: payload } : payload;
    this.send(msg);
  }

  /**
   * Generic lock operation executor - reduces code duplication
   */
  async executeLockOperation(operation, ...args) {
    if (!this.bridge?.bridge?.[operation]) {
      throw new Error(`Lock operation '${operation}' not available`);
    }
    return await this.bridge.bridge[operation](this.nukiId, ...args);
  }

  /**
   * Lock operation handlers - simplified and efficient
   */
  async handleLockState(msg) {
    try {
      const result = await this.executeLockOperation("lockState");
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(
        msg,
        `Failed to get lock state: ${error.message}`,
        true,
      );
    }
  }

  async handleLock(msg) {
    try {
      const result = await this.executeLockOperation(
        "lockAction",
        LOCK_ACTIONS.LOCK,
      );
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(msg, `Failed to lock: ${error.message}`, true);
    }
  }

  async handleUnlock(msg) {
    try {
      const result = await this.executeLockOperation(
        "lockAction",
        LOCK_ACTIONS.UNLOCK,
      );
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(msg, `Failed to unlock: ${error.message}`, true);
    }
  }

  async handleUnlatch(msg) {
    try {
      const result = await this.executeLockOperation(
        "lockAction",
        LOCK_ACTIONS.UNLATCH,
      );
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(msg, `Failed to unlatch: ${error.message}`, true);
    }
  }

  async handleCalibrate(msg) {
    try {
      const result = await this.executeLockOperation("calibrate");
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(msg, `Failed to calibrate: ${error.message}`, true);
    }
  }

  async handleInfo(msg) {
    try {
      const result = await this.executeLockOperation("info");
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(msg, `Failed to get lock info: ${error.message}`, true);
    }
  }

  /**
   * Cleanup on node close
   */
  handleClose() {
    if (this.bridge?.unregisterNukiNode) {
      this.bridge.unregisterNukiNode(this);
    }
  }
}

/**
 * Factory function for Node-RED registration
 */
function createNukiLockControl(RED) {
  return function (config) {
    return new NukiLockControl(RED, config);
  };
}

module.exports = { NukiLockControl, createNukiLockControl };
