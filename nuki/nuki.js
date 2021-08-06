module.exports = function(RED) {
  'use strict';
  const BridgeAPI = require('nuki-bridge-api');
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
    node.bridge.list().then(function GetNuki(nukis) {
      node.nukis = nukis;
      node.log('Got ' + node.nukis.length + ' nukis from bridge ' + node.host);
    });
  }

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
  NukiBridge.prototype.handleBridgeEvent = function(uuid, event) {
    let msg;
    try {
      msg = JSON.parse(event);
    } catch (err) {
      msg = event;
    }
    this.log('Bridge Payload: ' + JSON.stringify(msg));
    for (let i = 0; i < this._bridgeNodes.length; i++) {
      if (this._bridgeNodes[i].id !== uuid) {
        continue;
      }
      const currentNode = this._bridgeNodes[i];
      msg.bridge=currentNode.name;

      if (msg.topic.toLowerCase() === 'reboot') {
        this.bridge.reboot().then(function(response) {
          msg.payload = response;
          currentNode.send(msg);
        });
      } else if (msg.topic.toLowerCase() === 'fwupdate') {
        this.bridge.fwupdate().then(function(response) {
          msg.payload = response;
          currentNode.send(msg);
        });
      } else if (msg.topic.toLowerCase() === 'info') {
        this.bridge.info().then(function(response) {
          msg.payload = response;
          currentNode.send(msg);
        });
      } else if (msg.topic.toLowerCase() === 'log') {
        const offset = undefined;
        const count = undefined;
        this.bridge.log(offset, count).then(function(logLines) {
          msg.payload = logLines;
          currentNode.send(msg);
        });
      } else if (msg.topic.toLowerCase() === 'clearlog') {
        this.bridge.clearlog().then(function(response) {
          msg.payload = response;
          currentNode.send(msg);
        });
      } else if (msg.topic.toLowerCase() === 'list') {
        this.bridge.list().then(function(response) {
          msg.payload = response;
          currentNode.send(msg);
        });
      }
      return;
    }
  };
  NukiBridge.prototype.handleEvent = function(uuid, event) {
    let msg;
    const node = this;
    try {
      msg = JSON.parse(event);
    } catch (err) {
      msg = event;
    }
    node.log('Nuki Payload: ' + JSON.stringify(msg));

    for (let i = 0; i < this._nukiNodes.length; i++) {
      if (this._nukiNodes[i].id !== uuid) {
        continue;
      }
      const underControl = this._nukiNodes[i];
      for (let x = 0; x < this.nukis.length; ++x) {
        if (this.nukis[x].nukiId != underControl.nuki) {
          continue;
        }

        const currentNuki = this.nukis[x].nuki;
        msg.nuki = this.nukis[x].name;
        msg.nukiId = this.nukis[x].nukiId;

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
              underControl.send(msg);
              return;
            }

            currentNuki.lockAction(action).then(function(status) {
              msg.payload = status;
              underControl.send(msg);
              return;
            });
          });
        } else if (msg.topic.toLowerCase() === 'lockstatus') {
          currentNuki.lockState().then(function(lockState) {
            const state = getLockState(lockState);
            msg.payload = {
              state: state,
              value: lockState,
            };
            underControl.send(msg);
            return;
          });
        }
      }
    }
    msg.payload = {'error': 'Could not find a lock'};
    node.send(msg);
  };

  RED.nodes.registerType('nuki-bridge', NukiBridge, {
    credentials: {
      token: {
        type: 'password',
      },
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
    node.nuki = config.nuki;
    if (node.bridge) {
      node.bridge.registerNukiNode(node);
      this.on('close', function(done) {
        if (node.bridge) {
          node.bridge.deregisterNukiNode(node);
        }
        done();
      });
      this.on('input', function(msg) {
        node.bridge.handleEvent(node.id, msg);
      });
    }
  }
  RED.nodes.registerType('nuki-lock-control', NukiLockControl);

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
        node.bridge.handleBridgeEvent(node.id, msg);
      });
    }
  }
  RED.nodes.registerType('nuki-bridge-control', NukiBridgeControl);
};
