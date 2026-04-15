/**
 * Frontend Authentication System for BC3620 Project
 * Connects to backend auth system and manages user sessions
 */

class FrontendAuth {
    constructor() {
        this.user = null;
        this.token = null;
        this.userType = null;
        this.isAuthenticated = false;
        this.baseURL = 'http://localhost:3000'; // Backend server URL
        
        // API endpoints for different user types
        this.apiEndpoints = {
            student: 'https://1efeuebkh9.execute-api.ap-south-1.amazonaws.com/dev/student',
            teacher: 'https://1efeuebkh9.execute-api.ap-south-1.amazonaws.com/dev/teacher',
            admin: 'https://fowh69kcfd.execute-api.ap-south-1.amazonaws.com/dev/admin',
            parents: 'https://1efeuebkh9.execute-api.ap-south-1.amazonaws.com/dev/parents'
        };
        
        // Field mappings for each user type
        this.fieldMappings = {
            student: {
                idField: 'student_id',
                passwordField: 'password'
            },
            teacher: {
                idField: 'teacher_id',
                passwordField: 'password'
            },
            admin: {
                idField: 'admin_id',
                passwordField: 'password'
            },
            parents: {
                idField: 'parent_userId',
                passwordField: 'parent_password'
            }
        };
        
        // Redirect URLs for each user type
        this.redirectUrls = {
            student: './student-module/home.html',
            teacher: './teacher-module/home.html',
            parents: './parents-module/attendance.html',
            admin: './admin/admindashboard.html'
        };
        
        this.init();
    }

    /**
     * Initialize the authentication system
     */
    init() {
        // Check for existing session
        this.checkExistingSession();
        
        // Set up event listeners
        this.setupEventListeners();
        
        console.log('FrontendAuth initialized');
    }

    /**
     * Check for existing session in localStorage
     */
    checkExistingSession() {
        try {
            const storedUser = localStorage.getItem('bc3620_user');
            const storedToken = localStorage.getItem('bc3620_token');
            const storedUserType = localStorage.getItem('bc3620_userType');
            
            if (storedUser && storedToken && storedUserType) {
                this.user = JSON.parse(storedUser);
                this.token = storedToken;
                this.userType = storedUserType;
                this.isAuthenticated = true;
                
                console.log('Existing session found:', this.user);
            }
        } catch (error) {
            console.error('Error checking existing session:', error);
            this.clearSession();
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for auth state changes
        document.addEventListener('authStateChange', (event) => {
            console.log('Auth state changed:', event.detail);
        });
    }

    /**
     * Login user with credentials
     */
    async login(credentials) {
        try {
            console.log('Attempting login for:', credentials.userType);
            
            // Validate input
            if (!credentials.userType || !credentials.id || !credentials.password) {
                throw new Error('All fields are required');
            }
            
            // Get the appropriate API endpoint
            const apiEndpoint = this.apiEndpoints[credentials.userType];
            if (!apiEndpoint) {
                throw new Error('Invalid user type');
            }
            
            // First, get all users from the specific API endpoint
            const response = await fetch(apiEndpoint, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch user data');
            }
            
            const responseData = await response.json();
            console.log('API Response:', responseData);
            
            // Handle different response formats
            let allUsers;
            if (responseData.teachers) {
                // Teacher API returns { success: true, teachers: [...] }
                allUsers = responseData.teachers;
            } else if (responseData.students) {
                // Student API might return { success: true, students: [...] }
                allUsers = responseData.students;
            } else if (responseData.parents) {
                // Parents API might return { success: true, parents: [...] }
                allUsers = responseData.parents;
            } else if (responseData.admins) {
                // Admin API might return { success: true, admins: [...] }
                allUsers = responseData.admins;
            } else if (Array.isArray(responseData)) {
                // Some APIs return array directly
                allUsers = responseData;
            } else {
                // Fallback: try to find array in response
                allUsers = responseData.data || responseData.users || [];
            }
            
            console.log('Extracted users array:', allUsers);
            
            // Find user by ID and password
            const userData = allUsers.find(user => {
                const idField = this.fieldMappings[credentials.userType].idField;
                const passwordField = this.fieldMappings[credentials.userType].passwordField;
                
                return user[idField] === credentials.id && 
                       user[passwordField] === credentials.password;
            });
            
            if (!userData) {
                throw new Error('Invalid credentials');
            }
            
            // Check if user is active
            if (userData.is_active === false) {
                throw new Error('Account is deactivated');
            }
            
            // Set user data
            this.user = {
                ...userData,
                loginTime: new Date().toISOString(),
                userType: credentials.userType
            };
            
            // Debug logging to see what fields are available
            console.log('User data from API:', userData);
            console.log('Stored user object:', this.user);
            console.log('Teacher name field:', this.user.teacher_name);
            console.log('Full name field:', this.user.full_name);
            this.userType = credentials.userType;
            this.isAuthenticated = true;
            
            // Generate a simple token (in production, this should come from backend)
            this.token = this.generateToken();
            
            // Store in localStorage
            this.saveSession();
            
            // Dispatch auth state change event
            this.dispatchAuthStateChange();
            
            console.log('Login successful:', this.user);
            
            return {
                success: true,
                user: this.user,
                userType: this.userType,
                token: this.token
            };
            
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    /**
     * Generate a simple token (in production, use JWT from backend)
     */
    generateToken() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2);
        return `${timestamp}_${random}_${this.userType}`;
    }

    /**
     * Save session to localStorage
     */
    saveSession() {
        try {
            console.log('Saving session to localStorage:', this.user);
            console.log('User type:', this.userType);
            console.log('Available fields in user object:', Object.keys(this.user));
            
            localStorage.setItem('bc3620_user', JSON.stringify(this.user));
            localStorage.setItem('bc3620_token', this.token);
            localStorage.setItem('bc3620_userType', this.userType);
            localStorage.setItem('bc3620_loginTime', new Date().toISOString());
        } catch (error) {
            console.error('Error saving session:', error);
        }
    }

    /**
     * Clear session data
     */
    clearSession() {
        this.user = null;
        this.token = null;
        this.userType = null;
        this.isAuthenticated = false;
        
        // Clear localStorage
        localStorage.removeItem('bc3620_user');
        localStorage.removeItem('bc3620_token');
        localStorage.removeItem('bc3620_userType');
        localStorage.removeItem('bc3620_loginTime');
        
        // Dispatch auth state change event
        this.dispatchAuthStateChange();
        
        console.log('Session cleared');
    }

    /**
     * Logout user
     */
    async logout() {
        try {
            console.log('Logging out user...');
            
            // Clear session
            this.clearSession();
            
            // Redirect to login page
            window.location.href = './login.html';
            
            return { success: true };
        } catch (error) {
            console.error('Logout error:', error);
            throw error;
        }
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.user;
    }

    /**
     * Get user type
     */
    getUserType() {
        return this.userType;
    }

    /**
     * Check if user is authenticated
     */
    isUserAuthenticated() {
        return this.isAuthenticated;
    }

    /**
     * Get authentication token
     */
    getToken() {
        return this.token;
    }

    /**
     * Get redirect URL for user type
     */
    getRedirectUrl(userType) {
        return this.redirectUrls[userType] || './login.html';
    }

    /**
     * Redirect user to appropriate dashboard
     */
    redirectToDashboard() {
        if (!this.isAuthenticated || !this.userType) {
            window.location.href = './login.html';
            return;
        }
        
        const redirectUrl = this.getRedirectUrl(this.userType);
        console.log('Redirecting to:', redirectUrl);
        window.location.href = redirectUrl;
    }

    /**
     * Check if user has permission for specific action
     */
    hasPermission(action) {
        if (!this.isAuthenticated || !this.userType) {
            return false;
        }
        
        const permissions = {
            admin: ['read', 'write', 'delete', 'manage_users', 'manage_system'],
            teacher: ['read', 'write', 'manage_students', 'manage_assignments'],
            student: ['read', 'submit_assignments', 'view_grades'],
            parents: ['read', 'view_child_progress']
        };
        
        return permissions[this.userType]?.includes(action) || false;
    }

    /**
     * Make authenticated API request
     */
    async makeAuthenticatedRequest(url, options = {}) {
        if (!this.isAuthenticated || !this.token) {
            throw new Error('User not authenticated');
        }
        
        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                'X-User-Type': this.userType,
                'X-User-ID': this.user.id || this.user.student_id || this.user.teacher_id || this.user.admin_id || this.user.parent_userId
            }
        };
        
        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };
        
        try {
            const response = await fetch(url, mergedOptions);
            
            if (response.status === 401) {
                // Token expired, redirect to login
                this.clearSession();
                window.location.href = './login.html';
                throw new Error('Session expired');
            }
            
            return response;
        } catch (error) {
            console.error('Authenticated request failed:', error);
            throw error;
        }
    }

    /**
     * Dispatch auth state change event
     */
    dispatchAuthStateChange() {
        const event = new CustomEvent('authStateChange', {
            detail: {
                user: this.user,
                isAuthenticated: this.isAuthenticated,
                userType: this.userType,
                token: this.token
            }
        });
        document.dispatchEvent(event);
    }

    /**
     * Get user display name
     */
    getUserDisplayName() {
        if (!this.user) return 'Guest';
        
        return this.user.name || 
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
     * Check session validity
     */
    isSessionValid() {
        if (!this.isAuthenticated || !this.user) {
            return false;
        }
        
        // Check if session is older than 24 hours
        const loginTime = localStorage.getItem('bc3620_loginTime');
        if (loginTime) {
            const loginDate = new Date(loginTime);
            const now = new Date();
            const hoursDiff = (now - loginDate) / (1000 * 60 * 60);
            
            if (hoursDiff > 24) {
                this.clearSession();
                return false;
            }
        }
        
        return true;
    }
}

// Create global instance
const frontendAuth = new FrontendAuth();

// Export for use in other files
window.FrontendAuth = frontendAuth;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('FrontendAuth initialized');
    });
} else {
    console.log('FrontendAuth initialized');
}
