// Explanation modes
exports.MODE_LINE_BY_LINE = 'linebyline';
exports.MODE_FLOWCHART = 'flowchart';
exports.MODE_EXPLAIN = 'explain';
exports.MODE_ARCHITECTURE = 'architecture';
exports.MODE_ARCH = 'arch';  // Alias for architecture
exports.MODE_ISSUES = 'issues';
exports.MODE_ONBOARDING = 'onboarding';

// Output formats
exports.OUTPUT_PDF = 'pdf';
exports.OUTPUT_HTML = 'html';

// Default configuration values
exports.DEFAULT_RETRY_ATTEMPTS = 3;
exports.DEFAULT_CONCURRENCY = 3;
exports.MAX_CONCURRENCY = 10;
exports.MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB default
exports.MAX_FILE_SIZE_MB = 10;