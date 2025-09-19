/**
 * Common utility functions for CodeExplain
 */

const path = require('path');
const crypto = require('crypto')

/**
 * Escape HTML special characters
 * @param {string} unsafe - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(unsafe) {
  return unsafe.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return m;
    }
  });
}

/**
 * Escape regex special characters
 * @param {string} string - String to escape
 * @returns {string} Escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get file extension from path
 * @param {string} filePath - Path to file
 * @returns {string} File extension
 */
function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

/**
 * Get file name without extension
 * @param {string} filePath - Path to file
 * @returns {string} File name without extension
 */
function getFileNameWithoutExtension(filePath) {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Check if a file should be included based on extension
 * @param {string} filePath - Path to file
 * @param {string[]} allowedExtensions - Allowed extensions
 * @returns {boolean} True if file should be included
 */
function shouldIncludeFile(filePath, allowedExtensions) {
  const ext = getFileExtension(filePath);
  return allowedExtensions.includes(ext);
}

/**
 * Format bytes to human readable format
 * @param {number} bytes - Number of bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted string
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Capitalize first letter of string
 * @param {string} string - String to capitalize
 * @returns {string} Capitalized string
 */
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * Convert camelCase to kebab-case
 * @param {string} string - String to convert
 * @returns {string} Converted string
 */
function camelToKebab(string) {
  return string.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Truncate string with ellipsis
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated string
 */
function truncateString(str, maxLength) {
  if (str.length <= maxLength) return str;
  if (maxLength <= 3) return '...';
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Generate unique ID
 * @returns {string} Unique ID
 */
function generateUniqueId() {
  return crypto.randomBytes(8).toString('hex')
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after specified time
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  if (typeof target !== 'object' || target === null) {
    return source;
  }

  if (typeof source !== 'object' || source === null) {
    return target;
  }

  const output = Array.isArray(target) ? [...target] : { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (isObject(source[key])) {
        output[key] = deepMerge(output[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    }
  }

  return output;
}

/**
 * Check if value is object
 * @param {*} item - Value to check
 * @returns {boolean} True if value is object
 */
function isObject(item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Format date to readable string
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Pluralize word based on count
 * @param {number} count - Count
 * @param {string} singular - Singular form
 * @param {string} plural - Plural form
 * @returns {string} Pluralized word
 */
function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

/**
 * Convert array to human-readable list
 * @param {Array} array - Array to convert
 * @returns {string} Human-readable list
 */
function arrayToHumanReadableList(array) {
  if (array.length === 0) return '';
  if (array.length === 1) return array[0];
  if (array.length === 2) return array.join(' and ');

  // Create a shallow copy to avoid modifying the original array
  const arrCopy = [...array];
  const last = arrCopy.pop();
  return arrCopy.join(', ') + ', and ' + last;
}

module.exports = {
  escapeHtml,
  escapeRegExp,
  getFileExtension,
  getFileNameWithoutExtension,
  shouldIncludeFile,
  formatBytes,
  capitalizeFirstLetter,
  camelToKebab,
  truncateString,
  generateUniqueId,
  sleep,
  deepMerge,
  isObject,
  formatDate,
  pluralize,
  arrayToHumanReadableList
};