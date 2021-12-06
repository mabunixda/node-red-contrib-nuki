module.exports = function(RED) {
  'use strict';
  const BridgeAPI = require('nuki-bridge-api');
  const webNuki = require('nuki-web-api');

  const lockStates = BridgeAPI.lockState;
  const lockActions = BridgeAPI.lockAction;

  /**
   * function to filter lockstate
   * @param {map} lockState current lockstate as number
   * @return {lockStates} undefined or nuki lockstate of enum
   */
  function getLockState(lockState) {
    for (const x in lockStates) {
      if (lockStates[x] === lockState) {
        return x;
      }
    }
    return undefined;
  }


  RED.httpAdmin.get('/nuki-bridge/list', function(req, res) {
    if (!req.query.id) {
      return res.json('');
    }

    const configNode = RED.nodes.getNode(req.query.id);
    let result = {
      state: 'error',
      msg: 'bridge not connected',
      items: [],
    };

    if (configNode && configNode.bridge && configNode.nukis) {
      const data = [];
      for (let i = 0; i < configNode.nukis.length; ++i) {
        const n = configNode.nukis[i];
        const nuki = {};
        nuki.id = n.nukiId;
        nuki.name = n.name;
        data.push(nuki);
      }
      result = {
        state: 'ok',
        msg: 'got nuki list',
        items: data,
      };
    }
    res.json(result);
  });

  /**
   * nuki bridge item
   * @param {map} config nudered configuration
   * @constructor
   */
  function NukiBridge(config) {
    RED.nodes.createNode(this, config);

    const node = this;
    node.host = config.host;
    node.port = config.port;
    node._bridgeNodes = [];
    node._nukiNodes = [];
    node.nukis = [];


    node.bridge = new BridgeAPI.Bridge(node.host,
        node.port,
        node.credentials.token);
    node.log("generated bridge:" + node.credentials)
    if('webToken' in node.credentials) {
      node.log("generating web interaction")
      node.web = new webNuki(node.credentials.webToken)
      node.web.getNotification().then(notifications => {
        node.readNotifications(notifications);
      }).catch(err => {
        node.log('getWebApi(): Error retrieving notifications: ' + err.message);
      });
    }
    node.bridge.list().then(function listNukis(nukis) {
      node.nukis = nukis;
      node.log('Got ' + node.nukis.length +
                ' nukis from bridge '+ node.host +
                ' at already registered ' + node._nukiNodes.length);
      for (let x = 0; x < node._nukiNodes.length; ++x) {
        const current = node._nukiNodes[x];
        current.attachHandlers();
      }
    });
  }

  NukiBridge.prototype.readNotifications = function(notifications) {
    console.log(JSON.stringify(notification))
  }

  NukiBridge.prototype.getNuki = function(nukiId) {
    const node = this;
    for (let x = 0; x <node.nukis.length; ++x) {
      if (node.nukis[x].nukiId == nukiId) {
        return node.nukis[x].nuki;
      }
    }
    return undefined;
  };

  NukiBridge.prototype.registerNukiNode = function(handler) {
    this._nukiNodes.push(handler);
  };
  NukiBridge.prototype.deregisterNukiNode = function(handler) {
    this._nukiNodes.forEach(function(node, i, nukiNodes) {
      if (node === handler) {
        nukiNodes.splice(i, 1);
      }
    });
  };

  NukiBridge.prototype.registerBridgeNode = function(handler) {
    this._bridgeNodes.push(handler);
  };
  NukiBridge.prototype.deregisterBridgeNode = function(handler) {
    this._bridgeNodes.forEach(function(node, i, bridgeNodes) {
      if (node === handler) {
        bridgeNodes.splice(i, 1);
      }
    });
  };


  RED.nodes.registerType('nuki-bridge', NukiBridge, {
    credentials: {
      token: {
        type: 'password',
      },
      webToken: {
        type: 'password',
      }
    },
  });

  /**
   * nuki lock node
   * @param {map} config nodered configuration
   */
  function NukiLockControl(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.bridge = RED.nodes.getNode(config.bridge);
    node.nukiId = config.nuki;
    node.attachHandlers();

    if (node.bridge) {
      node.bridge.registerNukiNode(node);
      this.on('close', function(done) {
        if (node.bridge) {
          node.bridge.deregisterNukiNode(node);
        }
        done();
      });
      this.on('input', function(msg) {
        node.handleEvent(msg);
      });
    }
  }
  RED.nodes.registerType('nuki-lock-control', NukiLockControl);

  NukiLockControl.prototype.attachHandlers = function() {
    const node = this;
    const currentNuki = node.bridge.getNuki(node.nukiId);
    if (!currentNuki) {
      return;
    }
    currentNuki.on('action',
        function gotAction(state, response) {
          node.log('action: ' + state);
          msg = {payload:
                  {
                    state: state,
                    response: response,
                  },
          };
          node.send(msg);
        });
    currentNuki.on(BridgeAPI.lockState.LOCKED,
        function gotLocked(response) {
          node.log('locked ' + response);
          msg = {payload:
                  {
                    state: BridgeAPI.lockAction.LOCKED,
                    response: response,
                  },
          };
          node.send(msg);
        });
    currentNuki.on(BridgeAPI.lockState.UNLOCKED,
        function gotUnLocked(response) {
          node.log('unlocked ' + response);

          msg = {payload:
                  {
                    state: BridgeAPI.lockAction.LOCKED,
                    response: response,
                  },
          };
          node.send(msg);
        });
  };

  NukiLockControl.prototype.handleEvent = function(event) {
    let msg;
    const node = this;
    try {
      msg = JSON.parse(event);
    } catch (err) {
      msg = event;
    }
    node.log('Nuki Payload: ' + JSON.stringify(msg));

    const currentNuki = node.bridge.getNuki(node.nukiId);
    msg.nuki = currentNuki.name;
    msg.nukiId = node.nukiId;

    if (msg.topic.toLowerCase() === 'lockaction') {
      const action = lockActions[msg.payload];
      if (action === undefined || action === null) {
        node.warn('Could not transform payload into action: ' +
          msg.payload);
        return;
      }
      currentNuki.lockState().then(function(lockState) {
        const state = getLockState(lockState);
        node.log('current lock state: ' + state + '(' + lockState + ')' +
        ', action is ' + action + '(' + msg.payload + ')');
        if (lockState === lockStates.UNCALIBRATED ||
          lockState === lockStates.UNDEFINED) {
          // uncalibrated and undefined status should be avoided
          msg.payload = {'error':
            'could not process action! lock is in state ' + lockState};
          node.send(msg);
          return;
        }

        currentNuki.lockAction(action).then(function(status) {
          msg.payload = status;
          node.send(msg);
          return;
        }).catch(function(err) {
          msg.payload = {'error': 'failed sending lock action command'};
          node.send(msg);
          return;
        });
      }).catch(function(err) {
        msg.payload = {'error': 'can not get lock state'};
        node.send(msg);
        return;
      });
    } else if (msg.topic.toLowerCase() === 'lockstatus') {
      currentNuki.lockState().then(function(lockState) {
        const state = getLockState(lockState);
        msg.payload = {
          state: state,
          value: lockState,
        };

        if('web'  in node.bridge === false) {
          node.log("no web defined in bridge")
          node.send(msg);
          return;
        }

        node.bridge.web.getSmartlock(node.nukiId).then(function(res) {
            msg.payload.webState = res;
            node.send(msg);
          }).catch(function(err) {
            msg.payload = {'error': 'could not get web lock state: ' + err }
            node.log(msg.payload)
            node.send(msg)
          });
      }).catch(function(err) {
        msg.payload = {'error': 'can not get lock state: ' + err};
        node.log(msg.payload)
        node.send(msg);
        return;
      });
    }
  };

  /**
   * control a nuki bridge
   * @constructor
   * @param {map} config nodered configuration item
   */
  function NukiBridgeControl(config) {
    RED.nodes.createNode(this, config);
    const node = this;
    node.bridge = RED.nodes.getNode(config.bridge);
    if (node.bridge) {
      node.bridge.registerBridgeNode(node);
      this.on('close', function(done) {
        if (node.bridge) {
          node.bridge.deregisterBridgeNode(node);
        }
        done();
      });
      this.on('input', function(msg) {
        node.handleBridgeEvent(msg);
      });
    }
  }
  RED.nodes.registerType('nuki-bridge-control', NukiBridgeControl);

  NukiBridgeControl.prototype.handleBridgeEvent = function(event) {
    let msg;
    try {
      msg = JSON.parse(event);
    } catch (err) {
      msg = event;
    }
    const node = this;
    msg.bridgeName=node.name;

    if (msg.topic.toLowerCase() === 'reboot') {
      node.bridge.bridge.reboot().then(function(response) {
        msg.payload = response;
        node.send(msg);
      });
    } else if (msg.topic.toLowerCase() === 'fwupdate') {
      node.bridge.bridge.fwupdate().then(function(response) {
        msg.payload = response;
        node.send(msg);
      });
    } else if (msg.topic.toLowerCase() === 'info') {
      node.bridge.bridge.info().then(function(response) {
        msg.payload = response;
        node.send(msg);
      });
    } else if (msg.topic.toLowerCase() === 'log') {
      const offset = undefined;
      const count = undefined;
      node.bridge.bridge.log(offset, count).then(function(logLines) {
        msg.payload = logLines;
        node.send(msg);
      });
    } else if (msg.topic.toLowerCase() === 'clearlog') {
      node.bridge.bridge.clearlog().then(function(response) {
        msg.payload = response;
        node.send(msg);
      });
    } else if (msg.topic.toLowerCase() === 'list') {
      node.bridge.bridge.list().then(function(response) {
        msg.payload = response;
        node.send(msg);
      });
    }
  };
};
