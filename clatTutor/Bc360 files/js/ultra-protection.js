// Ultra-Strong Security Protection - Anti-Scraping, Anti-Save, Data Leakage Prevention
(function() {
    'use strict';
    
    // Multiple layers of protection
    const ultraProtection = {
        // Layer 1: Block all view source methods
        blockViewSource: function() {
            // Block Ctrl+U
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.keyCode === 85) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 View Source is completely disabled!');
                    return false;
                }
            }, true);
            
            // Block Ctrl+Shift+U
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.shiftKey && e.keyCode === 85) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 View Source is completely disabled!');
                    return false;
                }
            }, true);
            
            // Block F12 + Ctrl+U combination
            document.addEventListener('keydown', function(e) {
                if (e.keyCode === 123 && e.ctrlKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 View Source is completely disabled!');
                    return false;
                }
            }, true);
        },
        
        // Layer 2: Block right-click on sensitive areas
        blockRightClick: function() {
            document.addEventListener('contextmenu', function(e) {
                // Allow right-click on form elements only
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                    return;
                }
                
                // Allow right-click on non-sensitive areas for inspection
                if (!e.target.closest('.login-container') && !e.target.closest('.performance-indicator')) {
                    return; // Allow right-click for inspection
                }
                
                // Block right-click on sensitive areas
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                alert('🚫 Right-click disabled on sensitive areas!');
                return false;
            }, true);
        },
        
        // Layer 3: Block all possible view source methods
        blockAllMethods: function() {
            // Block Ctrl+A (Select All) + Ctrl+C (Copy)
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.keyCode === 65) { // Ctrl+A
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 Select All disabled for security!');
                    return false;
                }
            }, true);
            
            // Block Ctrl+C (Copy)
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.keyCode === 67) { // Ctrl+C
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 Copy disabled for security!');
                    return false;
                }
            }, true);
            
            // Block Ctrl+S (Save)
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.keyCode === 83) { // Ctrl+S
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 Save disabled for security!');
                    return false;
                }
            }, true);
        },
        
        // Layer 4: Block text selection
        blockTextSelection: function() {
            document.addEventListener('selectstart', function(e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }, true);
            
            document.addEventListener('dragstart', function(e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }, true);
        },
        
        // Layer 5: Block print
        blockPrint: function() {
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.keyCode === 80) { // Ctrl+P
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 Print disabled for security!');
                    return false;
                }
            }, true);
        },
        
        // Layer 6: Block save page
        blockSavePage: function() {
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.shiftKey && e.keyCode === 83) { // Ctrl+Shift+S
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 Save Page disabled for security!');
                    return false;
                }
            }, true);
        },
        
        // Layer 7: Block view source from address bar (Alternative method)
        blockAddressBar: function() {
            // Monitor for view-source URLs
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;
            
            history.pushState = function() {
                if (arguments[2] && arguments[2].includes('view-source:')) {
                    alert('🚫 View Source is completely disabled!');
                    return;
                }
                return originalPushState.apply(history, arguments);
            };
            
            history.replaceState = function() {
                if (arguments[2] && arguments[2].includes('view-source:')) {
                    alert('🚫 View Source is completely disabled!');
                    return;
                }
                return originalReplaceState.apply(history, arguments);
            };
        },
        
        // Layer 8: Enhanced Anti-Scraping Protection
        antiScraping: function() {
            // Detect common scraping tools
            const scrapingPatterns = [
                /headless/i, /phantom/i, /selenium/i, /puppeteer/i, 
                /playwright/i, /webdriver/i, /automation/i, /bot/i,
                /crawler/i, /spider/i, /scraper/i, /harvester/i
            ];
            
            // Check user agent for scraping tools
            const userAgent = navigator.userAgent.toLowerCase();
            const isScraping = scrapingPatterns.some(pattern => pattern.test(userAgent));
            
            if (isScraping) {
                console.warn('🚫 Scraping tool detected:', userAgent);
                // Redirect to login page
                window.location.href = './login.html';
                return;
            }
            
            // Monitor for automated behavior patterns
            let mouseMovements = 0;
            let keyboardEvents = 0;
            let suspiciousActivity = 0;
            
            document.addEventListener('mousemove', function() {
                mouseMovements++;
            });
            
            document.addEventListener('keydown', function() {
                keyboardEvents++;
            });
            
            // Check for suspicious patterns every 10 seconds
            setInterval(function() {
                // If no mouse movement and high keyboard activity, might be scraping
                if (mouseMovements === 0 && keyboardEvents > 50) {
                    suspiciousActivity++;
                }
                
                // If suspicious activity detected multiple times
                if (suspiciousActivity > 3) {
                    console.warn('🚫 Suspicious automated behavior detected');
                    alert('🚫 Automated access detected. Please use a regular browser.');
                    window.location.href = './login.html';
                }
                
                // Reset counters
                mouseMovements = 0;
                keyboardEvents = 0;
            }, 10000);
        },
        
        // Layer 9: Data Leakage Prevention
        preventDataLeakage: function() {
            // Override console methods to prevent data leakage
            const originalConsole = {
                log: console.log,
                warn: console.warn,
                error: console.error,
                info: console.info
            };
            
            const sensitivePatterns = [
                /password/i, /token/i, /secret/i, /key/i, /credential/i,
                /api[^a-z]/i, /endpoint/i, /bc3620/i, /student_id/i,
                /teacher_id/i, /admin_id/i, /parent_userId/i
            ];
            
            function filterSensitiveData(args) {
                return args.map(arg => {
                    if (typeof arg === 'string') {
                        for (let pattern of sensitivePatterns) {
                            if (pattern.test(arg)) {
                                return '[PROTECTED DATA]';
                            }
                        }
                    }
                    return arg;
                });
            }
            
            console.log = function() {
                const filteredArgs = filterSensitiveData(Array.from(arguments));
                originalConsole.log.apply(console, filteredArgs);
            };
            
            console.warn = function() {
                const filteredArgs = filterSensitiveData(Array.from(arguments));
                originalConsole.warn.apply(console, filteredArgs);
            };
            
            console.error = function() {
                const filteredArgs = filterSensitiveData(Array.from(arguments));
                originalConsole.error.apply(console, filteredArgs);
            };
            
            console.info = function() {
                const filteredArgs = filterSensitiveData(Array.from(arguments));
                originalConsole.info.apply(console, filteredArgs);
            };
        },
        
        // Layer 10: Enhanced Page Save Prevention
        preventPageSave: function() {
            // Block all save methods
            document.addEventListener('keydown', function(e) {
                // Block Ctrl+S (Save)
                if (e.ctrlKey && e.keyCode === 83) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 Save functionality is disabled for security!');
                    return false;
                }
                
                // Block Ctrl+Shift+S (Save As)
                if (e.ctrlKey && e.shiftKey && e.keyCode === 83) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 Save As functionality is disabled for security!');
                    return false;
                }
                
                // Block Ctrl+A then Ctrl+S (Select All + Save)
                if (e.ctrlKey && e.keyCode === 65) {
                    setTimeout(() => {
                        document.addEventListener('keydown', function(saveEvent) {
                            if (saveEvent.ctrlKey && saveEvent.keyCode === 83) {
                                saveEvent.preventDefault();
                                saveEvent.stopPropagation();
                                alert('🚫 Save functionality is disabled for security!');
                                return false;
                            }
                        }, { once: true });
                    }, 100);
                }
            });
            
            // Block right-click save
            document.addEventListener('contextmenu', function(e) {
                // Allow right-click on form elements only
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                return false;
            });
            
            // Block print functionality
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.keyCode === 80) { // Ctrl+P
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 Print functionality is disabled for security!');
                    return false;
                }
            });
            
            // Block drag and drop
            document.addEventListener('dragover', function(e) {
                e.preventDefault();
                return false;
            });
            
            document.addEventListener('drop', function(e) {
                e.preventDefault();
                return false;
            });
        },
        
        // Layer 11: Monitor developer tools (Allow for responsive design)
        blockDevTools: function() {
            let devtools = false;
            const threshold = 160;
            
            setInterval(function() {
                if (window.outerHeight - window.innerHeight > threshold || 
                    window.outerWidth - window.innerWidth > threshold) {
                    if (!devtools) {
                        devtools = true;
                        console.log('🔍 Developer Tools detected - Enhanced protection active');
                        // Don't redirect - allow dev tools for responsive design
                    }
                } else {
                    devtools = false;
                }
            }, 1000); // Reduced frequency to avoid conflicts
        },
        
        // Layer 9: Block all possible shortcuts
        blockAllShortcuts: function() {
            const blockedKeys = [
                { key: 85, ctrl: true, shift: false, name: 'Ctrl+U' },
                { key: 85, ctrl: true, shift: true, name: 'Ctrl+Shift+U' },
                { key: 65, ctrl: true, shift: false, name: 'Ctrl+A' },
                { key: 67, ctrl: true, shift: false, name: 'Ctrl+C' },
                { key: 83, ctrl: true, shift: false, name: 'Ctrl+S' },
                { key: 80, ctrl: true, shift: false, name: 'Ctrl+P' },
                { key: 83, ctrl: true, shift: true, name: 'Ctrl+Shift+S' }
            ];
            
            document.addEventListener('keydown', function(e) {
                for (let blockedKey of blockedKeys) {
                    if (e.keyCode === blockedKey.key && 
                        e.ctrlKey === blockedKey.ctrl && 
                        e.shiftKey === blockedKey.shift) {
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();
                        alert(`🚫 ${blockedKey.name} is disabled for security!`);
                        return false;
                    }
                }
            }, true);
        },
        
        // Initialize all protections with error handling
        init: function() {
            try {
                this.blockViewSource();
                this.blockRightClick();
                this.blockAllMethods();
                this.blockTextSelection();
                this.blockPrint();
                this.blockSavePage();
                this.blockAddressBar();
                this.antiScraping();
                this.preventDataLeakage();
                this.preventPageSave();
                this.blockDevTools();
                this.blockAllShortcuts();
                
                console.log('🛡️ Ultra-Strong Security Protection Active!');
                console.log('🔒 Anti-Scraping Protection: ON');
                console.log('🔒 Data Leakage Prevention: ON');
                console.log('🔒 Page Save Prevention: ON');
                console.log('🔒 View Source Protection: ON');
            } catch (error) {
                console.warn('⚠️ Some protection features may not be available:', error.message);
                // Still initialize basic protections
                this.blockViewSource();
                this.blockRightClick();
                this.blockAllMethods();
                this.preventDataLeakage();
                console.log('🛡️ Basic Security Protection Active!');
            }
        }
    };
    
    // Mark as loaded to prevent conflicts
    window.ultraProtectionLoaded = true;
    
    // IMMEDIATE PAGE SAVE PREVENTION - Works instantly
    (function() {
        // Block Ctrl+S immediately
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.keyCode === 83) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                alert('🚫 Save functionality is disabled for security!');
                console.warn('🚫 Page save attempt blocked!');
                return false;
            }
            
            // Block Ctrl+Shift+S immediately
            if (e.ctrlKey && e.shiftKey && e.keyCode === 83) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                alert('🚫 Save As functionality is disabled for security!');
                console.warn('🚫 Page save as attempt blocked!');
                return false;
            }
        }, true);
        
        console.log('🛡️ IMMEDIATE Page Save Prevention Active!');
    })();
    
    // Start protection immediately with error handling
    try {
        ultraProtection.init();
    } catch (error) {
        console.warn('⚠️ Initial protection setup failed:', error.message);
        // Fallback to basic protection
        try {
            ultraProtection.blockViewSource();
            ultraProtection.blockRightClick();
            ultraProtection.preventDataLeakage();
            console.log('🛡️ Fallback Protection Active - View Source Blocked!');
        } catch (fallbackError) {
            console.error('❌ Protection setup completely failed:', fallbackError.message);
        }
    }
    
    // Also start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            try {
                ultraProtection.init();
            } catch (error) {
                console.warn('⚠️ DOM protection setup failed:', error.message);
            }
        });
    }
    
})();
