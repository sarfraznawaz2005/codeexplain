const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { ConfigManager } = require('../config/configManager');
const { CodeAnalyzer } = require('../core/codeAnalyzer');
const { AIEngine } = require('../ai/aiEngine');
const { HTMLOutput } = require('../output/html/htmlOutput');
const { PDFOutput } = require('../output/pdf/pdfOutput');
const { PromptManager } = require('../ai/promptManager');
const { FlowchartGenerator } = require('../flowchart/flowchartGenerator');
const {
  MODE_LINE_BY_LINE,
  MODE_FLOWCHART,
  MODE_ARCHITECTURE,
  MODE_ONBOARDING,
  OUTPUT_PDF,
  OUTPUT_HTML
} = require('../utils/constants');

async function generateFlowchart(analysis, config) {
  return FlowchartGenerator.generate(analysis, config);
}

async function explain(paths, options) {
  try {
    console.log(chalk.cyan.bold(`
 ██████╗ ██████╗ ██████╗ ███████╗███████╗██╗  ██╗██████╗ ██╗      █████╗ ██╗███╗   ██╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔════╝╚██╗██╔╝██╔══██╗██║     ██╔══██╗██║████╗  ██║
██║     ██║   ██║██║  ██║█████╗  █████╗   ╚███╔╝ ██████╔╝██║     ███████║██║██╔██╗ ██║
██║     ██║   ██║██║  ██║██╔══╝  ██╔══╝   ██╔██╗ ██╔═══╝ ██║     ██╔══██║██║██║╚██╗██║
╚██████╗╚██████╔╝██████╔╝███████╗███████╗██╔╝ ██╗██║     ███████╗██║  ██║██║██║ ╚████║
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝
`));
    console.log(chalk.cyan.bold('🚀 Starting CodeExplain...'));

    // Ensure paths is an array
    const pathArray = Array.isArray(paths) ? paths : [paths];

    // Initialize configuration
    const configManager = new ConfigManager(options.config);
    const config = await configManager.loadConfig();

    // Create final config with proper precedence: CLI > Config > Environment
    // To achieve this, we need to selectively apply CLI options that were explicitly provided
    // Check for explicitly provided options by looking for their flags in process.argv
    const cliArgs = process.argv;
    
    // Build final config with proper precedence
    const finalConfig = {
      // Start with the loaded config which includes environment variables
      ...config,
      // Override with CLI options that were explicitly specified
      provider: (cliArgs.includes('--provider')) ? options.provider : config.provider,
      output: (cliArgs.includes('--output')) ? options.output : config.output,
      mode: (cliArgs.includes('--mode') || cliArgs.includes('-m')) ? options.mode : config.mode,
      level: (cliArgs.includes('--level') || cliArgs.includes('-l')) ? options.level : config.level,
      maxTokens: (cliArgs.includes('--max-tokens') || cliArgs.includes('-t')) ? parseInt(options.maxTokens) : config.maxTokens,
      model: (cliArgs.includes('--model') || cliArgs.includes('-M')) ? options.model : config.model,
      baseUrl: (cliArgs.includes('--base-url')) ? options.baseUrl : config.baseUrl,
      cache: (cliArgs.includes('--no-cache')) ? false : config.cache, // --no-cache sets cache to false
      // Always use values that are not subject to default conflicts
      verbose: options.verbose,
      paths: pathArray,
      // For API key, follow precedence: CLI > Config (this was already handled correctly)
      apiKey: options.apiKey || options.apikey || config.apiKey
    };
    
    // Remove lowercase variant if it exists to standardize on camelCase
    delete finalConfig.apikey;

    // Validate linebyline mode restrictions
    if (finalConfig.mode === MODE_LINE_BY_LINE) {
      // Check if multiple files are provided
      if (pathArray.length > 1) {
        console.log(chalk.red('❌ Error: Line-by-line mode can only be used with a single file.'));
        console.log(chalk.yellow('💡 Tip: Use line-by-line mode with individual files:'));
        console.log(chalk.gray('   codeexplain path/to/single/file.js --mode linebyline'));
        process.exit(1);
      }

      // Check if the single path is a directory
      const singlePath = pathArray[0];
      try {
        const stats = await fs.promises.stat(singlePath);
        if (stats.isDirectory()) {
          console.log(chalk.red('❌ Error: Line-by-line mode can only be used with individual files, not directories.'));
          console.log(chalk.yellow('💡 Tip: Use line-by-line mode with a single file:'));
          console.log(chalk.gray('   codeexplain path/to/single/file.js --mode linebyline'));
          process.exit(1);
        }
      } catch (error) {
        // File doesn't exist, let the normal error handling take care of it
      }
    }

    // Verbose: Show configuration
    if (options.verbose) {
      console.log(chalk.gray('📋 Configuration:'));
      console.log(chalk.gray(`   Paths: ${pathArray.join(', ')}`));
      console.log(chalk.gray(`   Provider: ${finalConfig.provider}`));
      console.log(chalk.gray(`   Model: ${finalConfig.model}`));
      console.log(chalk.gray(`   Output: ${finalConfig.output}`));
      console.log(chalk.gray(`   Mode: ${finalConfig.mode}`));
      console.log(chalk.gray(`   Level: ${finalConfig.level}`));
      console.log(chalk.gray(`   Max Tokens: ${finalConfig.maxTokens}`));
      console.log(chalk.gray(`   Base URL: ${finalConfig.baseUrl || 'default'}`));
      console.log(chalk.gray(`   Cache: ${finalConfig.cache !== false ? 'enabled' : 'disabled'}`));
      console.log(chalk.gray(`   Verbose: enabled`));
      console.log('');
    }

    // Initialize prompt manager to ensure prompts directory exists
    const promptManager = new PromptManager();
    await promptManager.initialize();

    // Initialize components
    const codeAnalyzer = new CodeAnalyzer(finalConfig);

    // Analyze all paths
    console.log(chalk.yellow(`🔍 Analyzing: ${pathArray.join(', ')}`));

    const allAnalysis = [];
    for (const filePath of pathArray) {
      if (options.verbose) {
        console.log(chalk.gray(`   Analyzing path: ${filePath}`));
      }
      const analysis = await codeAnalyzer.analyze(filePath);
      if (Array.isArray(analysis)) {
        allAnalysis.push(...analysis);
      } else if (analysis) {
        allAnalysis.push(analysis);
      }
    }

    console.log(chalk.green(`📁 Found ${allAnalysis.length} file(s) to analyze`));

    // Verbose: Show file details
    if (options.verbose) {
      console.log(chalk.gray('📄 Files to analyze:'));
      allAnalysis.forEach((file, index) => {
        console.log(chalk.gray(`   ${index + 1}. ${file.relativePath} (${file.language}) - ${file.content.length} chars`));
      });
      console.log('');
    }

    console.log(chalk.green('✅ Code analysis completed!'));

    // Handle mode aliases
    let effectiveMode = finalConfig.mode;
    if (effectiveMode === 'arch') {
      effectiveMode = 'architecture';
    }

    // Check if we should run in flowchart, architecture, or onboarding mode
    let explanations;
    if (!finalConfig.apiKey) {
      console.log(chalk.yellow('⚠️ No API key provided. Running in offline mode.'));
      // In offline mode, we just return the code analysis without AI explanations
      if (finalConfig.mode === MODE_FLOWCHART || effectiveMode === 'architecture' || finalConfig.mode === MODE_ONBOARDING) {
        // For special modes, return appropriate message
        explanations = [{
          relativePath: effectiveMode === 'architecture' ? 'Project Architecture' : 
                      finalConfig.mode === MODE_ONBOARDING ? 'Developer Onboarding' : 'Project Flowchart',
          path: effectiveMode === 'architecture' ? 'project-architecture' : 
                finalConfig.mode === MODE_ONBOARDING ? 'developer-onboarding' : 'project-flowchart',
          language: finalConfig.mode,
          explanation: 'Offline mode: AI analysis not available. Please provide an API key to get AI-powered architecture overview.'
        }];
      } else {
        explanations = allAnalysis.map(item => item ? { ...item, explanation: 'Offline mode: AI explanation not available. Please provide an API key to get AI-powered explanations.' } : null);
      }
    } else if (finalConfig.mode === MODE_FLOWCHART) {
      console.log(chalk.yellow('📊 Generating flowchart visualization...'));
      const flowchartResult = await generateFlowchart(allAnalysis, finalConfig);
      explanations = [flowchartResult];
      console.log(chalk.green('✅ Flowchart generation completed!'));
    } else if (effectiveMode === 'architecture') {
      console.log(chalk.yellow('🔍 Creating file summaries for analysis:'));
      const aiEngine = new AIEngine(finalConfig);
      let fileCounter = 0;
      explanations = await aiEngine.generateExplanations(allAnalysis, (filePath, completed, total, progress, cached, isStarting) => {
        // Convert to relative path from the scanned folder
        let displayPath = filePath;
        if (pathArray.length === 1) {
          const relativePath = path.relative(pathArray[0], filePath);
          displayPath = relativePath || path.basename(filePath); // Use basename if relative is empty
        } else {
          // For multiple paths, show relative to the common base or just filename
          displayPath = path.basename(filePath);
        }

        // Only show completion status to avoid duplicate entries
        if (!isStarting) {
          fileCounter++;
          const cacheIndicator = cached ? chalk.gray('[CACHE] ') : '';
          const formattedProgress = progress.toString().padStart(2, '0');
          const progressText = chalk.cyan(`[${formattedProgress}%] ${cacheIndicator}`);
          const paddedCounter = fileCounter.toString().padStart(2, '0');
          console.log(`${paddedCounter} - ${progressText}${displayPath}`);
        }
      });
      console.log(chalk.yellow('🏗️ Generating architecture overview...'));
      console.log(chalk.green('✅ Architecture overview generation completed!'));
    } else if (finalConfig.mode === MODE_ONBOARDING) {
      console.log(chalk.yellow('🔍 Creating file summaries for analysis:'));
      const aiEngine = new AIEngine(finalConfig);
      let fileCounter = 0;
      explanations = await aiEngine.generateExplanations(allAnalysis, (filePath, completed, total, progress, cached, isStarting) => {
        // Convert to relative path from the scanned folder
        let displayPath = filePath;
        if (pathArray.length === 1) {
          const relativePath = path.relative(pathArray[0], filePath);
          displayPath = relativePath || path.basename(filePath); // Use basename if relative is empty
        } else {
          // For multiple paths, show relative to the common base or just filename
          displayPath = path.basename(filePath);
        }

        // Only show completion status to avoid duplicate entries
        if (!isStarting) {
          fileCounter++;
          const cacheIndicator = cached ? chalk.gray('[CACHE] ') : '';
          const formattedProgress = progress.toString().padStart(2, '0');
          const progressText = chalk.cyan(`[${formattedProgress}%] ${cacheIndicator}`);
          const paddedCounter = fileCounter.toString().padStart(2, '0');
          console.log(`${paddedCounter} - ${progressText}${displayPath}`);
        }
      });
      console.log(chalk.yellow('👨‍💻 Generating onboarding guide...'));
      console.log(chalk.green('✅ Onboarding guide generation completed!'));
    } else {
      // Generate AI explanations with progress tracking for normal modes
      const aiEngine = new AIEngine(finalConfig);
      console.log(chalk.yellow('🤖 Generating AI explanations...'));

      // Verbose: Show AI engine details
      if (options.verbose) {
        console.log(chalk.gray(`   AI Provider: ${finalConfig.provider}`));
        console.log(chalk.gray(`   Model: ${finalConfig.model}`));
        console.log(chalk.gray(`   Max Tokens: ${finalConfig.maxTokens}`));
        console.log(chalk.gray(`   Retry Attempts: ${finalConfig.retry?.attempts || 3}`));
        console.log('');
      }

       let fileCounter = 0;
      explanations = await aiEngine.generateExplanations(allAnalysis, (filePath, completed, total, progress, cached, isStarting) => {
        // Convert to relative path from the scanned folder
        let displayPath = filePath;
        if (pathArray.length === 1) {
          const relativePath = path.relative(pathArray[0], filePath);
          displayPath = relativePath || path.basename(filePath); // Use basename if relative is empty
        } else {
          // For multiple paths, show relative to the common base or just filename
          displayPath = path.basename(filePath);
        }

        // Only show completion status to avoid duplicate entries
        if (!isStarting) {
          fileCounter++;
          const cacheIndicator = cached ? chalk.gray('[CACHE] ') : '';
          const formattedProgress = progress.toString().padStart(2, '0');
          const progressText = chalk.cyan(`[${formattedProgress}%] ${cacheIndicator}`);
          const paddedCounter = fileCounter.toString().padStart(2, '0');
          console.log(`${paddedCounter} - ${progressText}${displayPath}`);
        }
      });

      console.log(chalk.green('✅ AI explanations completed!'));

      // Show usage summary
      const usageSummary = aiEngine.getUsageSummary();
      console.log('');
      console.log(chalk.blue.bold('📊 Usage Summary:'));
      console.log(chalk.white(`   Files processed: ${usageSummary.processedFiles}`));
      console.log(chalk.white(`   Files from cache: ${usageSummary.cachedFiles}`));
      console.log(chalk.cyan(`   Input tokens: ${usageSummary.totalInputTokens.toLocaleString()}`));
      console.log(chalk.cyan(`   Output tokens: ${usageSummary.totalOutputTokens.toLocaleString()}`));
      console.log(chalk.yellow(`   Total tokens: ${usageSummary.totalTokens.toLocaleString()}`));
    }

    // Generate output
    const title = `Code Explanation: ${pathArray.join(', ')}`;

    // Verbose: Show output generation details
    if (options.verbose) {
      console.log(chalk.gray('📤 Generating output:'));
      console.log(chalk.gray(`   Format: ${finalConfig.output.toUpperCase()}`));
      console.log(chalk.gray(`   Title: ${title}`));
      console.log(chalk.gray(`   Files processed: ${explanations.length}`));
      console.log('');
    }

    if (finalConfig.output === OUTPUT_PDF) {
      const pdfOutput = new PDFOutput(finalConfig);
      await pdfOutput.generate(explanations, 'codeexplain-output.pdf', title);
      console.log(chalk.green('📄 PDF documentation generated successfully!'));

      if (options.verbose) {
        console.log(chalk.gray('   Output file: codeexplain-output.pdf'));
      }
    } else {
      const htmlOutput = new HTMLOutput(finalConfig);
      await htmlOutput.generate(explanations, 'codeexplain-output.html', title);
      console.log(chalk.green('🌐 HTML documentation generated successfully!'));

      if (options.verbose) {
        console.log(chalk.gray('   Output file: codeexplain-output.html'));
      }
    }
  } catch (error) {
    const errorLine = error.stack && error.stack.split('\n')[1]
      ? error.stack.split('\n')[1].trim()
      : ''
    console.error(
      chalk.red('❌ Error running CodeExplain:'),
      error.message,
      chalk.gray(`(${__filename}${errorLine ? ' ' + errorLine : ''})`)
    )
    process.exit(1);
  }
}

module.exports = { explain };