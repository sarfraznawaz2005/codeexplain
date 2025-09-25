const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

class CacheManager {
  constructor() {
    this.cacheDir = path.join(process.cwd(), '.codeexplain', 'cache');
  }

  async initialize() {
    await fs.ensureDir(this.cacheDir);
  }

  async getCacheKey(filePath, config) {
    // Create a cache key based on file path, config, mode, and model
    const keyString = `${filePath}-${config.mode}-${config.level}-${config.provider}-${config.model}`
    return crypto.createHash('md5').update(keyString).digest('hex')
  }

  async getCachedExplanation(filePath, config) {
    try {
      const cacheKey = await this.getCacheKey(filePath, config);
      const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);

      if (!(await fs.pathExists(cacheFile))) {
        return null;
      }

      const cacheData = await fs.readJson(cacheFile);

      const stats = await fs.stat(filePath);
      const currentMtime = stats.mtime.getTime();
      const currentSize = stats.size;

      // Fast path: check mtime and size first (no file content read needed)
      if (cacheData.mtime === currentMtime && cacheData.fileSize === currentSize) {
        return cacheData.explanation;
      }

      // Medium path: if mtime changed but size is same, check hash
      if (cacheData.fileSize === currentSize) {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const currentHash = crypto.createHash('sha256').update(fileContent).digest('hex');

        if (cacheData.fileHash === currentHash) {
          // Update mtime in cache
          cacheData.mtime = currentMtime;
          await fs.writeJson(cacheFile, cacheData);
          return cacheData.explanation;
        }
      }

      // Slow path: file has changed, invalidate cache
      return null;
    } catch (error) {
      console.warn('Cache read error:', error.message);
      return null;
    }
  }

  async setCachedExplanation(filePath, config, explanation) {
    try {
      const cacheKey = await this.getCacheKey(filePath, config);
      const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);

      const stats = await fs.stat(filePath);
      const fileContent = await fs.readFile(filePath, 'utf8');
      const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');

      // Only store cache-relevant config, not sensitive data like API keys
      const cacheConfig = {
        mode: config.mode,
        level: config.level,
        provider: config.provider,
        model: config.model
      };

      const cacheData = {
        fileHash,
        fileSize: stats.size,
        mtime: stats.mtime.getTime(),
        explanation,
        timestamp: new Date().toISOString(),
        config: cacheConfig
      };

      await fs.writeJson(cacheFile, cacheData);
    } catch (error) {
      console.warn('Cache write error:', error.message);
    }
  }
}


module.exports = { CacheManager };