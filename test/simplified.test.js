const assert = require('assert');
const sinon = require('sinon');

describe('Simplified Modular Components', function () {
  let RED;

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
          obj.credentials = { token: 'test-token', webToken: 'test-web-token' };
        },
        getNode: sinon.stub(),
      },
      log: { debug: sinon.stub(), error: sinon.stub() },
    };
  });

  describe('NukiLockControl', function () {
    it('should have factory function', function () {
      const { createNukiLockControl } = require('../nuki/nukiLockControl.js');
      assert.strictEqual(typeof createNukiLockControl, 'function');
      
      const factory = createNukiLockControl(RED);
      assert.strictEqual(typeof factory, 'function');
    });

    it('should create instance with proper initialization', function () {
      const { NukiLockControl } = require('../nuki/nukiLockControl.js');
      
      const mockBridge = {
        registerNukiNode: sinon.stub(),
        webUpdateTimeout: 0,
        getNuki: sinon.stub().returns({}),
        credentials: { webToken: 'test' },
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: 'lock1', bridge: 'bridge1' };
      const instance = new NukiLockControl(RED, config);

      assert.strictEqual(instance.nukiId, 'lock1');
      assert.strictEqual(instance.bridge, mockBridge);
      assert(mockBridge.registerNukiNode.calledWith(instance));
    });

    it('should use efficient response method', function () {
      const { NukiLockControl } = require('../nuki/nukiLockControl.js');
      
      const mockBridge = {
        registerNukiNode: sinon.stub(),
        webUpdateTimeout: 0,
        getNuki: sinon.stub().returns({}),
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { nuki: 'lock1', bridge: 'bridge1' };
      const instance = new NukiLockControl(RED, config);

      const msg = { topic: 'test' };
      instance.sendResponse(msg, 'success');
      
      assert.deepStrictEqual(msg.payload, 'success');
      assert(instance.send.calledWith(msg));
    });
  });

  describe('NukiBridgeControl', function () {
    it('should have factory function', function () {
      const { createNukiBridgeControl } = require('../nuki/nukiBridgeControl.js');
      assert.strictEqual(typeof createNukiBridgeControl, 'function');
      
      const factory = createNukiBridgeControl(RED);
      assert.strictEqual(typeof factory, 'function');
    });

    it('should create instance with proper initialization', function () {
      const { NukiBridgeControl } = require('../nuki/nukiBridgeControl.js');
      
      const mockBridge = {
        registerBridgeNode: sinon.stub(),
        callbackHost: 'http://localhost:3000',
        bridge: {
          addCallbackUrl: sinon.stub().resolves({ url: 'http://callback' }),
        },
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: 'bridge1' };
      const instance = new NukiBridgeControl(RED, config);

      assert.strictEqual(instance.bridge, mockBridge);
      assert(mockBridge.registerBridgeNode.calledWith(instance));
    });

    it('should use efficient bridge operation handler', async function () {
      const { NukiBridgeControl } = require('../nuki/nukiBridgeControl.js');
      
      const mockBridge = {
        registerBridgeNode: sinon.stub(),
        bridge: {
          info: sinon.stub().resolves({ firmware: '2.13.4' }),
          addCallbackUrl: sinon.stub().resolves({ url: 'http://callback' }),
        },
      };
      RED.nodes.getNode.returns(mockBridge);

      const config = { bridge: 'bridge1' };
      const instance = new NukiBridgeControl(RED, config);

      const result = await instance.executeBridgeOperation('info');
      assert.deepStrictEqual(result, { firmware: '2.13.4' });
      assert(mockBridge.bridge.info.called);
    });
  });

  describe('Utils - lockState', function () {
    it('should return correct lock state name efficiently', function () {
      const { getLockState } = require('../nuki/utils/lockState.js');
      const lockState = { LOCKED: 1, UNLOCKED: 2, UNCALIBRATED: 253, UNDEFINED: 255 };
      
      assert.strictEqual(getLockState(lockState, lockState.LOCKED), 'LOCKED');
      assert.strictEqual(getLockState(lockState, lockState.UNLOCKED), 'UNLOCKED');
      assert.strictEqual(getLockState(lockState, 999), undefined);
    });
  });
});
