const { CodeAnalyzer } = require('../src/core/codeAnalyzer');
const fs = require('fs-extra');
const path = require('path');

jest.mock('fs-extra');
jest.mock('globby');
const { globby } = require('globby');

describe('CodeAnalyzer', () => {
  let config;
  let analyzer;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    config = {
      codeExtensions: ['.js', '.py', '.java'],
      exclude: ['node_modules', '.git', '*.log']
    };
    analyzer = new CodeAnalyzer(config);
  });

  describe('analyze', () => {
    test('should analyze a single file', async () => {
      const filePath = 'test.js';
      const fullPath = path.resolve(filePath);

      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 20,
        mtime: new Date()
      });
      fs.readFile.mockResolvedValue('console.log("test");');

      const result = await analyzer.analyze(filePath);

      expect(fs.pathExists).toHaveBeenCalledWith(fullPath);
      expect(fs.stat).toHaveBeenCalledWith(fullPath);
      expect(result).toHaveProperty('path', fullPath);
      expect(result).toHaveProperty('content', 'console.log("test");');
      expect(result).toHaveProperty('language', 'javascript');
      expect(result).toHaveProperty('hash');
    });

    test('should analyze a directory', async () => {
      const dirPath = 'src';
      const fullPath = path.resolve(dirPath);

      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockImplementation((filePath) => {
        if (filePath === fullPath) {
          return Promise.resolve({ isFile: () => false, isDirectory: () => true });
        } else {
          return Promise.resolve({
            isFile: () => true,
            isDirectory: () => false,
            size: 15,
            mtime: new Date()
          });
        }
      });
      globby.mockResolvedValue(['file1.js', 'file2.py']);

      fs.readFile.mockImplementation((file) => {
        if (file.includes('file1.js')) return Promise.resolve('console.log("js");');
        if (file.includes('file2.py')) return Promise.resolve('print("py")');
        return Promise.resolve('');
      });

      const results = await analyzer.analyze(dirPath);

      expect(globby).toHaveBeenCalled();
      expect(results).toHaveLength(2);
      expect(results[0].language).toBe('javascript');
      expect(results[1].language).toBe('python');
    });

    test('should throw error for non-existent path', async () => {
      fs.pathExists.mockResolvedValue(false);

      await expect(analyzer.analyze('nonexistent')).rejects.toThrow('Path does not exist');
    });

    test('should skip files larger than maxFileSize', async () => {
      const filePath = 'large.js';
      const fullPath = path.resolve(filePath);

      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 15 * 1024 * 1024, // 15MB (larger than 10MB default)
        mtime: new Date()
      });

      const result = await analyzer.analyze(filePath);

      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping large file: ')
      );
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('(15.0MB > 10MB limit)')
      );
    });

    test('should process files within size limit', async () => {
      const filePath = 'small.js';
      const fullPath = path.resolve(filePath);

      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024, // 1KB (within limit)
        mtime: new Date()
      });
      fs.readFile.mockResolvedValue('console.log("small file");');

      const result = await analyzer.analyze(filePath);

      expect(result).not.toBeNull();
      expect(result.content).toBe('console.log("small file");');
    });
  });

  describe('shouldIncludeFile', () => {
    test('should exclude codeexplain output files', () => {
      expect(analyzer.shouldIncludeFile('codeexplain-output.html')).toBe(false);
      expect(analyzer.shouldIncludeFile('codeexplain-output.pdf')).toBe(false);
    });

    test('should force include user-specified files', () => {
      expect(analyzer.shouldIncludeFile('any-file.txt', true)).toBe(true);
    });

    test('should include files with supported extensions', () => {
      expect(analyzer.shouldIncludeFile('test.js')).toBe(true);
      expect(analyzer.shouldIncludeFile('test.py')).toBe(true);
      expect(analyzer.shouldIncludeFile('test.java')).toBe(true);
    });

    test('should exclude files with unsupported extensions', () => {
      expect(analyzer.shouldIncludeFile('test.txt')).toBe(false);
      expect(analyzer.shouldIncludeFile('test.md')).toBe(false);
    });

    test('should exclude files matching exclude patterns', () => {
      expect(analyzer.shouldIncludeFile('node_modules/package.js')).toBe(false);
      expect(analyzer.shouldIncludeFile('debug.log')).toBe(false);
    });

    test('should exclude files in excluded directories', () => {
      expect(analyzer.shouldIncludeFile('.git/config')).toBe(false);
    });
  });

  describe('detectLanguage', () => {
    test('should detect JavaScript', () => {
      expect(analyzer.detectLanguage('.js')).toBe('javascript');
      expect(analyzer.detectLanguage('.jsx')).toBe('javascript');
    });

    test('should detect TypeScript', () => {
      expect(analyzer.detectLanguage('.ts')).toBe('typescript');
      expect(analyzer.detectLanguage('.tsx')).toBe('typescript');
    });

    test('should detect Python', () => {
      expect(analyzer.detectLanguage('.py')).toBe('python');
    });

    test('should detect Java', () => {
      expect(analyzer.detectLanguage('.java')).toBe('java');
    });

    test('should detect C/C++', () => {
      expect(analyzer.detectLanguage('.c')).toBe('c');
      expect(analyzer.detectLanguage('.cpp')).toBe('cpp');
      expect(analyzer.detectLanguage('.h')).toBe('c');
    });

    test('should detect Rust', () => {
      expect(analyzer.detectLanguage('.rs')).toBe('rust');
    });

    test('should detect Go', () => {
      expect(analyzer.detectLanguage('.go')).toBe('go');
    });

    test('should detect web languages', () => {
      expect(analyzer.detectLanguage('.html')).toBe('html');
      expect(analyzer.detectLanguage('.css')).toBe('css');
      expect(analyzer.detectLanguage('.scss')).toBe('scss');
    });

    test('should detect data formats', () => {
      expect(analyzer.detectLanguage('.json')).toBe('json');
      expect(analyzer.detectLanguage('.yaml')).toBe('yaml');
      expect(analyzer.detectLanguage('.sql')).toBe('sql');
    });

    test('should return plaintext for unknown extensions', () => {
      expect(analyzer.detectLanguage('.xyz')).toBe('plaintext');
    });
  });

  describe('countFiles', () => {
    test('should count single file', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 10,
        mtime: new Date()
      });

      const count = await analyzer.countFiles('test.js');
      expect(count).toBe(1);
    });

    test('should count files in directory', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.stat.mockResolvedValue({
        isFile: () => false,
        isDirectory: () => true,
        size: 0,
        mtime: new Date()
      });
      globby.mockResolvedValue(['file1.js', 'file2.py', 'file3.java']);

      const count = await analyzer.countFiles('src');
      expect(count).toBe(3);
    });

    test('should return 0 for non-existent path', async () => {
      fs.pathExists.mockResolvedValue(false);

      const count = await analyzer.countFiles('nonexistent');
      expect(count).toBe(0);
    });
  });

  describe('analyzeFile', () => {
    test('should return null for excluded files', async () => {
      const result = await analyzer.analyzeFile('node_modules/test.js');
      expect(result).toBeNull();
    });

    test('should analyze included files', async () => {
      fs.readFile.mockResolvedValue('const test = "hello";');
      fs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 21,
        mtime: new Date()
      });

      const result = await analyzer.analyzeFile('test.js');

      expect(result).toHaveProperty('content', 'const test = "hello";');
      expect(result).toHaveProperty('language', 'javascript');
      expect(result).toHaveProperty('hash');
      expect(result).toHaveProperty('relativePath', 'test.js');
    });

    test('should calculate relative path when basePath provided', async () => {
      fs.readFile.mockResolvedValue('print("hello")');
      fs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 13,
        mtime: new Date()
      });

      const result = await analyzer.analyzeFile('src/main.py', 'src');

      expect(result.relativePath).toBe('main.py');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});