 const path = require('path');
const { ChatOpenAI } = require('@langchain/openai');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { ChatOllama } = require('@langchain/ollama');
const chalk = require('chalk');
const { CacheManager } = require('../core/cacheManager');
const { PromptManager } = require('./promptManager');
const { Logger } = require('../utils/logger');
const { dd } = require('../utils/utils'); // Debugging helper
const { encoding_for_model } = require('tiktoken');

// Constants
const PROVIDERS = {
  GEMINI: 'gemini',
  OPENAI: 'openai',
  OLLAMA: 'ollama'
};

const MODES = {
  EXPLAIN: 'explain',
  ARCHITECTURE: 'architecture',
  ARCH: 'arch',
  LINE_BY_LINE: 'linebyline',
  SUMMARY: 'summary'
};

const USER_LEVELS = {
  EXPERT: 'expert',
  BEGINNER: 'beginner'
};

const { DEFAULT_CONCURRENCY, MAX_CONCURRENCY } = require('../utils/constants');

class AIEngine {
  constructor(config) {
    this.config = config;
    this.provider = config.provider ?? PROVIDERS.GEMINI;
    this.model = config.model; // Allow model specification
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl; // For Ollama or custom endpoints
    this.verbose = config.verbose || false;
    this.concurrency = Math.min(config.concurrency || DEFAULT_CONCURRENCY, MAX_CONCURRENCY);

    // Initialize logger
    this.logger = new Logger({ verbose: this.verbose });

    // Initialize managers
    this.cacheManager = new CacheManager();
    this.promptManager = new PromptManager();

    // Initialize managers immediately
    this.init();

    // Initialize token tracking
    this.tokenUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      cachedFiles: 0,
      processedFiles: 0
    };

    // Validate API key (not required for Ollama)
    if (!this.apiKey && this.provider !== 'ollama') {
      throw new Error('API key required for ' + this.provider + '. Please provide an API key via --apikey option or config file.');
    }

    // Set up model based on provider
    this.setupModel();
  }

  async init() {
    await this.cacheManager.initialize();
    await this.promptManager.initialize();
  }

  setupModel() {
    if (this.provider === PROVIDERS.GEMINI) {
      this.modelInstance = new ChatGoogleGenerativeAI({
        apiKey: this.apiKey,
        modelName: this.model || 'gemini-2.5-flash',
        maxOutputTokens: this.config.maxTokens || 15000
      });
    } else if (this.provider === PROVIDERS.OPENAI) {
      this.modelInstance = new ChatOpenAI({
        openAIApiKey: this.apiKey,
        modelName: this.model || 'gpt-4o',
        maxTokens: this.config.maxTokens || 15000,
        ...(this.baseUrl && { configuration: { baseURL: this.baseUrl } })
      });
    } else if (this.provider === PROVIDERS.OLLAMA) {
      this.modelInstance = new ChatOllama({
        baseUrl: this.baseUrl || 'http://localhost:11434',
        model: this.model || 'llama2',
        maxTokens: this.config.maxTokens || 15000
      });
    } else {
      const supportedProviders = Object.values(PROVIDERS).join(', ');
      throw new Error(`Unsupported AI provider: ${this.provider}. Supported providers are: ${supportedProviders}`);
    }
  }

  // Helper function for logging with consistent format
  _log(level, message) {
    switch (level) {
      case 'error':
        console.error(chalk.redBright(`❌ Error: ${message}`));
        break;
      case 'warn':
        console.warn(chalk.yellowBright(`⚠️ Warning: ${message}`));
        break;
      case 'info':
        if (this.verbose) {
          const msg = typeof message === 'function' ? message() : message;
          console.log(chalk.gray(`ℹ️ ${msg}`));
        }
        break;
    }
  }

  // Helper function for exponential backoff retry
  async retryWithBackoff(fn) {
    const retries = this.config.retry?.attempts || 3;
    let delay = this.config.retry?.delay || 1000;
    let lastError;

    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // If this was the last attempt, throw the error
        if (i === retries) {
          throw error;
        }

        // Log retry attempt
        this._log('warn', `Attempt ${i + 1} failed. Retrying in ${delay}ms...`);

        // Wait for the delay
        await new Promise(resolve => setTimeout(resolve, delay));

        // Exponential backoff: double the delay for next attempt
        delay *= 2;
      }
    }

    throw lastError;
  }

  // Estimate tokens using LangChain response metadata if available, otherwise use proper tokenization
  estimateTokens(text, metadata) {
    if (metadata && typeof metadata.completion_tokens === 'number' && typeof metadata.prompt_tokens === 'number') {
      // If both prompt and completion tokens are available, return their sum
      return metadata.prompt_tokens + metadata.completion_tokens
    }
    if (metadata && typeof metadata.total_tokens === 'number') {
      return metadata.total_tokens
    }
    if (!text) return 0

    // Use proper tokenization for OpenAI models
    if (this.provider === PROVIDERS.OPENAI) {
      try {
        // Map model names to tiktoken encoding
        let encodingName = 'cl100k_base'; // Default for GPT-3.5-turbo and GPT-4
        if (this.model && this.model.includes('gpt-4o')) {
          encodingName = 'o200k_base'; // GPT-4o uses o200k_base
        }

        const encoding = encoding_for_model(this.model || 'gpt-3.5-turbo', encodingName);
        const tokens = encoding.encode(text);
        encoding.free();
        return tokens.length;
      } catch (error) {
        // Fallback to rough estimate if tiktoken fails
        this._log('warn', `Failed to tokenize with tiktoken: ${error.message}`);
        return Math.ceil(text.length / 4);
      }
    }

    // For other providers, use rough estimate (1 token ≈ 4 chars)
    return Math.ceil(text.length / 4)
  }

  // Get usage summary
  getUsageSummary() {
    return {
      ...this.tokenUsage
    };
  }

  // Helper function to suggest garbage collection for large objects
  _suggestGC() {
    // Only suggest GC if --expose-gc flag is used and gc is available
    if (typeof global !== 'undefined' && global.gc) {
      try {
        global.gc();
      } catch (error) {
        // Ignore GC errors
      }
    }
  }

  // Helper function to process files in parallel batches with memory cleanup
  async processFilesInBatches(files, processFn, progressCallback = null) {
    const results = [];
    const total = files.length;
    let completed = 0;

    // Process files in batches of concurrency size
    for (let i = 0; i < files.length; i += this.concurrency) {
      const batch = files.slice(i, i + this.concurrency);
      const batchPromises = batch.map(async (file, batchIndex) => {
        const globalIndex = i + batchIndex;
        try {
          const result = await processFn(file, globalIndex);
          // Clear reference to file content immediately after processing to free memory
          if (file && file.content) {
            file.content = null;
          }
          return { success: true, result, index: globalIndex };
        } catch (error) {
          console.error(`Error processing file ${file.path || `file-${globalIndex}`}:`, error.message);
          // Clear reference even on error
          if (file && file.content) {
            file.content = null;
          }
          return { success: false, error, index: globalIndex };
        }
      });

      // Wait for the current batch to complete
      const batchResults = await Promise.allSettled(batchPromises);

      // Process batch results
      for (const batchResult of batchResults) {
        if (batchResult.status === 'fulfilled') {
          const { success, result, index } = batchResult.value;
          if (success) {
            results[index] = result;
            completed++;

            // Update progress
            if (progressCallback) {
              const progress = Math.round((completed / total) * 100);
              const file = files[index];
              progressCallback(file.path || `file-${index}`, completed, total, progress, result.cached, false);
            }
          } else {
            // Handle failed file processing
            results[index] = null;
            completed++;
            if (progressCallback) {
              const progress = Math.round((completed / total) * 100);
              const file = files[index];
              progressCallback(file.path || `file-${index}`, completed, total, progress, false, false);
            }
          }
        } else {
          // Promise was rejected
          console.error('Batch processing error:', batchResult.reason);
          completed++;
        }
      }

      // Clear batch references to help GC
      batch.length = 0;

      // Suggest garbage collection after large batches
      if (i % (this.concurrency * 5) === 0) {
        this._suggestGC();
      }
    }

    return results;
  }

  // Helper function to process files with request batching for compatible providers
  async processFilesWithRequestBatching(files, progressCallback = null, processFn = null) {
    // Default processing function
    const defaultProcessFn = processFn || (async (file, index) => await this.explainFile(file));

    // Only use request batching for providers that support it efficiently
    if (this.provider !== PROVIDERS.OPENAI) {
      // Fall back to regular batch processing
      return this.processFilesInBatches(files, defaultProcessFn, progressCallback);
    }

    const results = [];
    const total = files.length;
    let completed = 0;

    // Process files in batches, but try to batch API requests within each batch
    for (let i = 0; i < files.length; i += this.concurrency) {
      const batch = files.slice(i, i + this.concurrency);

      // Prepare batch data: check cache and build prompts
      const batchData = [];
      for (let j = 0; j < batch.length; j++) {
        const file = batch[j];
        const globalIndex = i + j;

        // For custom processing functions, just call them directly
        if (processFn) {
          try {
            const result = await defaultProcessFn(file, globalIndex);
            results[globalIndex] = result;
            completed++;
            if (progressCallback) {
              const progress = Math.round((completed / total) * 100);
              progressCallback(file.path || `file-${globalIndex}`, completed, total, progress, result.cached, false);
            }
          } catch (error) {
            console.error(`Error processing file ${file.path || `file-${globalIndex}`}:`, error.message);
            results[globalIndex] = null;
            completed++;
            if (progressCallback) {
              const progress = Math.round((completed / total) * 100);
              progressCallback(file.path || `file-${globalIndex}`, completed, total, progress, false, false);
            }
          }
          continue;
        }

        // Check cache first for default explainFile processing
        if (this.config.cache !== false) {
          const cachedExplanation = await this.cacheManager.getCachedExplanation(file.path, this.config);
          if (cachedExplanation) {
            results[globalIndex] = {
              ...file,
              explanation: cachedExplanation,
              cached: true
            };
            this.tokenUsage.cachedFiles++;
            completed++;
            if (progressCallback) {
              const progress = Math.round((completed / total) * 100);
              progressCallback(file.path || `file-${globalIndex}`, completed, total, progress, true, false);
            }
            continue;
          }
        }

        // Build prompt for non-cached files
        const prompt = await this.buildPrompt(file);
        const inputTokens = this.estimateTokens(prompt);
        this.tokenUsage.totalInputTokens += inputTokens;
        this.tokenUsage.processedFiles++;

        batchData.push({
          file,
          prompt,
          inputTokens,
          globalIndex
        });
      }

      // If we have prompts to process, use batch API calls
      if (batchData.length > 0) {
        try {
          // For OpenAI, we can use Promise.all for concurrent requests
          // In the future, this could be enhanced to use OpenAI's batch API
          const batchPromises = batchData.map(async (data) => {
            const { file, prompt, inputTokens, globalIndex } = data;

            try {
              const result = await this.retryWithBackoff(async () => {
                return await this.modelInstance.invoke([
                  { role: 'system', content: 'You are a helpful assistant that provides detailed code explanations.' },
                  { role: 'user', content: prompt }
                ]);
              });

              const response = result.content;
              const metadata = result.additional_kwargs?.response_metadata ||
                result.additional_kwargs?.usage_metadata ||
                result.lc_kwargs?.response_metadata;
              const outputTokens = this.estimateTokens(response, metadata);
              this.tokenUsage.totalOutputTokens += outputTokens;
              this.tokenUsage.totalTokens += inputTokens + outputTokens;

              // Cache the result
              if (this.config.cache !== false) {
                await this.cacheManager.setCachedExplanation(file.path, this.config, response);
              }

              // Clear file content reference to free memory
              if (file && file.content) {
                file.content = null;
              }

              return {
                success: true,
                result: {
                  ...file,
                  explanation: response,
                  cached: false
                },
                globalIndex
              };
            } catch (error) {
              console.error(`Error processing file ${file.path}:`, error.message);
              // Clear file content reference even on error
              if (file && file.content) {
                file.content = null;
              }
              return {
                success: false,
                error,
                globalIndex
              };
            }
          });

          // Execute batch requests concurrently
          const batchResults = await Promise.allSettled(batchPromises);

          // Process results
          for (const batchResult of batchResults) {
            if (batchResult.status === 'fulfilled') {
              const { success, result, globalIndex } = batchResult.value;
              if (success) {
                results[globalIndex] = result;
                completed++;
                if (progressCallback) {
                  const progress = Math.round((completed / total) * 100);
                  progressCallback(result.path || `file-${globalIndex}`, completed, total, progress, false, false);
                }
              } else {
                results[globalIndex] = null;
                completed++;
                if (progressCallback) {
                  const progress = Math.round((completed / total) * 100);
                  progressCallback(`file-${globalIndex}`, completed, total, progress, false, false);
                }
              }
            } else {
              console.error('Request batch processing error:', batchResult.reason);
              completed++;
            }
          }
        } catch (error) {
          console.error('Batch processing failed:', error);
          // Fall back to individual processing for this batch
          for (const data of batchData) {
            try {
              const result = await this.explainFile(data.file);
              results[data.globalIndex] = result;
              completed++;
              if (progressCallback) {
                const progress = Math.round((completed / total) * 100);
                progressCallback(data.file.path || `file-${data.globalIndex}`, completed, total, progress, result.cached, false);
              }
            } catch (error) {
              results[data.globalIndex] = null;
              completed++;
              if (progressCallback) {
                const progress = Math.round((completed / total) * 100);
                progressCallback(data.file.path || `file-${data.globalIndex}`, completed, total, progress, false, false);
              }
            }
          }
        }
      }
    }

    return results;
  }

  async generateExplanations(analysis, progressCallback = null) {
    // Reset token tracking
    this.tokenUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      cachedFiles: 0,
      processedFiles: 0
    };

    // Check if this is architecture or onboarding mode (codebase-level analysis)
    if (this.config.mode === 'architecture' || this.config.mode === 'arch' || this.config.mode === 'onboarding') {
      const result = await this.explainCodebaseWithAISummaries(analysis, progressCallback);
      return [result];
    }

    if (Array.isArray(analysis)) {
      // Multiple files - use request batching for better performance
      const results = await this.processFilesWithRequestBatching(analysis, progressCallback);
      return results;
    } else {
      // Single file
      const result = await this.explainFile(analysis);
      if (progressCallback) {
        progressCallback(analysis.path || 'single-file', 1, 1, 100, result.cached, false); // Completed
      }
      return result;
    }
  }

  async explainCodebaseWithAISummaries(analysisArray, progressCallback) {
    // First, generate AI summaries for each file using request batching
    const fileSummaries = await this.processFilesWithRequestBatching(
      analysisArray,
      progressCallback,
      async (file, index) => {
        // Temporarily set mode to summary to get file summaries
        const originalMode = this.config.mode;
        this.config.mode = MODES.SUMMARY;

        const summaryResult = await this.explainFile(file);

        // Restore original mode
        this.config.mode = originalMode;

        return {
          relativePath: file.relativePath,
          language: file.language,
          summary: summaryResult.explanation,
          cached: summaryResult.cached
        };
      }
    );

    // Filter out any null results and ensure proper structure
    const validSummaries = fileSummaries.filter(summary => summary !== null);

    // Now generate the final architecture/onboarding analysis using the AI summaries
    const result = await this.explainCodebaseFromSummaries(validSummaries, analysisArray);
    return result;
  }

  async explainCodebaseFromSummaries(fileSummaries, analysisArray) {
    // Create a single codebase analysis object
    const codebaseSummary = this.buildCodebaseSummary(analysisArray, fileSummaries);

    const codebaseAnalysis = {
      relativePath: (this.config.mode === 'architecture' || this.config.mode === 'arch') ? 'Project Architecture' : 'Developer Onboarding',
      path: (this.config.mode === 'architecture' || this.config.mode === 'arch') ? 'project-architecture' : 'developer-onboarding',
      language: this.config.mode,
      content: codebaseSummary,
      codebaseSummary: codebaseSummary
    };

    // Try to get cached explanation first (unless cache is disabled)
    if (this.config.cache !== false) {
      this._log('info', () => chalk.gray(`🔍 Checking cache for: ${codebaseAnalysis.relativePath}`));

      const cachedExplanation = await this.cacheManager.getCachedExplanation(
        codebaseAnalysis.path,
        this.config
      );

      if (cachedExplanation) {
        this._log('info', () => chalk.gray(`📋 Cache hit! Using cached explanation (${cachedExplanation.length} chars)`));
        // Track cached file usage
        this.tokenUsage.cachedFiles++;
        return {
          ...codebaseAnalysis,
          explanation: cachedExplanation,
          cached: true
        };
      } else {
        this._log('info', () => chalk.gray('📭 Cache miss - will generate new explanation'));
      }
    }

    const prompt = await this.buildPrompt(codebaseAnalysis);

    // Estimate input tokens (prompt)
    const inputTokens = this.estimateTokens(prompt);
    this.tokenUsage.totalInputTokens += inputTokens;
    this.tokenUsage.processedFiles++;

    // Verbose: Show prompt details
    this.logger.logVerbose(() => {
      console.log(chalk.gray(`🔍 Processing: ${codebaseAnalysis.relativePath}`));
      console.log(chalk.gray(`📝 Prompt (${prompt.length} chars, ~${inputTokens} tokens):`));
      console.log(chalk.gray('   ' + prompt.replace(/\n/g, '\n   ')));
      console.log('');
    });

    try {
      // Retry with exponential backoff using LangChain
      const result = await this.retryWithBackoff(async () => {
        return await this.modelInstance.invoke([
          { role: 'system', content: 'You are a helpful assistant that provides detailed code analysis and documentation.' },
          { role: 'user', content: prompt }
        ]);
      });

      const response = result.content;

      // Get token usage from metadata
      const metadata = result.additional_kwargs?.response_metadata ||
        result.additional_kwargs?.usage_metadata ||
        result.lc_kwargs?.response_metadata;

      // Update token tracking with actual usage if available
      const outputTokens = this.estimateTokens(response, metadata);
      this.tokenUsage.totalOutputTokens += outputTokens;
      this.tokenUsage.totalTokens += inputTokens + outputTokens;

      // Verbose: Show response details
      if (this.verbose) {
        console.log(chalk.gray(`✅ Response (${response.length} chars, ~${outputTokens} tokens):`));
        console.log(chalk.gray('   ' + response.substring(0, 200) + (response.length > 200 ? '...' : '')));
        console.log('');
      }

      // Cache the explanation (unless cache is disabled)
      if (this.config.cache !== false) {
        if (this.verbose) {
          console.log(chalk.gray(`💾 Saving to cache: ${codebaseAnalysis.relativePath}`));
        }
        await this.cacheManager.setCachedExplanation(
          codebaseAnalysis.path,
          this.config,
          response
        );
      }

      return {
        ...codebaseAnalysis,
        explanation: response,
        cached: false
      };
    } catch (error) {
      // Ensure all errors, including those after all retries, are handled here
      console.error(`Error generating ${this.config.mode} analysis:`, error && error.message ? error.message : error);
      return {
        ...codebaseAnalysis,
        explanation: `Error generating ${this.config.mode} analysis: ${error && error.message ? error.message : error}`,
        cached: false
      };
    }
  }

  async explainCodebase(analysisArray) {
    // Create a single codebase analysis object
    const codebaseSummary = this.buildCodebaseSummary(analysisArray);

    const codebaseAnalysis = {
      relativePath: this.config.mode === 'architecture' ? 'Project Architecture' : 'Developer Onboarding',
      path: this.config.mode === 'architecture' ? 'project-architecture' : 'developer-onboarding',
      language: this.config.mode,
      content: codebaseSummary,
      codebaseSummary: codebaseSummary
    };

    // Try to get cached explanation first (unless cache is disabled)
    if (this.config.cache !== false) {
      this.logger.logVerbose(() => console.log(chalk.gray(`🔍 Checking cache for: ${codebaseAnalysis.relativePath}`)));

      const cachedExplanation = await this.cacheManager.getCachedExplanation(
        codebaseAnalysis.path,
        this.config
      );

      if (cachedExplanation) {
        this.logger.logVerbose(() => console.log(chalk.gray(`📋 Cache hit! Using cached explanation (${cachedExplanation.length} chars)`)));
        // Track cached file usage
        this.tokenUsage.cachedFiles++;
        return {
          ...codebaseAnalysis,
          explanation: cachedExplanation,
          cached: true
        };
      } else {
        this.logger.logVerbose(() => console.log(chalk.gray('📭 Cache miss - will generate new explanation')));
      }
    }

    const prompt = await this.buildPrompt(codebaseAnalysis);

    // Estimate input tokens (prompt)
    const inputTokens = this.estimateTokens(prompt);
    this.tokenUsage.totalInputTokens += inputTokens;
    this.tokenUsage.processedFiles++;

    // Verbose: Show prompt details
    this.logger.logVerbose(() => {
      console.log(chalk.gray(`🔍 Processing: ${codebaseAnalysis.relativePath}`));
      console.log(chalk.gray(`📝 Prompt (${prompt.length} chars, ~${inputTokens} tokens):`));
      console.log(chalk.gray('   ' + prompt.replace(/\n/g, '\n   ')));
      console.log('');
    });

    try {
      // Retry with exponential backoff using LangChain
      const result = await this.retryWithBackoff(async () => {
        return await this.modelInstance.invoke([
          { role: 'system', content: 'You are a helpful assistant that provides detailed code analysis and documentation.' },
          { role: 'user', content: prompt }
        ]);
      });

      const response = result.content;

      // Get token usage from metadata
      const metadata = result.additional_kwargs?.response_metadata ||
        result.additional_kwargs?.usage_metadata ||
        result.lc_kwargs?.response_metadata;

      // Update token tracking with actual usage if available
      const outputTokens = this.estimateTokens(response, metadata);
      this.tokenUsage.totalOutputTokens += outputTokens;
      this.tokenUsage.totalTokens += inputTokens + outputTokens;

      // Verbose: Show response details
      if (this.verbose) {
        console.log(chalk.gray(`✅ Response (${response.length} chars, ~${outputTokens} tokens):`));
        console.log(chalk.gray('   ' + response.substring(0, 200) + (response.length > 200 ? '...' : '')));
        console.log('');
      }

      // Cache the explanation (unless cache is disabled)
      if (this.config.cache !== false) {
        if (this.verbose) {
          console.log(chalk.gray(`💾 Saving to cache: ${codebaseAnalysis.relativePath}`));
        }
        await this.cacheManager.setCachedExplanation(
          codebaseAnalysis.path,
          this.config,
          response
        );
      }

      return {
        ...codebaseAnalysis,
        explanation: response,
        cached: false
      };
    } catch (error) {
      // Ensure all errors, including those after all retries, are handled here
      console.error(`Error generating ${this.config.mode} analysis:`, error && error.message ? error.message : error);
      return {
        ...codebaseAnalysis,
        explanation: `Error generating ${this.config.mode} analysis: ${error && error.message ? error.message : error}`,
        cached: false
      };
    }
  }

  buildCodebaseSummary(analysisArray, fileSummaries = null) {
    let summary = '# Codebase Summary\n\n';

    // Group files by directory
    const dirMap = new Map();
    analysisArray.forEach(file => {
      const dir = path.dirname(file.relativePath);
      if (!dirMap.has(dir)) {
        dirMap.set(dir, []);
      }
      dirMap.get(dir).push(file);
    });

    // Add project structure
    summary += '## Project Structure\n\n';
    for (const [dir, files] of dirMap) {
      summary += `### ${dir === '.' ? 'Root Directory' : dir}\n\n`;
      files.forEach(file => {
        const fileSummary = fileSummaries ? fileSummaries.find(s => s.relativePath === file.relativePath)?.summary : this.extractPurpose(file.content, file.relativePath, file.language);
        summary += `- **${path.basename(file.relativePath)}** (${file.language}): ${fileSummary || this.extractPurpose(file.content, file.relativePath, file.language)}\n`;
      });
      summary += '\n';
    }

    // Add technology stack
    const languages = [...new Set(analysisArray.map(file => file.language))];
    const extensions = [...new Set(analysisArray.map(file => path.extname(file.relativePath)))];
    summary += '## Technology Stack\n\n';
    summary += `- **Languages**: ${languages.join(', ')}\n`;
    summary += `- **File Types**: ${extensions.join(', ')}\n\n`;

    // Add key files content (limited to avoid token limits)
    summary += '## Key Files Content\n\n';
    const keyFiles = analysisArray.filter(file =>
      file.relativePath.includes('package.json') ||
      file.relativePath.includes('main') ||
      file.relativePath.includes('index') ||
      file.relativePath.includes('app') ||
      file.relativePath.includes('config')
    ).slice(0, 5); // Limit to 5 key files

    keyFiles.forEach(file => {
      summary += `### ${file.relativePath}\n\n`;
      summary += `\`\`\`${file.language}\n${file.content.substring(0, 1000)}${file.content.length > 1000 ? '\n... (truncated)' : ''}\n\`\`\`\n\n`;
    });

    return summary;
  }

  extractPurpose(content, relativePath, language) {
    const fileName = path.basename(relativePath, path.extname(relativePath));
    const directory = path.dirname(relativePath);

    // Extract purpose based on common patterns
    if (content.includes('class ') || content.includes('function ') || content.includes('def ')) {
      if (relativePath.includes('controller') || relativePath.includes('route') || relativePath.includes('handler')) {
        return 'Handles HTTP requests and routes them to appropriate business logic';
      } else if (relativePath.includes('service') || relativePath.includes('manager')) {
        return 'Contains business logic and service operations';
      } else if (relativePath.includes('model') || relativePath.includes('entity')) {
        return 'Defines data structures and database models';
      } else if (relativePath.includes('api') || relativePath.includes('client')) {
        return 'Handles external API communications';
      } else if (relativePath.includes('util') || relativePath.includes('helper')) {
        return 'Provides utility functions and reusable code';
      } else if (relativePath.includes('config') || relativePath.includes('setting')) {
        return 'Configuration settings and environment variables';
      } else if (relativePath.includes('test') || relativePath.includes('spec')) {
        return 'Contains tests for other modules';
      } else if (relativePath.includes('main') || relativePath.includes('index') || relativePath.includes('app')) {
        return 'Application entry point and main initialization';
      }
    }

    // If no specific pattern found, return a generic description
    return `Contains code for ${fileName} module`;
  }

  async explainFile(fileAnalysis) {
    if (!fileAnalysis) return null;

    // Try to get cached explanation first (unless cache is disabled)
    if (fileAnalysis.path && this.config.cache !== false) {
      this._log('info', () => chalk.gray(`🔍 Checking cache for: ${fileAnalysis.relativePath}`));

      const cachedExplanation = await this.cacheManager.getCachedExplanation(
        fileAnalysis.path,
        this.config
      );

      if (cachedExplanation) {
        this._log('info', () => chalk.gray(`📋 Cache hit! Using cached explanation (${cachedExplanation.length} chars)`));
        // Track cached file usage
        this.tokenUsage.cachedFiles++;
        return {
          ...fileAnalysis,
          explanation: cachedExplanation,
          cached: true
        };
      } else {
        this._log('info', () => chalk.gray('📭 Cache miss - will generate new explanation'));
      }
    }

    const prompt = await this.buildPrompt(fileAnalysis);

    // Estimate input tokens (prompt)
    const inputTokens = this.estimateTokens(prompt);
    this.tokenUsage.totalInputTokens += inputTokens;
    this.tokenUsage.processedFiles++;

    // Verbose: Show prompt details
    this._log('info', () => {
      const output = [];
      output.push(chalk.gray(`🔍 Processing: ${fileAnalysis.relativePath}`));
      output.push(chalk.gray(`📝 Prompt (${prompt.length} chars, ~${inputTokens} tokens):`));
      output.push(chalk.gray('   ' + prompt.replace(/\n/g, '\n   ')));
      output.push('');
      return output.join('\n');
    });

    try {
      // Retry with exponential backoff using LangChain
      const result = await this.retryWithBackoff(async () => {
        return await this.modelInstance.invoke([
          { role: 'system', content: 'You are a helpful assistant that provides detailed code explanations.' },
          { role: 'user', content: prompt }
        ]);
      });

      const response = result.content;

      // Get token usage from metadata
      const metadata = result.additional_kwargs?.response_metadata ||
        result.additional_kwargs?.usage_metadata ||
        result.lc_kwargs?.response_metadata;

      // Update token tracking with actual usage if available
      const outputTokens = this.estimateTokens(response, metadata);
      this.tokenUsage.totalOutputTokens += outputTokens;
      this.tokenUsage.totalTokens += inputTokens + outputTokens;

      // Verbose: Show response details
      this._log('info', () => {
        const output = [];
        output.push(chalk.gray(`✅ Response (${response.length} chars, ~${outputTokens} tokens):`));
        output.push(chalk.gray('   ' + response.substring(0, 200) + (response.length > 200 ? '...' : '')));
        output.push('');
        return output.join('\n');
      });

      // Cache the explanation (unless cache is disabled)
      if (fileAnalysis.path && this.config.cache !== false) {
        this._log('info', () => chalk.gray(`💾 Saving to cache: ${fileAnalysis.relativePath}`));
        await this.cacheManager.setCachedExplanation(
          fileAnalysis.path,
          this.config,
          response
        );
      }

      // Clear file content reference to free memory
      if (fileAnalysis && fileAnalysis.content) {
        fileAnalysis.content = null;
      }

      return {
        ...fileAnalysis,
        explanation: response,
        cached: false
      };
    } catch (error) {
      // Ensure all errors, including those after all retries, are handled here
      console.error(`Error explaining file ${fileAnalysis.path}:`, error && error.message ? error.message : error);

      // Clear file content reference even on error
      if (fileAnalysis && fileAnalysis.content) {
        fileAnalysis.content = null;
      }

      return {
        ...fileAnalysis,
        explanation: `Error generating explanation: ${error && error.message ? error.message : error}`,
        cached: false
      };
    }
  }

  async buildPrompt(fileAnalysis) {
    const levelDescription = this.config.level === USER_LEVELS.EXPERT
      ? 'an expert developer'
      : 'a beginner developer';

    // Get the appropriate prompt template
    let mode = this.config.mode || MODES.EXPLAIN;
    // Handle architecture mode alias
    if (mode === MODES.ARCH) {
      mode = MODES.ARCHITECTURE;
    }
    const promptTemplate = await this.promptManager.getPrompt(mode);

    // Render the prompt with variables
    let variables = {
      levelDescription: levelDescription,
      language: fileAnalysis.language,
      filePath: fileAnalysis.path,
      codeContent: fileAnalysis.content
    };

    // For architecture and onboarding modes, use codebaseSummary instead
    if (mode === MODES.ARCHITECTURE || mode === 'onboarding') {
      variables = {
        levelDescription: levelDescription,
        codebaseSummary: fileAnalysis.codebaseSummary || fileAnalysis.content
      };
    }

    const prompt = await this.promptManager.renderPrompt(promptTemplate, variables);

    // Add instruction to always respond in markdown
    return `${prompt}\n\nIMPORTANT: Always respond in markdown format.`;
  }
}

module.exports = { AIEngine };