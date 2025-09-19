const path = require('path');
const puppeteer = require('puppeteer');
const marked = require('marked');

// Constants for PDF generation
const PDF_CONFIG = {
  format: 'A3',
  margin: {
    top: '0.75in',
    right: '0.75in',
    bottom: '0.75in',
    left: '0.75in'
  }
};

// Helper function for HTML escaping
const escapeHtml = (text) => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

class PDFOutput {
  constructor(config) {
    this.config = config;

    // Configure marked to use highlight.js for code blocks once during initialization
    marked.setOptions({
      highlight: function (code, lang) {
        if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        } else if (typeof hljs !== 'undefined') {
          return hljs.highlightAuto(code).value;
        }
        return code;
      }
    });
  }

  async generate(explanations, targetPath, title = 'Code Explanation') {
    // Use targetPath if provided, otherwise use default in current directory
    const outputPath = targetPath || path.join(process.cwd(), 'codeexplain-output.pdf');

    // Handle both single file and multiple files
    const files = Array.isArray(explanations) ? explanations : [explanations];

    // Generate HTML content
    const htmlContent = this.generateHTML(files, targetPath, title);

    // Convert HTML to PDF using Puppeteer
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',  // Using new headless mode
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      // Wait for highlight.js to load and execute
      await page.waitForFunction(() => {
        return typeof hljs !== 'undefined' && document.querySelectorAll('.hljs').length > 0;
      }, { timeout: 5000 }).catch(() => {
        // If highlighting doesn't complete, continue anyway
        console.log('Highlight.js may not have completed, proceeding with PDF generation');
      });

      await page.pdf({
        path: outputPath,
        ...PDF_CONFIG,
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false
      });

      return outputPath;
    } catch (error) {
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  generateTableOfContents(files) {
    const tocItems = files.map((file, index) => {
      const fileName = escapeHtml(file.relativePath || path.basename(file.path));
      return `<li><a href="#file-${index}">${fileName}</a></li>`;
    });
    return `<h2>Table of Contents</h2><ul>${tocItems.join('')}</ul>`;
  }

  generateFileContent(file, index) {
    let processedExplanation = file.explanation || 'No explanation available.';
    processedExplanation = typeof processedExplanation === 'string' ? processedExplanation : String(processedExplanation);

    // Process explanation content
    processedExplanation = this.extractMermaidBlocks(processedExplanation);
    processedExplanation = this.extractMarkdownBlocks(processedExplanation);

    let renderedExplanation;
    try {
      // Replace the special markers back after marked processing
      renderedExplanation = marked.parse(processedExplanation)
        .replace(/<!--PARSED_MARKDOWN_START-->([\s\S]*?)<!--PARSED_MARKDOWN_END-->/g, '$1');
    } catch (error) {
      console.error('Error parsing markdown for PDF:', error);
      renderedExplanation = `<pre>${escapeHtml(processedExplanation)}</pre>`;
    }

    return `
      <div class="file" id="file-${index}">
        <div class="file-path">${escapeHtml(file.relativePath || path.basename(file.path))}</div>
        <div class="code">
          <pre><code class="language-${file.language || 'plaintext'}">${escapeHtml(file.content)}</code></pre>
        </div>
        <div class="explanation">
          <h2>AI Explanation</h2>
          ${renderedExplanation}
        </div>
      </div>
    `;
  }

  generateHTML(files, targetPath, title) {

    const htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <title>${title}</title>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/base16/cupertino.min.css">
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/autohotkey.min.js"></script>
          <style>
              body {
                  font-family: Arial, sans-serif;
                  margin: 20px;
                  line-height: 1.6;
                  font-size: 12px;
                  -webkit-font-smoothing: antialiased;
                  text-rendering: optimizeLegibility;
              }
              * { box-sizing: border-box; }
              .file {
                  margin-bottom: 40px;
                  page-break-inside: avoid;
                  page-break-after: always;
              }
              .file-path {
                  font-size: 18px;
                  font-weight: bold;
                  margin-bottom: 15px;
                  line-height: 1.4;
              }
              .code {
                  background: #f5f5f5;
                  padding: 15px;
                  margin: 15px 0;
                  border-radius: 4px;
                  border: none;
              }
              .code pre {
                  margin: 0;
                  font-family: 'Courier New', monospace;
                  font-size: 11px;
                  line-height: 1.4;
                  white-space: pre-wrap;
                  word-wrap: break-word;
              }
              .code code {
                  font-family: 'Courier New', monospace;
                  font-size: 11px;
                  line-height: 1.4;
              }
              .hljs {
                  background: #ffffff !important;
                  border: 1px solid #e0e0e0 !important;
              }
              .explanation {
                  margin-top: 25px;
              }
              .explanation h1,
              .explanation h2,
              .explanation h3 {
                  color: #333;
                  margin-top: 25px;
                  margin-bottom: 15px;
                  line-height: 1.3;
              }
              .explanation h1 { font-size: 20px; }
              .explanation h2 { font-size: 18px; }
              .explanation h3 { font-size: 16px; }
              .explanation p {
                  margin: 15px 0;
                  line-height: 1.7;
                  text-align: justify;
              }
              .explanation code {
                  background: #f0f0f0;
                  padding: 3px 6px;
                  font-family: 'Courier New', monospace;
                  font-size: 11px;
                  border-radius: 3px;
                  line-height: 1.2;
              }
              .explanation pre {
                  background: #f5f5f5;
                  padding: 15px;
                  overflow-x: auto;
                  margin: 15px 0;
                  line-height: 1.4;
                  font-size: 11px;
                  border-radius: 4px;
                  border: 1px solid #e0e0e0;
                  page-break-inside: avoid;
              }
              .explanation pre code {
                  background: transparent;
                  padding: 0;
                  font-size: 11px;
                  line-height: 1.4;
              }
              .explanation ul,
              .explanation ol {
                  margin: 15px 0;
                  padding-left: 25px;
                  line-height: 1.6;
              }
              .explanation li {
                  margin: 8px 0;
              }
              .explanation blockquote {
                  border-left: 4px solid #ccc;
                  padding-left: 15px;
                  margin: 15px 0;
                  font-style: italic;
                  line-height: 1.6;
              }
          </style>
      </head>
      <body>
          <h1>${title}</h1>
          ${this.generateTableOfContents(files)}
          <div style="page-break-before: always;"></div>
          ${files.filter(f => f !== null).map((file, index) => this.generateFileContent(file, index)).join('')}
          <script>
              if (typeof hljs !== 'undefined') {
                  hljs.highlightAll();
              }
          </script>
      </body>
      </html>
    `;

    return htmlTemplate.trim();
  }

  extractMermaidBlocks(text) {
    return text.replace(/```mermaid\s*([\s\S]*?)```/g, (match, mermaidCode) => {
      const diagramId = `mermaid-diagram-${Math.random().toString(36).substr(2, 9)}`;
      const cleanCode = mermaidCode.trim();

      if (!cleanCode) return match;

      return `<div class="mermaid-diagram-container mb-4">
        <div class="mermaid" id="${diagramId}">${cleanCode}</div>
      </div>`;
    });
  }

  extractMarkdownBlocks(text) {
    return text.replace(/```markdown\s*([\s\S]*?)```/g, (match, markdownContent) => {
      const cleanContent = markdownContent.trim();

      if (!cleanContent) return match;

      try {
        // Add a special marker to prevent double parsing in marked.parse later
        const parsed = marked.parse(cleanContent);
        return `<!--PARSED_MARKDOWN_START-->${parsed}<!--PARSED_MARKDOWN_END-->`;
      } catch (error) {
        console.error('Error parsing markdown block:', error);
        return `<pre>${escapeHtml(cleanContent)}</pre>`;
      }
    });
  }
}

module.exports = { PDFOutput };