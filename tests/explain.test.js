const { explain } = require('../src/commands/explain');
const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('../src/config/configManager');
jest.mock('../src/core/codeAnalyzer');
jest.mock('../src/ai/aiEngine');
jest.mock('../src/output/html/htmlOutput');
jest.mock('../src/output/pdf/pdfOutput');
jest.mock('../src/ai/promptManager');
jest.mock('../src/flowchart/flowchartGenerator');
jest.mock('globby');
jest.mock('mermaid');
jest.mock('chalk', () => ({
  cyan: { bold: jest.fn((str) => str) },
  yellow: jest.fn((str) => str),
  green: jest.fn((str) => str),
  red: jest.fn((str) => str),
  gray: jest.fn((str) => str),
  blue: { bold: jest.fn((str) => str) },
  white: jest.fn((str) => str),
}));

const { ConfigManager } = require('../src/config/configManager');
const { CodeAnalyzer } = require('../src/core/codeAnalyzer');
const { AIEngine } = require('../src/ai/aiEngine');
const { HTMLOutput } = require('../src/output/html/htmlOutput');
const { PDFOutput } = require('../src/output/pdf/pdfOutput');
const { PromptManager } = require('../src/ai/promptManager');
const { FlowchartGenerator } = require('../src/flowchart/flowchartGenerator');

describe('explain command', () => {
  let mockConfigManager;
  let mockCodeAnalyzer;
  let mockAIEngine;
  let mockHTMLOutput;
  let mockPDFOutput;
  let mockPromptManager;
  let consoleSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(process, 'exit').mockImplementation(() => {});

    // Setup mocks
    mockConfigManager = {
      loadConfig: jest.fn().mockResolvedValue({
        provider: 'gemini',
        model: 'gemini-pro',
        output: 'html',
        mode: 'explain',
        level: 'beginner',
        maxTokens: 15000,
        cache: true,
        apiKey: 'test-api-key'
      })
    };
    ConfigManager.mockImplementation(() => mockConfigManager);

    mockPromptManager = {
      initialize: jest.fn().mockResolvedValue()
    };
    PromptManager.mockImplementation(() => mockPromptManager);

    mockCodeAnalyzer = {
      analyze: jest.fn().mockResolvedValue([
        {
          relativePath: 'test.js',
          language: 'javascript',
          content: 'console.log("test");'
        }
      ])
    };
    CodeAnalyzer.mockImplementation(() => mockCodeAnalyzer);

    mockAIEngine = {
      generateExplanations: jest.fn().mockResolvedValue([
        {
          relativePath: 'test.js',
          explanation: 'This is a test file'
        }
      ]),
      getUsageSummary: jest.fn().mockReturnValue({
        processedFiles: 1,
        cachedFiles: 0,
        totalInputTokens: 100,
        totalOutputTokens: 50,
        totalTokens: 150
      })
    };
    AIEngine.mockImplementation(() => mockAIEngine);

    mockHTMLOutput = {
      generate: jest.fn().mockResolvedValue()
    };
    HTMLOutput.mockImplementation(() => mockHTMLOutput);

    mockPDFOutput = {
      generate: jest.fn().mockResolvedValue()
    };
    PDFOutput.mockImplementation(() => mockPDFOutput);

    FlowchartGenerator.generate = jest.fn().mockResolvedValue({
      type: 'flowchart',
      content: 'flowchart data'
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('should handle multiple paths', async () => {
    const paths = ['src', 'tests'];
    const options = {};

    await explain(paths, options);

    expect(mockCodeAnalyzer.analyze).toHaveBeenCalledTimes(2);
    expect(mockCodeAnalyzer.analyze).toHaveBeenCalledWith('src');
    expect(mockCodeAnalyzer.analyze).toHaveBeenCalledWith('tests');
  });

  test('should handle offline mode when no API key', async () => {
    mockConfigManager.loadConfig.mockResolvedValue({
      provider: 'gemini',
      model: 'gemini-pro',
      output: 'html',
      mode: 'explain',
      level: 'beginner',
      maxTokens: 15000,
      cache: true,
      apiKey: undefined
    });

    const paths = ['.'];
    const options = {};

    await explain(paths, options);

    expect(AIEngine).not.toHaveBeenCalled();
    expect(mockHTMLOutput.generate).toHaveBeenCalled();
  });

  test('should handle flowchart mode', async () => {
    const paths = ['.'];
    const options = { mode: 'flowchart' };

    await explain(paths, options);

    expect(FlowchartGenerator.generate).toHaveBeenCalled();
    expect(AIEngine).not.toHaveBeenCalled();
  });

  test('should reject linebyline mode with multiple files', async () => {
    const paths = ['file1.js', 'file2.js'];
    const options = { mode: 'linebyline' };

    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit');
    });
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({ isDirectory: () => false });

    await expect(explain(paths, options)).rejects.toThrow('Process exit');

    mockExit.mockRestore();
  });

  test('should reject linebyline mode with directory', async () => {
    const paths = ['src'];
    const options = { mode: 'linebyline' };

    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process exit');
    });
    jest.spyOn(fs.promises, 'stat').mockResolvedValue({ isDirectory: () => true });

    await expect(explain(paths, options)).rejects.toThrow('Process exit');

    mockExit.mockRestore();
  });

  test('should handle API key from options', async () => {
    const paths = ['.'];
    const options = { apikey: 'test-key' };

    await explain(paths, options);

    expect(mockAIEngine.generateExplanations).toHaveBeenCalled();
  });

  test('should show verbose output when enabled', async () => {
    const paths = ['.'];
    const options = { verbose: true };

    await explain(paths, options);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration:'));
  });
});