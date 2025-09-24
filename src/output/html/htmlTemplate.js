const fs = require('fs').promises;
const path = require('path');

/**
 * HTML Template for CodeExplain output
 */

/**

 * Creates the complete HTML template for the output
 * @param {object} config - Configuration object
 * @param {string} title - The page title
 * @param {string} sidebarItems - HTML for sidebar navigation
 * @param {string} fileEntries - HTML for file entries
 * @param {object} assets - { styles, jsCode, jsCodeFlowChart }
 * @returns {string} Complete HTML document
 */
function createHTMLTemplate(config, title, sidebarItems, fileEntries, assets) {
    // Handle title - can be string or object with html/plain properties
    let finalTitle = 'AI-Powered Code Explanation';
    let headerTitle = title;

    if (title) {
        if (typeof title === 'object' && title.plain) {
            finalTitle = title.plain;
            headerTitle = title.html;
        } else if (typeof title === 'string') {
            finalTitle = title.replace(/<[^>]*>/g, '').trim() || title;
            headerTitle = title;
        }
    }

    const { styles, jsCode, jsCodeFlowChart } = assets;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${finalTitle}</title>
    <!-- Critical CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/base16/cupertino.min.css">
    
    <!-- Critical JavaScript -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js" defer></script>
    <style>
    ${styles}
    </style>

    <script>
    ${jsCode}
    ${jsCodeFlowChart || ''}
    </script>    
</head>
    <body class="bg-light text-dark" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <div id="app" class="vh-100">
        <!-- Header -->
        <header class="bg-white shadow-sm position-fixed top-0 start-0 w-100 border-bottom" style="z-index: 1030; backdrop-filter: blur(10px); background-color: rgba(255, 255, 255, 0.95);">
            <div class="container-fluid py-3 px-4">
                <div class="row align-items-center">
                    <div class="col-auto d-flex align-items-center">
                        <i class="fas fa-code text-primary me-3 fs-4"></i>
                         <h1 class="h5 fw-bold text-dark mb-0">${headerTitle}</h1>
                    </div>
                    <div class="col text-center d-none d-md-block">
                        <small class="text-muted">AI-Powered Code Explanation</small>
                    </div>

                </div>
            </div>
        </header>


        ${config.mode === 'flowchart' || config.mode === 'architecture' || config.mode === 'onboarding' ? '' : `
        <!-- Sidebar Toggle Button (Mobile) -->
        <button id="sidebar-toggle" class="btn btn-primary position-fixed d-none" style="top: 16px; left: 16px; z-index: 1030; display: block;" title="Toggle Sidebar">
            <i class="fas fa-bars"></i>
        </button>

        <!-- Sidebar Navigation -->
        <aside class="position-fixed bg-white border-end" id="sidebar" style="width: 280px; height: calc(100vh - 64px); top: 64px; left: 0; transform: translateX(0); opacity: 1; pointer-events: auto; transition: all 0.3s ease; z-index: 1000;">
            <div class="position-absolute" style="top: 0; right: 0; width: 5px; height: 100%; cursor: ew-resize; background: rgba(0,0,0,0.1);" id="sidebar-resizer"></div>
            <div class="p-3 border-bottom">
                <h2 class="h6 fw-bold mb-0 text-muted d-flex align-items-center">
                    <i class="fas fa-folder-tree me-2"></i>
                    Project Files
                </h2>
            </div>
            <div class="sidebar-content" style="height: calc(100% - 60px); overflow-y: auto;">
                <ul class="list-unstyled p-2">
                    ${sidebarItems}
                </ul>
            </div>
        </aside>`}

        <!-- Main Content -->
        <main style="${config.mode === 'flowchart' || config.mode === 'architecture' || config.mode === 'onboarding' ? 'margin-left: 0px; width: 100%;' : 'margin-left: 280px; width: calc(100% - 280px);'} margin-top: 96px; padding: 2rem; transition: margin-left 0.3s ease; min-height: calc(100vh - 96px);">
            <div class="container-fluid">
                <!-- File Entries -->
                <div id="file-entries" class="row g-4">
                    ${fileEntries}
                </div>
            </div>
        </main>

        <!-- Navigation Arrows -->
        <div id="nav-arrows" class="position-fixed d-none d-flex flex-column" style="bottom: 20px; right: 20px; z-index: 1040; gap: 8px;">
            <button id="prev-file" class="btn btn-primary btn-sm" title="Previous file">
                <i class="fas fa-chevron-up"></i>
            </button>
            <button id="next-file" class="btn btn-primary btn-sm" title="Next file">
                <i class="fas fa-chevron-down"></i>
            </button>
        </div>
    </div>

    <!-- Non-critical scripts -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js" defer></script>
    <!-- Load common programming languages for syntax highlighting -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/python.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/javascript.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/typescript.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/java.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/cpp.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/csharp.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/ruby.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/go.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/rust.min.js" defer></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/php.min.js" defer></script>
     <script src="https://cdn.jsdelivr.net/npm/marked@9.1.0/marked.min.js" defer></script>
     <script src="https://cdn.jsdelivr.net/npm/marked-highlight@2.1.0/lib/index.umd.js" defer></script>
     <script src="https://cdn.jsdelivr.net/npm/mermaid@11.0.0/dist/mermaid.min.js" defer></script>
`
}

/**
 * @returns {Promise<{styles: string, jsCode: string, jsCodeFlowChart: string}>}
 */
async function loadHTMLAssets(config) {
    const stylesPath = path.join(__dirname, '_css.css');
    const jsPath = path.join(__dirname, '_js.js');
    const isFlowchart = config.mode === 'flowchart';
    const [styles, jsCode] = await Promise.all([
        fs.readFile(stylesPath, 'utf8'),
        fs.readFile(jsPath, 'utf8')
    ]);
    let jsCodeFlowChart = '';
    if (isFlowchart) {
        const jsflowChartPath = path.join(__dirname, '_flowchart.js');
        jsCodeFlowChart = await fs.readFile(jsflowChartPath, 'utf8');
    }
    return { styles, jsCode, jsCodeFlowChart };
}

module.exports = { createHTMLTemplate, loadHTMLAssets };