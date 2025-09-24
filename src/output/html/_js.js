(function () {
    // Constants for configuration
    const SIDEBAR_DEFAULT_WIDTH = 280;
    const SIDEBAR_MIN_WIDTH = 250;
    const SIDEBAR_MAX_WIDTH = 450;
    const MOBILE_BREAKPOINT = 768;
    const COPY_FEEDBACK_DURATION = 2000;

    // Cache DOM elements and other state (assigned in DOMContentLoaded)
    let cachedFileEntries;
    let cachedSidebarLinks;

    // Initialize syntax highlighting
    document.addEventListener('DOMContentLoaded', function () {
        // Configure marked to use highlight.js for code blocks (after marked is loaded)
        const { Marked } = window.marked;
        const { markedHighlight } = window.markedHighlight;

        // Create Marked instance with the highlight plugin
        const markedInstance = new Marked(
            { gfm: true },
            markedHighlight({
                langPrefix: 'hljs language-',
                emptyLangClass: 'hljs',
                highlight(code, lang) {
                    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                    return hljs.highlight(code, { language }).value;
                }
            })
        );

        // Apply syntax highlighting to code blocks in AI explanations
        if (typeof hljs !== 'undefined') {
            document.querySelectorAll('.explanation-content pre code').forEach((block) => {
                if (!block.classList.contains('hljs')) {
                    hljs.highlightElement(block);
                }
            });
        }

        // Cache DOM elements - convert NodeList to Array for better performance
        cachedFileEntries = Array.from(document.querySelectorAll('.file-entry'));
        cachedSidebarLinks = document.querySelectorAll('#sidebar a[href^=\"#file-\"]');
        
        // If no sidebar exists, set to empty NodeList to prevent errors
        if (cachedSidebarLinks.length === 0) {
            cachedSidebarLinks = [];
        }

        // Initialize layout
        initializeLayout();

        // Initial active item update
        updateActiveSidebarItem();

        // Update navigation arrows
        updateNavigationArrows();

        // Function to toggle folder icons
        function toggleFolderIcon(folderToggle, force) {
            const folderContents = folderToggle.nextElementSibling;
            const folderIcon = folderToggle.querySelector('.folder-icon');
            const isExpanded = force !== undefined ? force : !folderContents.classList.contains('d-none');

            if (isExpanded) {
                folderIcon.classList.remove('fa-chevron-right');
                folderIcon.classList.add('fa-chevron-down');
            } else {
                folderIcon.classList.remove('fa-chevron-down');
                folderIcon.classList.add('fa-chevron-right');
            }
        }

        // Initialize folder icons for expanded folders
        document.querySelectorAll('.folder-toggle').forEach(toggle => {
            const folderContents = toggle.nextElementSibling;
            if (folderContents && !folderContents.classList.contains('d-none')) {
                toggleFolderIcon(toggle, true);
            }
        });

        // Code folding
        document.addEventListener('click', function (e) {
            if (e.target.closest('.toggle-code')) {
                const toggleElement = e.target.closest('.toggle-code');
                const codeContainer = toggleElement.closest('.file-entry').querySelector('.code-container');
                const icon = toggleElement.querySelector('i');

                if (codeContainer.classList.contains('d-none')) {
                    codeContainer.classList.remove('d-none');
                    icon.classList.remove('fa-chevron-right');
                    icon.classList.add('fa-chevron-down');
                } else {
                    codeContainer.classList.add('d-none');
                    icon.classList.remove('fa-chevron-down');
                    icon.classList.add('fa-chevron-right');
                }
            }
        });

        // Copy explanation functionality
        document.addEventListener('click', function (e) {
            if (e.target.closest('.copy-explanation')) {
                const button = e.target.closest('.copy-explanation');
                const explanationContainer = button.closest('.file-entry').querySelector('.explanation-content');
                const explanationText = explanationContainer.textContent.trim();

                navigator.clipboard.writeText(explanationText).then(() => {
                    const originalText = button.innerHTML;
                    button.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => {
                        button.innerHTML = originalText;
                    }, COPY_FEEDBACK_DURATION);
                });
            }
        });


        // Sidebar navigation and folder toggle
        document.addEventListener('click', function (e) {
            if (e.target.closest('a[href^="#file-"]')) {
                e.preventDefault();
                const targetId = e.target.closest('a').getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                }
            }

            // Folder toggle functionality
            if (e.target.closest('.folder-toggle')) {
                const folderToggle = e.target.closest('.folder-toggle');
                const folderContents = folderToggle.nextElementSibling;
                folderContents.classList.toggle('d-none');
                toggleFolderIcon(folderToggle);
            }
        });

        // Sidebar toggle functionality
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.querySelector('main');

        if (sidebarToggle && sidebar && mainContent) {
            sidebarToggle.addEventListener('click', () => {
                const isCollapsed = sidebar.style.transform === 'translateX(-100%)';
                if (window.innerWidth <= 768) {
                    // Mobile: toggle between collapsed and expanded
                    if (isCollapsed) {
                        sidebar.style.transform = 'translateX(0)';
                        sidebar.style.opacity = '1';
                        sidebar.style.pointerEvents = 'auto';
                        mainContent.style.marginLeft = '280px';
                    } else {
                        sidebar.style.transform = 'translateX(-100%)';
                        sidebar.style.opacity = '0';
                        sidebar.style.pointerEvents = 'none';
                        mainContent.style.marginLeft = '0';
                    }
                }
            });
        }

        // Sidebar drag resizing
        const sidebarResizer = document.getElementById('sidebar-resizer');
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        let animationFrameId = null;

        if (sidebarResizer && sidebar && mainContent) {
            sidebarResizer.addEventListener('mousedown', (e) => {
                isResizing = true;
                startX = e.clientX;
                startWidth = sidebar.offsetWidth;
                document.body.style.cursor = 'ew-resize';
                document.body.style.userSelect = 'none';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;

                // Cancel any pending animation frame
                if (animationFrameId !== null) {
                    cancelAnimationFrame(animationFrameId);
                }

                // Schedule update on next animation frame
                animationFrameId = requestAnimationFrame(() => {
                    const newWidth = startWidth + (e.clientX - startX);
                    const clampedWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, newWidth));

                    sidebar.style.width = `${clampedWidth}px`;
                    mainContent.style.marginLeft = `${clampedWidth}px`;
                    mainContent.style.width = `calc(100% - ${clampedWidth}px)`;
                    animationFrameId = null;
                });
            });

            document.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                }
            });
        }

        // Handle window resize using the shared layout function
        window.addEventListener('resize', () => {
            applyLayoutStyles(window.innerWidth <= MOBILE_BREAKPOINT);
        });

        // Navigation arrow event listeners
        document.getElementById('prev-file').addEventListener('click', () => {
            const currentFile = getCurrentVisibleFile();
            const prevFile = getPreviousFile(currentFile);
            if (prevFile) {
                prevFile.scrollIntoView({ behavior: 'smooth' });
            }
        });

        document.getElementById('next-file').addEventListener('click', () => {
            const currentFile = getCurrentVisibleFile();
            const nextFile = getNextFile(currentFile);
            if (nextFile) {
                nextFile.scrollIntoView({ behavior: 'smooth' });
            }
        });

        // Use requestAnimationFrame for smoother scroll performance
        let isScrolling = false;
        window.addEventListener('scroll', function () {
            if (!isScrolling) {
                window.requestAnimationFrame(function () {
                    updateActiveSidebarItem();
                    isScrolling = false;
                });
                isScrolling = true;
            }
        });

    });

    // Shared function to apply layout styles based on screen size
    function applyLayoutStyles(isMobile) {
        const sidebar = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebar-toggle');
        const mainContent = document.querySelector('main');

        // If sidebar doesn't exist (e.g., in flowchart mode), just return
        if (!sidebar) {
            // In flowchart mode, ensure main content takes full width
            if (mainContent) {
                mainContent.style.marginLeft = '0';
                mainContent.style.width = '100%';
            }
            return;
        }

        if (isMobile) {
            if (sidebarToggle) {
                sidebarToggle.classList.remove('d-none');
            }
            if (sidebar.style.transform !== 'translateX(-100%)') {
                sidebar.style.transform = 'translateX(-100%)';
                sidebar.style.opacity = '0';
                sidebar.style.pointerEvents = 'none';
                if (mainContent) {
                    mainContent.style.marginLeft = '0';
                    mainContent.style.width = '100%';
                }
            }
        } else {
            if (sidebarToggle) {
                sidebarToggle.classList.add('d-none');
            }
            sidebar.style.transform = 'translateX(0)';
            sidebar.style.opacity = '1';
            sidebar.style.pointerEvents = 'auto';
            const currentWidth = sidebar.offsetWidth || SIDEBAR_DEFAULT_WIDTH;
            if (mainContent) {
                mainContent.style.marginLeft = `${currentWidth}px`;
                mainContent.style.width = `calc(100% - ${currentWidth}px)`;
            }
        }
    }

    // Initialize layout on page load
    function initializeLayout() {
        applyLayoutStyles(window.innerWidth <= MOBILE_BREAKPOINT);
    }

    // Helper function to find the most visible element from a list of elements
    function getMostVisibleElement(elements) {
        let mostVisibleElement = null;
        let maxVisibility = 0;

        elements.forEach(element => {
            const rect = element.getBoundingClientRect();
            const windowHeight = window.innerHeight;

            // Calculate how much of the element is visible
            const visibleTop = Math.max(0, rect.top);
            const visibleBottom = Math.min(windowHeight, rect.bottom);
            const visibleHeight = Math.max(0, visibleBottom - visibleTop);
            const visibility = visibleHeight / rect.height;

            if (visibility > maxVisibility) {
                maxVisibility = visibility;
                mostVisibleElement = element;
            }
        });

        return mostVisibleElement;
    }

    // Auto-sync sidebar with scroll position
    function updateActiveSidebarItem() {
        // Remove active class from all sidebar links if they exist
        if (cachedSidebarLinks && cachedSidebarLinks.length > 0) {
            cachedSidebarLinks.forEach(link => link.classList.remove('active'));

            // Find which file entry is currently most visible
            const mostVisibleEntry = getMostVisibleElement(cachedFileEntries);

            // Highlight the corresponding sidebar item
            if (mostVisibleEntry) {
                const fileIndex = mostVisibleEntry.getAttribute('data-file-index');
                const correspondingLink = document.querySelector('#sidebar a[href="#file-' + fileIndex + '"]');
                if (correspondingLink) {
                    correspondingLink.classList.add('active');
                }
            }
        }
    }

    // Navigation arrow functionality
    function getCurrentVisibleFile() {
        return getMostVisibleElement(cachedFileEntries);
    }

    function getPreviousFile(currentFile) {
        if (!currentFile) return null;
        const currentIndex = cachedFileEntries.indexOf(currentFile);
        return currentIndex > 0 ? cachedFileEntries[currentIndex - 1] : null;
    }

    function getNextFile(currentFile) {
        if (!currentFile) return null;
        const currentIndex = cachedFileEntries.indexOf(currentFile);
        return currentIndex < cachedFileEntries.length - 1 ? cachedFileEntries[currentIndex + 1] : null;
    }

    // Show/hide navigation arrows based on file count
    function updateNavigationArrows() {
        const fileCount = cachedFileEntries.length;
        const navArrows = document.getElementById('nav-arrows');
        if (fileCount > 1) {
            navArrows.classList.remove('d-none');
        } else {
            navArrows.classList.add('d-none');
        }
    }

})();
