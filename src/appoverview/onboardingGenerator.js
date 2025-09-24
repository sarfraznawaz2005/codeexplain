const path = require('path');

class OnboardingGenerator {
  /**
   * Generate an onboarding guide from code analysis to help new developers
   * @param {Array} analysis - Array of analyzed files with their content and metadata
   * @param {Object} config - Configuration options for onboarding generation
   * @returns {Object} Generated onboarding guide
   */
  static async generate(analysis, config) {
    try {
      // First, get individual file summaries
      const fileSummaries = analysis.map(file => ({
        relativePath: file.relativePath,
        language: file.language,
        purpose: this.extractPurpose(file.content, file.relativePath, file.language),
        keyFeatures: this.extractKeyFeatures(file.content, file.relativePath)
      }));

      // Generate comprehensive onboarding guide based on file summaries
      const onboardingGuide = await this.generateOnboardingGuide(fileSummaries, analysis, config);
      
      return {
        relativePath: 'Developer Onboarding',
        path: 'developer-onboarding',
        language: 'onboarding',
        content: onboardingGuide,
        explanation: onboardingGuide
      };
    } catch (error) {
      console.error('Error generating onboarding guide:', error.message);
      return {
        relativePath: 'Developer Onboarding',
        path: 'developer-onboarding',
        language: 'onboarding',
        explanation: 'Error generating onboarding guide. Please check the code structure.',
        error: error.message
      };
    }
  }

  /**
   * Extract the purpose of a file based on its content, name and language
   * @param {string} content - File content
   * @param {string} relativePath - File relative path
   * @param {string} language - Programming language
   * @returns {string} Purpose of the file
   */
  static extractPurpose(content, relativePath, language) {
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
      } else if (relativePath.includes('readme') || relativePath.includes('package')) {
        return 'Project documentation and configuration';
      }
    }

    // If no specific pattern found, return a generic description
    return `Contains code for ${fileName} module`;
  }

  /**
   * Extract key features from a file
   * @param {string} content - File content
   * @param {string} relativePath - File relative path
   * @returns {Array} Key features of the file
   */
  static extractKeyFeatures(content, relativePath) {
    const features = [];
    
    // Look for common patterns that indicate key features
    if (content.match(/export|module\.exports/)) {
      features.push('Exports functionality for use by other modules');
    }
    
    if (content.match(/async|await|Promise/)) {
      features.push('Uses asynchronous operations');
    }
    
    if (content.match(/try|catch|throw|error/)) {
      features.push('Implements error handling');
    }
    
    if (content.match(/test|spec|describe|it|expect|assert/)) {
      features.push('Contains testing code');
    }
    
    if (content.match(/config|env|process\.env/)) {
      features.push('Handles configuration or environment variables');
    }
    
    if (content.match(/http|get|post|put|delete|fetch|axios/)) {
      features.push('Handles network requests');
    }
    
    if (content.match(/database|db|sql|query|connect/)) {
      features.push('Interacts with database');
    }
    
    if (features.length === 0) {
      features.push('Standard module functionality');
    }
    
    return features;
  }

  /**
   * Generate the main onboarding guide based on file summaries
   * @param {Array} fileSummaries - Array of file summaries
   * @param {Array} analysis - Full analysis array
   * @param {Object} config - Configuration
   * @returns {string} Onboarding guide in markdown
   */
  static async generateOnboardingGuide(fileSummaries, analysis, config) {
    // Group files by types for better organization
    const groupedFiles = this.groupFilesByType(fileSummaries);
    
    // Get dependencies and relationships between files
    const dependencies = this.extractDependencies(analysis);
    
    // Create the onboarding guide
    const onboardingMarkdown = `
# Developer Onboarding Guide

Welcome to the project! This guide will help you understand the codebase and get started quickly.

## 🚀 Getting Started

This project is structured to be modular and maintainable. Here's what you need to know to begin working effectively:

## 📋 Project Overview

\${this.generateProjectOverview(fileSummaries, analysis)}

## 🧭 Navigation Guide

\${this.generateNavigationGuide(groupedFiles)}

## 🔧 Development Setup

\${this.generateDevelopmentSetup(analysis)}

## 🏗️ Code Structure

\${this.generateCodeStructure(groupedFiles)}

## 🔄 Dependencies and Data Flow

\${this.generateDependenciesAndFlow(dependencies)}

## 📖 Key Files and Their Functions

\${this.generateKeyFilesAndFunctions(fileSummaries)}

## 💡 Tips for New Developers

\${this.generateTipsForNewDevs(analysis)}
    `;

    return onboardingMarkdown.trim();
  }

  /**
   * Group files by their types based on purpose
   * @param {Array} fileSummaries - Array of file summaries
   * @returns {Object} Grouped files by type
   */
  static groupFilesByType(fileSummaries) {
    const grouped = {
      controllers: [],
      services: [],
      models: [],
      utilities: [],
      configs: [],
      tests: [],
      main: [],
      apis: [],
      documentation: [],
      others: []
    };

    fileSummaries.forEach(file => {
      const purpose = file.purpose.toLowerCase();
      
      if (purpose.includes('controller') || purpose.includes('route') || purpose.includes('handler')) {
        grouped.controllers.push(file);
      } else if (purpose.includes('service') || purpose.includes('manager')) {
        grouped.services.push(file);
      } else if (purpose.includes('model') || purpose.includes('entity')) {
        grouped.models.push(file);
      } else if (purpose.includes('util') || purpose.includes('helper')) {
        grouped.utilities.push(file);
      } else if (purpose.includes('config') || purpose.includes('setting')) {
        grouped.configs.push(file);
      } else if (purpose.includes('test')) {
        grouped.tests.push(file);
      } else if (purpose.includes('main') || purpose.includes('entry') || purpose.includes('app')) {
        grouped.main.push(file);
      } else if (purpose.includes('api') || purpose.includes('client')) {
        grouped.apis.push(file);
      } else if (file.relativePath.toLowerCase().includes('readme') || file.relativePath.toLowerCase().includes('package')) {
        grouped.documentation.push(file);
      } else {
        grouped.others.push(file);
      }
    });

    return grouped;
  }

  /**
   * Generate project overview section
   * @param {Array} fileSummaries - Array of file summaries
   * @param {Array} analysis - Full analysis array
   * @returns {string} Project overview in markdown
   */
  static generateProjectOverview(fileSummaries, analysis) {
    const languages = [...new Set(analysis.map(file => file.language))];
    const fileCount = fileSummaries.length;
    
    const controllers = fileSummaries.filter(f => f.purpose.toLowerCase().includes('controller'));
    const services = fileSummaries.filter(f => f.purpose.toLowerCase().includes('service'));
    const models = fileSummaries.filter(f => f.purpose.toLowerCase().includes('model'));
    
    return `
This project consists of **\${fileCount} files** written in **\${languages.join(', ')}**.

Key components include:
- **\${controllers.length}** controller modules for handling requests
- **\${services.length}** service modules for business logic
- **\${models.length}** model modules for data management

The architecture follows a modular approach to separate concerns and maintain scalability.
    `.trim();
  }

  /**
   * Generate navigation guide section
   * @param {Object} groupedFiles - Files grouped by type
   * @returns {string} Navigation guide in markdown
   */
  static generateNavigationGuide(groupedFiles) {
    let guide = 'To navigate the codebase effectively, focus on these key areas:\n\n';
    
    Object.keys(groupedFiles).forEach(type => {
      const files = groupedFiles[type];
      if (files.length > 0) {
        const typeName = type.charAt(0).toUpperCase() + type.slice(1);
        guide += `#### \${typeName}\n`;
        guide += `Start with these \${type} files:\n`;
        
        files.slice(0, 3).forEach(file => { // Show first 3 files of each type
          guide += `- \`\${file.relativePath}\` - \${file.purpose}\n`;
        });
        
        if (files.length > 3) {
          guide += `... and \${files.length - 3} more \${type} files\n`;
        }
        
        guide += '\n';
      }
    });

    return guide;
  }

  /**
   * Generate development setup section
   * @param {Array} analysis - Full analysis array
   * @returns {string} Development setup in markdown
   */
  static generateDevelopmentSetup(analysis) {
    // Look for configuration files to determine setup requirements
    const hasPackageJson = analysis.some(file => file.relativePath.toLowerCase().includes('package.json'));
    const hasRequirements = analysis.some(file => file.relativePath.toLowerCase().includes('requirements.txt') || file.relativePath.toLowerCase().includes('pipfile'));
    const hasGemfile = analysis.some(file => file.relativePath.toLowerCase().includes('gemfile'));
    const hasPom = analysis.some(file => file.relativePath.toLowerCase().includes('pom.xml'));
    
    let setup = 'To set up your development environment:\n\n';
    
    if (hasPackageJson) {
      setup += '1. **Node.js Project**: Make sure you have Node.js installed, then run:\n   ```bash\n   npm install\n   npm run dev\n   ```\n\n';
    } else if (hasRequirements) {
      setup += '1. **Python Project**: Make sure you have Python installed, then run:\n   ```bash\n   pip install -r requirements.txt\n   ```\n\n';
    } else if (hasGemfile) {
      setup += '1. **Ruby Project**: Make sure you have Ruby and Bundler installed, then run:\n   ```bash\n   bundle install\n   ```\n\n';
    } else if (hasPom) {
      setup += '1. **Java Project**: Make sure you have Java and Maven installed, then run:\n   ```bash\n   mvn install\n   ```\n\n';
    } else {
      setup += '1. **Setup**: Check for project-specific configuration files like package.json, requirements.txt, etc.\n\n';
    }
    
    setup += '2. **API Keys**: Check configuration files for any required API keys or environment variables.\n';
    setup += '3. **Database**: Look for database configuration in config files or documentation.\n\n';
    
    return setup;
  }

  /**
   * Generate code structure section
   * @param {Object} groupedFiles - Files grouped by type
   * @returns {string} Code structure in markdown
   */
  static generateCodeStructure(groupedFiles) {
    let structure = 'The project is organized into several logical modules:\n\n';
    
    Object.keys(groupedFiles).forEach(type => {
      const files = groupedFiles[type];
      if (files.length > 0) {
        const typeName = type.charAt(0).toUpperCase() + type.slice(1);
        structure += `#### \${typeName} (\${files.length} files)\n`;
        
        files.slice(0, 2).forEach(file => {
          structure += `- \`\${file.relativePath}\`: \${file.purpose}\n`;
        });
        
        if (files.length > 2) {
          structure += `- ... \${files.length - 2} more \${type} files\n`;
        }
        
        structure += '\n';
      }
    });

    return structure;
  }

  /**
   * Extract dependencies between files
   * @param {Array} analysis - Full analysis array
   * @returns {Array} Dependencies
   */
  static extractDependencies(analysis) {
    const dependencies = [];
    
    analysis.forEach(file => {
      const content = file.content.toLowerCase();
      
      // Extract common import/require patterns based on language
      const language = file.language.toLowerCase();
      let importMatches = [];
      
      if (language.includes('javascript') || language.includes('js') || language.includes('ts')) {
        // JS/TS imports
        const jsImports = content.match(/import\s+.*?from\s+['"][^'"]+['"]|require\(['"][^'"]+['"]\)/gi);
        if (jsImports) importMatches = jsImports;
      } else if (language.includes('python')) {
        // Python imports
        const pyImports = content.match(/from\s+[^\s]+\s+import|import\s+[^\s]+/gi);
        if (pyImports) importMatches = pyImports;
      } else if (language.includes('java')) {
        // Java imports
        const javaImports = content.match(/import\s+[^\s]+;/gi);
        if (javaImports) importMatches = javaImports;
      }
      
      if (importMatches.length > 0) {
        dependencies.push({
          file: file.relativePath,
          imports: importMatches.map(imp => this.extractImportPath(imp, file.relativePath))
        });
      }
    });
    
    return dependencies;
  }

  /**
   * Extract import path from import statement
   * @param {string} importStatement - Import statement
   * @param {string} currentFile - Current file path
   * @returns {string} Import path
   */
  static extractImportPath(importStatement, currentFile) {
    // Extract path from various import formats
    const match = importStatement.match(/['"][^'"]+['"]/);
    if (match) {
      return match[0].replace(/['"]/g, '');
    }
    return importStatement;
  }

  /**
   * Generate dependencies and data flow section
   * @param {Array} dependencies - File dependencies
   * @returns {string} Dependencies section in markdown
   */
  static generateDependenciesAndFlow(dependencies) {
    if (dependencies.length === 0) {
      return 'No dependencies detected in the codebase.\n';
    }

    let section = 'Understanding how modules interact will help you trace code execution:\n\n';
    
    dependencies.slice(0, 5).forEach((dep, index) => { // Limit to first 5 for readability
      if (dep.imports.length > 0) {
        section += `**\${dep.file}** imports:\n`;
        dep.imports.slice(0, 3).forEach(importPath => { // Limit imports to first 3
          section += `  - \${importPath}\n`;
        });
        
        if (dep.imports.length > 3) {
          section += `  - ... and \${dep.imports.length - 3} more imports\n`;
        }
        
        section += '\n';
      }
    });

    if (dependencies.length > 5) {
      section += `... and \${dependencies.length - 5} more files\n\n`;
    }

    section += 'This shows the dependency flow through the application.\n';
    
    return section;
  }

  /**
   * Generate key files and their functions section
   * @param {Array} fileSummaries - Array of file summaries
   * @returns {string} Key files section in markdown
   */
  static generateKeyFilesAndFunctions(fileSummaries) {
    // Identify key files that new developers should understand first
    const keyFiles = fileSummaries.filter(file => {
      const purpose = file.purpose.toLowerCase();
      return purpose.includes('main') || 
             purpose.includes('entry') || 
             purpose.includes('app') ||
             purpose.includes('index') ||
             file.relativePath.toLowerCase().includes('readme') ||
             file.relativePath.toLowerCase().includes('package');
    });

    if (keyFiles.length === 0) {
      return 'No key files identified to highlight.\n';
    }

    let section = 'These are essential files every new developer should understand:\n\n';
    
    keyFiles.forEach(file => {
      section += `#### \`\${file.relativePath}\`\n`;
      section += `- **Purpose**: \${file.purpose}\n`;
      section += `- **Key Features**: \${file.keyFeatures.join(', ')}\n\n`;
    });

    return section;
  }

  /**
   * Generate tips for new developers section
   * @param {Array} analysis - Full analysis array
   * @returns {string} Tips section in markdown
   */
  static generateTipsForNewDevs(analysis) {
    const hasTests = analysis.some(file => file.relativePath.toLowerCase().includes('test') || file.relativePath.toLowerCase().includes('spec'));
    const hasReadme = analysis.some(file => file.relativePath.toLowerCase().includes('readme'));
    const hasConfig = analysis.some(file => file.relativePath.toLowerCase().includes('config'));
    
    let tips = 'Here are some tips to help you get up to speed quickly:\n\n';
    
    tips += '1. **Start with the main entry point** - Look for files named \`main.js\`, \`app.js\`, \`index.js\`, or similar to understand how the application starts.\n';
    
    if (hasReadme) {
      tips += '2. **Check the README** - Look for documentation files that may contain important setup instructions.\n';
    }
    
    if (hasTests) {
      tips += '3. **Review the tests** - Test files often provide examples of how different modules are used.\n';
    }
    
    if (hasConfig) {
      tips += '4. **Examine the configuration** - Configuration files show how the application is set up and what environment variables it needs.\n';
    }
    
    tips += '5. **Follow the data flow** - Start with request handlers and trace how data moves through services and models.\n';
    tips += '6. **Make small changes first** - Try modifying small parts of the code to understand how everything connects.\n\n';
    
    tips += 'Remember to reach out to team members if you have questions! Understanding the codebase takes time, so be patient with yourself.\n';
    
    return tips;
  }
}

module.exports = { OnboardingGenerator };