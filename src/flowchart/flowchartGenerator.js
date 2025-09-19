const path = require('path');

class FlowchartGenerator {
  static MAX_FUNCTIONS_PER_COMPONENT = 2;
  static MAX_FUNCTIONS_TOTAL = 15;
  static MAX_DB_CONNECTIONS = 3;
  static MAX_API_CONNECTIONS = 3;

  static NODE_SHAPES = {
    DEFAULT: ['["', '"]'],
    ENTRY: ['("', '")'],
    CONFIG: ['[/', '/]'],
    SERVICE: ['{{', '}}'],
    MODEL: ['[[', ']]'],
    UTILITY: ['[(', ')]'],
    TEST: ['{{', '}}']
  };

  /**
   * Generate a comprehensive flowchart and explanation from code analysis
   * @param {Array} analysis - Array of analyzed files with their content and metadata
   * @param {Object} config - Configuration options for flowchart generation
   * @returns {Object} Generated flowchart and explanation
   */
  static generate(analysis, config) {
    try {
      // Analyze code structure to understand project relationships
      const codeStructure = FlowchartGenerator.analyzeCodeStructure(analysis);

      // Create a map of component names to their indices for faster lookups
      const componentIndexMap = new Map(
        codeStructure.components.map((comp, index) => [comp.name, index])
      );

      // Create a comprehensive flowchart based on actual code relationships
      const flowchartLines = ['flowchart TD'];

      // Add main entry points - connecting each directly to START
      flowchartLines.push('    START[("Start")]');
      if (codeStructure.entryPoints.length > 0) {
        codeStructure.entryPoints.forEach((entry, index) => {
          const safeEntryName = this.sanitizeComponentName(entry.name);
          flowchartLines.push(`    ENTRY${index + 1}[("${safeEntryName} (entry point)")]`);
          flowchartLines.push(`    START --> ENTRY${index + 1}`);
        });
      }

      // Add core components and their relationships
      codeStructure.components.forEach((component, index) => {
        const compId = `COMP${index + 1}`;

        // Get node shape based on component type
        const [nodeShape, nodeEnd] = this.getNodeShape(component.type);

        // Format the node content properly - avoid parentheses and newlines that can cause parsing issues
        const safeComponentName = this.sanitizeComponentName(component.name);
        const safeComponentType = component.type.replace(/"/g, '\\"').replace(/\n/g, ' ');
        const nodeContent = `${safeComponentName} - ${safeComponentType}`;
        flowchartLines.push(`    ${compId}${nodeShape}${nodeContent}${nodeEnd}`);

        // Only connect Main/Entry components to START if they're not already in entryPoints
        if ((component.type.includes('Main') || component.type.includes('Entry')) &&
          !codeStructure.entryPoints.some(entry => entry.name === component.name)) {
          flowchartLines.push(`    START --> ${compId}`);
        }

        // Add internal dependencies (other project modules)
        if (component.internalDependencies && component.internalDependencies.length > 0) {
          const lines = component.internalDependencies
            .map(dep => {
              const depIndex = componentIndexMap.get(dep);
              // Only create connection if dependency component exists and isn't self
              if (depIndex !== undefined && depIndex !== index) {
                return `    ${compId} --> COMP${depIndex + 1}\n`;
              }
              return null;
            })
            .filter(line => line !== null);

          if (lines.length > 0) {
            flowchartLines.push(...lines.map(line => line.trim()));
          }
        }

        // External dependencies are shown in text analysis only, not in visual flowchart
        // to keep the diagram clean and focused on internal architecture

        // Add functions/methods within component
        if (component.functions && component.functions.length > 0) {
          const funcCount = Math.min(component.functions.length, FlowchartGenerator.MAX_FUNCTIONS_PER_COMPONENT);
          component.functions.slice(0, funcCount).forEach((func, funcIndex) => {
            const funcId = `FUNC${index + 1}_${funcIndex + 1}`;
            // Escape special characters in function names
            const safeFuncName = this.sanitizeFunctionName(func.name);
            flowchartLines.push(`    ${compId} --> ${funcId}["${safeFuncName}()"]`);
          });
          if (component.functions.length > 2) {
            flowchartLines.push(`    ${compId} --> FUNC${index + 1}_MORE["${component.functions.length - 2} more funcs"]`);
          }
        }
      });

      // TODO: Add database/external connections if detected
      // Currently disabled due to extraction pattern issues
      /*
       if (codeStructure.databaseConnections.length > 0) {
         codeStructure.databaseConnections.slice(0, 3).forEach((db, index) => {
           const dbId = `DB${index + 1}`;
           const cleanName = db.name.replace(/https?:\/\//, '').split('/')[0].split('.')[0].substring(0, 15);
           const displayName = cleanName || 'Database';
           flowchartLines.push(`    ${dbId}(("${displayName}")`);
           codeStructure.components.forEach((comp, compIndex) => {
             if (comp.databases && comp.databases.includes(db.name)) {
               flowchartLines.push(`    COMP${compIndex + 1} --> ${dbId}`);
             }
           });
         });
       }

       if (codeStructure.apiConnections.length > 0) {
         codeStructure.apiConnections.slice(0, 3).forEach((api, index) => {
           const apiId = `API${index + 1}`;
           const cleanName = api.name.replace(/https?:\/\//, '').split('/')[0].split('.')[0].substring(0, 15);
           const displayName = cleanName || 'API';
           flowchartLines.push(`    ${apiId}(("${displayName}")`);
           codeStructure.components.forEach((comp, compIndex) => {
             if (comp.apis && comp.apis.includes(api.name)) {
               flowchartLines.push(`    COMP${compIndex + 1} --> ${apiId}`);
             }
           });
         });
       }
       */

      // Add completion node
      flowchartLines.push('    END[("End")]');
      codeStructure.components.forEach((_, index) => {
        flowchartLines.push(`    COMP${index + 1} --> END`);
      });

      // Create a summary of the project structure
      const summary = codeStructure.components.map((comp, index) => {
        const funcCount = comp.functions ? comp.functions.length : 0;
        const internalDepsCount = comp.internalDependencies ? comp.internalDependencies.length : 0;
        const externalDepsCount = comp.externalDependencies ? comp.externalDependencies.length : 0;
        return `${index + 1}. **${comp.name}** (${comp.type}) - ${funcCount} functions, ${internalDepsCount} internal deps, ${externalDepsCount} external deps`;
      }).join('\n');

      // Create dependency summary with all dependencies in code tags
      const externalDepsSummary = codeStructure.externalDependencies.length > 0
        ? `**External Dependencies (${codeStructure.externalDependencies.length} unique):** ${codeStructure.externalDependencies
          .filter(dep => dep && dep.trim()) // Filter out empty/null dependencies
          .map(dep => `<code>${dep.replace(/[<>&]/g, '')}</code>`) // Escape HTML and wrap in code tags
          .join(', ')}`
        : '**External Dependencies:** None detected';

      const internalDepsSummary = codeStructure.internalDependencies.length > 0
        ? `**Internal Dependencies (${codeStructure.internalDependencies.length} unique):** ${codeStructure.internalDependencies
          .filter(dep => dep && dep.trim()) // Filter out empty/null dependencies
          .map(dep => `<code>${dep.replace(/[<>&]/g, '')}</code>`) // Escape HTML and wrap in code tags
          .join(', ')}`
        : '**Internal Dependencies:** None detected';

      // Construct the beautified explanation string with enhanced HTML formatting
      const explanation = `# Project Architecture Flowchart

## 📋 Project Overview
<div class="alert alert-info border-0 shadow-sm mb-4">
  <div class="d-flex align-items-center">
    <i class="fas fa-info-circle text-info me-3 fs-5"></i>
    <div>
      <h5 class="alert-heading mb-1">Project Analysis Summary</h5>
      <p class="mb-0">This interactive flowchart visualizes how your <strong class="text-primary">${codeStructure.language.toUpperCase()}</strong> project works, including components, dependencies, and data flow patterns.</p>
    </div>
  </div>
</div>

## 🏗️ Architecture Analysis
<div class="row g-3 mb-4">
  <div class="col-md-6">
    <div class="card h-100 border-0">
       <div class="card-header bg-primary text-white border-0 d-flex align-items-center justify-content-center" style="height: 60px;">
         <h6 class="card-title text-white" style="margin: 0;">
           <i class="fas fa-sitemap me-2"></i>
           System Structure
         </h6>
       </div>
      <div class="card-body">
        <p class="text-muted small mb-2">This analysis reveals the structure and relationships within your codebase:</p>
        <ul class="list-unstyled mb-0">
          <li class="mb-2 d-flex align-items-start">
            <i class="fas fa-play-circle text-success me-2 mt-1"></i>
            <div><strong>Entry Points</strong><br><small class="text-muted">Main execution paths and application starting points</small></div>
          </li>
          <li class="mb-2 d-flex align-items-start">
            <i class="fas fa-cubes text-primary me-2 mt-1"></i>
            <div><strong>Core Components</strong><br><small class="text-muted">Primary modules and classes that form the application backbone</small></div>
          </li>
          <li class="mb-2 d-flex align-items-start">
            <i class="fas fa-project-diagram text-info me-2 mt-1"></i>
            <div><strong>Data Flow</strong><br><small class="text-muted">How data moves between components and external systems</small></div>
          </li>
        </ul>
      </div>
    </div>
  </div>
  <div class="col-md-6">
    <div class="card h-100 border-0">
       <div class="card-header bg-success text-white border-0 d-flex align-items-center justify-content-center" style="height: 60px;">
         <h6 class="card-title text-white" style="margin: 0;">
           <i class="fas fa-plug me-2"></i>
           Integration Points
         </h6>
       </div>
      <div class="card-body">
        <p class="text-muted small mb-2">External connections and service integrations:</p>
        <ul class="list-unstyled mb-0">
          <li class="mb-2 d-flex align-items-start">
            <i class="fas fa-database text-warning me-2 mt-1"></i>
            <div><strong>Database Connections</strong><br><small class="text-muted">Database and storage system integrations</small></div>
          </li>
          <li class="mb-2 d-flex align-items-start">
            <i class="fas fa-globe text-danger me-2 mt-1"></i>
            <div><strong>API Connections</strong><br><small class="text-muted">External API and web service integrations</small></div>
          </li>
          <li class="mb-2 d-flex align-items-start">
            <i class="fas fa-code-branch text-secondary me-2 mt-1"></i>
            <div><strong>Function Organization</strong><br><small class="text-muted">How functionality is distributed across the codebase</small></div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</div>

## 📦 Key Components
<div class="card border-0 mb-4">
  <div class="card-header bg-gradient-primary bg-dark text-white border-0 d-flex align-items-center justify-content-between" style="height: 60px;">
    <h6 class="card-title text-white" style="margin: 0;">
      <i class="fas fa-cube me-2"></i>
      Core Components (${codeStructure.components.length})
    </h6>
    <span class="badge bg-white text-dark">${codeStructure.components.length} modules</span>
  </div>
  <div class="card-body p-0">
    <div class="table-responsive">
      <table class="table table-hover mb-0">
        <thead class="table-light">
          <tr>
            <th class="border-0 fw-semibold">Component</th>
            <th class="border-0 fw-semibold text-center">Type</th>
            <th class="border-0 fw-semibold text-center">Functions</th>
            <th class="border-0 fw-semibold text-center">Dependencies</th>
          </tr>
        </thead>
        <tbody>
          ${codeStructure.components.map((comp, index) => {
        const funcCount = comp.functions ? comp.functions.length : 0;
        const internalDepsCount = comp.internalDependencies ? comp.internalDependencies.length : 0;
        const externalDepsCount = comp.externalDependencies ? comp.externalDependencies.length : 0;

        let typeIcon = 'fas fa-cube';
        let typeColor = 'text-primary';
        if (comp.type.includes('Service')) {
          typeIcon = 'fas fa-server';
          typeColor = 'text-success';
        } else if (comp.type.includes('Utility')) {
          typeIcon = 'fas fa-tools';
          typeColor = 'text-info';
        } else if (comp.type.includes('Main') || comp.type.includes('Entry')) {
          typeIcon = 'fas fa-play-circle';
          typeColor = 'text-warning';
        }

        return `
          <tr>
            <td class="fw-semibold">
              <i class="${typeIcon} ${typeColor} me-2"></i>
              ${comp.name}
            </td>
            <td class="text-center">
              <span class="badge bg-light text-dark">${comp.type}</span>
            </td>
            <td class="text-center">
              <span class="badge bg-primary">${funcCount}</span>
            </td>
            <td class="text-center">
              <span class="badge bg-secondary">${internalDepsCount} int</span>
              <span class="badge bg-info ms-1">${externalDepsCount} ext</span>
            </td>
          </tr>`;
      }).join('')}
        </tbody>
      </table>
    </div>
  </div>
</div>

## 🔗 Dependency Analysis
<div class="row g-3 mb-4">
  <div class="col-md-6">
    <div class="card h-100 border-0">
       <div class="card-header bg-warning text-white border-0 d-flex align-items-center justify-content-center" style="height: 60px;">
         <h6 class="card-title text-white" style="margin: 0;">
           <i class="fas fa-boxes me-2"></i>
           External Dependencies
         </h6>
       </div>
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <span class="badge bg-white text-dark fs-6">${codeStructure.externalDependencies.length} unique packages</span>
        </div>
        <div class="dependency-tags">
          ${codeStructure.externalDependencies
          .filter(dep => dep && dep.trim())
          .map(dep => `<span class="badge bg-light text-dark me-1 mb-1"><code class="text-muted">${dep.replace(/[<>&]/g, '')}</code></span>`)
          .join('')}
        </div>
      </div>
    </div>
  </div>
  <div class="col-md-6">
    <div class="card h-100 border-0">
       <div class="card-header bg-info text-white border-0 d-flex align-items-center justify-content-center" style="height: 60px;">
         <h6 class="card-title text-white" style="margin: 0;">
           <i class="fas fa-link me-2"></i>
           Internal Dependencies
         </h6>
       </div>
      <div class="card-body">
        ${codeStructure.internalDependencies.length > 0
          ? `<div class="d-flex justify-content-between align-items-center mb-3">
               <span class="badge bg-white text-dark fs-6">${codeStructure.internalDependencies.length} internal links</span>
             </div>
             <div class="dependency-tags">
               ${codeStructure.internalDependencies
            .filter(dep => dep && dep.trim())
            .map(dep => `<span class="badge bg-light text-dark me-1 mb-1"><code class="text-muted">${dep.replace(/[<>&]/g, '')}</code></span>`)
            .join('')}
             </div>`
          : `<div class="text-center py-4">
               <i class="fas fa-unlink text-muted fs-1 mb-3"></i>
               <p class="text-muted mb-0">No internal dependencies detected</p>
               <small class="text-muted">All components are self-contained</small>
             </div>`
        }
      </div>
    </div>
  </div>
</div>

## 📊 Architecture Metrics
<div class="card border-0 mb-4">
   <div class="card-header bg-primary text-white border-0 d-flex align-items-center justify-content-center" style="height: 60px;">
     <h6 class="card-title text-white" style="margin: 0;">
       <i class="fas fa-chart-bar me-2"></i>
       System Metrics
     </h6>
   </div>
  <div class="card-body">
    <div class="row g-3">
      <div class="col-md-3 col-sm-6">
        <div class="text-center">
          <div class="fs-2 fw-bold text-primary">${codeStructure.entryPoints.length}</div>
          <div class="text-muted small">Entry Points</div>
        </div>
      </div>
      <div class="col-md-3 col-sm-6">
        <div class="text-center">
          <div class="fs-2 fw-bold text-success">${codeStructure.databaseConnections.length}</div>
          <div class="text-muted small">Database Connections</div>
        </div>
      </div>
      <div class="col-md-3 col-sm-6">
        <div class="text-center">
          <div class="fs-2 fw-bold text-danger">${codeStructure.apiConnections.length}</div>
          <div class="text-muted small">API Connections</div>
        </div>
      </div>
      <div class="col-md-3 col-sm-6">
        <div class="text-center">
          <div class="fs-2 fw-bold text-info">${codeStructure.components.reduce((sum, comp) => sum + (comp.functions ? comp.functions.length : 0), 0)}</div>
          <div class="text-muted small">Total Functions</div>
        </div>
      </div>
    </div>
  </div>
</div>

## 🎨 Visual Architecture
<div class="card border-0">
  <div class="card-header bg-dark text-white border-0 d-flex align-items-center justify-content-center" style="height: 60px;">
    <h6 class="card-title text-white" style="margin: 0;">
      <i class="fas fa-project-diagram me-2"></i>
      Interactive Flowchart
    </h6>
  </div>
  <div class="card-body">
    <div class="alert alert-light border-0 mb-3">
      <i class="fas fa-mouse-pointer text-primary me-2"></i>
      <strong>Interactive Features:</strong> Click and drag to pan, scroll to zoom, use controls for fullscreen and reset view.
    </div>

\`\`\`mermaid
${flowchartLines.join('\n')}\`\`\`

  </div>
</div>

<div class="text-center text-muted mt-3">
  <small><i class="fas fa-info-circle me-1"></i>This flowchart shows the actual architecture and data flow of your project.</small>
</div>`;

      // Return the result
      const finalFlowchart = flowchartLines.join('\n');
      return {
        relativePath: 'Project Flowchart',
        path: 'project-flowchart',
        language: 'flowchart',
        content: finalFlowchart, // Include the raw content for analysis
        explanation: explanation,
        flowchart: finalFlowchart
      };
    } catch (error) {
      console.error('Error generating flowchart:', error.message);
      return {
        relativePath: 'Project Flowchart',
        path: 'project-flowchart',
        language: 'flowchart',
        explanation: 'Error generating flowchart. Please check the code structure.',
        error: error.message
      };
    }
  }

  /**
   * Analyze code structure to understand project relationships
   * @param {Array} analysis - Array of analyzed files with their content and metadata
   * @returns {Object} Structure containing components, dependencies, and relationships
   */
  static analyzeCodeStructure(analysis) {
    const structure = {
      language: 'Unknown',
      components: [],
      entryPoints: [],
      databaseConnections: [],
      apiConnections: [],
      externalDependencies: [],
      internalDependencies: []
    };

    // Determine primary language
    const langCount = {};
    analysis.forEach(file => {
      const lang = file.language || 'unknown';
      langCount[lang] = (langCount[lang] || 0) + 1;
    });
    structure.language = Object.keys(langCount).reduce((a, b) => langCount[a] > langCount[b] ? a : b);

    // Collect all component names for internal dependency detection
    const componentNames = analysis.map(file =>
      path.basename(file.relativePath, path.extname(file.relativePath))
    );

    // Analyze each file for components and relationships
    analysis.forEach((file, index) => {
      const content = file.content;
      const fileName = path.basename(file.relativePath, path.extname(file.relativePath));

      // Extract all dependencies
      const allDependencies = FlowchartGenerator.extractDependencies(content);

      // Categorize dependencies as internal or external
      const internalDeps = [];
      const externalDeps = [];

      allDependencies.forEach(dep => {
        // Check if dependency matches any component name (internal)
        if (componentNames.includes(dep)) {
          internalDeps.push(dep);
        } else {
          externalDeps.push(dep);
        }
      });

      // Detect components based on file patterns and content
      const component = {
        name: fileName,
        type: FlowchartGenerator.detectComponentType(file, content),
        functions: FlowchartGenerator.extractFunctions(content),
        dependencies: allDependencies,
        internalDependencies: internalDeps,
        externalDependencies: externalDeps,
        databases: FlowchartGenerator.extractDatabases(content),
        apis: FlowchartGenerator.extractAPIs(content)
      };

      structure.components.push(component);

      // Detect entry points
      if (FlowchartGenerator.isEntryPoint(file, content)) {
        structure.entryPoints.push({
          name: fileName,
          file: file.relativePath
        });
      }

      // Detect database connections
      const dbConnections = FlowchartGenerator.extractDatabaseConnections(content);
      dbConnections.forEach(db => {
        if (!structure.databaseConnections.find(existing => existing.name === db.name)) {
          structure.databaseConnections.push(db);
        }
      });

      // Detect API connections
      const apiConnections = FlowchartGenerator.extractAPIConnections(content);
      apiConnections.forEach(api => {
        if (!structure.apiConnections.find(existing => existing.name === api.name)) {
          structure.apiConnections.push(api);
        }
      });

      // Collect all external dependencies for overview
      externalDeps.forEach(dep => {
        if (!structure.externalDependencies.includes(dep)) {
          structure.externalDependencies.push(dep);
        }
      });

      // Collect all internal dependencies for overview
      internalDeps.forEach(dep => {
        if (!structure.internalDependencies.includes(dep)) {
          structure.internalDependencies.push(dep);
        }
      });
    });

    return structure;
  }

  /**
   * Get the appropriate node shape for a component type
   * @param {string} componentType - The type of component
   * @returns {[string, string]} Tuple containing start and end shape markers
   */
  static getNodeShape(componentType) {
    if (componentType.includes('Main') || componentType.includes('Entry')) {
      return FlowchartGenerator.NODE_SHAPES.ENTRY;
    }
    if (componentType.includes('Config') || componentType.includes('Setting')) {
      return FlowchartGenerator.NODE_SHAPES.CONFIG;
    }
    if (componentType.includes('Service') || componentType.includes('Processor')) {
      return FlowchartGenerator.NODE_SHAPES.SERVICE;
    }
    if (componentType.includes('Model') || componentType.includes('Data')) {
      return FlowchartGenerator.NODE_SHAPES.MODEL;
    }
    if (componentType.includes('Util') || componentType.includes('Helper')) {
      return FlowchartGenerator.NODE_SHAPES.UTILITY;
    }
    if (componentType.includes('Test')) {
      return FlowchartGenerator.NODE_SHAPES.TEST;
    }
    return FlowchartGenerator.NODE_SHAPES.DEFAULT;
  }

  // Language-agnostic component type detection based on filename patterns
  static detectComponentType(file, content) {
    const fileName = path.basename(file.relativePath).toLowerCase();

    // Generic filename-based detection (works for any language)
    if (fileName.includes('controller') || fileName.includes('handler') || fileName.includes('route')) return 'Controller';
    if (fileName.includes('service') || fileName.includes('manager') || fileName.includes('provider')) return 'Service';
    if (fileName.includes('model') || fileName.includes('entity') || fileName.includes('schema')) return 'Model';
    if (fileName.includes('config') || fileName.includes('settings') || fileName.includes('conf')) return 'Configuration';
    if (fileName.includes('util') || fileName.includes('helper') || fileName.includes('utils')) return 'Utility';
    if (fileName.includes('main') || fileName.includes('app') || fileName.includes('index') || fileName.includes('program')) return 'Main';
    if (fileName.includes('test') || fileName.includes('spec')) return 'Test';

    // Generic content-based detection (language-agnostic patterns)
    if (content.includes('class ') || content.includes('Class ') || content.includes('struct ')) return 'Class';
    if (content.includes('function ') || content.includes('def ') || content.includes('func ')) return 'Function';
    if (content.includes('interface ') || content.includes('protocol ')) return 'Interface';

    return 'Component';
  }

  /**
   * Extract function declarations from code content
   * Supports multiple languages and function declaration styles
   * @param {string} content - Source code content to analyze
   * @returns {Array<Object>} Array of functions with name and type
   */
  static extractFunctions(content) {
    const functions = [];

    // Generic function patterns that work across languages
    const patterns = [
      // Standard function definitions
      /\b(?:function|def|func|fn|method|sub)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi,
      // Arrow functions and lambdas
      /\b(?:const|let|var|val|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[:=]\s*(?:\([^)]*\)\s*=>|\([^)]*\)\s*->|function\s*\()/gi,
      // Class methods
      /(?:public|private|protected|static)?\s*(?:function|def|func|fn|method|sub)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi,
      // Property methods
      /([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{/gi
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const funcName = match[1];
        if (funcName &&
          !functions.find(f => f.name === funcName) &&
          funcName.length > 1 &&
          !['if', 'for', 'while', 'switch', 'try', 'catch', 'finally', 'function', 'class', 'constructor', 'main'].includes(funcName.toLowerCase()) &&
          this.isSafeFunctionName(funcName)) {
          functions.push({
            name: funcName,
            type: this.inferFunctionType(funcName, content)
          });
        }
      }
    });

    return functions.slice(0, FlowchartGenerator.MAX_FUNCTIONS_TOTAL); // Limit to maximum functions per file
  }

  // Infer function type based on context and naming
  static inferFunctionType(funcName, content) {
    const lowerName = funcName.toLowerCase();

    // Common patterns for different function types
    if (lowerName.includes('get') || lowerName.includes('fetch') || lowerName.includes('find') || lowerName.includes('select')) {
      return 'getter';
    }
    if (lowerName.includes('set') || lowerName.includes('update') || lowerName.includes('save') || lowerName.includes('insert')) {
      return 'setter';
    }
    if (lowerName.includes('handle') || lowerName.includes('process') || lowerName.includes('execute')) {
      return 'handler';
    }
    if (lowerName.includes('validate') || lowerName.includes('check') || lowerName.includes('verify')) {
      return 'validator';
    }
    if (lowerName.includes('convert') || lowerName.includes('transform') || lowerName.includes('format')) {
      return 'converter';
    }

    // Check for async patterns
    const funcPattern = new RegExp(`\\b${funcName}\\b.*(?:async|await|Promise|Future|Task)`, 'i');
    if (funcPattern.test(content)) {
      return 'async-function';
    }

    // Check for arrow function patterns
    const arrowPattern = new RegExp(`${funcName}\\s*[:=]\\s*[^=]*=>`, 'i');
    if (arrowPattern.test(content)) {
      return 'arrow-function';
    }

    return 'function';
  }

  /**
   * Extract dependencies from code content
   * Supports multiple languages and import/require patterns
   * Handles scoped packages and submodules appropriately
   * @param {string} content - Source code content to analyze
   * @returns {Array<string>} Array of dependency names
   */
  static extractDependencies(content) {
    const dependencies = [];

    // Generic import/include patterns that work across languages
    const patterns = [
      // ES6/TypeScript imports
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/gi,
      // CommonJS/Node.js requires
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gi,
      // Python imports
      /(?:from\s+([^\s]+)\s+import|import\s+([^\s]+))/gi,
      // PHP includes/requires
      /(?:include|require|include_once|require_once)\s*\(\s*['"]([^'"]+)['"]\s*\)/gi,
      // C/C++/C# includes
      /#include\s+[<"]([^>"]+)[>"]/gi,
      // Java imports
      /import\s+([^\s;]+)/gi,
      // Ruby requires
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)|require\s+['"]([^'"]+)['"]/gi,
      // Go imports
      /import\s*\(\s*[\s\S]*?"([^"]+)"[\s\S]*?\s*\)|import\s+"([^"]+)"/gi,
      // Rust use statements
      /use\s+([^;]+)/gi
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        // Extract the dependency name (first non-empty capture group)
        const dep = match.slice(1).find(group => group && group.trim());
        if (dep && !dep.startsWith('.') && !dependencies.includes(dep)) {
          // Keep scoped packages and submodules intact, only clean if needed
          let cleanDep = dep;
          // Only split on '/' if it's not a scoped package
          if (!dep.startsWith('@')) {
            cleanDep = dep.split('/')[0];
          }

          // Additional filtering to avoid false positives
          if (cleanDep &&
            !dependencies.includes(cleanDep) &&
            this.isSafeDependencyName(cleanDep) &&
            this.isValidPackageName(cleanDep)) {
            dependencies.push(this.sanitizeDependencyName(cleanDep));
          }
        }
      }
    });

    return dependencies;
  }

  // Language-agnostic database pattern detection
  static extractDatabases(content) {
    const databases = [];

    // Common database patterns that work across languages
    const dbPatterns = [
      /\b(?:mysql|postgresql|postgres|mongodb|mongo|sqlite|redis|oracle|sqlserver|mssql|cassandra|couchdb|dynamodb)\b/gi,
      /\b(?:database|db|pdo|mysqli|sqlite3|mongoose|prisma|typeorm|sequelize)\b/gi,
      /\b(?:connection|connect|pool|client|session)\b.*?\b(?:db|database)\b/gi
    ];

    dbPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanMatch = match.toLowerCase().replace(/\b(?:connection|connect|pool|client|session)\b.*?\b(?:db|database)\b/gi, match => match.split(/\s+/)[0]);
          if (!databases.includes(cleanMatch)) {
            databases.push(cleanMatch);
          }
        });
      }
    });

    return databases;
  }

  // Language-agnostic API pattern detection
  static extractAPIs(content) {
    const apis = [];

    // Common API patterns that work across languages
    const apiPatterns = [
      /\b(?:api|rest|graphql|http|fetch|axios|request|curl|urllib|httpx)\b/gi,
      /\b(?:endpoint|route|router|controller)\b/gi,
      /(?:https?:\/\/[^\/\s]+|[a-zA-Z_][a-zA-Z0-9_]*\.(?:com|org|net|io|dev|api))/gi
    ];

    apiPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (!apis.includes(match.toLowerCase())) {
            apis.push(match.toLowerCase());
          }
        });
      }
    });

    return apis;
  }

  // Language-agnostic entry point detection
  static isEntryPoint(file, content) {
    const fileName = path.basename(file.relativePath).toLowerCase();

    // Generic entry point filename patterns
    if (['index', 'main', 'app', 'program', 'start', 'run', 'init', 'bootstrap'].includes(fileName) ||
      fileName.startsWith('main.') || fileName.startsWith('app.') || fileName.startsWith('index.')) {
      return true;
    }

    // Generic content patterns for entry points
    const entryPatterns = [
      /\b(?:main|run|start|init|bootstrap)\s*\(/gi,  // main() function calls
      /if\s+__name__\s*==\s*['"]__main__['"]/gi,     // Python main guard
      /public\s+static\s+void\s+main/gi,             // Java main method
      /fn\s+main\s*\(/gi,                            // Rust main function
      /int\s+main\s*\(/gi,                           // C/C++ main function
      /func\s+main\s*\(/gi,                          // Go main function
      /app\.listen|express\(\)/gi,                   // Node.js server startup
      /console\.log.*start|server.*start/gi          // Generic startup logging
    ];

    return entryPatterns.some(pattern => pattern.test(content));
  }

  // Language-agnostic database connection extraction (with security filtering)
  static extractDatabaseConnections(content) {
    const connections = [];

    // Generic database connection patterns - very specific to avoid false matches
    const dbConnectionPatterns = [
      /(?:host|server|hostname)=([^&\s;,]{5,})/gi,  // At least 5 characters
      /(?:database|db|dbname)=([^&\s;,]{5,})/gi,    // At least 5 characters
      /(?:mysql|postgresql|mongodb|sqlite|redis):\/\/([^\/\s]{5,})/gi,  // At least 5 characters
      /(?:connection|connect).*?(?:to|@)\s*([^;\s]{5,})/gi  // At least 5 characters
    ];

    dbConnectionPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const connection = match[1] || match[0];
          if (connection && !connections.find(c => c.name === connection) &&
            this.isSafeConnectionString(connection)) {
            connections.push({
              type: 'Database',
              name: this.sanitizeConnectionString(connection)
            });
          }
        });
      }
    });

    return connections;
  }

  // Language-agnostic API connection extraction (with security filtering)
  static extractAPIConnections(content) {
    const connections = [];

    // Generic API connection patterns - very specific to avoid false matches
    const apiPatterns = [
      /(?:https?:\/\/[^\/\s]{8,})/gi,  // At least 8 characters for full URLs
      /(?:api|service|endpoint)[-_]?url[\s]*[=:][\s]*['"]([^'"]{8,})['"]/gi,     // At least 8 characters
      /(?:base|api)[-_]?url[\s]*[=:][\s]*['"]([^'"]{8,})['"]/gi                  // At least 8 characters
    ];

    apiPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const api = match[1] || match[0];
          if (!connections.find(c => c.name === api) && this.isSafeAPIEndpoint(api)) {
            connections.push({
              type: 'API',
              name: this.sanitizeAPIEndpoint(api)
            });
          }
        });
      }
    });

    return connections;
  }

  /**
   * Security filtering methods to prevent exposure of sensitive information
   * These methods ensure no sensitive data is exposed in the flowchart or explanation
   */

  /**
   * Check if a connection string is safe to display
   * Filters out sensitive information like passwords, tokens, and internal URLs
   * @param {string} connection - Connection string to validate
   * @returns {boolean} True if the connection string is safe to display
   */
  static isSafeConnectionString(connection) {
    const sensitivePatterns = [
      /\b(?:password|pwd|pass|secret|key|token|auth|credential)\b/i,
      /\b(?:admin|root|superuser)\b/i,
      /\b\d{3,}\b/, // Avoid IP addresses or long numbers that might be sensitive
      /[a-zA-Z0-9]{32,}/, // Long alphanumeric strings (potential keys)
      /localhost|127\.0\.0\.1|0\.0\.0\.0/, // Local development connections
      /\.local\b|\.internal\b/, // Internal domains
    ];

    return !sensitivePatterns.some(pattern => pattern.test(connection));
  }

  // Sanitize connection strings for safe display
  static sanitizeConnectionString(connection) {
    // Replace sensitive parts with placeholders
    let sanitized = connection
      .replace(/\bpassword\s*=\s*[^&\s,]*/gi, 'password=***')
      .replace(/\bsecret\s*=\s*[^&\s,]*/gi, 'secret=***')
      .replace(/\bkey\s*=\s*[^&\s,]*/gi, 'key=***')
      .replace(/\btoken\s*=\s*[^&\s,]*/gi, 'token=***')
      .replace(/\bauth\s*=\s*[^&\s,]*/gi, 'auth=***');

    // If the connection still looks sensitive, replace with a generic name
    if (!this.isSafeConnectionString(sanitized)) {
      return 'Database Connection';
    }

    return sanitized;
  }

  // Check if an API endpoint is safe to display
  static isSafeAPIEndpoint(api) {
    const sensitivePatterns = [
      /\b(?:secret|key|token|auth|credential|password)\b/i,
      /[a-zA-Z0-9]{32,}/, // Long alphanumeric strings (potential keys)
      /localhost|127\.0\.0\.1|0\.0\.0\.0/, // Local development endpoints
      /\.local\b|\.internal\b/, // Internal domains
      /\/(?:admin|superuser|root|private|secret)\b/i, // Sensitive paths
    ];

    return !sensitivePatterns.some(pattern => pattern.test(api));
  }

  // Sanitize API endpoints for safe display
  static sanitizeAPIEndpoint(api) {
    // Replace sensitive parts with placeholders
    let sanitized = api
      .replace(/\/(?:secret|key|token|auth|credential|password)[^/]*/gi, '/***')
      .replace(/[?&](?:secret|key|token|auth|credential|password)=[^&]*/gi, '?***=***');

    // If the API still looks sensitive, replace with a generic name
    if (!this.isSafeAPIEndpoint(sanitized)) {
      return 'API Endpoint';
    }

    return sanitized;
  }

  // Filter out sensitive function names
  static isSafeFunctionName(funcName) {
    const sensitivePatterns = [
      /\b(?:password|pwd|pass|secret|key|token|auth|credential|private)\b/i,
      /\b(?:admin|root|superuser|sudo)\b/i,
      /\b(?:encrypt|decrypt|cipher|hash)\b.*\b(?:key|secret|password)\b/i,
    ];

    return !sensitivePatterns.some(pattern => pattern.test(funcName));
  }

  // Filter out sensitive dependency names
  static isSafeDependencyName(depName) {
    const sensitivePatterns = [
      /\b(?:secret|key|token|auth|credential|password)\b/i,
      /\b(?:private|internal|confidential)\b/i,
      /[a-zA-Z0-9]{32,}/, // Long alphanumeric strings (potential keys)
    ];

    return !sensitivePatterns.some(pattern => pattern.test(depName));
  }

  // Sanitize dependency names
  static sanitizeDependencyName(depName) {
    if (!this.isSafeDependencyName(depName)) {
      return 'External Module';
    }
    return depName;
  }

  // Check if a string looks like a valid package/dependency name
  static isValidPackageName(name) {
    // Filter out obviously invalid package names
    const invalidPatterns = [
      /['")}\];]/,  // Contains quotes, brackets, or semicolons (likely code snippets)
      /mode with/,  // Contains "mode with" (likely from comments)
      /^(?:if|else|for|while|return|const|let|var|function|class|def)$/,  // Exact matches for keywords only
      /basename if/,  // Specific corrupted text patterns
      /different shapes/,  // Specific corrupted text patterns
      /parsing issues/,  // Specific corrupted text patterns
      /\s+/,  // Contains spaces (invalid for package names)
      /^$/,  // Empty string
      /[<>|?*]/,  // Invalid filesystem characters
      /^\.+$/,  // Just dots
      /^.{100,}$/  // Extremely long (likely a code snippet)
    ];

    return !invalidPatterns.some(pattern => pattern.test(name));
  }

  // Sanitize component names for safe display
  static sanitizeComponentName(componentName) {
    let sanitized = componentName
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ')
      .replace(/\b(?:secret|key|token|auth|password|credential)\b/gi, '***');

    // If the name still contains sensitive patterns, use a generic name
    if (/\b(?:secret|key|token|auth|password|credential)\b/gi.test(sanitized)) {
      return 'Component';
    }

    return sanitized;
  }

  // Sanitize function names for safe display
  static sanitizeFunctionName(funcName) {
    let sanitized = funcName
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ')
      .replace(/\b(?:secret|key|token|auth|password|credential)\b/gi, '***');

    // If the name still contains sensitive patterns, use a generic name
    if (/\b(?:secret|key|token|auth|password|credential)\b/gi.test(sanitized)) {
      return 'function';
    }

    return sanitized;
  }
}

module.exports = { FlowchartGenerator };