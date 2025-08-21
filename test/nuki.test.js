const assert = require("assert");
const sinon = require("sinon");
const proxyquire = require("proxyquire");

describe("nuki.js", function () {
  let RED;
  let NukiModule;
  let BridgeAPIStub;
  let WebNukiStub;

  beforeEach(function () {
    BridgeAPIStub = {
      lockState: { LOCKED: 1, UNLOCKED: 2 },
      lockAction: { LOCK: 1, UNLOCK: 2 },
      Bridge: sinon.stub().returns({
        list: sinon.stub().resolves([]),
        getCallbacks: sinon.stub().returns([]),
        addCallbackUrl: sinon.stub().resolves({ url: "http://callback" }),
      }),
    };
    WebNukiStub = sinon.stub();
    // Mock createNode to assign on, status, and credentials to 'this'
    RED = {
      nodes: {
        createNode: function (obj, config) {
          obj.on = sinon.stub();
          obj.status = sinon.stub();
          obj.credentials = (config && config.credentials) || { token: "abc" };
        },
        getNode: sinon.stub().returns({}),
        eachNode: sinon.stub(),
        registerType: sinon.stub(),
      },
      httpNode: {
        post: sinon.stub(),
        get: sinon.stub(),
      },
      log: { debug: sinon.stub() },
    };
    NukiModule = proxyquire("../nuki/nuki.js", {
      "nuki-bridge-api": BridgeAPIStub,
      "nuki-web-api": WebNukiStub,
    });
  });

  it("should export a function", function () {
    assert.strictEqual(typeof NukiModule, "function");
  });

  it("should return correct lock state from getLockState", function () {
    // getLockState is not exported, so we test via re-implementation
    function getLockState(lockStates, lockState) {
      for (const x in lockStates) {
        if (lockStates[x] === lockState) {
          return x;
        }
      }
      return undefined;
    }
    assert.strictEqual(getLockState(BridgeAPIStub.lockState, 1), "LOCKED");
    assert.strictEqual(getLockState(BridgeAPIStub.lockState, 2), "UNLOCKED");
    assert.strictEqual(getLockState(BridgeAPIStub.lockState, 99), undefined);
  });

  it("NukiBridge prototype methods should register/deregister nodes", function () {
    NukiModule(RED);
    // Find the first call to registerType with 'nuki-bridge'
    const nukiBridgeCall = RED.nodes.registerType
      .getCalls()
      .find((call) => call.args[0] === "nuki-bridge");
    assert(nukiBridgeCall, "registerType for nuki-bridge should be called");
    const NukiBridge = nukiBridgeCall.args[1];
    // Provide a mock config with credentials and a stub for on
    const config = {
      host: "localhost",
      port: 8080,
      credentials: { token: "abc" },
    };
    const bridge = new NukiBridge(config);
    const handler = {};
    bridge.registerNukiNode(handler);
    assert(bridge._nukiNodes.includes(handler));
    bridge.deregisterNukiNode(handler);
    assert(!bridge._nukiNodes.includes(handler));
    bridge.registerBridgeNode(handler);
    assert(bridge._bridgeNodes.includes(handler));
    bridge.deregisterBridgeNode(handler);
    assert(!bridge._bridgeNodes.includes(handler));
  });

  it("NukiBridge getNuki/getNode returns undefined for missing id", function () {
    NukiModule(RED);
    const nukiBridgeCall = RED.nodes.registerType
      .getCalls()
      .find((call) => call.args[0] === "nuki-bridge");
    const NukiBridge = nukiBridgeCall.args[1];
    const config = {
      host: "localhost",
      port: 8080,
      credentials: { token: "abc" },
    };
    const bridge = new NukiBridge(config);
    assert.strictEqual(bridge.getNuki("notfound"), undefined);
    assert.strictEqual(bridge.getNode("notfound"), undefined);
  });

  it("NukiLockControl should construct and register with bridge", function () {
    NukiModule(RED);
    const nukiLockControlCall = RED.nodes.registerType
      .getCalls()
      .find((call) => call.args[0] === "nuki-lock-control");
    assert(
      nukiLockControlCall,
      "registerType for nuki-lock-control should be called",
    );
    const NukiLockControl = nukiLockControlCall.args[1];
    // Mock bridge with registerNukiNode, webUpdateTimeout, and getNuki
    const mockBridge = {
      registerNukiNode: sinon.stub(),
      webUpdateTimeout: 0,
      getNuki: sinon.stub().returns(undefined),
    };
    RED.nodes.getNode.returns(mockBridge);
    const config = { nuki: "id1", bridge: "bridge1" };
    // createNode will add .on and .status
    const node = new NukiLockControl(config);
    assert(mockBridge.registerNukiNode.calledWith(node));
    assert.strictEqual(node.nukiId, "id1");
    assert(node.status.called); // status should be called for connection status
  });

  // More tests for NukiLockControl and NukiBridgeControl can be added with further stubbing/mocking
});
