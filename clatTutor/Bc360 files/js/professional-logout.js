/**
 * Professional Logout System for BC3620 Project
 * Provides secure logout with confirmation, session cleanup, and browser back prevention
 */

class ProfessionalLogout {
    constructor() {
        this.isLoggingOut = false;
        this.confirmationShown = false;
        this.init();
    }

    /**
     * Initialize the logout system
     */
    init() {
        // Add logout confirmation popup styles
        this.addLogoutStyles();
        
        // Setup logout event listeners
        this.setupLogoutListeners();
        
        // Prevent browser back button after logout
        this.preventBrowserBack();
        
        console.log('🔐 Professional Logout System initialized');
    }

    /**
     * Add professional logout confirmation popup styles
     */
    addLogoutStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Professional Logout Confirmation Popup */
            .logout-confirmation-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                backdrop-filter: blur(10px);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                animation: fadeIn 0.3s ease-out;
            }

            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            .logout-confirmation-popup {
                background: linear-gradient(145deg, #1a1a1a, #2d2d2d);
                border-radius: 20px;
                padding: 40px;
                max-width: 450px;
                width: 90%;
                text-align: center;
                box-shadow: 
                    0 25px 50px -12px rgba(0, 0, 0, 0.5),
                    0 0 0 1px rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                animation: slideIn 0.4s ease-out;
                position: relative;
                overflow: hidden;
            }

            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: scale(0.8) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }

            .logout-confirmation-popup::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 4px;
                background: linear-gradient(90deg, #ef4444, #f59e0b, #ef4444);
                background-size: 200% 100%;
                animation: shimmer 2s ease-in-out infinite;
            }

            @keyframes shimmer {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
            }

            .logout-icon {
                font-size: 64px;
                color: #ef4444;
                margin-bottom: 20px;
                animation: pulse 2s ease-in-out infinite;
            }

            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.1); opacity: 0.8; }
            }

            .logout-title {
                font-size: 24px;
                font-weight: 700;
                color: #ffffff;
                margin-bottom: 12px;
                letter-spacing: -0.5px;
            }

            .logout-message {
                font-size: 16px;
                color: #a0a0a0;
                margin-bottom: 30px;
                line-height: 1.6;
            }

            .logout-buttons {
                display: flex;
                gap: 16px;
                justify-content: center;
                flex-wrap: wrap;
            }

            .logout-btn {
                padding: 12px 32px;
                border: none;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                min-width: 120px;
                position: relative;
                overflow: hidden;
            }

            .logout-btn::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
                transition: left 0.5s ease;
            }

            .logout-btn:hover::before {
                left: 100%;
            }

            .logout-btn-cancel {
                background: linear-gradient(145deg, #374151, #4b5563);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.2);
            }

            .logout-btn-cancel:hover {
                background: linear-gradient(145deg, #4b5563, #6b7280);
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(75, 85, 99, 0.3);
            }

            .logout-btn-confirm {
                background: linear-gradient(145deg, #ef4444, #dc2626);
                color: #ffffff;
                border: 1px solid rgba(239, 68, 68, 0.3);
            }

            .logout-btn-confirm:hover {
                background: linear-gradient(145deg, #dc2626, #b91c1c);
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(239, 68, 68, 0.4);
            }

            .logout-btn:active {
                transform: translateY(0);
            }

            .logout-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                transform: none;
            }

            /* Loading state */
            .logout-btn.loading {
                position: relative;
                color: transparent;
            }

            .logout-btn.loading::after {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 20px;
                height: 20px;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top-color: #ffffff;
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                to { transform: translate(-50%, -50%) rotate(360deg); }
            }

            /* Mobile responsiveness */
            @media (max-width: 480px) {
                .logout-confirmation-popup {
                    padding: 30px 20px;
                    margin: 20px;
                }

                .logout-title {
                    font-size: 20px;
                }

                .logout-message {
                    font-size: 14px;
                }

                .logout-buttons {
                    flex-direction: column;
                }

                .logout-btn {
                    width: 100%;
                    padding: 14px;
                }
            }

            /* Close button */
            .logout-close {
                position: absolute;
                top: 15px;
                right: 15px;
                background: none;
                border: none;
                color: #a0a0a0;
                font-size: 24px;
                cursor: pointer;
                transition: color 0.3s ease;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
            }

            .logout-close:hover {
                color: #ffffff;
                background: rgba(255, 255, 255, 0.1);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Setup logout event listeners for all logout buttons
     */
    setupLogoutListeners() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.attachLogoutListeners();
            });
        } else {
            this.attachLogoutListeners();
        }
    }

    /**
     * Attach logout listeners to all logout buttons
     */
    attachLogoutListeners() {
        const logoutSelectors = [
            '.logout-btn',
            '.logout-button', 
            '[onclick*="logout"]',
            'a[href="#"][onclick*="logout"]',
            'button[onclick*="logout"]'
        ];

        logoutSelectors.forEach(selector => {
            const buttons = document.querySelectorAll(selector);
            buttons.forEach(button => {
                // Remove existing onclick handlers
                button.removeAttribute('onclick');
                
                // Add new event listener
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showLogoutConfirmation();
                });
            });
        });

        console.log('🔗 Logout listeners attached to all logout buttons');
    }

    /**
     * Show professional logout confirmation popup
     */
    showLogoutConfirmation() {
        if (this.confirmationShown || this.isLoggingOut) {
            return;
        }

        this.confirmationShown = true;

        // Get user information for personalization
        const userInfo = this.getUserInfo();
        const userName = userInfo.name || 'User';

        // Create popup HTML
        const popupHTML = `
            <div class="logout-close" onclick="professionalLogout.closeLogoutConfirmation()">&times;</div>
            <div class="logout-icon">
                <i class="fas fa-sign-out-alt"></i>
            </div>
            <h2 class="logout-title">Confirm Logout</h2>
            <p class="logout-message">
                Hi <strong>${userName}</strong>,<br>
                Are you sure you want to log out?<br>
                <span style="color: #f59e0b; font-size: 14px; margin-top: 8px; display: block;">
                    Your session will be securely terminated and you'll need to log in again.
                </span>
            </p>
            <div class="logout-buttons">
                <button class="logout-btn logout-btn-cancel" onclick="professionalLogout.closeLogoutConfirmation()">
                    <i class="fas fa-times"></i> Cancel
                </button>
                <button class="logout-btn logout-btn-confirm" onclick="professionalLogout.confirmLogout()">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            </div>
        `;

        // Create overlay and popup
        const overlay = document.createElement('div');
        overlay.className = 'logout-confirmation-overlay';
        overlay.innerHTML = `<div class="logout-confirmation-popup">${popupHTML}</div>`;

        // Add to document
        document.body.appendChild(overlay);

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeLogoutConfirmation();
            }
        });

        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                this.closeLogoutConfirmation();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // Focus on cancel button for accessibility
        setTimeout(() => {
            const cancelBtn = overlay.querySelector('.logout-btn-cancel');
            if (cancelBtn) cancelBtn.focus();
        }, 100);
    }

    /**
     * Close logout confirmation popup
     */
    closeLogoutConfirmation() {
        const overlay = document.querySelector('.logout-confirmation-overlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.3s ease-in forwards';
            setTimeout(() => {
                overlay.remove();
                this.confirmationShown = false;
            }, 300);
        }
    }

    /**
     * Confirm logout and proceed with logout process
     */
    async confirmLogout() {
        if (this.isLoggingOut) {
            return;
        }

        this.isLoggingOut = true;

        // Show loading state
        const confirmBtn = document.querySelector('.logout-btn-confirm');
        const cancelBtn = document.querySelector('.logout-btn-cancel');
        
        if (confirmBtn) {
            confirmBtn.classList.add('loading');
            confirmBtn.disabled = true;
        }
        if (cancelBtn) {
            cancelBtn.disabled = true;
        }

        try {
            // Perform logout process
            await this.performLogout();
        } catch (error) {
            console.error('Logout error:', error);
            // Reset button states
            if (confirmBtn) {
                confirmBtn.classList.remove('loading');
                confirmBtn.disabled = false;
            }
            if (cancelBtn) {
                cancelBtn.disabled = false;
            }
            this.isLoggingOut = false;
        }
    }

    /**
     * Perform the actual logout process
     */
    async performLogout() {
        console.log('🔐 Starting secure logout process...');

        // Step 1: Clear user session
        if (window.UserSession) {
            console.log('🗑️ Clearing UserSession...');
            window.UserSession.clearUserData();
        }

        // Step 2: Clear all localStorage data
        console.log('🗑️ Clearing localStorage...');
        this.clearAllSessionData();

        // Step 3: Clear sessionStorage
        console.log('🗑️ Clearing sessionStorage...');
        sessionStorage.clear();

        // Step 4: Clear any cookies (if any)
        console.log('🗑️ Clearing cookies...');
        this.clearCookies();

        // Step 5: Prevent browser back button
        console.log('🚫 Setting up browser back prevention...');
        this.setupBackPrevention();

        // Step 6: Show logout success message briefly
        this.showLogoutSuccess();

        // Step 7: Redirect to login page
        setTimeout(() => {
            console.log('🔄 Redirecting to login page...');
            window.location.replace('../login.html');
        }, 1500);
    }

    /**
     * Clear all session-related data from localStorage
     */
    clearAllSessionData() {
        const keysToRemove = [
            'bc3620_user',
            'bc3620_userType', 
            'bc3620_token',
            'bc3620_loginTime',
            'bc3620_session',
            'user_session',
            'auth_token',
            'login_data'
        ];

        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
        });

        // Also remove any keys that start with 'rate_' (rate limiting data)
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('rate_')) {
                localStorage.removeItem(key);
            }
        });
    }

    /**
     * Clear cookies (if any exist)
     */
    clearCookies() {
        document.cookie.split(";").forEach(function(c) { 
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
        });
    }

    /**
     * Show logout success message
     */
    showLogoutSuccess() {
        const overlay = document.querySelector('.logout-confirmation-overlay');
        if (overlay) {
            const popup = overlay.querySelector('.logout-confirmation-popup');
            if (popup) {
                popup.innerHTML = `
                    <div class="logout-icon" style="color: #10b981;">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h2 class="logout-title" style="color: #10b981;">Logged Out Successfully</h2>
                    <p class="logout-message">
                        Your session has been securely terminated.<br>
                        Redirecting to login page...
                    </p>
                    <div style="width: 100%; height: 4px; background: #374151; border-radius: 2px; overflow: hidden; margin-top: 20px;">
                        <div style="width: 100%; height: 100%; background: linear-gradient(90deg, #10b981, #059669); animation: progress 1.5s ease-out forwards;"></div>
                    </div>
                `;
            }
        }

        // Add progress animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes progress {
                from { transform: translateX(-100%); }
                to { transform: translateX(0%); }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Setup browser back button prevention
     */
    setupBackPrevention() {
        // Push a new state to history
        history.pushState(null, null, location.href);
        
        // Listen for back button
        window.addEventListener('popstate', (e) => {
            // Push state again to prevent going back
            history.pushState(null, null, location.href);
            
            // Show warning
            console.warn('🚫 Browser back button blocked after logout');
            
            // Optional: Show a message
            if (typeof showNotification === 'function') {
                showNotification('⚠️ Please use the login page to access the system', 'warning');
            }
        });
    }

    /**
     * Prevent browser back button (called on page load)
     */
    preventBrowserBack() {
        // Only prevent back if user is not authenticated
        if (!this.isUserAuthenticated()) {
            this.setupBackPrevention();
        }
    }

    /**
     * Check if user is authenticated
     */
    isUserAuthenticated() {
        try {
            const userData = localStorage.getItem('bc3620_user');
            const userType = localStorage.getItem('bc3620_userType');
            return !!(userData && userType);
        } catch (error) {
            return false;
        }
    }

    /**
     * Get user information for personalization
     */
    getUserInfo() {
        try {
            const userData = localStorage.getItem('bc3620_user');
            if (userData) {
                const user = JSON.parse(userData);
                return {
                    name: user.name || user.student_name || user.teacher_name || user.admin_name || user.parent_name,
                    email: user.email,
                    userType: user.userType
                };
            }
        } catch (error) {
            console.error('Error getting user info:', error);
        }
        return { name: 'User' };
    }

    /**
     * Public method to trigger logout programmatically
     */
    triggerLogout() {
        this.showLogoutConfirmation();
    }
}

// Create global instance
const professionalLogout = new ProfessionalLogout();

// Export for use in other files
window.ProfessionalLogout = professionalLogout;

// Also expose the instance globally for onclick handlers
window.professionalLogout = professionalLogout;

console.log('🔐 Professional Logout System loaded successfully');
