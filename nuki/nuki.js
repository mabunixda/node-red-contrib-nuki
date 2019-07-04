module.exports = function (RED) {

  "use strict";
  const bridgeAPI = require('nuki-bridge-api');
  const lockStates = bridgeAPI.lockState;
  const lockActions = bridgeAPI.lockAction;

  function getLockState(lockState) {
    for (var x in lockStates) {
      if (lockStates[x] === lockState)
        return x;
    }
    return undefined;
  }


  RED.httpAdmin.get('/nuki-bridge/list', function (req, res) {
    if (!req.query.id) {
      return res.json("");
    }

    var configNode = RED.nodes.getNode(req.query.id);
    var result = {
      state: 'error',
      msg: 'bridge not connected',
      items: []
    };

    if (configNode && configNode.bridge && configNode.nukis) {

      var data = [];
      for (var i = 0; i < configNode.nukis.length; ++i) {
        var n = configNode.nukis[i];
        var nuki = {};
        nuki.id = n.nukiId;
        nuki.name = n.name;

        data.push(nuki);
      }
      result = {
        state: 'ok',
        msg: 'got nuki list',
        items: data
      };
    }
    res.json(result)
  });


  function NukiBridge(config) {
    RED.nodes.createNode(this, config);

    var node = this;
    node.host = config.host;
    node.port = config.port;
    node._bridgeNodes = [];
    node._nukiNodes = [];
    node.nukis = [];

    node.bridge = bridgeAPI.Bridge(node.host, node.port, node.credentials.token);
    node.bridge.list().then(function getNuki(nukis) {
      node.nukis = nukis;
      node.log("Got " + node.nukis.length + " nukis from bridge " + node.host);
    });
  }

  NukiBridge.prototype.registerNukiNode = function (handler) {
    this._nukiNodes.push(handler);
  }
  NukiBridge.prototype.deregisterNukiNode = function (handler) {
    this._nukiNodes.forEach(function (node, i, nukiNodes) {
      if (node === handler) {
        nukiNodes.splice(i, 1);
      }
    });
  }

  NukiBridge.prototype.registerBridgeNode = function (handler) {
    this._bridgeNodes.push(handler);
  }
  NukiBridge.prototype.deregisterBridgeNode = function (handler) {
    this._bridgeNodes.forEach(function (node, i, bridgeNodes) {
      if (node === handler) {
        bridgeNodes.splice(i, 1);
      }
    });
  }
  NukiBridge.prototype.handleBridgeEvent = function (uuid, event) {
    var payload;
    try {
      payload = JSON.parse(event);
    } catch (err) {
      payload = event;
    }
    this.log("Bridge Payload: " + JSON.stringify(payload));
    for (var i = 0; i < this._bridgeNodes.length; i++) {
      if (this._bridgeNodes[i].id !== uuid) {
        continue;
      }
      var currentNode = this._bridgeNodes[i];
      var msg = {
        topic: payload.topic,
        bridge: currentNode.name
      }

      if (payload.topic.toLowerCase() === 'reboot') {
        this.bridge.reboot().then(function (response) {
          msg.payload = response;
          currentNode.send(msg);
        });
      } else if (payload.topic.toLowerCase() === 'fwupdate') {
        this.bridge.fwupdate().then(function (response) {
          msg.payload = response;
          currentNode.send(msg);
        })
      } else if (payload.topic.toLowerCase() === 'info') {
        this.bridge.info().then(function (response) {
          msg.payload = response;
          currentNode.send(msg);
        });
      } else if (payload.topic.toLowerCase() === 'log') {
        var offset = undefined;
        var count = undefined;
        this.bridge.log(offset, count).then(function (logLines) {
          msg.payload = logLines;
          currentNode.send(msg);
        })
      } else if (payload.topic.toLowerCase() === 'clearlog') {
        this.bridge.clearlog().then(function (response) {
          msg.payload = response;
          currentNode.send(msg);
        })
      }
      return;
    }
  }
  NukiBridge.prototype.handleEvent = function (uuid, event) {
    var payload;
    try {
      payload = JSON.parse(event);
    } catch (err) {
      payload = event;
    }
    this.log("Nuki Payload: " + JSON.stringify(payload));
    var msg = {
      topic: payload.topic,
    }

    for (var i = 0; i < this._nukiNodes.length; i++) {
      if (this._nukiNodes[i].id !== uuid) {
        continue;
      }
      var underControl = this._nukiNodes[i];
      for (var x = 0; x < this.nukis.length; ++x) {
        if (this.nukis[x].nukiId != underControl.nuki) {
          continue;
        }

        var currentNuki = this.nukis[x].nuki;
        msg.nuki = this.nukis[x].name;
        msg.nukiId = this.nukis[x].nukiId;

        if (payload.topic.toLowerCase() === 'lockaction') {
          var action = lockActions[payload.payload];
          currentNuki.lockState().then(function (lockState) {
            var state = getLockState(lockState);

            if (state === lockStates.UNCALIBRATED || state === lockStates.UNDEFINED) {
              // uncalibrated and undefined status should be avoided
              return;
            } else if (state === lockStates.LOCKED) {
              // try not to unlock when state is not locked
              if (!(action === lockActions.UNLOCK || action === lockActions.UNLATCH)) {
                return;
              }
            } else if (state === lockStates.UNLOCKED) {
              // try not to lock when it states other than locked
              if (!(action === lockActions.LOCK || action === lockActions.LOCK_N_GO)) {
                return;
              }
            } else {
              return;
            }
            currentNuki.lockAction(action).then(function (status) {
              msg.payload = status;
              underControl.send(msg);
            });
          });
        } else if (payload.topic.toLowerCase() === "lockstatus") {
          currentNuki.lockState().then(function (lockState) {
            var state = getLockState(lockState);
            msg.payload = {
              state: state,
              value: lockState
            };
            underControl.send(msg);
          });
        }
        return;
      }
    }
  }

  RED.nodes.registerType("nuki-bridge", NukiBridge, {
    credentials: {
      token: {
        type: "password"
      }
    }
  });

  function NukiLockControl(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.bridge = RED.nodes.getNode(config.bridge);
    node.nuki = config.nuki;
    if (node.bridge) {
      node.bridge.registerNukiNode(node);
      this.on('close', function (done) {
        if (node.bridge) {
          node.bridge.deregisterNukiNode(node);
        }
        done();
      });
      this.on('input', function (msg) {
        node.bridge.handleEvent(node.id, msg);
      });
    }
  }
  RED.nodes.registerType("nuki-lock-control", NukiLockControl);

  function NukiBridgeControl(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.bridge = RED.nodes.getNode(config.bridge);
    if (node.bridge) {
      node.bridge.registerBridgeNode(node);
      this.on('close', function (done) {
        if (node.bridge) {
          node.bridge.deregisterBridgeNode(node);
        }
        done();
      });
      this.on('input', function (msg) {
        node.bridge.handleBridgeEvent(node.id, msg);
      });
    }
  }
  RED.nodes.registerType("nuki-bridge-control", NukiBridgeControl);


}