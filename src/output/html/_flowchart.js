

// Global zoom state for each diagram
const diagramStates = new Map();

document.addEventListener('DOMContentLoaded', function () {
    // Initialize Mermaid for flowchart rendering with zoom support (after mermaid is loaded)
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({
            startOnLoad: false, // Disable auto-rendering to control manually
            theme: 'default',
            flowchart: {
                useMaxWidth: false, // Disable to allow custom sizing
                htmlLabels: true,
                curve: 'basis',
                nodeSpacing: NODE_SPACING,
                rankSpacing: RANK_SPACING
            },
            securityLevel: 'antiscript', // Updated security level for Mermaid v11
            themeVariables: {
                fontSize: FONT_SIZE,
                fontFamily: 'arial'
            }
        });
    }

    // Re-render any mermaid diagrams that might have been missed
    const mermaidElements = document.querySelectorAll('.mermaid:not([data-processed])');
    mermaidElements.forEach(async (element) => {
        // Check if element has content to render
        const content = element.textContent.trim();
        if (!content || content.length === 0) {
            console.warn('Skipping empty Mermaid diagram');
            element.innerHTML = '<div class="alert alert-info">No diagram content available</div>';
            element.setAttribute('data-processed', 'true');
            return;
        }

        // Check if content looks like valid Mermaid syntax
        if (!content.includes('flowchart') && !content.includes('graph') && !content.includes('sequenceDiagram') &&
            !content.includes('gantt') && !content.includes('classDiagram') && !content.includes('stateDiagram') &&
            !content.includes('pie') && !content.includes('erDiagram') && !content.includes('journey')) {
            console.warn('Skipping invalid Mermaid diagram content:', content.substring(0, 50) + '...');
            element.innerHTML = '<div class="alert alert-info">Invalid diagram syntax</div>';
            element.setAttribute('data-processed', 'true');
            return;
        }

        const diagramId = 'mermaid-' + Math.random().toString(36).substr(2, 9);
        try {
            // Clean the content to ensure valid Mermaid syntax
            const cleanContent = content.replace(new RegExp('\\r\\n', 'g'), '\\n').replace(new RegExp('\\r', 'g'), '\\n').trim();
            const { svg } = await mermaid.render(diagramId, cleanContent);
            element.innerHTML = svg;
            element.setAttribute('data-processed', 'true');
            // Set the diagramId as the id attribute on the element for correct state linkage
            element.id = diagramId;

            // Add zoom controls after rendering
            addZoomControls(element);
        } catch (error) {
            console.error('Mermaid rendering error:', error);
            element.innerHTML = '<div class="alert alert-warning">Failed to render diagram: ' + error.message + '</div>';
            element.setAttribute('data-processed', 'true');
        }
    });

});

// Function to add zoom controls to a diagram
function addZoomControls(diagramElement) {
    const container = diagramElement.closest('.mermaid-diagram-container');
    if (!container) return;

    // Check if controls already exist
    if (container.querySelector('.mermaid-controls')) return;

    // Create zoom controls
    const controls = document.createElement('div');
    controls.className = 'mermaid-controls';
    controls.innerHTML = '<button class="btn btn-outline-secondary btn-sm" id="zoom-out" title="Zoom Out"><i class="fas fa-search-minus"></i></button><button class="btn btn-outline-secondary btn-sm" id="zoom-reset" title="Reset Zoom"><i class="fas fa-sync-alt"></i></button><span class="zoom-level">100%</span><button class="btn btn-outline-secondary btn-sm" id="zoom-in" title="Zoom In"><i class="fas fa-search-plus"></i></button><button class="btn btn-outline-secondary btn-sm" id="fullscreen" title="Fullscreen"><i class="fas fa-expand"></i></button>';

    // Insert controls before the diagram
    container.insertBefore(controls, diagramElement);

    // Initialize zoom state
    const diagramId = diagramElement.id;
    diagramStates.set(diagramId, {
        scale: 1,
        translateX: 0,
        translateY: 0,
        isDragging: false,
        lastX: 0,
        lastY: 0,
        isFullscreen: false
    });

    const state = diagramStates.get(diagramId);
    const zoomLevel = controls.querySelector('.zoom-level');

    // Add zoom functionality
    diagramElement.classList.add('mermaid-zoomable');
    diagramElement.style.cursor = 'grab';
    updateTransform(diagramElement, state);

    // Add debouncing for zoom level updates
    let zoomUpdateTimeout;
    const debouncedUpdateZoomLevel = (element, scale) => {
        clearTimeout(zoomUpdateTimeout);
        zoomUpdateTimeout = setTimeout(() => {
            updateZoomLevel(element, scale);
        }, 100); // Wait 100ms after last zoom event
    };

    // Zoom in button
    controls.querySelector('#zoom-in').addEventListener('click', function () {
        state.scale = state.scale * ZOOM_FACTOR_IN;
        updateTransform(diagramElement, state);
        debouncedUpdateZoomLevel(zoomLevel, state.scale);
    });

    // Zoom out button
    controls.querySelector('#zoom-out').addEventListener('click', function () {
        state.scale = state.scale / ZOOM_FACTOR_IN;
        updateTransform(diagramElement, state);
        debouncedUpdateZoomLevel(zoomLevel, state.scale);
    });

    // Reset zoom button
    controls.querySelector('#zoom-reset').addEventListener('click', function () {
        state.scale = 1;
        state.translateX = 0;
        state.translateY = 0;
        updateTransform(diagramElement, state);
        debouncedUpdateZoomLevel(zoomLevel, state.scale);
    });

    // Fullscreen button
    controls.querySelector('#fullscreen').addEventListener('click', function () {
        toggleFullscreen(container, diagramElement, state);
    });

    // Mouse wheel zoom
    diagramElement.addEventListener('wheel', function (e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? ZOOM_FACTOR_OUT : 1 / ZOOM_FACTOR_OUT;
        state.scale = state.scale * delta;
        updateTransform(diagramElement, state);
        debouncedUpdateZoomLevel(zoomLevel, state.scale);
    });

    // Pan functionality
    diagramElement.addEventListener('mousedown', (e) => {
        state.isDragging = true;
        state.lastX = e.clientX;
        state.lastY = e.clientY;
        diagramElement.classList.add('dragging');
        diagramElement.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function (e) {
        if (!state.isDragging) return;

        const deltaX = e.clientX - state.lastX;
        const deltaY = e.clientY - state.lastY;

        state.translateX += deltaX;
        state.translateY += deltaY;

        state.lastX = e.clientX;
        state.lastY = e.clientY;

        updateTransform(diagramElement, state);
    });

    document.addEventListener('mouseup', function () {
        state.isDragging = false;
        diagramElement.classList.remove('dragging');
        diagramElement.style.cursor = 'grab';
    });

    // Touch support for mobile
    let initialDistance = 0;
    diagramElement.addEventListener('touchstart', function (e) {
        if (e.touches.length === 2) {
            // Pinch to zoom
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            initialDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
        } else if (e.touches.length === 1) {
            // Pan
            state.isDragging = true;
            state.lastX = e.touches[0].clientX;
            state.lastY = e.touches[0].clientY;
            diagramElement.style.cursor = 'grabbing';
        }
    });

    diagramElement.addEventListener('touchmove', function (e) {
        if (e.touches.length === 2) {
            // Handle pinch zoom
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );

            if (initialDistance > 0) {
                const scaleChange = currentDistance / initialDistance;
                state.scale = state.scale * scaleChange; // Removed min/max zoom limitations
                updateTransform(diagramElement, state);
                updateZoomLevel(zoomLevel, state.scale);
                initialDistance = currentDistance;
            }
        } else if (e.touches.length === 1 && state.isDragging) {
            // Handle pan
            const deltaX = e.touches[0].clientX - state.lastX;
            const deltaY = e.touches[0].clientY - state.lastY;

            state.translateX += deltaX;
            state.translateY += deltaY;

            state.lastX = e.touches[0].clientX;
            state.lastY = e.touches[0].clientY;

            updateTransform(diagramElement, state);
        }
    });

    diagramElement.addEventListener('touchend', function () {
        state.isDragging = false;
        initialDistance = 0;
        diagramElement.style.cursor = 'grab';
    });
}

// Helper function to update transform
function updateTransform(element, state) {
    element.style.transform = 'scale(' + state.scale + ') translate(' + (state.translateX / state.scale) + 'px, ' + (state.translateY / state.scale) + 'px)';
}

// Helper function to update zoom level display
// Note: For performance, consider debouncing if zoom events are very frequent.
function updateZoomLevel(displayElement, scale) {
    displayElement.textContent = Math.round(scale * 100) + '%';
}

// Helper to get or initialize diagram state
function getDiagramState(diagramId) {
    let state = diagramStates.get(diagramId);
    if (!state) {
        state = {
            scale: 1,
            translateX: 0,
            translateY: 0,
            isDragging: false,
            lastX: 0,
            lastY: 0,
            isFullscreen: false
        };
        diagramStates.set(diagramId, state);
    }
    return state;
}

// Constants for configuration values
const ZOOM_FACTOR_IN = 1.2;
const ZOOM_FACTOR_OUT = 0.9;
const NODE_SPACING = 100;
const RANK_SPACING = 80;
const FONT_SIZE = '14px';

// Global functions for onclick handlers
function zoomDiagram(diagramId, factor) {
    const diagram = document.getElementById(diagramId);
    if (!diagram) return;

    const state = getDiagramState(diagramId);
    state.scale = state.scale * factor;
    updateTransform(diagram, state);

    const container = diagram.closest('.mermaid-diagram-container');
    const zoomLevelElement = container ? container.querySelector('.zoom-level') : null;
    if (zoomLevelElement) {
        updateZoomLevel(zoomLevelElement, state.scale);
    }
}

function resetZoom(diagramId) {
    const diagram = document.getElementById(diagramId);
    if (!diagram) return;

    const state = getDiagramState(diagramId);
    state.scale = 1;
    state.translateX = 0;
    state.translateY = 0;
    updateTransform(diagram, state);

    const container = diagram.closest('.mermaid-diagram-container');
    const zoomLevelElement = container ? container.querySelector('.zoom-level') : null;
    if (zoomLevelElement) {
        updateZoomLevel(zoomLevelElement, state.scale);
    }
}

function toggleFullscreenGlobal(diagramId) {
    const diagram = document.getElementById(diagramId);
    if (!diagram) return;

    const container = diagram.closest('.mermaid-diagram-container');
    if (!container) return;

    const state = getDiagramState(diagramId);
    toggleFullscreen(container, diagram, state);
}

// Helper function to toggle fullscreen
function toggleFullscreen(container, diagram, state) {
    const overlay = document.querySelector('.fullscreen-overlay') || createFullscreenOverlay();

    if (state.isFullscreen) {
        // Exit fullscreen
        container.classList.remove('mermaid-fullscreen');
        overlay.classList.remove('active');
        state.isFullscreen = false;
    } else {
        // Enter fullscreen
        container.classList.add('mermaid-fullscreen');
        overlay.classList.add('active');
        state.isFullscreen = true;
    }
}

// Helper function to create fullscreen overlay
function createFullscreenOverlay() {
    const overlay = document.querySelector('.fullscreen-overlay');
    if (overlay) return overlay;

    const newOverlay = document.createElement('div');
    newOverlay.className = 'fullscreen-overlay';
    newOverlay.addEventListener('click', () => {
        // Exit fullscreen when clicking overlay
        const fullscreenContainer = document.querySelector('.mermaid-fullscreen');
        if (fullscreenContainer) {
            const diagram = fullscreenContainer.querySelector('.mermaid');
            if (diagram) {
                const state = diagramStates.get(diagram.id);
                if (state) {
                    toggleFullscreen(fullscreenContainer, diagram, state);
                }
            }
        }
    });
    document.body.appendChild(newOverlay);
    return newOverlay;
}

