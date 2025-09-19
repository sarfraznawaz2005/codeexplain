const { ConfigManager } = require('../src/config/configManager');
const fs = require('fs-extra');
const path = require('path');

jest.mock('fs-extra');

describe('ConfigManager', () => {
  const mockCwd = 'D:\\test\\project';
  let originalCwd;
  let originalEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalCwd = process.cwd;
    originalEnv = process.env.CODEEXPLAIN_API_KEY;
    process.cwd = jest.fn().mockReturnValue(mockCwd);
    delete process.env.CODEEXPLAIN_API_KEY;
  });

  afterEach(() => {
    process.cwd = originalCwd;
    process.env.CODEEXPLAIN_API_KEY = originalEnv;
  });

  describe('constructor', () => {
    test('should initialize with default config path', () => {
      const configManager = new ConfigManager();
      expect(configManager.configPath).toBeUndefined();
      expect(configManager.defaultConfig.provider).toBe('gemini');
      expect(configManager.defaultConfig.model).toBe('gemini-2.5-flash');
    });

    test('should initialize with custom config path', () => {
      const configManager = new ConfigManager('./custom-config.json');
      expect(configManager.configPath).toBe('./custom-config.json');
    });
  });

  describe('loadConfig', () => {
    test('should create .codeexplain directory and load default config when no config file exists', async () => {
      fs.pathExists.mockResolvedValue(false);
      fs.ensureDir.mockResolvedValue();
      fs.writeJson.mockResolvedValue();

      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();

      expect(fs.ensureDir).toHaveBeenCalledWith(path.join(mockCwd, '.codeexplain'));
      expect(fs.writeJson).toHaveBeenCalledWith(
        path.join(mockCwd, '.codeexplain', 'config.json'),
        configManager.defaultConfig,
        { spaces: 2 }
      );
      expect(config.provider).toBe('gemini');
      expect(config.model).toBe('gemini-2.5-flash');
    });

    test('should load existing config file and merge with defaults', async () => {
      const existingConfig = { provider: 'openai', apiKey: 'test-key' };
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue(existingConfig);
      fs.ensureDir.mockResolvedValue();

      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();

      expect(fs.readJson).toHaveBeenCalledWith(path.join(mockCwd, '.codeexplain', 'config.json'));
      expect(config.provider).toBe('openai'); // overridden
      expect(config.apiKey).toBe('test-key'); // from file
      expect(config.model).toBe('gemini-2.5-flash'); // keeps default model
    });

    test('should use custom config path when provided', async () => {
      const customPath = './my-config.json';
      fs.pathExists.mockResolvedValue(true);
      fs.readJson.mockResolvedValue({ provider: 'ollama' });
      fs.ensureDir.mockResolvedValue();

      const configManager = new ConfigManager(customPath);
      await configManager.loadConfig();

      expect(fs.readJson).toHaveBeenCalledWith(path.resolve(customPath));
    });

    test('should override with environment variables', async () => {
      const originalEnv = process.env.CODEEXPLAIN_API_KEY;
      process.env.CODEEXPLAIN_API_KEY = 'env-api-key';

      fs.pathExists.mockResolvedValue(false);
      fs.ensureDir.mockResolvedValue();
      fs.writeJson.mockResolvedValue();

      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();

      expect(config.apiKey).toBe('env-api-key');

      process.env.CODEEXPLAIN_API_KEY = originalEnv;
    });

    test('should set default model for gemini provider', async () => {
      fs.pathExists.mockResolvedValue(false);
      fs.ensureDir.mockResolvedValue();
      fs.writeJson.mockResolvedValue();

      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();

      expect(config.model).toBe('gemini-2.5-flash');
    });

    test('should set default model for openai provider', async () => {
      const configManager = new ConfigManager();
      configManager.defaultConfig.provider = 'openai';
      configManager.defaultConfig.model = undefined;

      fs.pathExists.mockResolvedValue(false);
      fs.ensureDir.mockResolvedValue();
      fs.writeJson.mockResolvedValue();

      const config = await configManager.loadConfig();

      expect(config.model).toBe('gpt-4o');
    });
  });

  describe('saveConfig', () => {
    test('should save config to default path', async () => {
      const config = { provider: 'gemini' };
      fs.writeJson.mockResolvedValue();

      const configManager = new ConfigManager();
      await configManager.saveConfig(config);

      expect(fs.writeJson).toHaveBeenCalledWith(
        path.join(mockCwd, '.codeexplain', 'config.json'),
        config,
        { spaces: 2 }
      );
    });

    test('should save config to custom path', async () => {
      const config = { provider: 'openai' };
      const customPath = './custom.json';
      fs.writeJson.mockResolvedValue();

      const configManager = new ConfigManager();
      await configManager.saveConfig(config, customPath);

      expect(fs.writeJson).toHaveBeenCalledWith(customPath, config, { spaces: 2 });
    });
  });

  describe('defaultConfig', () => {
    test('should have comprehensive code extensions list', () => {
      const configManager = new ConfigManager();
      const extensions = configManager.defaultConfig.codeExtensions;

      expect(extensions).toContain('.js');
      expect(extensions).toContain('.py');
      expect(extensions).toContain('.java');
      expect(extensions).toContain('.rs');
      expect(extensions.length).toBeGreaterThan(40);
    });

    test('should have comprehensive exclude patterns', () => {
      const configManager = new ConfigManager();
      const exclude = configManager.defaultConfig.exclude;

      expect(exclude).toContain('node_modules');
      expect(exclude).toContain('.git');
      expect(exclude).toContain('dist');
      expect(exclude).toContain('.codeexplain');
      expect(exclude.length).toBeGreaterThan(30);
    });

    test('should have retry configuration', () => {
      const configManager = new ConfigManager();
      const retry = configManager.defaultConfig.retry;

      expect(retry.attempts).toBe(3);
      expect(retry.delay).toBe(1000);
    });
  });
});