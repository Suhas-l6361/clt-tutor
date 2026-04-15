/**
 * User Session Management for BC3620 Project
 * Handles user data tracking and session management across pages
 */

class UserSession {
    constructor() {
        this.user = null;
        this.userType = null;
        this.isAuthenticated = false;
        this.init();
    }

    /**
     * Initialize user session
     */
    init() {
        this.loadUserData();
        this.setupEventListeners();
        this.updateUI();
    }

    /**
     * Load user data from localStorage with enhanced validation
     */
    loadUserData() {
        try {
            const storedUser = localStorage.getItem('bc3620_user');
            const storedUserType = localStorage.getItem('bc3620_userType');
            
            if (storedUser && storedUserType) {
                const user = JSON.parse(storedUser);
                
                // 🛡️ SECURITY VALIDATION: Check user type consistency
                if (user.userType && user.userType !== storedUserType) {
                    console.error('🚨 SECURITY WARNING: User type mismatch detected!');
                    console.error('User object userType:', user.userType, 'Stored userType:', storedUserType);
                    console.error('Clearing potentially compromised session...');
                    this.clearUserData();
                    return;
                }
                
                // Additional validation: Check if user has required fields for their type
                const requiredFields = {
                    student: ['student_id'],
                    teacher: ['teacher_id'],
                    admin: ['admin_id'],
                    parents: ['parent_userId']
                };
                
                const required = requiredFields[storedUserType];
                if (required && !required.some(field => user[field])) {
                    console.error('🚨 SECURITY WARNING: User missing required fields for type:', storedUserType);
                    console.error('Required fields:', required, 'User data:', user);
                    this.clearUserData();
                    return;
                }
                
                this.user = user;
                this.userType = storedUserType;
                this.isAuthenticated = true;
                
                console.log('User session loaded:', this.user);
                console.log('Available fields in loaded user:', Object.keys(this.user));
                console.log('Teacher name field:', this.user.teacher_name);
                console.log('Full name field:', this.user.full_name);
                console.log('Name field:', this.user.name);
                console.log('✅ Session validation passed for user type:', this.userType);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            this.clearUserData();
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for auth state changes
        document.addEventListener('authStateChange', (event) => {
            this.user = event.detail.user;
            this.userType = event.detail.userType;
            this.isAuthenticated = event.detail.isAuthenticated;
            this.updateUI();
        });

        // Listen for storage changes (for multi-tab sync)
        window.addEventListener('storage', (event) => {
            if (event.key === 'bc3620_user' || event.key === 'bc3620_userType') {
                this.loadUserData();
                this.updateUI();
            }
        });
    }

    /**
     * Update UI elements with user data
     */
    updateUI() {
        // Update user name display
        const userNameElements = document.querySelectorAll('.user-name, .user-display-name');
        userNameElements.forEach(element => {
            if (this.user) {
                element.textContent = this.getUserDisplayName();
            } else {
                element.textContent = 'Guest';
            }
        });

        // Update user type display
        const userTypeElements = document.querySelectorAll('.user-type, .user-role');
        userTypeElements.forEach(element => {
            if (this.userType) {
                element.textContent = this.userType.charAt(0).toUpperCase() + this.userType.slice(1);
            } else {
                element.textContent = 'Guest';
            }
        });

        // Update user ID display
        const userIdElements = document.querySelectorAll('.user-id');
        userIdElements.forEach(element => {
            if (this.user) {
                element.textContent = this.getUserId();
            } else {
                element.textContent = 'N/A';
            }
        });

        // Show/hide authenticated content
        const authElements = document.querySelectorAll('.auth-required');
        authElements.forEach(element => {
            element.style.display = this.isAuthenticated ? 'block' : 'none';
        });

        // Show/hide guest content
        const guestElements = document.querySelectorAll('.guest-only');
        guestElements.forEach(element => {
            element.style.display = this.isAuthenticated ? 'none' : 'block';
        });

        // Update role-specific content
        this.updateRoleSpecificContent();
    }

    /**
     * Update role-specific content visibility
     */
    updateRoleSpecificContent() {
        const roles = ['student', 'teacher', 'admin', 'parents'];
        
        roles.forEach(role => {
            const roleElements = document.querySelectorAll(`.${role}-only`);
            roleElements.forEach(element => {
                element.style.display = (this.userType === role) ? 'block' : 'none';
            });
        });
    }

    /**
     * Get user display name
     */
    getUserDisplayName() {
        if (!this.user) return 'Guest';
        
        return this.user.full_name || 
               this.user.name || 
               this.user.student_name || 
               this.user.teacher_name || 
               this.user.admin_name || 
               this.user.parent_name || 
               'User';
    }

    /**
     * Get user ID
     */
    getUserId() {
        if (!this.user) return null;
        
        return this.user.id || 
               this.user.student_id || 
               this.user.teacher_id || 
               this.user.admin_id || 
               this.user.parent_userId || 
               null;
    }

    /**
     * Get user email
     */
    getUserEmail() {
        if (!this.user) return null;
        
        return this.user.email || null;
    }

    /**
     * Get user phone
     */
    getUserPhone() {
        if (!this.user) return null;
        
        return this.user.phone_number || 
               this.user.phone || 
               null;
    }

    /**
     * Check if user has specific permission
     */
    hasPermission(permission) {
        if (!this.isAuthenticated || !this.userType) {
            return false;
        }
        
        const permissions = {
            admin: ['read', 'write', 'delete', 'manage_users', 'manage_system'],
            teacher: ['read', 'write', 'manage_students', 'manage_assignments'],
            student: ['read', 'submit_assignments', 'view_grades'],
            parents: ['read', 'view_child_progress']
        };
        
        return permissions[this.userType]?.includes(permission) || false;
    }

    /**
     * Get user-specific data
     */
    getUserData() {
        return {
            user: this.user,
            userType: this.userType,
            isAuthenticated: this.isAuthenticated,
            displayName: this.getUserDisplayName(),
            userId: this.getUserId(),
            email: this.getUserEmail(),
            phone: this.getUserPhone()
        };
    }

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return this.isAuthenticated && this.user !== null;
    }

    /**
     * Require authentication (redirect to login if not authenticated)
     */
    requireAuth() {
        if (!this.isAuthenticated) {
            window.location.href = './login.html';
            return false;
        }
        return true;
    }

    /**
     * Require specific user type with enhanced security logging
     */
    requireUserType(requiredType) {
        if (!this.requireAuth()) {
            return false;
        }
        
        if (this.userType !== requiredType) {
            // 🚨 SECURITY ALERT: Log unauthorized access attempt
            console.error('🚨 SECURITY BREACH ATTEMPT:', {
                attemptedAccess: requiredType,
                actualUserType: this.userType,
                userId: this.getUserId(),
                userName: this.getUserDisplayName(),
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                currentUrl: window.location.href
            });
            
            // Show security warning
            alert(`🚫 UNAUTHORIZED ACCESS DETECTED!\n\nYou (${this.userType}) are trying to access ${requiredType}-only content.\n\nThis incident has been logged.\nYou will be redirected to your appropriate dashboard.`);
            
            // Redirect to appropriate dashboard
            const redirectUrls = {
                student: './student-module/home.html',
                teacher: './teacher-module/home.html',
                parent: './parent-module/home.html',
                parents: './parent-module/home.html',
                admin: './admin/admindashboard.html'
            };
            
            window.location.href = redirectUrls[this.userType] || './login.html';
            return false;
        }
        
        return true;
    }

    /**
     * Validate user session integrity
     */
    validateSessionIntegrity() {
        if (!this.user || !this.userType) {
            return false;
        }
        
        // Check if stored user type matches user's actual type
        if (this.user.userType && this.user.userType !== this.userType) {
            console.error('🚨 SESSION INTEGRITY VIOLATION: User type mismatch detected');
            console.error('Stored userType:', this.userType, 'User object userType:', this.user.userType);
            this.clearUserData();
            return false;
        }
        
        // Additional integrity checks can be added here
        return true;
    }

    /**
     * Logout user
     */
    logout() {
        this.clearUserData();
        
        // Redirect to login page
        window.location.href = './login.html';
    }

    /**
     * Clear user data
     */
    clearUserData() {
        this.user = null;
        this.userType = null;
        this.isAuthenticated = false;
        
        // Clear localStorage
        localStorage.removeItem('bc3620_user');
        localStorage.removeItem('bc3620_token');
        localStorage.removeItem('bc3620_userType');
        localStorage.removeItem('bc3620_loginTime');
        
        this.updateUI();
    }

    /**
     * Get user profile information
     */
    getUserProfile() {
        if (!this.user) return null;
        
        return {
            id: this.getUserId(),
            name: this.getUserDisplayName(),
            email: this.getUserEmail(),
            phone: this.getUserPhone(),
            userType: this.userType,
            loginTime: this.user.loginTime,
            isActive: this.user.is_active !== false
        };
    }

    /**
     * Update user data (for profile updates)
     */
    updateUserData(updatedData) {
        if (!this.user) return false;
        
        try {
            // Merge updated data with existing user data
            this.user = { ...this.user, ...updatedData };
            
            // Save to localStorage
            localStorage.setItem('bc3620_user', JSON.stringify(this.user));
            
            // Update UI
            this.updateUI();
            
            // Dispatch update event
            const event = new CustomEvent('userDataUpdated', {
                detail: { user: this.user }
            });
            document.dispatchEvent(event);
            
            return true;
        } catch (error) {
            console.error('Error updating user data:', error);
            return false;
        }
    }
}

// Create global instance
const userSession = new UserSession();

// Export for use in other files
window.UserSession = userSession;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('UserSession initialized');
    });
} else {
    console.log('UserSession initialized');
}
