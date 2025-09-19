const { PromptManager } = require('../src/ai/promptManager');
const fs = require('fs-extra');
const path = require('path');

jest.mock('fs-extra');

describe('PromptManager', () => {
  let promptManager;
  const mockCwd = 'D:\\test\\project';
  let originalCwd;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    originalCwd = process.cwd;
    process.cwd = jest.fn().mockReturnValue(mockCwd);
    promptManager = new PromptManager();
  });

  afterEach(() => {
    process.cwd = originalCwd;
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should set correct directory paths', () => {
      expect(promptManager.promptsDir).toContain('prompts');
      expect(promptManager.userPromptsDir).toBe(path.join(mockCwd, '.codeexplain', 'prompts'));
    });
  });

  describe('initialize', () => {
    test('should create user prompts directory and copy default prompts', async () => {
      const defaultPrompts = ['explain.md', 'architecture.md'];
      fs.ensureDir.mockResolvedValue();
      fs.readdir.mockResolvedValue(defaultPrompts);
      fs.stat.mockResolvedValue({ isFile: () => true }); // Mock stat to return file info
      fs.pathExists.mockResolvedValue(false); // No user prompts exist
      fs.copy.mockResolvedValue();

      await promptManager.initialize();

      expect(fs.ensureDir).toHaveBeenCalledWith(promptManager.userPromptsDir);
      expect(fs.readdir).toHaveBeenCalledWith(promptManager.promptsDir);
      expect(fs.copy).toHaveBeenCalledTimes(2);
    });

    test('should not overwrite existing user prompts', async () => {
      const defaultPrompts = ['explain.md'];
      fs.ensureDir.mockResolvedValue();
      fs.readdir.mockResolvedValue(defaultPrompts);
      fs.stat.mockResolvedValue({ isFile: () => true }); // Mock stat to return file info
      fs.pathExists.mockResolvedValue(true); // User prompt exists
      fs.copy.mockResolvedValue();

      await promptManager.initialize();

      expect(fs.copy).not.toHaveBeenCalled();
    });
  });

  describe('getPrompt', () => {
    test('should return user custom prompt when available', async () => {
      const userPromptContent = 'Custom user prompt';
      fs.pathExists.mockImplementation((filePath) => {
        return filePath.includes('.codeexplain') && filePath.endsWith('explain.md');
      });
      fs.readFile.mockResolvedValue(userPromptContent);

      const prompt = await promptManager.getPrompt('explain');

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(promptManager.userPromptsDir, 'explain.md'),
        'utf8'
      );
      expect(prompt).toBe(userPromptContent);
    });

    test('should return default prompt when no user custom prompt exists', async () => {
      const defaultPromptContent = 'Default prompt content';
      fs.pathExists.mockImplementation((filePath) => {
        return !filePath.includes('.codeexplain') && filePath.endsWith('explain.md');
      });
      fs.readFile.mockResolvedValue(defaultPromptContent);

      const prompt = await promptManager.getPrompt('explain');

      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(promptManager.promptsDir, 'explain.md'),
        'utf8'
      );
      expect(prompt).toBe(defaultPromptContent);
    });

    test('should return fallback template when no prompt files exist', async () => {
      fs.pathExists.mockResolvedValue(false);

      const prompt = await promptManager.getPrompt('nonexistent');

      expect(prompt).toContain('You are an AI assistant that explains code');
      expect(prompt).toContain('{{language}}');
      expect(prompt).toContain('{{filePath}}');
      expect(prompt).toContain('{{codeContent}}');
    });
  });

  describe('renderPrompt', () => {
    test('should replace template variables', async () => {
      const template = 'Explain {{language}} code in {{filePath}}: {{codeContent}}';
      const variables = {
        language: 'JavaScript',
        filePath: 'src/main.js',
        codeContent: 'console.log("hello");'
      };

      const result = await promptManager.renderPrompt(template, variables);

      expect(result).toBe('Explain JavaScript code in src/main.js: console.log("hello");');
    });

    test('should handle multiple occurrences of same variable', async () => {
      const template = '{{name}} says {{name}} again';
      const variables = { name: 'Alice' };

      const result = await promptManager.renderPrompt(template, variables);

      expect(result).toBe('Alice says Alice again');
    });

    test('should handle empty variables object', async () => {
      const template = 'No variables here';

      const result = await promptManager.renderPrompt(template, {});

      expect(result).toBe('No variables here');
    });

    test('should handle variables with special regex characters', async () => {
      const template = 'File: {{filePath}}';
      const variables = { filePath: 'src/test(file).js' };

      const result = await promptManager.renderPrompt(template, variables);

      expect(result).toBe('File: src/test(file).js');
    });
  });
});