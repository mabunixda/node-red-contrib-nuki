/**
 * Returns the lock state name for a given lock state value.
 * @param {object} lockStates - The lockStates enum from the Nuki API.
 * @param {number} lockState - The current lock state as a number.
 * @returns {string|undefined} The lock state name or undefined if not found.
 */
const getLockState = (lockStates, lockState) => {
  for (const [key, value] of Object.entries(lockStates)) {
    if (value === lockState) {
      return key;
    }
  }
  return undefined;
};

module.exports = {
  getLockState,
};
