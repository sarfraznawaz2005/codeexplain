const fs = require('fs').promises;
const path = require('path');
const marked = require('marked');
const hljs = require('highlight.js');
const { escapeHtml, generateUniqueId } = require('../../utils/utils');
const { createHTMLTemplate, loadHTMLAssets } = require('./htmlTemplate');

// Configure marked to use highlight.js for syntax highlighting
marked.setOptions({
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  }
});

/**
 * Highlight code using highlight.js
 * @param {string} code - Code to highlight
 * @param {string} language - Programming language
 * @returns {string} Highlighted HTML
 */
function highlightCode(code, language) {
  if (!code || typeof code !== 'string') {
    return '';
  }

  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    } else {
      return hljs.highlightAuto(code).value;
    }
  } catch (error) {
    // Fallback to escaping if highlighting fails
    return escapeHtml(code);
  }
}

class HTMLOutput {
  constructor(config) {
    this.config = config || {};
  }

  async generate(analysis, outputPath, title = 'Code Explanation') {
    // Ensure analysis is always an array
    const files = Array.isArray(analysis) ? analysis : [analysis];

    // Create a tree structure for the sidebar
    const tree = createFileTree(files);
    const sidebarItems = generateSidebarTree(tree);

    // Pre-calculate file indices for each file
    const fileEntries = files.map((file, index) => generateFileEntry(this.config, file, index)).join('\n');

    // Modify title to include success labels for paths
    const titleResult = this.modifyTitleWithLabels(title);
    const modifiedTitle = typeof titleResult === 'object' ? titleResult.html : titleResult;

    // Load HTML assets (CSS, JS)
    const assets = await loadHTMLAssets(this.config);

    // Create the complete HTML
    const html = createHTMLTemplate(this.config, titleResult, sidebarItems, fileEntries, assets);

    // Write to file asynchronously
    await fs.writeFile(outputPath, html);
    return outputPath;
  }

  modifyTitleWithLabels(title) {
    // Extract paths from title like "Code Explanation: path1, path2, path3"
    const titleMatch = title.match(/^Code Explanation:\s*(.+)$/);
    if (!titleMatch) return title;

    const paths = titleMatch[1].split(',').map(path => path.trim());
    const coloredPaths = paths.map(path => {
      const fileName = path.split(/[/\\]/).pop() || path;
      return `<span class="text-primary fw-semibold">${fileName}</span>`;
    });

    // Return both HTML version for header and plain text version for title tag
    return {
      html: `Code Explanation: ${coloredPaths.join(', ')}`,
      plain: `Code Explanation: ${paths.map(path => path.split(/[/\\]/).pop() || path).join(', ')}`
    };
  }
}

/**
 * Extract and process Mermaid code blocks from text
 * @param {string} text - Text containing Mermaid code blocks
 * @returns {string} Text with Mermaid blocks replaced by HTML containers
 */
function extractMermaidBlocks(text) {
  // Replace mermaid code blocks with placeholders before marked.parse()
  return text.replace(/```mermaid\s*([\s\S]*?)```/g, (match, mermaidCode) => {
    // Generate a unique ID for this diagram
    const diagramId = `mermaid-diagram-${generateUniqueId()}`;

    // Clean up the mermaid code
    const cleanCode = mermaidCode.trim();

    // Validate that this is actually a mermaid diagram with content
    if (!cleanCode || cleanCode.length === 0) {
      return match; // Return original if empty
    }

    return `<div class="mermaid-diagram-container mb-4">
      <div class="mermaid" id="${diagramId}">${cleanCode}</div>
    </div>`;
  });
}

/**
 * Extract and process Markdown code blocks from text
 * @param {string} text - Text containing Markdown code blocks
 * @returns {string} Text with Markdown blocks replaced by rendered HTML
 */
function extractMarkdownBlocks(text) {
  // Replace markdown code blocks with rendered HTML before marked.parse()
  return text.replace(/```markdown\s*([\s\S]*?)```/g, (match, markdownContent) => {
    // Trim and parse the markdown content
    const cleanContent = markdownContent.trim();
    if (!cleanContent || cleanContent.length === 0) {
      return match; // Return original if empty
    }

    try {
      return marked.parse(cleanContent);
    } catch (error) {
      console.error('Error parsing markdown block:', error);
      return `<pre>${escapeHtml(cleanContent)}</pre>`;
    }
  });
}

/**
 * Create a tree structure for the sidebar from file analysis
 * @param {Array} files - Array of file analysis objects
 * @returns {Object} Tree structure for sidebar navigation
 */
function createFileTree(files) {
  const tree = {};
  const seenPaths = new Set();

  files.forEach((file, index) => {
    // Ensure we have a unique path for each file
    let relativePath = file.relativePath;
    if (!relativePath) {
      // If no relativePath, use full path and make it unique
      relativePath = file.path;
      if (path.isAbsolute(relativePath)) {
        // Convert absolute path to a relative-like path that preserves uniqueness
        relativePath = relativePath.replace(/^[a-zA-Z]:\\/, '').replace(/^\//, '');
      }
    }

    // Normalize path separators
    const normalizedPath = relativePath.replace(/\\/g, '/');

    // Handle path collisions
    if (seenPaths.has(normalizedPath)) {
      // Add a unique suffix to the filename
      const pathParts = normalizedPath.split('/');
      const fileName = pathParts.pop();
      const fileExt = path.extname(fileName);
      const fileBase = path.basename(fileName, fileExt);
      pathParts.push(`${fileBase}_${index}${fileExt}`);
      relativePath = pathParts.join('/');
    }
    seenPaths.add(normalizedPath);

    // Split path into parts
    const pathParts = relativePath.split('/');

    let current = tree;
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      if (part) { // Skip empty parts
        if (!current[part]) {
          current[part] = i === pathParts.length - 1 ? { isFile: true, index: index, file: file } : {};
        }
        current = current[part];
      }
    }
  });

  return tree;
}

/**
 * Generate HTML for the sidebar tree navigation
 * @param {Object} tree - Tree structure from createFileTree
 * @returns {string} HTML string for sidebar navigation
 */
function generateSidebarTree(tree) {
  // Generate HTML for the tree
  const generateTreeHTML = (tree, depth = 0) => {
    const htmlParts = [];
    const indent = '  '.repeat(depth);

    for (const [key, value] of Object.entries(tree)) {
      if (value.isFile) {
        const file = value.file;
        const fileName = path.basename(file.path);
        htmlParts.push(`${indent}                <li><a href="#file-${value.index}" class="d-block py-1 px-2 text-decoration-none rounded">${escapeHtml(fileName)}</a></li>\n`);
      } else {
        htmlParts.push(`${indent}<li>\n`);
        htmlParts.push(`${indent}  <span class="folder-toggle d-flex align-items-center py-1 px-2 rounded" style="cursor: pointer;"><i class="fas fa-chevron-right me-1 fs-6 folder-icon"></i> ${key}</span>\n`);
        htmlParts.push(`${indent}  <ul class="folder-contents ms-4 ps-2 border-start">\n`);
        htmlParts.push(generateTreeHTML(value, depth + 2));
        htmlParts.push(`${indent}  </ul>\n`);
        htmlParts.push(`${indent}</li>\n`);
      }
    }

    return htmlParts.join('');
  };

  return generateTreeHTML(tree);
}

/**
 * Process HTML tables in content while preserving their structure
 * @param {string} content - Content containing HTML tables
 * @returns {Object} Processed content and table mappings
 */
function processHtmlTables(content) {
  const tables = [];
  const tableRegex = /<table[^>]*>[\s\S]*?<\/table>/gi;
  let processedContent = content;
  let match;

  // Extract all tables with unique placeholders
  while ((match = tableRegex.exec(content)) !== null) {
    const placeholder = `___TABLE_${tables.length}_PLACEHOLDER___`;
    tables.push({ placeholder, table: match[0] });
    processedContent = processedContent.replace(match[0], placeholder);
  }

  return { processedContent, tables };
}

/**
 * Restore HTML tables in content
 * @param {string} content - Content with table placeholders
 * @param {Array} tables - Array of table mappings
 * @returns {string} Content with tables restored
 */
function restoreHtmlTables(content, tables) {
  let restoredContent = content;
  for (const { placeholder, table } of tables) {
    restoredContent = restoredContent.replace(placeholder, table);
  }
  return restoredContent;
}

/**
 * Process Mermaid diagrams in a flowchart file
 * @param {string} content - Flowchart content
 * @param {string} explanation - File explanation
 * @returns {Object} Processed content and explanation
 */
function processFlowchartContent(content, explanation) {
  const diagrams = [];

  // For flowchart mode, replace mermaid code blocks directly with diagram HTML
  let processedExplanation = explanation;
  processedExplanation = processedExplanation.replace(/```mermaid\s*([\s\S]*?)```/g, (match, mermaidCode) => {
    const diagramId = `mermaid-diagram-${generateUniqueId()}`;
    diagrams.push({
      id: diagramId,
      code: mermaidCode.trim(),
      isMain: false
    });
    return `<div class="mermaid-diagram-container mb-4">
      <div class="mermaid" id="${diagramId}">${mermaidCode.trim()}</div>
    </div>`;
  });

  return { diagrams, processedExplanation };
}

/**
 * Generate HTML for a single file entry
 * @param {Object} file - File analysis object
 * @param {number} fileIndex - Index of the file for unique IDs
 * @returns {string} HTML string for the file entry
 */
function generateFileEntry(config, file, fileIndex) {
  let processedExplanation = file.explanation || 'No explanation available.';
  const isFlowchart = config.mode === 'flowchart';
  let mermaidDiagrams = [];

  if (isFlowchart) {
    // Process flowchart content and explanation
    const { diagrams, processedExplanation: newExplanation } = processFlowchartContent(
      file.content,
      processedExplanation
    );
    mermaidDiagrams = diagrams;
    processedExplanation = newExplanation;
  } else {
    // For non-flowchart files, process mermaid blocks normally
    processedExplanation = extractMermaidBlocks(processedExplanation);
  }

  // Process markdown blocks
  processedExplanation = extractMarkdownBlocks(processedExplanation);

  // Extract and preserve HTML tables
  const { processedContent: contentWithoutTables, tables } = processHtmlTables(processedExplanation);
  processedExplanation = contentWithoutTables;

  // Render the explanation as HTML
  let renderedExplanation;
  try {
    if (typeof processedExplanation !== 'string') {
      processedExplanation = String(processedExplanation || '');
    }
    renderedExplanation = marked.parse(processedExplanation);
  } catch (error) {
    console.error('Error parsing markdown for file:', file.path, error);
    renderedExplanation = `<pre>${escapeHtml(processedExplanation)}</pre>`;
  }

  // Restore the tables after markdown processing
  renderedExplanation = restoreHtmlTables(renderedExplanation, tables);

  // For flowchart mode, diagrams are already embedded in the explanation

  return `
<div class="file-entry col-12 mb-4" id="file-${fileIndex}" data-file-path="${escapeHtml(file.path)}" data-file-index="${fileIndex}">
    <div class="card shadow-sm border-0 h-100" style="border-radius: 12px; overflow: hidden;">
        <div class="card-header bg-gradient-primary text-white" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border: none; padding: 1rem 1.5rem;">
            <div class="d-flex justify-content-between align-items-center">
                <h2 class="${isFlowchart ? '' : 'toggle-code'} h5 fw-semibold mb-0 ${isFlowchart ? '' : 'cursor-pointer'} d-flex align-items-center text-white" data-file-index="${fileIndex}" style="font-size: 1.1rem;">
                    ${isFlowchart ? '' : '<i class="fas fa-chevron-right me-2 transition-transform duration-200"></i>'}
                    <i class="fas fa-${isFlowchart ? 'project-diagram' : 'file-code'} me-2"></i>
                    ${escapeHtml(file.relativePath || path.basename(file.path))}
                </h2>
                <span class="badge bg-white bg-opacity-25 text-white px-2 py-1" style="font-size: 0.75rem;">
                    ${file.language || 'text'}
                </span>
            </div>
        </div>

        <div class="card-body p-0">
              ${isFlowchart ? '' : `<div class="code-container bg-light border-bottom d-none" style="max-height: 400px; overflow: auto;">
                  <div class="p-3">
                      <pre class="mb-0"><code class="language-${file.language}" style="font-size: 0.9rem; line-height: 1.5;">
${highlightCode(file.content, file.language)}
                      </code></pre>
                  </div>
              </div>`}

            <div class="p-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3 class="h6 text-muted mb-0 d-flex align-items-center">
                        <i class="fas fa-brain me-2 text-primary"></i>
                        AI Explanation
                    </h3>
                    <button class="btn btn-outline-primary btn-sm copy-explanation" data-file-index="${fileIndex}" title="Copy explanation">
                        <i class="fas fa-copy me-1"></i> Copy
                    </button>
                </div>
                <div class="explanation-content">
                    ${renderedExplanation}
                </div>
            </div>
        </div>
    </div>
</div>
    `;
}

module.exports = { HTMLOutput };