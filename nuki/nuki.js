module.exports = function(RED) {
  'use strict';
  const BridgeAPI = require('nuki-bridge-api');
  const WebNuki = require('nuki-web-api');
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

  RED.httpNode.post('/nuki-bridge/callback-bridge', function(req, res) {
    console.log('node::callback Got a request on a bridge');

    if (req && !req.body) {
      res.sendStatus(500);
      res.end();
      return;
    }
    const payload = {
      'state': {...req.body,
        'timestamp': new Date().toISOString().substr(0, 19) + '+00:00',
      },
    };
    res.sendStatus(200);
    res.end();

    console.log('bridge::Received payload via callback: ' + JSON.stringify(payload));
  });

  RED.httpNode.post('/nuki-bridge/callback-node', function(req, res) {
    if (req && !req.body) {
      res.sendStatus(500);
      res.end();
      return;
    }

    const msg = {
      'topic': 'lockCallback',
      'nukiId': req.body.nukiId,
      'payload': {...req.body,
        'timestamp': new Date().toISOString().substr(0, 19) + '+00:00',
      },
    };

    if (msg.payload.nukiId) {
      delete msg.payload.nukiId;
    }
    RED.nodes.eachNode(function(n) {
      if (n.type == 'nuki-lock-control') {
        try {
          if (n.nuki == msg.nukiId) {
            const x = RED.nodes.getNode(n.id);
            x.send(msg);
          }
        } catch (e) {
          console.log('nuki-node::callback::error at processing callback: ' + JSON.stringify(e));
        }
      }
    });
    res.sendStatus(200);
    res.end();
  });

  RED.httpNode.get('/nuki-bridge/list', function(req, res) {
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
    node.webUpdateTimeout = config.webUpdateTimeout;
    node.callbackHost = config.callbackHost;
    node.clearCallbacks = config.clearCallbacks;

    node._bridgeNodes = [];
    node._nukiNodes = [];
    node._webNodes = [];
    node.nukis = [];

    node.on('close', function(done) {
      if (node.timer) {
        clearInterval(node.timer);
      }
      done();
    });

    node.bridge = new BridgeAPI.Bridge(node.host,
        node.port,
        node.credentials.token);

    if (node.clearCallbacks) {
      node.clearCallbacks();
    }

    node.bridge.list().then(function listNukis(nukis) {
      node.nukis = nukis;
      RED.log.debug('Got ' + node.nukis.length +
        ' nukis from bridge ' + node.host +
        ' at already registered ' + node._nukiNodes.length);
      node.registerNukiCallbacks();
    });

    if ('webToken' in node.credentials && node.credentials.webToken != '') {
      node.web = new WebNuki(node.credentials.webToken);
      if (node.bridge.webUpdateTimeout > 0) {
        node.timer = setInterval(node.updateWebAPI, node.bridge.webUpdateTimeout * 1000, node);
      }
    }
  }

  RED.nodes.registerType('nuki-bridge', NukiBridge, {
    credentials: {
      token: {
        type: 'password',
      },
      webToken: {
        type: 'password',
      },
    },
  });

  NukiBridge.prototype.notifyNukiNode = function(msg) {
    const node = this;
    const current = node.getNode(msg.nukiId);
    current.send(msg);
  };

  NukiBridge.prototype.clearCallbacks = function() {
    const node = this;
    node.bridge.getCallbacks().map(function removeCallbacks(callback) {
      return callback.remove();
    });
  };

  NukiBridge.prototype.registerNukiCallbacks = function() {
    const node = this;
    node._nukiNodes.forEach(function(current) {
      current.attachHandlers();
    });
  };


  NukiBridge.prototype.updateWebAPI = function(node) {
    if (node.webUpdateTimeout <= 0 ||
      !('webToken' in node.credentials) ||
      node.credentials.webToken === '') {
      return;
    }
  };

  NukiBridge.prototype.getNuki = function(nukiId) {
    const node = this;
    for (let x = 0; x < node.nukis.length; ++x) {
      if (node.nukis[x].nukiId == nukiId) {
        return node.nukis[x].nuki;
      }
    }
    return undefined;
  };
  NukiBridge.prototype.getNode = function(nukiId) {
    const node = this;
    for (let x = 0; x < node._webNodes.length; ++x) {
      if (node._webNodes[x].nukiId == nukiId) {
        return node._webNodes[x].nuki;
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

  /**
   * nuki lock node
   * @param {map} config nodered configuration
   */
  function NukiLockControl(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.nukiId = config.nuki;
    node.clearCallbacks = node.clearCallbacks;

    node.bridge = RED.nodes.getNode(config.bridge);
    node.bridge.registerNukiNode(node);
    node.attachHandlers();
    node.on('close', function(done) {
      if (node.bridge) {
        node.bridge.deregisterNukiNode(node);
      }
      if (node.timer) {
        clearInterval(node.timer);
      }
      done();
    });
    node.on('input', function(msg) {
      node.handleEvent(msg);
    });

    if (node.bridge.webUpdateTimeout > 0) {
      node.timer = setInterval(node.updateWebAPI, node.bridge.webUpdateTimeout * 1000, node);
    }
  }

  RED.nodes.registerType('nuki-lock-control', NukiLockControl);

  NukiLockControl.prototype.setConnectionStatusMsg = function(color,
      text,
      shape) {
    shape = shape || 'dot';
    this.status({
      fill: color,
      shape: shape,
      text: text,
    });
  };

  NukiLockControl.prototype.attachHandlers = function() {
    const node = this;
    if (!node.bridge) {
      node.setConnectionStatusMsg('red', 'Cannot access bridge');
      return;
    }
    node.setConnectionStatusMsg('blue', '');
    const currentNuki = node.bridge.getNuki(node.nukiId);
    if (!currentNuki) {
      node.setConnectionStatusMsg('orange', 'attachHandlers::Could not get Nuki');
      return;
    }

    node.setConnectionStatusMsg('green', '');

    if (node.bridge === undefined || node.bridge.callbackHost == '') {
      node.setConnectionStatusMsg('green', 'web api is not connected');
      setTimeout(() => {
        node.setConnectionStatusMsg('green', '');
      }, 1000);
      return;
    }
    const url = node.bridge.callbackHost + '/nuki-bridge/callback-node';
    RED.log.debug('node::adding callback to ' + url);
    try {
      if (node.clearCallbacks) {
        node.clearCallbacks();
      }
      currentNuki.addCallbackUrl(url, false).then(function gotCallbackRegistered(res) {
        RED.log.debug('node::add-callback...' + JSON.stringify(res));
        if (!res || !res.url) {
          throw new Error(JSON.stringify(res));
        }
        RED.log.debug('Callback (with URL ' + res.url + ') attached to Nuki node');
        res.on('action',
            function gotAction(state, response) {
              msg = {
                payload: {
                  state: state,
                  response: response,
                },
              };
              node.send(msg);
            });
        res.on(BridgeAPI.lockState.LOCKED,
            function gotLocked(response) {
              msg = {
                payload: {
                  state: BridgeAPI.lockAction.LOCKED,
                  response: response,
                },
              };
              node.send(msg);
            });
        res.on(BridgeAPI.lockState.UNLOCKED,
            function gotUnLocked(response) {
              msg = {
                payload: {
                  state: BridgeAPI.lockAction.LOCKED,
                  response: response,
                },
              };
              node.send(msg);
            });
      }).catch((err) => {
        node.log('Callback not attached due to error. See debug log for details.' + JSON.stringify(err));
      });
    } catch (e) {
      node.log('Could not register callback: ' + JSON.stringify(e));
    }
  };

  NukiLockControl.prototype.clearCallbacks = function() {
    const node = this;
    const currentNuki = node.bridge.getNuki(node.nukiId);
    if (currentNuki === undefined) {
      node.warn('Could not get nuki');
      return;
    }
    currentNuki.getCallbacks().map(function removeCallbacks(callback) {
      return callback.remove();
    });
  };

  NukiLockControl.prototype.updateWebAPI = function(node) {
    if (node.bridge.webUpdateTimeout <= 0 ||
      !('webToken' in node.bridge.credentials) ||
      node.bridge.credentials.webToken === '') {
      return;
    }

    node.bridge.web.getSmartlock(node.nukiId).then(function(res) {
      try {
        if (node.webState !== undefined && node.webState.state.state == res.state.state) {
          return;
        }
        const msg = {
          topic: 'webUpdate',
          nukiId: node.nukiId,
          nukiName: node.name,
          payload: {
            webState: res.state,
          },
        };
        node.send(msg);
      } finally {
        node.webState = res;
      }
    }).catch((err) => {
      node.log(node.nukiId + '-error: could not get web lock state: ' + JSON.stringify(err));
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

    const currentNuki = node.bridge.getNuki(node.nukiId);
    if (currentNuki === undefined) {
      node.warn('Could not get nuki');
      return;
    }
    msg.nukiId = node.nukiId;
    msg.nukiName = node.name;

    if (msg.topic.toLowerCase() === 'lockaction') {
      const action = lockActions[msg.payload];
      if (action === undefined || action === null) {
        node.warn('Could not transform payload into action: ' +
          JSON.stringify(msg.payload));
        return;
      }
      currentNuki.lockState().then(function(lockState) {
        if (lockState === lockStates.UNCALIBRATED ||
          lockState === lockStates.UNDEFINED) {
          // uncalibrated and undefined status should be avoided
          msg.payload = {
            'error': 'could not process action! lock is in state ' + lockState,
          };
          node.send(msg);
          return;
        }
        currentNuki.lockAction(action).then(function(status) {
          msg.payload = status;
          node.send(msg);
          return;
        }).catch(function(err) {
          msg.payload = {
            'error': 'failed sending lock action command: ' + JSON.stringify(err),
          };
          node.send(msg);
          return;
        });
      }).catch(function(err) {
        msg.payload = {
          'error': 'can not get lock state: ' + JSON.stringify(err),
        };
        node.send(msg);
        return;
      });
    } else if (msg.topic.toLowerCase() === 'lockstatus') {
      currentNuki.lockState().then(function(lockState) {
        const state = getLockState(lockState);
        const webState = (node.webState !== undefined) ? node.webState.state : undefined;
        msg.payload = {
          state: state,
          value: lockState,
          webState: webState,
        };
        node.send(msg);
      }).catch(function(err) {
        msg.payload = {
          'error': 'can not get lock state: ' + JSON.stringify(err),
        };
        // node.log(msg.payload);
        node.send(msg);
        return;
      });
    } else if (msg.topic.toLowerCase() === 'webinfo') {
      msg.payload = node.webState;
      node.send(msg);
    } else if (msg.topic.toLowerCase() === 'clearcallbacks') {
      node.clearCallbacks();
      msg.payload = 'cleared';
      node.send(msg);
    } else if (msg.topic.toLowerCase() === 'setupcallback') {
      node.attachHandlers();
      node.send(msg);
    } else if (msg.topic.toLowerCase() === 'getcallbacks') {
      currentNuki.getCallbacks(true).then((callbacks) => {
        msg.payload = callbacks;
        node.send(msg);
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
    node.bridge.registerBridgeNode(node);
    node.on('close', function(done) {
      if (node.bridge) {
        node.bridge.deregisterBridgeNode(node);
      }
      done();
    });
    node.on('input', function(msg) {
      node.handleBridgeEvent(msg);
    });
    node.setupCallback();
  }

  NukiBridgeControl.prototype.setupCallback = function() {
    const node = this;
    if (node.bridge === undefined || node.bridge.callbackHost == '') {
      return;
    }
    const url = node.bridge.callbackHost + '/nuki-bridge/callback-bridge';
    RED.log.debug('bridge::adding callback to ' + url);
    node.bridge.bridge.addCallbackUrl(url, false).then(function gotCallbackRegistered(res) {
      RED.log.debug('bridge::add-callback...');
      if (!res || !res.url) {
        throw new Error(JSON.stringify(res));
      }
      RED.log.debug('Callback (with URL ' + res.url + ') attached to Nuki node');
    }).catch((e) => {
      node.log('Could not register callback: ' + JSON.stringify(e));
    });
  };

  RED.nodes.registerType('nuki-bridge-control', NukiBridgeControl);
  NukiBridgeControl.prototype.setConnectionStatusMsg = function(color,
      text,
      shape) {
    shape = shape || 'dot';
    this.status({
      fill: color,
      shape: shape,
      text: text,
    });
  };

  NukiBridgeControl.prototype.handleBridgeEvent = function(event) {
    let msg;
    try {
      msg = JSON.parse(event);
    } catch (err) {
      msg = event;
    }
    const node = this;

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
    } else if (msg.topic.toLowerCase() === 'setupcallback') {
      node.setupCallback();
      node.send(msg);
    } else if (msg.topic.toLowerCase() === 'clearcallbacks') {
      node.clearCallbacks();
      node.setupCallback();
      node.send(msg);
    } else if (msg.topic.toLowerCase() === 'getcallbacks') {
      node.bridge.bridge.getCallbacks(true).then((callbacks) => {
        msg.payload = callbacks;
        node.send(msg);
      });
    }
  };
};
