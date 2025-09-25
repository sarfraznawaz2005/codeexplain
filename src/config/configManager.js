const path = require('path');
const fs = require('fs-extra');

// Configuration constants
const CONFIG_DEFAULTS = {
  GEMINI_MODEL: 'gemini-2.5-flash',
  OPENAI_MODEL: 'gpt-4o',
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  JSON_INDENT_SPACES: 2
};

const { MAX_FILE_SIZE_MB } = require('../utils/constants');

const CONFIG_DIR_NAME = '.codeexplain';
const CONFIG_FILE_NAME = 'config.json';

class ConfigManager {
  #codeExplainDir;

  constructor(configPath) {
    this.configPath = configPath;
    this.#codeExplainDir = path.join(process.cwd(), CONFIG_DIR_NAME);
    this.defaultConfig = {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      output: 'html',
      mode: 'explain',
      level: 'beginner',
      maxTokens: 15000,
      baseUrl: null, // For Ollama or custom OpenAI endpoints
      retry: {
        attempts: CONFIG_DEFAULTS.RETRY_ATTEMPTS,
        delay: CONFIG_DEFAULTS.RETRY_DELAY
      },
      concurrency: 3,
      maxFileSize: MAX_FILE_SIZE_MB,
      codeExtensions: [
        // Web Development
        '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro',
        '.html', '.htm', '.xml', '.svg', '.css', '.scss', '.sass', '.less',
        '.php', '.asp', '.jsp', '.ejs', '.hbs', '.handlebars',

        // Backend Languages
        '.py', '.java', '.c', '.cpp', '.cxx', '.cc', '.h', '.hpp',
        '.cs', '.vb', '.fs', '.fsx', '.go', '.rs', '.swift', '.kt', '.scala',
        '.rb', '.pl', '.pm', '.tcl', '.lua', '.dart', '.r', '.m', '.matlab',

        // Systems Programming
        '.asm', '.s', '.zig', '.v', '.nim', '.crystal', '.pony',

        // Functional Programming
        '.hs', '.ml', '.fs', '.elm', '.purs', '.clj', '.cljs', '.scm', '.rkt',
        '.ex', '.exs', '.erl', '.hrl',

        // Data & Config
        '.graphql', '.gql',

        // Shell & Scripting
        '.awk', '.sed', '.perl', '.ahk',

        // Build & Config Files
        '.makefile', '.mk', '.cmake', '.gradle', '.maven', '.pom',
        '.dockerfile', '.containerfile',

        // Other
        '.raku', '.p6', '.nim', '.vala', '.genie', '.boo', '.cobra', '.ahk'
      ],
      exclude: [
        // Version control
        '.git',
        '.svn',
        '.hg',
        '.bzr',

        // Dependencies
        'node_modules',
        'vendor',
        'packages',
        'bower_components',
        'jspm_packages',
        'lib',

        // Build outputs
        'dist',
        'build',
        'target',
        'bin',
        'obj',
        '.next',
        '.nuxt',
        '.output',
        'public/build',

        // IDEs and editors
        '.vscode',
        '.idea',
        '.vs',
        '*.swp',
        '*.swo',
        '*~',

        // OS generated
        '.DS_Store',
        'Thumbs.db',
        'desktop.ini',
        '.Trashes',

        // Logs and debug
        '*.log',
        'logs',
        'log',
        '.log',
        'npm-debug.log*',
        'yarn-debug.log*',
        'yarn-error.log*',

        // Cache and temp
        '.cache',
        '__pycache__',
        '.pytest_cache',
        '.mypy_cache',
        '.tox',
        '.coverage',
        '.nyc_output',
        'coverage',
        '.eslintcache',
        '.stylelintcache',
        '.sass-cache',

        // Temporary files
        'tmp',
        'temp',
        '.tmp',
        '.temp',

        // Archives and backups
        '*.zip',
        '*.tar.gz',
        '*.tar.bz2',
        '*.tar',
        '*.rar',
        '*.7z',
        '*.bak',
        '*.backup',

        // Lock files (optional, but often not needed for explanation)
        // 'package-lock.json',
        // 'yarn.lock',
        // 'Gemfile.lock',

        // Config files that are not code
        '.env',
        '.env.local',
        '.env.*',

        // CI/CD
        '.github/workflows',
        '.gitlab-ci.yml',
        '.travis.yml',
        'Jenkinsfile',

        // Docker
        'Dockerfile.*',

        // tests
        'tests',
        'test',
        '__tests__',
        '*.test.*',
        '*cest*',
        '*.spec.*',
        'e2e',
        '*.e2e.*',

        // Other
        '.codeexplain'
      ]
    };
  }



  async loadConfig() {
    if (this._cachedConfig) {
      return this._cachedConfig
    }

    try {
      // Create config directory if it doesn't exist
      await fs.ensureDir(this.#codeExplainDir)

      // Determine config file path
      const configFile = this.configPath
        ? path.resolve(this.configPath)
        : path.join(this.#codeExplainDir, CONFIG_FILE_NAME)

      // Load existing config or create default
      let config = {}
      if (await fs.pathExists(configFile)) {
        const configContent = await fs.readJson(configFile)
        config = { ...this.defaultConfig, ...configContent }
      } else {
        config = { ...this.defaultConfig }
        await this.saveConfig(config, configFile)
      }

      // Only set environment variable as fallback if apiKey is not already set in config file
      if (!config.apiKey && process.env.CODEEXPLAIN_API_KEY) {
        config.apiKey = process.env.CODEEXPLAIN_API_KEY
      }

      // Ensure model parameter is set (for backward compatibility)
      if (!config.model && config.provider === 'gemini') {
        config.model = CONFIG_DEFAULTS.GEMINI_MODEL
      } else if (!config.model && config.provider === 'openai') {
        config.model = CONFIG_DEFAULTS.OPENAI_MODEL
      }

      this._cachedConfig = config
      return config
    } catch (err) {
      console.error('Failed to load config:', err)
      throw new Error('Could not load configuration')
    }
  }

  async saveConfig(config, configFile) {
    try {
      const configPath = configFile || path.join(this.#codeExplainDir, CONFIG_FILE_NAME)
      await fs.writeJson(configPath, config, { spaces: CONFIG_DEFAULTS.JSON_INDENT_SPACES })
      this._cachedConfig = config
    } catch (err) {
      console.error('Failed to save config:', err)
      throw new Error('Could not save configuration')
    }
  }
}

module.exports = { ConfigManager };