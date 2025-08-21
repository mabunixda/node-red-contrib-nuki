/**
 * Node-RED Nuki Bridge Integration Module
 * Provides nodes for controlling Nuki bridges and smart locks
 */

const { setupRoutes } = require("./routes");
const { createNukiBridge } = require("./nukiBridge");
const { createNukiLockControl } = require("./nukiLockControl");
const { createNukiBridgeControl } = require("./nukiBridgeControl");

/**
 * Main module registration function for Node-RED
 * @param {object} RED - Node-RED runtime object
 */
module.exports = function (RED) {
  "use strict";

  // Setup HTTP routes for callbacks
  setupRoutes(RED);

  // Register NukiBridge node type
  const NukiBridgeConstructor = createNukiBridge(RED);
  RED.nodes.registerType("nuki-bridge", NukiBridgeConstructor, {
    credentials: {
      token: {
        type: "password",
      },
      webToken: {
        type: "password",
      },
    },
  });

  // Register NukiLockControl node type
  const NukiLockControlConstructor = createNukiLockControl(RED);
  RED.nodes.registerType("nuki-lock-control", NukiLockControlConstructor);

  // Register NukiBridgeControl node type
  const NukiBridgeControlConstructor = createNukiBridgeControl(RED);
  RED.nodes.registerType("nuki-bridge-control", NukiBridgeControlConstructor);
};
