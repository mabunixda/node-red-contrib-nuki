/**
 * Validation utilities for Nuki Bridge Integration
 */

/**
 * Validates that a configuration object has required properties
 * @param {object} config - Configuration object to validate
 * @param {string[]} requiredProps - Array of required property names
 * @returns {object} Validation result with isValid boolean and missing array
 */
const validateConfig = (config, requiredProps) => {
  const missing = requiredProps.filter(prop => !config || !(prop in config) || config[prop] === '');
  return {
    isValid: missing.length === 0,
    missing,
  };
};

/**
 * Validates a Node-RED message object
 * @param {object} msg - Message object to validate
 * @returns {boolean} True if message is valid
 */
const validateMessage = (msg) => {
  return msg && typeof msg === 'object' && 'topic' in msg;
};

/**
 * Validates HTTP request body
 * @param {object} req - Express request object
 * @returns {boolean} True if request has valid body
 */
const validateRequestBody = (req) => {
  return req && req.body && typeof req.body === 'object';
};

/**
 * Validates Nuki ID format
 * @param {string} nukiId - Nuki device ID
 * @returns {boolean} True if ID is valid
 */
const validateNukiId = (nukiId) => {
  return nukiId && typeof nukiId === 'string' && nukiId.trim().length > 0;
};

module.exports = {
  validateConfig,
  validateMessage,
  validateRequestBody,
  validateNukiId,
};
