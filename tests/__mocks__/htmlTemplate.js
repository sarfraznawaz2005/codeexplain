// Mock for htmlTemplate.js to avoid Jest parsing HTML template literals as JSX
const createHTMLTemplate = jest.fn((config, title, sidebarItems, fileEntries, assets, headerOnly, footerOnly) => {
  if (headerOnly) {
    return '<!DOCTYPE html><html><head><title>Mock Header</title></head><body><div id="file-entries">';
  } else if (footerOnly) {
    return '</div></body></html>';
  } else {
    return '<!DOCTYPE html><html><head><title>Mock HTML</title></head><body><div id="file-entries">' + (fileEntries || '') + '</div></body></html>';
  }
});

const loadHTMLAssets = jest.fn(async () => ({
  styles: '/* mock styles */',
  jsCode: '// mock js',
  jsCodeFlowChart: '// mock flowchart js'
}));

module.exports = { createHTMLTemplate, loadHTMLAssets };