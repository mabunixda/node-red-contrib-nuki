const assert = require("assert");
const sinon = require("sinon");
const proxyquire = require("proxyquire");

describe("NukiBridge - Integration Tests", function () {
  let RED;
  let BridgeAPIStub;
  let WebNukiStub;
  let NukiBridge;

  beforeEach(function () {
    BridgeAPIStub = {
      Bridge: sinon.stub(),
    };

    WebNukiStub = sinon.stub();

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
      },
      log: {
        debug: sinon.stub(),
        error: sinon.stub(),
      },
    };

    const module = proxyquire("../nuki/nukiBridge.js", {
      "nuki-bridge-api": BridgeAPIStub,
      "nuki-web-api": WebNukiStub,
    });

    NukiBridge = module.NukiBridge;
  });

  describe("Bridge Initialization", function () {
    it("should initialize bridge with valid configuration", async function () {
      const mockBridge = {
        list: sinon.stub().resolves([
          { nukiId: "123", name: "Front Door" },
          { nukiId: "456", name: "Back Door" },
        ]),
        getCallbacks: sinon.stub().resolves([]),
      };

      BridgeAPIStub.Bridge.returns(mockBridge);

      const config = {
        host: "localhost",
        port: 8080,
        clearCallbacks: false,
      };

      const bridgeNode = new NukiBridge(RED, config);
      bridgeNode.credentials = { token: "test-token" };

      // Wait for async initialization
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert(BridgeAPIStub.Bridge.calledWith("localhost", 8080, "test-token"));
      assert(mockBridge.list.called);
      assert.strictEqual(bridgeNode.nukis.length, 2);
    });

    it("should clear callbacks when configured", async function () {
      const mockCallback = { remove: sinon.stub().resolves() };
      const mockBridge = {
        list: sinon.stub().resolves([]),
        getCallbacks: sinon.stub().resolves([mockCallback]),
      };

      BridgeAPIStub.Bridge.returns(mockBridge);

      const config = {
        host: "localhost",
        port: 8080,
        clearCallbacks: true,
      };

      const bridgeNode = new NukiBridge(RED, config);
      bridgeNode.credentials = { token: "test-token" };

      // Wait for async initialization
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert(mockBridge.getCallbacks.called);
      assert(mockCallback.remove.called);
    });

    it("should handle initialization errors gracefully", async function () {
      BridgeAPIStub.Bridge.throws(new Error("Network error"));

      const config = {
        host: "invalid-host",
        port: 8080,
      };

      const bridgeNode = new NukiBridge(RED, config);
      bridgeNode.credentials = { token: "test-token" };

      // Wait for async initialization
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert(RED.log.error.called);
      const errorCall = RED.log.error.getCall(0);
      assert(errorCall.args[0].includes("Failed to initialize bridge"));
    });
  });

  describe("Web API Integration", function () {
    beforeEach(function () {
      // Reset stubs for each test in this describe block
      WebNukiStub.resetHistory();
    });

    it("should initialize web API with valid token", function () {
      const config = {
        host: "localhost",
        port: 8080,
        webUpdateTimeout: 30,
      };

      const bridgeNode = new NukiBridge(RED, config);
      bridgeNode.credentials = { webToken: "web-token" };

      bridgeNode.initializeWebAPI();

      assert(WebNukiStub.calledWith("web-token"));
      assert(bridgeNode.timer);
    });

    it("should not initialize web API without token", function () {
      // Override the createNode to provide empty credentials
      const originalCreateNode = RED.nodes.createNode;
      RED.nodes.createNode = function (obj, config) {
        originalCreateNode(obj, config);
        obj.credentials = {}; // Empty credentials, no webToken
      };

      const config = {
        host: "localhost",
        port: 8080,
        webUpdateTimeout: 30,
      };

      const bridgeNode = new NukiBridge(RED, config);

      // Restore original createNode
      RED.nodes.createNode = originalCreateNode;

      // WebNuki should not have been called since no token provided
      assert(!WebNukiStub.called, "WebNuki should not be called without token");
      assert(!bridgeNode.timer, "Timer should not be set without token");
    });

    it("should not set timer when webUpdateTimeout is 0", function () {
      const config = {
        host: "localhost",
        port: 8080,
        webUpdateTimeout: 0,
      };

      const bridgeNode = new NukiBridge(RED, config);
      bridgeNode.credentials = { webToken: "web-token" };

      bridgeNode.initializeWebAPI();

      assert(WebNukiStub.calledWith("web-token"));
      assert(!bridgeNode.timer);
    });
  });

  describe("Node Management", function () {
    let bridgeNode;

    beforeEach(function () {
      const config = { host: "localhost", port: 8080 };
      bridgeNode = new NukiBridge(RED, config);
    });

    it("should register and manage Nuki nodes", function () {
      const nukiNode = { nukiId: "123" };
      const nukiNode2 = { nukiId: "456" };

      bridgeNode.registerNukiNode(nukiNode);
      bridgeNode.registerNukiNode(nukiNode2);

      assert.strictEqual(bridgeNode._nukiNodes.length, 2);
      assert(bridgeNode._nukiNodes.includes(nukiNode));
      assert(bridgeNode._nukiNodes.includes(nukiNode2));

      bridgeNode.deregisterNukiNode(nukiNode);
      assert.strictEqual(bridgeNode._nukiNodes.length, 1);
      assert(!bridgeNode._nukiNodes.includes(nukiNode));
      assert(bridgeNode._nukiNodes.includes(nukiNode2));
    });

    it("should register and manage bridge nodes", function () {
      const bridgeControlNode = { id: "bridge1" };
      const bridgeControlNode2 = { id: "bridge2" };

      bridgeNode.registerBridgeNode(bridgeControlNode);
      bridgeNode.registerBridgeNode(bridgeControlNode2);

      assert.strictEqual(bridgeNode._bridgeNodes.length, 2);
      assert(bridgeNode._bridgeNodes.includes(bridgeControlNode));
      assert(bridgeNode._bridgeNodes.includes(bridgeControlNode2));

      bridgeNode.deregisterBridgeNode(bridgeControlNode);
      assert.strictEqual(bridgeNode._bridgeNodes.length, 1);
      assert(!bridgeNode._bridgeNodes.includes(bridgeControlNode));
      assert(bridgeNode._bridgeNodes.includes(bridgeControlNode2));
    });
  });

  describe("Data Retrieval", function () {
    let bridgeNode;

    beforeEach(function () {
      const config = { host: "localhost", port: 8080 };
      bridgeNode = new NukiBridge(RED, config);

      bridgeNode.nukis = [
        { nukiId: "123", nuki: { name: "Front Door" } },
        { nukiId: "456", nuki: { name: "Back Door" } },
      ];

      bridgeNode._webNodes = [
        { nukiId: "123", nuki: { status: "online" } },
        { nukiId: "789", nuki: { status: "offline" } },
      ];
    });

    it("should find Nuki by ID", function () {
      const nuki = bridgeNode.getNuki("123");
      assert.deepStrictEqual(nuki, { name: "Front Door" });

      const notFound = bridgeNode.getNuki("999");
      assert.strictEqual(notFound, undefined);
    });

    it("should find node by Nuki ID", function () {
      const node = bridgeNode.getNode("123");
      assert.deepStrictEqual(node, { status: "online" });

      const notFound = bridgeNode.getNode("999");
      assert.strictEqual(notFound, undefined);
    });
  });

  describe("Callback Management", function () {
    let bridgeNode;

    beforeEach(function () {
      const config = { host: "localhost", port: 8080 };
      bridgeNode = new NukiBridge(RED, config);
    });

    it("should notify target Nuki node with message", function () {
      const targetNode = { send: sinon.stub() };
      bridgeNode._webNodes = [{ nukiId: "123", nuki: targetNode }];

      const message = { nukiId: "123", payload: { state: "unlocked" } };
      bridgeNode.notifyNukiNode(message);

      assert(targetNode.send.calledWith(message));
    });

    it("should handle notification to non-existent node", function () {
      const message = { nukiId: "999", payload: { state: "unlocked" } };

      // Should not throw
      bridgeNode.notifyNukiNode(message);
    });

    it("should register Nuki callbacks for all nodes", function () {
      const nukiNode1 = { attachHandlers: sinon.stub() };
      const nukiNode2 = { attachHandlers: sinon.stub() };

      bridgeNode._nukiNodes = [nukiNode1, nukiNode2];
      bridgeNode.registerNukiCallbacks();

      assert(nukiNode1.attachHandlers.called);
      assert(nukiNode2.attachHandlers.called);
    });
  });

  describe("Cleanup", function () {
    it("should clear timer on close", function (done) {
      const config = {
        host: "localhost",
        port: 8080,
        webUpdateTimeout: 30,
      };

      const bridgeNode = new NukiBridge(RED, config);
      bridgeNode.credentials = { webToken: "web-token" };
      bridgeNode.initializeWebAPI();

      const timer = bridgeNode.timer;
      assert(timer, "Timer should be set");

      // Manually call the close handler
      bridgeNode.on.getCalls().forEach((call) => {
        if (call.args[0] === "close") {
          const closeHandler = call.args[1];
          closeHandler(done);
        }
      });
    });
  });
});
