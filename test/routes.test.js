const assert = require("assert");
const sinon = require("sinon");
const proxyquire = require("proxyquire");

describe("Routes - HTTP Endpoints", function () {
  let RED;
  let routes;
  let req, res;

  beforeEach(function () {
    req = {
      body: null,
      query: {},
    };

    res = {
      sendStatus: sinon.stub().returnsThis(),
      end: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis(),
    };

    RED = {
      httpNode: {
        post: sinon.stub(),
        get: sinon.stub(),
      },
      nodes: {
        eachNode: sinon.stub(),
        getNode: sinon.stub(),
      },
    };

    routes = require("../nuki/routes.js");
  });

  describe("setupRoutes", function () {
    it("should register all HTTP endpoints", function () {
      routes.setupRoutes(RED);

      assert(RED.httpNode.post.calledWith("/nuki-bridge/callback-bridge"));
      assert(RED.httpNode.post.calledWith("/nuki-bridge/callback-node"));
      assert(RED.httpNode.get.calledWith("/nuki-bridge/list"));
    });
  });

  describe("Bridge Callback Endpoint", function () {
    beforeEach(function () {
      routes.setupRoutes(RED);
      // Get the callback handler for bridge endpoint
      this.bridgeHandler = RED.httpNode.post
        .getCalls()
        .find(
          (call) => call.args[0] === "/nuki-bridge/callback-bridge",
        ).args[1];
    });

    it("should handle valid bridge callback", function () {
      req.body = { state: "connected", version: "1.0" };

      this.bridgeHandler(req, res);

      assert(res.sendStatus.calledWith(200));
      assert(res.end.called);
    });

    it("should reject requests without body", function () {
      req.body = null;

      this.bridgeHandler(req, res);

      assert(res.sendStatus.calledWith(500));
      assert(res.end.called);
    });

    it("should reject requests with undefined body", function () {
      req.body = undefined;

      this.bridgeHandler(req, res);

      assert(res.sendStatus.calledWith(500));
      assert(res.end.called);
    });
  });

  describe("Node Callback Endpoint", function () {
    beforeEach(function () {
      routes.setupRoutes(RED);
      // Get the callback handler for node endpoint
      this.nodeHandler = RED.httpNode.post
        .getCalls()
        .find((call) => call.args[0] === "/nuki-bridge/callback-node").args[1];
    });

    it("should handle valid node callback and notify target node", function () {
      req.body = {
        nukiId: "12345",
        state: "unlocked",
        timestamp: "2024-01-01T10:00:00Z",
      };

      const mockTargetNode = { send: sinon.stub() };
      const mockNode = {
        type: "nuki-lock-control",
        nuki: "12345",
        id: "node1",
      };

      RED.nodes.eachNode.callsArgWith(0, mockNode);
      RED.nodes.getNode.withArgs("node1").returns(mockTargetNode);

      this.nodeHandler(req, res);

      assert(res.sendStatus.calledWith(200));
      assert(mockTargetNode.send.called);

      const sentMessage = mockTargetNode.send.getCall(0).args[0];
      assert.strictEqual(sentMessage.topic, "lockCallback");
      assert.strictEqual(sentMessage.nukiId, "12345");
      assert(sentMessage.payload.state);
      assert(sentMessage.payload.timestamp);
    });

    it("should handle callback for non-existent node gracefully", function () {
      req.body = { nukiId: "99999", state: "locked" };

      const mockNode = {
        type: "nuki-lock-control",
        nuki: "12345",
        id: "node1",
      };
      RED.nodes.eachNode.callsArgWith(0, mockNode);
      RED.nodes.getNode.returns(null);

      this.nodeHandler(req, res);

      assert(res.sendStatus.calledWith(200));
      assert(res.end.called);
    });

    it("should reject requests without body", function () {
      req.body = null;

      this.nodeHandler(req, res);

      assert(res.sendStatus.calledWith(500));
      assert(res.end.called);
    });

    it("should handle errors during node processing", function () {
      req.body = { nukiId: "12345", state: "locked" };

      const mockNode = {
        type: "nuki-lock-control",
        nuki: "12345",
        id: "node1",
      };
      RED.nodes.eachNode.callsArgWith(0, mockNode);
      RED.nodes.getNode.throws(new Error("Node not found"));

      // Should not crash
      this.nodeHandler(req, res);

      assert(res.sendStatus.calledWith(200));
      assert(res.end.called);
    });
  });

  describe("List Endpoint", function () {
    beforeEach(function () {
      routes.setupRoutes(RED);
      // Get the handler for list endpoint
      this.listHandler = RED.httpNode.get
        .getCalls()
        .find((call) => call.args[0] === "/nuki-bridge/list").args[1];
    });

    it("should return empty response when no id provided", function () {
      req.query = {};

      this.listHandler(req, res);

      assert(res.json.calledWith(""));
    });

    it("should return error state when bridge not connected", function () {
      req.query = { id: "bridge1" };
      RED.nodes.getNode.returns(null);

      this.listHandler(req, res);

      const response = res.json.getCall(0).args[0];
      assert.strictEqual(response.state, "error");
      assert.strictEqual(response.msg, "bridge not connected");
      assert.deepStrictEqual(response.items, []);
    });

    it("should return nuki list when bridge connected", function () {
      req.query = { id: "bridge1" };

      const mockBridge = {
        bridge: {},
        nukis: [
          { nukiId: "123", name: "Front Door" },
          { nukiId: "456", name: "Back Door" },
        ],
      };

      RED.nodes.getNode.returns(mockBridge);

      this.listHandler(req, res);

      const response = res.json.getCall(0).args[0];
      assert.strictEqual(response.state, "ok");
      assert.strictEqual(response.msg, "got nuki list");
      assert.strictEqual(response.items.length, 2);
      assert.strictEqual(response.items[0].id, "123");
      assert.strictEqual(response.items[0].name, "Front Door");
    });
  });

  describe("Utility Functions", function () {
    it("createTimestamp should return ISO format string", function () {
      const timestamp = routes.createTimestamp();

      assert(typeof timestamp === "string");
      assert(timestamp.endsWith("+00:00"));
      assert(timestamp.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/));
    });

    it("hasValidBody should validate request bodies", function () {
      assert.deepStrictEqual(routes.hasValidBody({ body: { test: "data" } }), {
        test: "data",
      });
      assert.strictEqual(routes.hasValidBody({ body: null }), null);
      assert.strictEqual(routes.hasValidBody({ body: undefined }), undefined);
      assert.strictEqual(routes.hasValidBody(null), null);
      assert.strictEqual(routes.hasValidBody(undefined), undefined);
    });

    it("sendErrorResponse should send status and end response", function () {
      routes.sendErrorResponse(res, 404);

      assert(res.sendStatus.calledWith(404));
      assert(res.end.called);
    });

    it("sendErrorResponse should default to 500 status", function () {
      routes.sendErrorResponse(res);

      assert(res.sendStatus.calledWith(500));
      assert(res.end.called);
    });
  });
});
