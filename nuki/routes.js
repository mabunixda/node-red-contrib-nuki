/**
 * HTTP routes for Nuki Bridge   // Bridge callback endpoint
  RED.httpNode.post("/nuki-bridge/callback-bridge", (req, res) => {
    if (RED.log?.debug) {
      RED.log.debug("Bridge callback received");
    }

    if (!hasValidBody(req)) {
      sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return;
    }

    const payload = {
      state: {
        ...req.body,
        timestamp: createTimestamp(),
      },
    };

    res.sendStatus(HTTP_STATUS.OK);
    res.end();

    if (RED.log?.debug) {
      RED.log.debug(`Bridge payload: ${JSON.stringify(payload)}`);
    }dpoints
 */

const { HTTP_STATUS, TOPICS } = require("./constants");

/**
 * Creates an ISO timestamp string for the current time
 * @returns {string} ISO timestamp string
 */
const createTimestamp = () =>
  new Date().toISOString().substring(0, 19) + "+00:00";

/**
 * Validates if request has a body
 * @param {object} req - Express request object
 * @returns {boolean} True if request has a body
 */
const hasValidBody = (req) => req && req.body;

/**
 * Sends a standardized error response
 * @param {object} res - Express response object
 * @param {number} statusCode - HTTP status code
 */
const sendErrorResponse = (
  res,
  statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
) => {
  res.sendStatus(statusCode);
  res.end();
};

/**
 * Sets up HTTP routes for Nuki Bridge communication
 * @param {object} RED - Node-RED runtime object
 */
const setupRoutes = (RED) => {
  // Bridge callback endpoint
  RED.httpNode.post("/nuki-bridge/callback-bridge", (req, res) => {
    if (RED.log?.debug) {
      RED.log.debug("Bridge callback received");
    }

    if (!hasValidBody(req)) {
      sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return;
    }

    const payload = {
      state: {
        ...req.body,
        timestamp: createTimestamp(),
      },
    };

    res.sendStatus(HTTP_STATUS.OK);
    res.end();

    if (RED.log?.debug) {
      RED.log.debug(`Bridge payload: ${JSON.stringify(payload)}`);
    }
  });

  // Node callback endpoint
  RED.httpNode.post("/nuki-bridge/callback-node", (req, res) => {
    if (!hasValidBody(req)) {
      sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR);
      return;
    }

    const msg = {
      topic: TOPICS.LOCK_CALLBACK,
      nukiId: req.body.nukiId,
      payload: {
        ...req.body,
        timestamp: createTimestamp(),
      },
    };

    if (msg.payload.nukiId) {
      delete msg.payload.nukiId;
    }

    // More efficient node lookup with early return
    const nukiNodes = [];
    RED.nodes.eachNode((node) => {
      if (node.type === "nuki-lock-control" && node.nuki === msg.nukiId) {
        nukiNodes.push(node);
      }
    });

    // Send message to all matching nodes
    nukiNodes.forEach((node) => {
      try {
        const targetNode = RED.nodes.getNode(node.id);
        targetNode?.send(msg);
      } catch (error) {
        if (RED.log?.error) {
          RED.log.error(`Nuki node callback error: ${JSON.stringify(error)}`);
        }
      }
    });

    res.sendStatus(HTTP_STATUS.OK);
    res.end();
  });

  // List endpoint
  RED.httpNode.get("/nuki-bridge/list", (req, res) => {
    if (!req.query.id) {
      return res.json("");
    }

    const configNode = RED.nodes.getNode(req.query.id);
    let result = {
      state: "error",
      msg: "bridge not connected",
      items: [],
    };

    if (configNode?.bridge && configNode?.nukis) {
      const data = configNode.nukis.map((nuki) => ({
        id: nuki.nukiId,
        name: nuki.name,
      }));

      result = {
        state: "ok",
        msg: "got nuki list",
        items: data,
      };
    }

    res.json(result);
  });
};

module.exports = {
  setupRoutes,
  createTimestamp,
  hasValidBody,
  sendErrorResponse,
};
