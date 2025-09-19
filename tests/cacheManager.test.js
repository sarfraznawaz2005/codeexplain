const { CacheManager } = require('../src/core/cacheManager');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

jest.mock('fs-extra');

describe('CacheManager', () => {
  let cacheManager;
  const mockCwd = 'D:\\test\\project';
  let originalCwd;

  beforeEach(() => {
    jest.clearAllMocks();
    originalCwd = process.cwd;
    process.cwd = jest.fn().mockReturnValue(mockCwd);
    cacheManager = new CacheManager();
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  describe('initialize', () => {
    test('should create cache directory', async () => {
      fs.ensureDir.mockResolvedValue();

      await cacheManager.initialize();

      expect(fs.ensureDir).toHaveBeenCalledWith(path.join(mockCwd, '.codeexplain', 'cache'));
    });
  });

  describe('getCacheKey', () => {
    test('should generate consistent cache key', async () => {
      const filePath = 'src/main.js';
      const config = {
        mode: 'explain',
        level: 'beginner',
        provider: 'gemini'
      };

      const key1 = await cacheManager.getCacheKey(filePath, config);
      const key2 = await cacheManager.getCacheKey(filePath, config);

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(32); // MD5 hash length
    });

    test('should generate different keys for different configs', async () => {
      const filePath = 'src/main.js';
      const config1 = { mode: 'explain', level: 'beginner', provider: 'gemini' };
      const config2 = { mode: 'linebyline', level: 'beginner', provider: 'gemini' };

      const key1 = await cacheManager.getCacheKey(filePath, config1);
      const key2 = await cacheManager.getCacheKey(filePath, config2);

      expect(key1).not.toBe(key2);
    });
  });

  describe('getCachedExplanation', () => {
    test('should return null when cache file does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);

      const result = await cacheManager.getCachedExplanation('test.js', {});

      expect(result).toBeNull();
    });

    test('should return cached explanation when mtime matches', async () => {
      const cacheData = {
        fileHash: 'abc123',
        mtime: 1234567890000,
        explanation: 'cached explanation'
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(cacheData);
      fs.stat.mockResolvedValue({ mtime: new Date(1234567890000) });

      const result = await cacheManager.getCachedExplanation('test.js', {});

      expect(result).toBe('cached explanation');
    });

    test('should return cached explanation when hash matches and update mtime', async () => {
      const cacheData = {
        fileHash: 'abc123',
        mtime: 1234567890000,
        explanation: 'cached explanation'
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(cacheData);
      fs.stat.mockResolvedValue({ mtime: new Date(1234567891000) }); // Different mtime
      fs.readFile.mockResolvedValue('file content');
      fs.writeJson.mockResolvedValue();

      // Mock crypto to return the expected hash
      const mockHash = crypto.createHash('sha256');
      mockHash.update('file content');
      const expectedHash = mockHash.digest('hex');

      // Override the cache data hash to match
      cacheData.fileHash = expectedHash;

      const result = await cacheManager.getCachedExplanation('test.js', {});

      expect(result).toBe('cached explanation');
      expect(fs.writeJson).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ mtime: 1234567891000 })
      );
    });

    test('should return null when file content has changed', async () => {
      const cacheData = {
        fileHash: 'oldhash',
        mtime: 1234567890000,
        explanation: 'cached explanation'
      };

      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(cacheData);
      fs.stat.mockResolvedValue({ mtime: new Date(1234567891000) });
      fs.readFile.mockResolvedValue('new content');

      const result = await cacheManager.getCachedExplanation('test.js', {});

      expect(result).toBeNull();
    });

    test('should handle cache read errors gracefully', async () => {
      fs.pathExists.mockRejectedValue(new Error('Read error'));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await cacheManager.getCachedExplanation('test.js', {});

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('Cache read error:', 'Read error');

      consoleSpy.mockRestore();
    });
  });

  describe('setCachedExplanation', () => {
    test('should save explanation to cache', async () => {
      const config = {
        mode: 'explain',
        level: 'beginner',
        provider: 'gemini',
        model: 'gemini-pro',
        apiKey: 'secret' // Should not be cached
      };
      const explanation = 'AI generated explanation';

      fs.stat.mockResolvedValue({ mtime: new Date(1234567890000) });
      fs.readFile.mockResolvedValue('file content');
      fs.writeJson.mockResolvedValue();

      await cacheManager.setCachedExplanation('test.js', config, explanation);

      expect(fs.writeJson).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        expect.objectContaining({
          fileHash: expect.any(String),
          mtime: 1234567890000,
          explanation: 'AI generated explanation',
          timestamp: expect.any(String),
          config: {
            mode: 'explain',
            level: 'beginner',
            provider: 'gemini',
            model: 'gemini-pro'
            // apiKey should not be included
          }
        })
      );
    });

    test('should handle cache write errors gracefully', async () => {
      fs.stat.mockRejectedValue(new Error('Write error'));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await cacheManager.setCachedExplanation('test.js', {}, 'explanation');

      expect(consoleSpy).toHaveBeenCalledWith('Cache write error:', 'Write error');

      consoleSpy.mockRestore();
    });
  });
});