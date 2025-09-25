
const fs = require('fs-extra');
const path = require('path');
const { globby } = require('globby');
const crypto = require('crypto');
const { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } = require('../utils/constants');

class CodeAnalyzer {
  static OUTPUT_FILE_PREFIX = 'codeexplain-output';

  constructor(config) {
    this.config = Object.assign({}, config);
    // Ensure all codeExtensions are lowercase for consistent matching
    this.config.codeExtensions = (this.config.codeExtensions || []).map(ext => ext.toLowerCase());
    // Set max file size from config (convert MB to bytes)
    this.maxFileSizeBytes = (this.config.maxFileSize || MAX_FILE_SIZE_MB) * 1024 * 1024;
    // Pre-compile exclude patterns (wildcards to regex)
    this.excludeRegexes = (this.config.exclude || []).map(pattern => {
      if (pattern.includes('*')) {
        // Escape all regex special characters EXCEPT '*'
        const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        // Replace glob '*' with regex '.*'
        const safeRegexPattern = escapedPattern.replace(/\*/g, '.*');
        try {
          // Anchor the regex to match the entire string
          return new RegExp('^' + safeRegexPattern + '$');
        } catch (e) {
          console.warn(`Invalid exclude regex pattern '${pattern}': ${e.message}`);
          return null;
        }
      }
      return null;
    }).filter(Boolean); // Remove null entries
  }

  async countFiles(targetPath) {
    const fullPath = path.resolve(targetPath);
    try {
      if (!(await fs.pathExists(fullPath))) {
        return 0;
      }
      const stats = await fs.stat(fullPath);
      if (stats.isFile()) {
        return this.shouldIncludeFile(fullPath, true) ? 1 : 0;
      } else if (stats.isDirectory()) {
        return await this.countFilesInDirectory(fullPath);
      }
      return 0;
    } catch (err) {
      console.error('Error in countFiles:', err.message);
      return 0;
    }
  }


  // Helper to build include/exclude patterns
  buildGlobPatterns() {
    const includePatterns = this.config.codeExtensions.map(ext => `**/*${ext}`);
    const excludePatterns = ['.codeexplain', ...(this.config.exclude || [])].map(ex => `!${ex}`);
    return [...includePatterns, ...excludePatterns];
  }

  async countFilesInDirectory(dirPath) {
    try {
      const patterns = this.buildGlobPatterns();
      const files = await globby(patterns, {
        cwd: dirPath,
        onlyFiles: true,
        gitignore: true
      });
      return files.length;
    } catch (err) {
      console.error('Error in countFilesInDirectory:', err.message);
      return 0;
    }
  }

  async analyze(targetPath) {
    return await this.analyzeWithProgress(targetPath, null);
  }

  async analyzeWithProgress(targetPath, progressCallback = null) {
    const fullPath = path.resolve(targetPath);
    try {
      if (!(await fs.pathExists(fullPath))) {
        throw new Error('Path does not exist: ' + fullPath);
      }
      const stats = await fs.stat(fullPath);
      if (stats.isFile()) {
        if (progressCallback) {
          progressCallback(fullPath, 1, 1);
        }
        return await this.analyzeFile(fullPath, null, true, stats);
      } else if (stats.isDirectory()) {
        return await this.analyzeDirectoryWithProgress(fullPath, progressCallback);
      } else {
        throw new Error('Unsupported file type: ' + fullPath);
      }
    } catch (err) {
      console.error('Error in analyzeWithProgress:', err.message);
      throw err;
    }
  }

  async analyzeFile(filePath, basePath = null, forceInclude = false, stats = null) {
    if (!this.shouldIncludeFile(filePath, forceInclude)) {
      return null;
    }
    try {
      const fileStats = stats || await fs.stat(filePath);

      // Check file size limit
      if (fileStats.size > this.maxFileSizeBytes) {
        const maxSizeMB = this.maxFileSizeBytes / 1024 / 1024;
        console.warn(`⚠️ Skipping large file: ${filePath} (${(fileStats.size / 1024 / 1024).toFixed(1)}MB > ${maxSizeMB}MB limit)`);
        return null;
      }

      // For very large files, read in chunks to avoid memory issues
      let content;
      if (fileStats.size > 1024 * 1024) { // 1MB threshold for chunked reading
        content = await this.readFileInChunks(filePath, fileStats.size);
      } else {
        content = await fs.readFile(filePath, 'utf8');
      }

      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const ext = path.extname(filePath).toLowerCase();
      let relativePath = path.basename(filePath);
      if (basePath) {
        relativePath = path.relative(basePath, filePath).replace(/\\/g, '/');
      }

      return {
        path: filePath,
        relativePath,
        content,
        hash,
        language: this.detectLanguage(ext),
        stats: fileStats
      };
    } catch (err) {
      console.error('Error in analyzeFile:', err.message);
      return null;
    }
  }

  // Read large files in chunks to prevent memory exhaustion
  async readFileInChunks(filePath, fileSize) {
    const chunkSize = 64 * 1024; // 64KB chunks
    const chunks = [];
    const stream = require('fs').createReadStream(filePath, {
      encoding: 'utf8',
      highWaterMark: chunkSize
    });

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        resolve(chunks.join(''));
      });

      stream.on('error', (err) => {
        reject(err);
      });
    });
  }

  async analyzeDirectory(dirPath) {
    return await this.analyzeDirectoryWithProgress(dirPath, null);
  }

  async analyzeDirectoryWithProgress(dirPath, progressCallback = null) {
    try {
      const patterns = this.buildGlobPatterns();
      const files = await globby(patterns, {
        cwd: dirPath,
        onlyFiles: true,
        gitignore: true
      });
      const results = [];
      let processedCount = 0;
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        try {
          if (progressCallback) {
            progressCallback(fullPath, ++processedCount, files.length);
          }
          const analysis = await this.analyzeFile(fullPath, dirPath, false);
          if (analysis) {
            results.push(analysis);
          }
        } catch (error) {
          console.warn('Could not analyze file ' + fullPath + ': ' + error.message);
        }
      }
      return results;
    } catch (err) {
      console.error('Error in analyzeDirectoryWithProgress:', err.message);
      return [];
    }
  }

  shouldIncludeFile(filePath, forceInclude = false) {
    const filename = path.basename(filePath);
    // Never include our own output files
    if (filename.startsWith(CodeAnalyzer.OUTPUT_FILE_PREFIX)) {
      return false;
    }
    if (forceInclude) {
      return true;
    }
    // Check if file extension is in our include list (case-insensitive)
    const ext = path.extname(filePath).toLowerCase();
    if (!this.config.codeExtensions.includes(ext)) {
      return false;
    }
    // Check against exclude patterns (exact match or wildcard regex)
    for (let i = 0; i < (this.config.exclude || []).length; i++) {
      const pattern = this.config.exclude[i];
      if (pattern.includes('*')) {
        const regex = this.excludeRegexes[i];
        if (regex && regex.test(filename)) {
          return false;
        }
      } else {
        // Check if pattern matches filename or if path contains the pattern (for directories)
        if (pattern === filename || filePath.includes(pattern)) {
          return false;
        }
      }
    }
    return true;
  }

  detectLanguage(extension) {
    const languageMap = require('../utils/languageMap');
    return languageMap[extension] || 'plaintext';
  }
}

module.exports = { CodeAnalyzer };