// HTML Source Code Protection
(function() {
    'use strict';
    
    // Enhanced protection - Block View Source completely
    const selectiveProtection = () => {
        // Block View Source (Ctrl+U) completely
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.keyCode === 85) { // Block Ctrl+U (View Source)
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                console.warn('🚫 View Source disabled for security');
                alert('🚫 View Source is disabled for security reasons');
                return false;
            }
        });
        
        // Allow right-click for inspection - only block on sensitive areas
        document.addEventListener('contextmenu', function(e) {
            // Allow right-click on form elements
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                return;
            }
            
            // Allow right-click on non-sensitive areas for inspection
            if (!e.target.closest('.login-container') && !e.target.closest('.performance-indicator')) {
                return; // Allow right-click for inspection
            }
            
            // Only block right-click on sensitive areas
            e.preventDefault();
            e.stopPropagation();
            console.warn('🚫 Right-click disabled on sensitive areas only');
            return false;
        });
        
        // Allow F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C for responsive design
        console.log('✅ Developer tools enabled for responsive design');
    };
    
    // Form element right-click allowance (already handled in selectiveProtection)
    const allowFormRightClick = () => {
        // This is now handled in selectiveProtection function
        console.log('✅ Right-click protection configured');
    };
    
    // Disable text selection
    const disableTextSelection = () => {
        document.addEventListener('selectstart', function(e) {
            e.preventDefault();
            return false;
        });
        
        document.addEventListener('dragstart', function(e) {
            e.preventDefault();
            return false;
        });
    };
    
    // Disable drag and drop
    const disableDragDrop = () => {
        document.addEventListener('dragover', function(e) {
            e.preventDefault();
            return false;
        });
        
        document.addEventListener('drop', function(e) {
            e.preventDefault();
            return false;
        });
    };
    
    // Enhanced console protection for sensitive data
    const protectConsole = () => {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        const originalInfo = console.info;
        
        // Sensitive data patterns
        const sensitivePatterns = [
            /api[^a-z]/i,
            /endpoint/i,
            /token/i,
            /password/i,
            /credential/i,
            /auth/i,
            /login/i,
            /bc3620/i,
            /execute-api/i,
            /amazonaws/i,
            /student_id/i,
            /teacher_id/i,
            /admin_id/i,
            /parent_id/i
        ];
        
        const filterSensitiveData = (args) => {
            return args.map(arg => {
                if (typeof arg === 'string') {
                    for (let pattern of sensitivePatterns) {
                        if (pattern.test(arg)) {
                            return '🚫 [Sensitive Data Protected]';
                        }
                    }
                } else if (typeof arg === 'object' && arg !== null) {
                    // Filter object properties
                    const filtered = {};
                    for (let key in arg) {
                        if (sensitivePatterns.some(pattern => pattern.test(key))) {
                            filtered[key] = '[Protected]';
                        } else {
                            filtered[key] = arg[key];
                        }
                    }
                    return filtered;
                }
                return arg;
            });
        };
        
        console.log = function() {
            const filteredArgs = filterSensitiveData(Array.from(arguments));
            originalLog.apply(console, filteredArgs);
        };
        
        console.warn = function() {
            const filteredArgs = filterSensitiveData(Array.from(arguments));
            originalWarn.apply(console, filteredArgs);
        };
        
        console.error = function() {
            const filteredArgs = filterSensitiveData(Array.from(arguments));
            originalError.apply(console, filteredArgs);
        };
        
        console.info = function() {
            const filteredArgs = filterSensitiveData(Array.from(arguments));
            originalInfo.apply(console, filteredArgs);
        };
    };
    
    // Allow debugging for responsive design
    const allowDebugging = () => {
        console.log('✅ Debugging enabled for responsive design');
        console.log('✅ Developer tools accessible');
        console.log('✅ Console available for debugging');
    };
    
    // Protect localStorage from developer tools
    const protectLocalStorage = () => {
        const originalGetItem = localStorage.getItem;
        const originalSetItem = localStorage.setItem;
        const originalRemoveItem = localStorage.removeItem;
        
        // Override localStorage methods to hide sensitive data
        localStorage.getItem = function(key) {
            if (key.includes('bc3620') || key.includes('auth') || key.includes('token') || key.includes('user')) {
                return '[Protected Data]';
            }
            return originalGetItem.call(this, key);
        };
        
        localStorage.setItem = function(key, value) {
            if (key.includes('bc3620') || key.includes('auth') || key.includes('token') || key.includes('user')) {
                // Store normally but hide from dev tools
                originalSetItem.call(this, key, value);
                return;
            }
            originalSetItem.call(this, key, value);
        };
        
        // Hide sensitive keys from Object.keys(localStorage)
        const originalKeys = Object.keys;
        Object.keys = function(obj) {
            if (obj === localStorage) {
                return originalKeys(obj).filter(key => 
                    !key.includes('bc3620') && 
                    !key.includes('auth') && 
                    !key.includes('token') && 
                    !key.includes('user')
                );
            }
            return originalKeys(obj);
        };
    };
    
    // Initialize selective protections
    const initProtection = () => {
        selectiveProtection();
        allowFormRightClick();
        disableTextSelection();
        disableDragDrop();
        protectConsole();
        protectLocalStorage();
        allowDebugging();
        
        console.log('🛡️ Enhanced Protection Active - Dev Tools Enabled');
    };
    
    // Start protection when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProtection);
    } else {
        initProtection();
    }
    
})();
