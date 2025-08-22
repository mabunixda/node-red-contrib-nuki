/**
 * Node-RED Nuki Bridge Integration Module
 * Provides nodes for controlling Nuki bridges and smart locks
 */

const { setupRoutes } = require("./routes");
const { createNukiBridge } = require("./nukiBridge");
const { createNukiLockControl } = require("./nukiLockControl");
const { createNukiBridgeControl } = require("./nukiBridgeControl");

// Node type configurations
const NODE_TYPES = [
  {
    type: "nuki-bridge",
    factory: createNukiBridge,
    credentials: {
      token: { type: "password" },
      webToken: { type: "password" },
    },
  },
  {
    type: "nuki-lock-control",
    factory: createNukiLockControl,
  },
  {
    type: "nuki-bridge-control",
    factory: createNukiBridgeControl,
  },
];

/**
 * Main module registration function for Node-RED
 * @param {object} RED - Node-RED runtime object
 */
module.exports = function (RED) {
  "use strict";

  // Setup HTTP routes for callbacks
  setupRoutes(RED);

  // Register all node types
  NODE_TYPES.forEach(({ type, factory, credentials }) => {
    RED.nodes.registerType(type, factory(RED), credentials);
  });
};
