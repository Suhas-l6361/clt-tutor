// Simple but Effective Protection (Fallback) - Optimized
(function() {
    'use strict';
    
    // Check if ultra-protection is already loaded
    if (window.ultraProtectionLoaded) {
        console.log('🛡️ Ultra-protection already loaded, skipping simple protection');
        return;
    }
    
    // Simple protection that works without errors
    const simpleProtection = {
        // Block Ctrl+U (View Source)
        blockViewSource: function() {
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.keyCode === 85) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 View Source is completely disabled!');
                    return false;
                }
            }, true);
        },
        
        // Block Ctrl+Shift+U
        blockViewSourceAlt: function() {
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.shiftKey && e.keyCode === 85) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 View Source is completely disabled!');
                    return false;
                }
            }, true);
        },
        
        // Block Ctrl+A (Select All)
        blockSelectAll: function() {
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.keyCode === 65) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 Select All disabled for security!');
                    return false;
                }
            }, true);
        },
        
        // Block Ctrl+C (Copy)
        blockCopy: function() {
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.keyCode === 67) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 Copy disabled for security!');
                    return false;
                }
            }, true);
        },
        
        // Block Ctrl+S (Save) - CRITICAL
        blockSave: function() {
            document.addEventListener('keydown', function(e) {
                if (e.ctrlKey && e.keyCode === 83) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 Save functionality is disabled for security!');
                    console.warn('🚫 Page save attempt blocked by simple protection!');
                    return false;
                }
                
                // Block Ctrl+Shift+S (Save As)
                if (e.ctrlKey && e.shiftKey && e.keyCode === 83) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    alert('🚫 Save As functionality is disabled for security!');
                    console.warn('🚫 Page save as attempt blocked by simple protection!');
                    return false;
                }
            }, true);
        },
        
        // Block text selection
        blockTextSelection: function() {
            document.addEventListener('selectstart', function(e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }, true);
        },
        
        // Allow right-click for inspection
        allowRightClick: function() {
            document.addEventListener('contextmenu', function(e) {
                // Allow right-click on form elements
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
        
        // Initialize simple protection
        init: function() {
            this.blockViewSource();
            this.blockViewSourceAlt();
            this.blockSelectAll();
            this.blockCopy();
            this.blockSave(); // CRITICAL: Add save blocking
            this.blockTextSelection();
            this.allowRightClick();
            
            console.log('🛡️ Simple Protection Active - View Source & Save Blocked!');
        }
    };
    
    // Start simple protection
    simpleProtection.init();
    
    // Also start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            simpleProtection.init();
        });
    }
    
})();
