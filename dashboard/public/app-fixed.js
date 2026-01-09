// S6 Chromium Grid Dashboard - Fixed Event Handlers
// This file ensures all buttons work properly by using event delegation

(function() {
    'use strict';

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }

    function initializeApp() {
        console.log('[App] Initializing S6 Chromium Grid Dashboard');

        // Attach global event handlers using delegation
        document.body.addEventListener('click', handleGlobalClick);

        // Load initial status
        if (typeof loadStatus === 'function') {
            loadStatus();
        }

        console.log('[App] Dashboard initialized successfully');
    }

    function handleGlobalClick(e) {
        const target = e.target;

        // Handle button clicks
        if (target.tagName === 'BUTTON' || target.closest('button')) {
            const button = target.tagName === 'BUTTON' ? target : target.closest('button');
            const clickHandler = button.getAttribute('onclick');

            if (clickHandler) {
                e.preventDefault();
                try {
                    // Extract function name and arguments from onclick attribute
                    const match = clickHandler.match(/(\w+)\((.*?)\)/);
                    if (match) {
                        const [, funcName, args] = match;
                        if (typeof window[funcName] === 'function') {
                            // Parse arguments
                            const parsedArgs = args ? args.split(',').map(arg => {
                                arg = arg.trim();
                                // Try to parse as number
                                if (/^\d+$/.test(arg)) return parseInt(arg, 10);
                                // Try to parse as boolean
                                if (arg === 'true') return true;
                                if (arg === 'false') return false;
                                // Try to parse as string (remove quotes)
                                if (/^['"].*['"]$/.test(arg)) return arg.slice(1, -1);
                                // Return as is
                                return arg;
                            }) : [];

                            window[funcName](...parsedArgs);
                        } else {
                            console.error(`[App] Function not found: ${funcName}`);
                        }
                    }
                } catch (err) {
                    console.error('[App] Error handling click:', err);
                }
            }
        }

        // Handle div clicks (for VNC preview, settings sections, etc.)
        if (target.classList.contains('clickable') || target.closest('.clickable')) {
            const clickable = target.classList.contains('clickable') ? target : target.closest('.clickable');
            const clickHandler = clickable.getAttribute('onclick');

            if (clickHandler) {
                e.preventDefault();
                try {
                    eval(clickHandler);
                } catch (err) {
                    console.error('[App] Error handling clickable div:', err);
                }
            }
        }

        // Handle settings section headers
        if (target.classList.contains('settings-section-header')) {
            const clickHandler = target.getAttribute('onclick');
            if (clickHandler) {
                e.preventDefault();
                try {
                    eval(clickHandler);
                } catch (err) {
                    console.error('[App] Error handling settings section:', err);
                }
            }
        }
    }

    // Ensure all window functions are accessible
    console.log('[App] Checking global functions...');
    const requiredFunctions = [
        'loadStatus', 'openSettings', 'closeSettings', 'openLogs', 'closeLogs',
        'openVNC', 'closeModal', 'openMultiView', 'closeMultiView',
        'copyEndpoint', 'copyAIPrompt', 'restartInstance', 'stopInstance',
        'startRecording', 'stopRecording', 'toggleGPU', 'renameInstance',
        'openRecordingsManager', 'closeRecordingsManager', 'loadRecordings',
        'saveSettings', 'resetAIPrompt', 'toggleSection', 'loadLogFile',
        'scrollLogsToBottom', 'openRecordingSettings'
    ];

    const missingFunctions = requiredFunctions.filter(fn => typeof window[fn] !== 'function');
    if (missingFunctions.length > 0) {
        console.warn('[App] Missing functions:', missingFunctions);
    } else {
        console.log('[App] All required functions are available');
    }
})();
