const path = require('path');

class ArchitectureGenerator {
  /**
   * Generate a comprehensive architecture overview from code analysis
   * @param {Array} analysis - Array of analyzed files with their content and metadata
   * @param {Object} config - Configuration options for architecture generation
   * @returns {Object} Generated architecture overview
   */
  static async generate(analysis, config) {
    try {
      // First, get individual file summaries
      const fileSummaries = analysis.map(file => ({
        relativePath: file.relativePath,
        language: file.language,
        purpose: this.extractPurpose(file.content, file.relativePath, file.language)
      }));

      // Generate comprehensive architecture based on file summaries
      const architectureOverview = await this.generateArchitectureOverview(fileSummaries, analysis, config);
      
      return {
        relativePath: 'Project Architecture',
        path: 'project-architecture',
        language: 'architecture',
        content: architectureOverview,
        explanation: architectureOverview
      };
    } catch (error) {
      console.error('Error generating architecture:', error.message);
      return {
        relativePath: 'Project Architecture',
        path: 'project-architecture',
        language: 'architecture',
        explanation: 'Error generating architecture overview. Please check the code structure.',
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
      }
    }

    // If no specific pattern found, return a generic description
    return `Contains code for ${fileName} module`;
  }

  /**
   * Generate the main architecture overview based on file summaries
   * @param {Array} fileSummaries - Array of file summaries
   * @param {Array} analysis - Full analysis array
   * @param {Object} config - Configuration
   * @returns {string} Architecture overview in markdown
   */
  static async generateArchitectureOverview(fileSummaries, analysis, config) {
    // Group files by types for better organization
    const groupedFiles = this.groupFilesByType(fileSummaries);
    
    // Get dependencies and relationships between files
    const dependencies = this.extractDependencies(analysis);
    
    // Create the architecture overview
    const architectureMarkdown = `
# Project Architecture Overview

## 🏗️ High-Level System Architecture

This document provides an overview of the system's architecture, including major components and their relationships.

## 📁 Project Structure

${this.generateProjectStructure(fileSummaries)}

## 🧩 Component Breakdown

${this.generateComponentBreakdown(groupedFiles)}

## 🔄 Data Flow and Interactions

${this.generateDataFlow(dependencies)}

## 🔧 Technology Stack

${this.generateTechnologyStack(analysis)}

## 📋 Key Modules

${this.generateKeyModules(fileSummaries)}
    `;

    return architectureMarkdown.trim();
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
      } else {
        grouped.others.push(file);
      }
    });

    return grouped;
  }

  /**
   * Generate project structure section
   * @param {Array} fileSummaries - Array of file summaries
   * @returns {string} Project structure in markdown
   */
  static generateProjectStructure(fileSummaries) {
    // Group files by directory
    const dirMap = new Map();
    
    fileSummaries.forEach(file => {
      const dir = path.dirname(file.relativePath);
      if (!dirMap.has(dir)) {
        dirMap.set(dir, []);
      }
      dirMap.get(dir).push(file);
    });

    let structure = '';
    
    for (const [dir, files] of dirMap) {
      structure += `### ${dir === '.' ? 'Root' : dir}\n\n`;
      files.forEach(file => {
        structure += `- \`${path.basename(file.relativePath)}\` - ${file.purpose}\n`;
      });
      structure += '\n';
    }

    return structure;
  }

  /**
   * Generate component breakdown section
   * @param {Object} groupedFiles - Files grouped by type
   * @returns {string} Component breakdown in markdown
   */
  static generateComponentBreakdown(groupedFiles) {
    let breakdown = '';

    Object.keys(groupedFiles).forEach(type => {
      const files = groupedFiles[type];
      if (files.length > 0) {
        const typeName = type.charAt(0).toUpperCase() + type.slice(1);
        breakdown += `### ${typeName}\n\n`;
        
        files.forEach(file => {
          breakdown += `- **${file.relativePath}** - ${file.purpose}\n`;
        });
        
        breakdown += '\n';
      }
    });

    return breakdown;
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
   * Generate data flow section
   * @param {Array} dependencies - File dependencies
   * @returns {string} Data flow in markdown
   */
  static generateDataFlow(dependencies) {
    if (dependencies.length === 0) {
      return 'No dependencies detected in the codebase.\n';
    }

    let flow = 'The following shows how different modules interact with each other:\n\n';
    
    dependencies.forEach(dep => {
      if (dep.imports.length > 0) {
        flow += `**${dep.file}** imports from:\n`;
        dep.imports.forEach(importPath => {
          flow += `  - ${importPath}\n`;
        });
        flow += '\n';
      }
    });

    return flow;
  }

  /**
   * Generate technology stack section
   * @param {Array} analysis - Full analysis array
   * @returns {string} Technology stack in markdown
   */
  static generateTechnologyStack(analysis) {
    const languages = [...new Set(analysis.map(file => file.language))];
    const extensions = [...new Set(analysis.map(file => path.extname(file.relativePath)))];
    
    return `The project uses the following technologies:\n\n- **Programming Languages**: ${languages.join(', ')}\n- **File Extensions**: ${extensions.join(', ')}\n\n`;
  }

  /**
   * Generate key modules section
   * @param {Array} fileSummaries - Array of file summaries
   * @returns {string} Key modules in markdown
   */
  static generateKeyModules(fileSummaries) {
    const keyModules = fileSummaries.filter(file => 
      file.purpose.includes('main') || 
      file.purpose.includes('entry') || 
      file.purpose.includes('app') ||
      file.relativePath.includes('index') ||
      file.relativePath.includes('main')
    );

    if (keyModules.length === 0) {
      return 'No key modules identified.\n';
    }

    let modules = 'The following are key modules that form the backbone of the application:\n\n';
    
    keyModules.forEach(module => {
      modules += `- **${module.relativePath}** - ${module.purpose}\n`;
    });

    return modules;
  }
}

module.exports = { ArchitectureGenerator };