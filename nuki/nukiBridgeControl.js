/**
 * Simplified Bridge Control with efficient operation handling
 */
const { STATUS_COLORS, STATUS_SHAPES, DEFAULTS } = require("./constants");

class NukiBridgeControl {
  constructor(RED, config) {
    RED.nodes.createNode(this, config);

    this.bridge = RED.nodes.getNode(config.bridge);
    if (!this.bridge) {
      this.status({
        fill: STATUS_COLORS.RED,
        shape: STATUS_SHAPES.RING,
        text: "Missing bridge config",
      });
      return;
    }

    // Efficient bridge handlers mapping for cleaner dispatch
    this.BRIDGE_HANDLERS = {
      info: this.handleInfo.bind(this),
      list: this.handleList.bind(this),
      reboot: this.handleReboot.bind(this),
      fwupdate: this.handleFwUpdate.bind(this),
      addcallback: this.handleAddCallback.bind(this),
      listcallback: this.handleListCallback.bind(this),
      deletecallback: this.handleDeleteCallback.bind(this),
      log: this.handleLog.bind(this),
    };

    // Register with bridge and setup input handler
    this.bridge.registerBridgeNode(this);
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
    const handler = this.BRIDGE_HANDLERS[topic];

    if (!handler) {
      this.sendResponse(msg, `Unknown topic: ${topic}`, true);
      return;
    }

    try {
      await handler(msg);
    } catch (error) {
      this.error(error.message);
      this.sendResponse(msg, `Bridge operation failed: ${error.message}`, true);
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
   * Generic bridge operation executor - reduces code duplication
   */
  async executeBridgeOperation(operation, ...args) {
    if (!this.bridge?.bridge?.[operation]) {
      throw new Error(`Bridge operation '${operation}' not available`);
    }
    return await this.bridge.bridge[operation](...args);
  }

  /**
   * Bridge operation handlers - simplified and efficient
   */
  async handleInfo(msg) {
    try {
      const result = await this.executeBridgeOperation("info");
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(
        msg,
        `Failed to get bridge info: ${error.message}`,
        true,
      );
    }
  }

  async handleList(msg) {
    try {
      const result = await this.executeBridgeOperation("list");
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(msg, `Failed to list devices: ${error.message}`, true);
    }
  }

  async handleReboot(msg) {
    try {
      const result = await this.executeBridgeOperation("reboot");
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(msg, `Failed to reboot bridge: ${error.message}`, true);
    }
  }

  async handleFwUpdate(msg) {
    try {
      const result = await this.executeBridgeOperation("fwupdate");
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(
        msg,
        `Failed to update firmware: ${error.message}`,
        true,
      );
    }
  }

  async handleAddCallback(msg) {
    try {
      const url = msg.payload?.url || this.bridge.callbackHost;
      const result = await this.executeBridgeOperation("addCallbackUrl", url);
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(msg, `Failed to add callback: ${error.message}`, true);
    }
  }

  async handleListCallback(msg) {
    try {
      const result = await this.executeBridgeOperation("listCallbackUrl");
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(
        msg,
        `Failed to list callbacks: ${error.message}`,
        true,
      );
    }
  }

  async handleDeleteCallback(msg) {
    try {
      const id = msg.payload?.id;
      if (!id) {
        this.sendResponse(msg, "Callback ID required", true);
        return;
      }
      const result = await this.executeBridgeOperation("deleteCallbackUrl", id);
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(
        msg,
        `Failed to delete callback: ${error.message}`,
        true,
      );
    }
  }

  async handleLog(msg) {
    try {
      const { count = DEFAULTS.LOG_COUNT, offset = DEFAULTS.LOG_OFFSET } =
        msg.payload || {};
      const result = await this.executeBridgeOperation("log", offset, count);
      this.sendResponse(msg, result);
    } catch (error) {
      this.sendResponse(
        msg,
        `Failed to get bridge log: ${error.message}`,
        true,
      );
    }
  }

  /**
   * Cleanup on node close
   */
  handleClose() {
    if (this.bridge?.unregisterBridgeNode) {
      this.bridge.unregisterBridgeNode(this);
    }
  }
}

/**
 * Factory function for Node-RED registration
 */
function createNukiBridgeControl(RED) {
  return function (config) {
    return new NukiBridgeControl(RED, config);
  };
}

module.exports = { NukiBridgeControl, createNukiBridgeControl };
