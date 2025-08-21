const assert = require("assert");
const sinon = require("sinon");
const proxyquire = require("proxyquire");

describe("Modular Components", function () {
  let RED;
  let BridgeAPIStub;

  beforeEach(function () {
    BridgeAPIStub = {
      lockState: { LOCKED: 1, UNLOCKED: 2, UNCALIBRATED: 253, UNDEFINED: 255 },
      lockAction: { LOCK: 1, UNLOCK: 2, UNLATCH: 3 },
    };

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
  });

  describe("NukiLockControl", function () {
    let NukiLockControl;
    let createNukiLockControl;

    beforeEach(function () {
      const module = proxyquire("../nuki/nukiLockControl.js", {
        "nuki-bridge-api": BridgeAPIStub,
      });
      NukiLockControl = module.NukiLockControl;
      createNukiLockControl = module.createNukiLockControl;
    });

    it("should create factory function", function () {
      assert.strictEqual(typeof createNukiLockControl, "function");
      const factory = createNukiLockControl(RED);
      assert.strictEqual(typeof factory, "function");
    });

    it("should create instance with proper initialization", function () {
      const mockBridge = {
        registerNukiNode: sinon.stub(),
        webUpdateTimeout: 0,
        getNuki: sinon.stub().returns({}),
        credentials: { webToken: "test" },
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock1", bridge: "bridge1" };
      const instance = new NukiLockControl(RED, config);

      assert.strictEqual(instance.nukiId, "lock1");
      assert.strictEqual(instance.bridge, mockBridge);
      assert(mockBridge.registerNukiNode.calledWith(instance));
    });

    it("should handle lock action request", async function () {
      const mockNuki = {
        lockState: sinon.stub().resolves(BridgeAPIStub.lockState.LOCKED),
        lockAction: sinon.stub().resolves({ success: true }),
      };
      const mockBridge = {
        registerNukiNode: sinon.stub(),
        webUpdateTimeout: 0,
        getNuki: sinon.stub().returns(mockNuki),
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock1", bridge: "bridge1" };
      const instance = new NukiLockControl(RED, config);

      const msg = {
        topic: "lockaction",
        payload: "LOCK",
        nukiId: "lock1",
        nukiName: "Test Lock",
      };

      await instance.handleLockAction(msg, mockNuki);

      assert(mockNuki.lockState.called);
      assert(mockNuki.lockAction.calledWith(BridgeAPIStub.lockAction.LOCK));
      assert(instance.send.calledWith(msg));
      assert.deepStrictEqual(msg.payload, { success: true });
    });

    it("should handle lock status request", async function () {
      const mockNuki = {
        lockState: sinon.stub().resolves(BridgeAPIStub.lockState.LOCKED),
      };
      const mockBridge = {
        registerNukiNode: sinon.stub(),
        webUpdateTimeout: 0,
        getNuki: sinon.stub().returns(mockNuki),
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock1", bridge: "bridge1" };
      const instance = new NukiLockControl(RED, config);
      instance.webState = { state: { batteryLevel: 50 } };

      const msg = {
        topic: "lockstatus",
        nukiId: "lock1",
        nukiName: "Test Lock",
      };

      await instance.handleLockStatus(msg, mockNuki);

      assert(mockNuki.lockState.called);
      assert(instance.send.calledWith(msg));
      assert.strictEqual(msg.payload.state, "LOCKED");
      assert.strictEqual(msg.payload.value, BridgeAPIStub.lockState.LOCKED);
    });

    it("should set connection status", function () {
      const mockBridge = {
        registerNukiNode: sinon.stub(),
        webUpdateTimeout: 0,
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: "lock1", bridge: "bridge1" };
      const instance = new NukiLockControl(RED, config);

      instance.setConnectionStatusMsg("green", "Connected");

      assert(
        instance.status.calledWith({
          fill: "green",
          shape: "dot",
          text: "Connected",
        }),
      );
    });
  });

  describe("NukiBridgeControl", function () {
    let NukiBridgeControl;
    let createNukiBridgeControl;

    beforeEach(function () {
      const module = proxyquire("../nuki/nukiBridgeControl.js", {});
      NukiBridgeControl = module.NukiBridgeControl;
      createNukiBridgeControl = module.createNukiBridgeControl;
    });

    it("should create factory function", function () {
      assert.strictEqual(typeof createNukiBridgeControl, "function");
      const factory = createNukiBridgeControl(RED);
      assert.strictEqual(typeof factory, "function");
    });

    it("should create instance with proper initialization", function () {
      const mockBridge = {
        registerBridgeNode: sinon.stub(),
        callbackHost: "http://localhost:3000",
        bridge: {
          addCallbackUrl: sinon.stub().resolves({ url: "http://callback" }),
        },
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      assert.strictEqual(instance.bridge, mockBridge);
      assert(mockBridge.registerBridgeNode.calledWith(instance));
    });

    it("should handle bridge info request", async function () {
      const mockBridge = {
        registerBridgeNode: sinon.stub(),
        bridge: {
          info: sinon.stub().resolves({ firmware: "2.13.4" }),
        },
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      const msg = { topic: "info" };
      await instance.handleInfo(msg);

      assert(mockBridge.bridge.info.called);
      assert(instance.send.calledWith(msg));
      assert.deepStrictEqual(msg.payload, { firmware: "2.13.4" });
    });

    it("should handle bridge list request", async function () {
      const mockDevices = [{ nukiId: 1, name: "Front Door" }];
      const mockBridge = {
        registerBridgeNode: sinon.stub(),
        bridge: {
          list: sinon.stub().resolves(mockDevices),
        },
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      const msg = { topic: "list" };
      await instance.handleList(msg);

      assert(mockBridge.bridge.list.called);
      assert(instance.send.calledWith(msg));
      assert.deepStrictEqual(msg.payload, mockDevices);
    });

    it("should handle bridge reboot request", async function () {
      const mockBridge = {
        registerBridgeNode: sinon.stub(),
        bridge: {
          reboot: sinon.stub().resolves({ success: true }),
        },
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      const msg = { topic: "reboot" };
      await instance.handleReboot(msg);

      assert(mockBridge.bridge.reboot.called);
      assert(instance.send.calledWith(msg));
      assert.deepStrictEqual(msg.payload, { success: true });
    });

    it("should handle error in bridge operation", async function () {
      const mockBridge = {
        registerBridgeNode: sinon.stub(),
        bridge: {
          info: sinon.stub().rejects(new Error("Network error")),
        },
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: "bridge1" };
      const instance = new NukiBridgeControl(RED, config);

      const msg = { topic: "info" };
      await instance.handleInfo(msg);

      assert(mockBridge.bridge.info.called);
      assert(instance.send.calledWith(msg));
      assert(msg.payload.error.includes("Network error"));
    });
  });

  describe("Utils - lockState", function () {
    let getLockState;

    beforeEach(function () {
      const module = require("../nuki/utils/lockState.js");
      getLockState = module.getLockState;
    });

    it("should return correct lock state name", function () {
      assert.strictEqual(
        getLockState(BridgeAPIStub.lockState, BridgeAPIStub.lockState.LOCKED),
        "LOCKED",
      );
      assert.strictEqual(
        getLockState(BridgeAPIStub.lockState, BridgeAPIStub.lockState.UNLOCKED),
        "UNLOCKED",
      );
    });

    it("should return undefined for unknown state", function () {
      assert.strictEqual(getLockState(BridgeAPIStub.lockState, 999), undefined);
    });
  });
});
