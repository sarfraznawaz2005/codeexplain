class Logger {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.level = options.level || 'info';
  }

  // Lazy logging - only executes callback if verbose is enabled
  logVerbose(callback) {
    if (this.verbose) {
      callback();
    }
  }

  // Lazy logging with message formatting
  verboseLog(message, ...args) {
    if (this.verbose) {
      console.log(message, ...args);
    }
  }

  // Standard logging methods
  info(message, ...args) {
    console.log(message, ...args);
  }

  warn(message, ...args) {
    console.log(message, ...args);
  }

  error(message, ...args) {
    console.error(message, ...args);
  }

  // Update verbose setting
  setVerbose(verbose) {
    this.verbose = verbose;
  }
}

module.exports = { Logger };