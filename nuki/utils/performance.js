/**
 * Performance utilities for monitoring and optimization
 */

/**
 * Simple performance timer for measuring operation duration
 */
class PerformanceTimer {
  constructor() {
    this.startTime = process.hrtime.bigint();
  }

  /**
   * Get elapsed time since timer creation
   * @returns {number} Elapsed time in milliseconds
   */
  elapsed() {
    const endTime = process.hrtime.bigint();
    return Number(endTime - this.startTime) / 1e6; // Convert nanoseconds to milliseconds
  }

  /**
   * Stop timer and return elapsed time
   * @returns {number} Elapsed time in milliseconds
   */
  stop() {
    return this.elapsed();
  }
}

/**
 * Decorator function to measure execution time of async functions
 * @param {Function} func - Function to wrap
 * @param {string} name - Name for logging
 * @param {object} logger - Logger object (optional)
 * @returns {Function} Wrapped function
 */
const withTiming = (func, name, logger) => {
  return async function(...args) {
    const timer = new PerformanceTimer();
    try {
      const result = await func.apply(this, args);
      const elapsed = timer.stop();
      if (logger && elapsed > 100) { // Only log slow operations
        logger.debug(`${name} completed in ${elapsed.toFixed(2)}ms`);
      }
      return result;
    } catch (error) {
      const elapsed = timer.stop();
      if (logger) {
        logger.error(`${name} failed after ${elapsed.toFixed(2)}ms: ${error.message}`);
      }
      throw error;
    }
  };
};

/**
 * Creates a debounced version of a function
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
const debounce = (func, delay) => {
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
};

/**
 * Creates a throttled version of a function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

module.exports = {
  PerformanceTimer,
  withTiming,
  debounce,
  throttle,
};
