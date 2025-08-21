/**
 * HTTP routes for Nuki Bridge callbacks and API endpoints
 */

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
const sendErrorResponse = (res, statusCode = 500) => {
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
    console.log("node::callback Got a request on a bridge");

    if (!hasValidBody(req)) {
      sendErrorResponse(res, 500);
      return;
    }

    const payload = {
      state: {
        ...req.body,
        timestamp: createTimestamp(),
      },
    };

    res.sendStatus(200);
    res.end();

    console.log(
      `bridge::Received payload via callback: ${JSON.stringify(payload)}`,
    );
  });

  // Node callback endpoint
  RED.httpNode.post("/nuki-bridge/callback-node", (req, res) => {
    if (!hasValidBody(req)) {
      sendErrorResponse(res, 500);
      return;
    }

    const msg = {
      topic: "lockCallback",
      nukiId: req.body.nukiId,
      payload: {
        ...req.body,
        timestamp: createTimestamp(),
      },
    };

    if (msg.payload.nukiId) {
      delete msg.payload.nukiId;
    }

    RED.nodes.eachNode((node) => {
      if (node.type === "nuki-lock-control") {
        try {
          if (node.nuki === msg.nukiId) {
            const targetNode = RED.nodes.getNode(node.id);
            if (targetNode) {
              targetNode.send(msg);
            }
          }
        } catch (error) {
          console.log(
            `nuki-node::callback::error at processing callback: ${JSON.stringify(error)}`,
          );
        }
      }
    });

    res.sendStatus(200);
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
