/**
 * Solidity Coverage configuration
 * - Generates html, lcov and json-summary reports
 * - Customize `skipFiles` if you want to exclude generated or non-critical files
 */
module.exports = {
  istanbulReporter: ["html", "lcov", "json-summary"],
  skipFiles: [
    // Example: "mocks", "interfaces"
  ],
};

