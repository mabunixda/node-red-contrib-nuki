const assert = require("assert");
const sinon = require("sinon");

describe("Message Flow Integration Tests", function () {
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
        eachNode: sinon.stub(),
      },
      log: { debug: sinon.stub(), error: sinon.stub() },
      httpNode: {
        post: sinon.stub(),
        get: sinon.stub(),
      },
    };

    mockBridge = {
      registerNukiNode: sinon.stub(),
      registerBridgeNode: sinon.stub(),
      unregisterNukiNode: sinon.stub(),
      unregisterBridgeNode: sinon.stub(),
      webUpdateTimeout: 0,
      getNuki: sinon.stub().returns({}),
      bridge: {
        lockState: sinon.stub().resolves({ state: 1, stateName: "locked" }),
        lockAction: sinon.stub().resolves({ success: true }),
        info: sinon.stub().resolves({ version: "2.13.4" }),
        list: sinon.stub().resolves([{ nukiId: "123", name: "Test Lock" }]),
      },
    };
  });

  describe("Complete Lock Control Flow", function () {
    it("should handle full lock operation cycle", async function () {
      const { NukiLockControl } = require("../nuki/nukiLockControl.js");
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock123", bridge: "bridge1" };
      const lockControl = new NukiLockControl(RED, config);

      // Test lock state query
      const stateMsg = { topic: "lockState" };
      await lockControl.handleInput(stateMsg);

      assert(mockBridge.bridge.lockState.calledWith("lock123"));
      assert.deepStrictEqual(stateMsg.payload, {
        state: 1,
        stateName: "locked",
      });
      assert(lockControl.send.calledWith(stateMsg));

      // Test lock action
      const lockMsg = { topic: "lock" };
      await lockControl.handleInput(lockMsg);

      assert(mockBridge.bridge.lockAction.calledWith("lock123", 1));
      assert.deepStrictEqual(lockMsg.payload, { success: true });
      assert(lockControl.send.calledWith(lockMsg));

      // Verify node registration
      assert(mockBridge.registerNukiNode.calledWith(lockControl));
      assert.strictEqual(lockControl.nukiId, "lock123");
      assert.strictEqual(lockControl.bridge, mockBridge);
    });

    it("should handle full bridge control flow", async function () {
      const { NukiBridgeControl } = require("../nuki/nukiBridgeControl.js");
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const bridgeControl = new NukiBridgeControl(RED, config);

      // Test bridge info
      const infoMsg = { topic: "info" };
      await bridgeControl.handleInput(infoMsg);

      assert(mockBridge.bridge.info.called);
      assert.deepStrictEqual(infoMsg.payload, { version: "2.13.4" });
      assert(bridgeControl.send.calledWith(infoMsg));

      // Test device list
      const listMsg = { topic: "list" };
      await bridgeControl.handleInput(listMsg);

      assert(mockBridge.bridge.list.called);
      assert.deepStrictEqual(listMsg.payload, [
        { nukiId: "123", name: "Test Lock" },
      ]);
      assert(bridgeControl.send.calledWith(listMsg));

      // Verify node registration
      assert(mockBridge.registerBridgeNode.calledWith(bridgeControl));
      assert.strictEqual(bridgeControl.bridge, mockBridge);
    });
  });

  describe("HTTP Callback to Node Message Flow", function () {
    it("should route HTTP callback to correct lock control node", function () {
      const routes = require("../nuki/routes.js");
      routes.setupRoutes(RED);

      // Setup mock nodes
      const targetLockNode = { send: sinon.stub() };
      const otherLockNode = { send: sinon.stub() };

      const nodes = [
        { type: "nuki-lock-control", nuki: "lock123", id: "node1" },
        { type: "nuki-lock-control", nuki: "lock456", id: "node2" },
        { type: "other-node", id: "node3" },
      ];

      RED.nodes.eachNode.callsFake((callback) => {
        nodes.forEach(callback);
      });

      RED.nodes.getNode.withArgs("node1").returns(targetLockNode);
      RED.nodes.getNode.withArgs("node2").returns(otherLockNode);

      // Get the callback handler
      const callbackHandler = RED.httpNode.post
        .getCalls()
        .find((call) => call.args[0] === "/nuki-bridge/callback-node").args[1];

      // Simulate callback
      const req = {
        body: {
          nukiId: "lock123",
          state: 2,
          stateName: "unlocked",
          timestamp: "2024-01-01T10:00:00Z",
        },
      };

      const res = {
        sendStatus: sinon.stub().returnsThis(),
        end: sinon.stub().returnsThis(),
      };

      callbackHandler(req, res);

      // Verify correct node received message
      assert(targetLockNode.send.called);
      assert(!otherLockNode.send.called);

      const sentMsg = targetLockNode.send.getCall(0).args[0];
      assert.strictEqual(sentMsg.topic, "lockCallback");
      assert.strictEqual(sentMsg.nukiId, "lock123");
      assert.strictEqual(sentMsg.payload.state, 2);
      assert.strictEqual(sentMsg.payload.stateName, "unlocked");
      assert(sentMsg.payload.timestamp);

      // Verify HTTP response
      assert(res.sendStatus.calledWith(200));
      assert(res.end.called);
    });

    it("should handle bridge callback notification", function () {
      const routes = require("../nuki/routes.js");
      routes.setupRoutes(RED);

      // Get the bridge callback handler
      const bridgeHandler = RED.httpNode.post
        .getCalls()
        .find((call) => call.args[0] === "/nuki-bridge/callback-bridge")
        .args[1];

      const req = {
        body: {
          bridgeType: 1,
          state: "connected",
          versions: { firmwareVersion: "2.13.4" },
        },
      };

      const res = {
        sendStatus: sinon.stub().returnsThis(),
        end: sinon.stub().returnsThis(),
      };

      bridgeHandler(req, res);

      assert(res.sendStatus.calledWith(200));
      assert(res.end.called);
    });
  });

  describe("Multi-Node Scenarios", function () {
    it("should handle multiple lock controls with same bridge", async function () {
      const { NukiLockControl } = require("../nuki/nukiLockControl.js");
      RED.nodes.getNode.returns(mockBridge);

      // Create multiple lock control nodes
      const lock1 = new NukiLockControl(RED, {
        nuki: "lock1",
        bridge: "bridge1",
      });
      const lock2 = new NukiLockControl(RED, {
        nuki: "lock2",
        bridge: "bridge1",
      });
      const lock3 = new NukiLockControl(RED, {
        nuki: "lock3",
        bridge: "bridge1",
      });

      // Verify all registered with same bridge
      assert.strictEqual(mockBridge.registerNukiNode.callCount, 3);
      assert(mockBridge.registerNukiNode.calledWith(lock1));
      assert(mockBridge.registerNukiNode.calledWith(lock2));
      assert(mockBridge.registerNukiNode.calledWith(lock3));

      // Test operations on different locks
      const msg1 = { topic: "lockState" };
      const msg2 = { topic: "lock" };
      const msg3 = { topic: "unlock" };

      await Promise.all([
        lock1.handleInput(msg1),
        lock2.handleInput(msg2),
        lock3.handleInput(msg3),
      ]);

      // Verify correct nukiId passed to bridge
      assert(mockBridge.bridge.lockState.calledWith("lock1"));
      assert(mockBridge.bridge.lockAction.calledWith("lock2", 1)); // LOCK
      assert(mockBridge.bridge.lockAction.calledWith("lock3", 2)); // UNLOCK
    });

    it("should handle bridge controls with multiple bridges", async function () {
      const { NukiBridgeControl } = require("../nuki/nukiBridgeControl.js");

      const bridge1 = {
        registerBridgeNode: sinon.stub(),
        bridge: { info: sinon.stub().resolves({ id: 1 }) },
      };
      const bridge2 = {
        registerBridgeNode: sinon.stub(),
        bridge: { info: sinon.stub().resolves({ id: 2 }) },
      };

      RED.nodes.getNode.withArgs("bridge1").returns(bridge1);
      RED.nodes.getNode.withArgs("bridge2").returns(bridge2);

      const control1 = new NukiBridgeControl(RED, { bridge: "bridge1" });
      const control2 = new NukiBridgeControl(RED, { bridge: "bridge2" });

      assert(bridge1.registerBridgeNode.calledWith(control1));
      assert(bridge2.registerBridgeNode.calledWith(control2));
      assert.strictEqual(control1.bridge, bridge1);
      assert.strictEqual(control2.bridge, bridge2);

      // Test operations hit different bridges
      const msg1 = { topic: "info" };
      const msg2 = { topic: "info" };

      await Promise.all([
        control1.handleInput(msg1),
        control2.handleInput(msg2),
      ]);

      assert(bridge1.bridge.info.called);
      assert(bridge2.bridge.info.called);
      assert.deepStrictEqual(msg1.payload, { id: 1 });
      assert.deepStrictEqual(msg2.payload, { id: 2 });
    });
  });

  describe("Configuration Validation", function () {
    it("should validate lock control configuration", function () {
      const { NukiLockControl } = require("../nuki/nukiLockControl.js");

      // Test with valid config
      RED.nodes.getNode.returns(mockBridge);
      const validConfig = { nuki: "lock123", bridge: "bridge1" };
      const validNode = new NukiLockControl(RED, validConfig);

      assert.strictEqual(validNode.nukiId, "lock123");
      assert.strictEqual(validNode.bridge, mockBridge);
      assert(
        validNode.status.calledWith({
          fill: "green",
          shape: "dot",
          text: "Ready",
        }),
      );

      // Test with missing bridge
      RED.nodes.getNode.returns(null);
      const invalidConfig = { nuki: "lock123", bridge: "invalid" };
      const invalidNode = new NukiLockControl(RED, invalidConfig);

      assert.strictEqual(invalidNode.bridge, null);
      assert(
        invalidNode.status.calledWith({
          fill: "red",
          shape: "ring",
          text: "Missing bridge config",
        }),
      );
    });

    it("should validate bridge control configuration", function () {
      const { NukiBridgeControl } = require("../nuki/nukiBridgeControl.js");

      // Test with valid config
      RED.nodes.getNode.returns(mockBridge);
      const validConfig = { bridge: "bridge1" };
      const validNode = new NukiBridgeControl(RED, validConfig);

      assert.strictEqual(validNode.bridge, mockBridge);
      assert(
        validNode.status.calledWith({
          fill: "green",
          shape: "dot",
          text: "Ready",
        }),
      );

      // Test with missing bridge
      RED.nodes.getNode.returns(null);
      const invalidConfig = { bridge: "invalid" };
      const invalidNode = new NukiBridgeControl(RED, invalidConfig);

      assert.strictEqual(invalidNode.bridge, null);
      assert(
        invalidNode.status.calledWith({
          fill: "red",
          shape: "ring",
          text: "Missing bridge config",
        }),
      );
    });
  });

  describe("Node Lifecycle Management", function () {
    it("should properly manage lock control lifecycle", function () {
      const { NukiLockControl } = require("../nuki/nukiLockControl.js");
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock123", bridge: "bridge1" };
      const lockControl = new NukiLockControl(RED, config);

      // Verify registration
      assert(mockBridge.registerNukiNode.calledWith(lockControl));

      // Simulate close event
      lockControl.handleClose();

      // Verify cleanup
      assert(mockBridge.unregisterNukiNode.calledWith(lockControl));
    });

    it("should properly manage bridge control lifecycle", function () {
      const { NukiBridgeControl } = require("../nuki/nukiBridgeControl.js");
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const bridgeControl = new NukiBridgeControl(RED, config);

      // Verify registration
      assert(mockBridge.registerBridgeNode.calledWith(bridgeControl));

      // Simulate close event
      bridgeControl.handleClose();

      // Verify cleanup
      assert(mockBridge.unregisterBridgeNode.calledWith(bridgeControl));
    });
  });
});
