const assert = require("assert");
const sinon = require("sinon");

describe("Error Handling & Edge Cases", function () {
  let RED;
  let mockBridge;

  beforeEach(function () {
    RED = {
      nodes: {
        createNode: function (obj, config) {
          obj.on = sinon.stub();
          obj.status = sinon.stub();
          obj.log = sinon.stub();
          obj.warn = sinon.stub();
          obj.error = sinon.stub();
          obj.send = sinon.stub();
          obj.credentials = { token: "test-token", webToken: "test-web-token" };
        },
        getNode: sinon.stub(),
      },
      log: { debug: sinon.stub(), error: sinon.stub() },
    };

    mockBridge = {
      registerNukiNode: sinon.stub(),
      registerBridgeNode: sinon.stub(),
      webUpdateTimeout: 0,
      getNuki: sinon.stub().returns({}),
      bridge: {
        lockState: sinon.stub(),
        lockAction: sinon.stub(),
        info: sinon.stub(),
        list: sinon.stub(),
      },
    };
  });

  describe("NukiLockControl Error Scenarios", function () {
    let NukiLockControl;

    beforeEach(function () {
      const module = require("../nuki/nukiLockControl.js");
      NukiLockControl = module.NukiLockControl;
    });

    it("should handle missing bridge configuration", function () {
      RED.nodes.getNode.returns(null);

      const config = { nuki: "lock1", bridge: "bridge1" };
      const instance = new NukiLockControl(RED, config);

      assert.strictEqual(instance.bridge, null);
      assert(
        instance.status.calledWith({
          fill: "red",
          shape: "ring",
          text: "Missing bridge config",
        }),
      );
    });

    it("should handle unknown topic gracefully", async function () {
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock1", bridge: "bridge1" };
      const instance = new NukiLockControl(RED, config);

      const msg = { topic: "invalidTopic" };
      await instance.handleInput(msg);

      assert.deepStrictEqual(msg.payload, {
        error: "Unknown topic: invalidTopic",
      });
      assert(instance.send.calledWith(msg));
    });

    it("should handle bridge operation failures", async function () {
      mockBridge.bridge.lockState.rejects(new Error("Network timeout"));
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock1", bridge: "bridge1" };
      const instance = new NukiLockControl(RED, config);

      const msg = { topic: "lockState" };
      await instance.handleInput(msg);

      assert(msg.payload.error.includes("Failed to get lock state"));
      assert(msg.payload.error.includes("Network timeout"));
      // Note: error() is called through the input handler, not directly
    });

    it("should handle missing bridge API methods", async function () {
      mockBridge.bridge = {}; // No methods available
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock1", bridge: "bridge1" };
      const instance = new NukiLockControl(RED, config);

      const msg = { topic: "lockState" };
      await instance.handleInput(msg);

      assert(msg.payload && msg.payload.error, "Should have error payload");
      assert(msg.payload.error.includes("Failed to get lock state"));
      assert(msg.payload.error.includes("lockState' not available"));
    });

    it("should handle bridge being null during operation", async function () {
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock1", bridge: "bridge1" };
      const instance = new NukiLockControl(RED, config);

      // Simulate bridge disconnection
      instance.bridge = null;

      const msg = { topic: "lock" };
      await instance.handleInput(msg);

      assert(msg.payload && msg.payload.error, "Should have error payload");
      assert(msg.payload.error.includes("Failed to lock"));
      assert(msg.payload.error.includes("lockAction' not available"));
    });

    it("should cleanup properly on node close", function () {
      mockBridge.unregisterNukiNode = sinon.stub();
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock1", bridge: "bridge1" };
      const instance = new NukiLockControl(RED, config);

      instance.handleClose();

      assert(mockBridge.unregisterNukiNode.calledWith(instance));
    });

    it("should handle cleanup when bridge has no unregister method", function () {
      delete mockBridge.unregisterNukiNode;
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock1", bridge: "bridge1" };
      const instance = new NukiLockControl(RED, config);

      // Should not throw
      instance.handleClose();
    });
  });

  describe("NukiBridgeControl Error Scenarios", function () {
    let NukiBridgeControl;

    beforeEach(function () {
      const module = require("../nuki/nukiBridgeControl.js");
      NukiBridgeControl = module.NukiBridgeControl;
    });

    it("should handle missing bridge configuration", function () {
      RED.nodes.getNode.returns(null);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      assert.strictEqual(instance.bridge, null);
      assert(
        instance.status.calledWith({
          fill: "red",
          shape: "ring",
          text: "Missing bridge config",
        }),
      );
    });

    it("should handle unknown bridge topic", async function () {
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      const msg = { topic: "invalidOperation" };
      await instance.handleInput(msg);

      assert.deepStrictEqual(msg.payload, {
        error: "Unknown topic: invalidOperation",
      });
      assert(instance.send.calledWith(msg));
    });

    it("should handle bridge operation timeouts", async function () {
      mockBridge.bridge.info.rejects(new Error("Operation timed out"));
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      const msg = { topic: "info" };
      await instance.handleInput(msg);

      assert(msg.payload.error.includes("Failed to get bridge info"));
      assert(msg.payload.error.includes("Operation timed out"));
    });

    it("should validate delete callback payload", async function () {
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      const msg = { topic: "deletecallback", payload: {} }; // Missing id
      await instance.handleDeleteCallback(msg);

      assert.deepStrictEqual(msg.payload, { error: "Callback ID required" });
      assert(instance.send.calledWith(msg));
    });

    it("should handle missing bridge API during operation", async function () {
      mockBridge.bridge = null;
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      const msg = { topic: "info" };
      await instance.handleInput(msg);

      assert(msg.payload && msg.payload.error, "Should have error payload");
      assert(msg.payload.error.includes("Failed to get bridge info"));
      assert(msg.payload.error.includes("info' not available"));
    });

    it("should handle log operation with default parameters", async function () {
      mockBridge.bridge.log = sinon
        .stub()
        .resolves({ entries: ["log1", "log2"] });
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      const msg = { topic: "log" }; // No payload
      await instance.handleLog(msg);

      assert(mockBridge.bridge.log.calledWith(0, 100)); // Default offset=0, count=100
      assert.deepStrictEqual(msg.payload, { entries: ["log1", "log2"] });
    });

    it("should cleanup properly on node close", function () {
      mockBridge.unregisterBridgeNode = sinon.stub();
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      instance.handleClose();

      assert(mockBridge.unregisterBridgeNode.calledWith(instance));
    });
  });

  describe("Concurrent Operations", function () {
    it("should handle multiple simultaneous lock operations", async function () {
      const { NukiLockControl } = require("../nuki/nukiLockControl.js");

      // Simulate slow bridge operations
      mockBridge.bridge.lockAction.callsFake(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ success: true }), 50),
          ),
      );
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock1", bridge: "bridge1" };
      const instance = new NukiLockControl(RED, config);

      const msg1 = { topic: "lock" };
      const msg2 = { topic: "unlock" };
      const msg3 = { topic: "lock" };

      // Start operations concurrently
      const promises = [
        instance.handleInput(msg1),
        instance.handleInput(msg2),
        instance.handleInput(msg3),
      ];

      await Promise.all(promises);

      // All operations should complete successfully
      assert.deepStrictEqual(msg1.payload, { success: true });
      assert.deepStrictEqual(msg2.payload, { success: true });
      assert.deepStrictEqual(msg3.payload, { success: true });

      // Bridge should have been called 3 times
      assert.strictEqual(mockBridge.bridge.lockAction.callCount, 3);
    });

    it("should handle mixed success and failure operations", async function () {
      const { NukiBridgeControl } = require("../nuki/nukiBridgeControl.js");

      mockBridge.bridge.info.resolves({ version: "1.0" });
      mockBridge.bridge.list.rejects(new Error("List failed"));
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      const msg1 = { topic: "info" };
      const msg2 = { topic: "list" };

      await Promise.all([
        instance.handleInput(msg1),
        instance.handleInput(msg2),
      ]);

      assert.deepStrictEqual(msg1.payload, { version: "1.0" });
      assert(msg2.payload.error.includes("Failed to list devices"));
    });
  });
});
