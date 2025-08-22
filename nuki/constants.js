/**
 * Constants for Nuki Bridge Integration
 */

// Lock actions from Nuki Bridge API
const LOCK_ACTIONS = {
  LOCK: 1,
  UNLOCK: 2,
  UNLATCH: 3,
  LOCK_N_GO: 4,
  LOCK_N_GO_WITH_UNLATCH: 5,
};

// HTTP status codes
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500,
};

// Node status colors
const STATUS_COLORS = {
  GREEN: "green",
  RED: "red",
  ORANGE: "orange",
  BLUE: "blue",
  GREY: "grey",
};

// Node status shapes
const STATUS_SHAPES = {
  DOT: "dot",
  RING: "ring",
};

// Message topics
const TOPICS = {
  LOCK_CALLBACK: "lockCallback",
  LOCK_STATE: "lockState",
  LOCK: "lock",
  UNLOCK: "unlock",
  UNLATCH: "unlatch",
  CALIBRATE: "calibrate",
  INFO: "info",
  LIST: "list",
  REBOOT: "reboot",
  FW_UPDATE: "fwupdate",
};

// Default values
const DEFAULTS = {
  WEB_UPDATE_TIMEOUT: 30,
  BRIDGE_PORT: 8080,
  LOG_COUNT: 100,
  LOG_OFFSET: 0,
};

module.exports = {
  LOCK_ACTIONS,
  HTTP_STATUS,
  STATUS_COLORS,
  STATUS_SHAPES,
  TOPICS,
  DEFAULTS,
};
