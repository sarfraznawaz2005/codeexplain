const { AIEngine } = require('../src/ai/aiEngine');
const { CacheManager } = require('../src/core/cacheManager');
const { PromptManager } = require('../src/ai/promptManager');

jest.mock('@langchain/openai');
jest.mock('@langchain/google-genai');
jest.mock('@langchain/ollama');
jest.mock('../src/core/cacheManager');
jest.mock('../src/ai/promptManager');
jest.mock('chalk', () => ({
  gray: jest.fn((str) => str),
  redBright: jest.fn((str) => str),
  yellowBright: jest.fn((str) => str)
}));

const { ChatOpenAI } = require('@langchain/openai');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatOllama } = require('@langchain/ollama');

describe('AIEngine', () => {
  let config;
  let mockCacheManager;
  let mockPromptManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    config = {
      provider: 'gemini',
      model: 'gemini-pro',
      apiKey: 'test-key',
      mode: 'explain',
      level: 'beginner',
      maxTokens: 15000,
      cache: true,
      concurrency: 5
    };

    mockCacheManager = {
      initialize: jest.fn().mockResolvedValue(),
      getCachedExplanation: jest.fn().mockResolvedValue(null),
      setCachedExplanation: jest.fn().mockResolvedValue()
    };
    CacheManager.mockImplementation(() => mockCacheManager);

    mockPromptManager = {
      initialize: jest.fn().mockResolvedValue(),
      getPrompt: jest.fn().mockResolvedValue('Test prompt template'),
      renderPrompt: jest.fn().mockResolvedValue('Rendered prompt')
    };
    PromptManager.mockImplementation(() => mockPromptManager);
  });

  describe('constructor', () => {
    test('should initialize with gemini provider', () => {
      const engine = new AIEngine(config);

      expect(engine.provider).toBe('gemini');
      expect(engine.apiKey).toBe('test-key');
      expect(ChatGoogleGenerativeAI).toHaveBeenCalledWith({
        apiKey: 'test-key',
        modelName: 'gemini-pro',
        maxOutputTokens: 15000
      });
      expect(CacheManager).toHaveBeenCalled();
      expect(PromptManager).toHaveBeenCalled();
    });

    test('should initialize with openai provider', () => {
      config.provider = 'openai';
      const engine = new AIEngine(config);

      expect(ChatOpenAI).toHaveBeenCalledWith({
        openAIApiKey: 'test-key',
        modelName: 'gemini-pro',
        maxTokens: 15000
      });
    });

    test('should initialize with ollama provider without API key', () => {
      config.provider = 'ollama';
      config.apiKey = undefined;
      const engine = new AIEngine(config);

      expect(ChatOllama).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:11434',
        model: 'gemini-pro',
        maxTokens: 15000
      });
    });

    test('should throw error for unsupported provider', () => {
      config.provider = 'unsupported';
      expect(() => new AIEngine(config)).toThrow('Unsupported AI provider: unsupported');
    });

    test('should throw error when API key missing for non-ollama provider', () => {
      config.apiKey = undefined;
      expect(() => new AIEngine(config)).toThrow('API key required for gemini');
    });

    test('should set concurrency from config', () => {
      const engine = new AIEngine(config);
      expect(engine.concurrency).toBe(5);
    });

    test('should default concurrency to 3 when not specified', () => {
      delete config.concurrency;
      const engine = new AIEngine(config);
      expect(engine.concurrency).toBe(3);
    });
  });

  describe('estimateTokens', () => {
    test('should estimate tokens based on text length for non-OpenAI providers', () => {
      const engine = new AIEngine(config); // gemini provider

      expect(engine.estimateTokens('')).toBe(0);
      expect(engine.estimateTokens('test')).toBe(1); // 4 chars / 4 = 1
      expect(engine.estimateTokens('this is a longer text')).toBe(6); // 21 chars / 4 = 5.25 -> 6
    });

    test('should use tiktoken for OpenAI provider', () => {
      config.provider = 'openai';
      const engine = new AIEngine(config);

      // Test with actual token counts (approximate)
      expect(engine.estimateTokens('')).toBe(0);
      expect(engine.estimateTokens('test')).toBeGreaterThan(0); // Should be actual token count
      expect(engine.estimateTokens('this is a longer text')).toBeGreaterThan(3); // Should be more accurate
    });
  });

  describe('getUsageSummary', () => {
    test('should return token usage summary', () => {
      const engine = new AIEngine(config);
      engine.tokenUsage = {
        totalInputTokens: 100,
        totalOutputTokens: 50,
        totalTokens: 150,
        cachedFiles: 2,
        processedFiles: 5
      };

      const summary = engine.getUsageSummary();
      expect(summary).toEqual({
        totalInputTokens: 100,
        totalOutputTokens: 50,
        totalTokens: 150,
        cachedFiles: 2,
        processedFiles: 5
      });
    });
  });

  describe('buildPrompt', () => {
    test('should build prompt with template rendering', async () => {
      const engine = new AIEngine(config);
      const fileAnalysis = {
        language: 'javascript',
        path: 'test.js',
        content: 'console.log("test");'
      };

      const prompt = await engine.buildPrompt(fileAnalysis);

      expect(mockPromptManager.getPrompt).toHaveBeenCalledWith('explain');
      expect(mockPromptManager.renderPrompt).toHaveBeenCalledWith('Test prompt template', {
        levelDescription: 'a beginner developer',
        language: 'javascript',
        filePath: 'test.js',
        codeContent: 'console.log("test");'
      });
      expect(prompt).toBe('Rendered prompt\n\nIMPORTANT: Always respond in markdown format.');
    });

    test('should handle architecture mode alias', async () => {
      config.mode = 'arch';
      const engine = new AIEngine(config);
      const fileAnalysis = { language: 'javascript', path: 'test.js', content: 'code' };

      await engine.buildPrompt(fileAnalysis);

      expect(mockPromptManager.getPrompt).toHaveBeenCalledWith('architecture');
    });

    test('should handle expert level', async () => {
      config.level = 'expert';
      const engine = new AIEngine(config);
      const fileAnalysis = { language: 'javascript', path: 'test.js', content: 'code' };

      await engine.buildPrompt(fileAnalysis);

      expect(mockPromptManager.renderPrompt).toHaveBeenCalledWith(
        'Test prompt template',
        expect.objectContaining({ levelDescription: 'an expert developer' })
      );
    });
  });

  describe('explainFile', () => {
    let engine;
    let fileAnalysis;

    beforeEach(() => {
      engine = new AIEngine(config);
      fileAnalysis = {
        path: 'test.js',
        relativePath: 'test.js',
        language: 'javascript',
        content: 'console.log("test");'
      };

      // Mock the model instance
      engine.modelInstance = {
        invoke: jest.fn().mockResolvedValue({ content: 'AI explanation' })
      };
    });

    test('should return cached explanation when available', async () => {
      mockCacheManager.getCachedExplanation.mockResolvedValue('cached explanation');

      const result = await engine.explainFile(fileAnalysis);

      expect(mockCacheManager.getCachedExplanation).toHaveBeenCalledWith('test.js', config);
      expect(result).toEqual({
        ...fileAnalysis,
        explanation: 'cached explanation',
        cached: true
      });
      expect(engine.tokenUsage.cachedFiles).toBe(1);
    });

    test('should generate new explanation when not cached', async () => {
      const result = await engine.explainFile(fileAnalysis);

      expect(mockPromptManager.renderPrompt).toHaveBeenCalled();
      expect(engine.modelInstance.invoke).toHaveBeenCalledWith([
        { role: 'system', content: 'You are a helpful assistant that provides detailed code explanations.' },
        { role: 'user', content: expect.stringContaining('Rendered prompt') }
      ]);
      expect(mockCacheManager.setCachedExplanation).toHaveBeenCalledWith('test.js', config, 'AI explanation');
      expect(result).toEqual({
        ...fileAnalysis,
        explanation: 'AI explanation',
        cached: false
      });
    });

    test('should skip caching when cache is disabled', async () => {
      config.cache = false;
      engine = new AIEngine(config);
      engine.modelInstance = { invoke: jest.fn().mockResolvedValue({ content: 'AI explanation' }) };

      await engine.explainFile(fileAnalysis);

      expect(mockCacheManager.getCachedExplanation).not.toHaveBeenCalled();
      expect(mockCacheManager.setCachedExplanation).not.toHaveBeenCalled();
    });

    test('should handle API errors gracefully', async () => {
      // Create engine with no retries to avoid timeout
      const noRetryConfig = { ...config, retry: { attempts: 0, delay: 1 } };
      const noRetryEngine = new AIEngine(noRetryConfig);
      // Verify config is set correctly
      expect(noRetryEngine.config.retry.attempts).toBe(0);
      noRetryEngine.modelInstance = { invoke: jest.fn().mockRejectedValue(new Error('API Error')) };

      const result = await noRetryEngine.explainFile(fileAnalysis);

      expect(result.explanation).toContain('Error generating explanation: API Error');
      expect(result.cached).toBe(false);
    }, 10000); // Increase timeout

    test('should handle null file analysis', async () => {
      const result = await engine.explainFile(null);
      expect(result).toBeNull();
    });
  });

  describe('generateExplanations', () => {
    let engine;

    beforeEach(() => {
      engine = new AIEngine(config);
      engine.modelInstance = { invoke: jest.fn().mockResolvedValue({ content: 'AI explanation' }) };
    });

    test('should process single file', async () => {
      const fileAnalysis = { path: 'test.js', relativePath: 'test.js' };
      const progressCallback = jest.fn();

      const result = await engine.generateExplanations(fileAnalysis, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith('test.js', 1, 1, 100, false, false);
      expect(result).toEqual({
        ...fileAnalysis,
        explanation: 'AI explanation',
        cached: false
      });
    });

    test('should process multiple files with progress', async () => {
      const files = [
        { path: 'file1.js', relativePath: 'file1.js' },
        { path: 'file2.js', relativePath: 'file2.js' }
      ];
      const progressCallback = jest.fn();

      const results = await engine.generateExplanations(files, progressCallback);

      expect(results).toHaveLength(2);
      expect(progressCallback).toHaveBeenCalledTimes(2);
      expect(progressCallback).toHaveBeenCalledWith('file1.js', 1, 2, 50, false, false);
      expect(progressCallback).toHaveBeenCalledWith('file2.js', 2, 2, 100, false, false);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});