/**
 * Simple Frontend Authentication System for BC3620 Project
 * Simplified version for better reliability
 */

// API endpoints for different user types
const AUTH_API_ENDPOINTS = {
    student: 'https://1efeuebkh9.execute-api.ap-south-1.amazonaws.com/dev/student',
    teacher: 'https://1efeuebkh9.execute-api.ap-south-1.amazonaws.com/dev/teacher',
    admin: 'https://fowh69kcfd.execute-api.ap-south-1.amazonaws.com/dev/admin',
    parents: 'https://1efeuebkh9.execute-api.ap-south-1.amazonaws.com/dev/parents'
};

// AWS ElastiCache Redis endpoints (replace with your actual Redis cluster)
const REDIS_ENDPOINTS = {
    primary: 'https://your-redis-cluster.cache.amazonaws.com:6379',
    session: 'https://your-session-cache.cache.amazonaws.com:6379'
};

// AWS API Gateway caching configuration
const CACHE_CONFIG = {
    enabled: true,
    ttl: 300, // 5 minutes
    keyPrefix: 'bc3620_auth_',
    maxSize: 1000
};

// Field mappings for each user type
const AUTH_FIELD_MAPPINGS = {
    student: { idField: 'student_id', passwordField: 'password' },
    teacher: { idField: 'teacher_id', passwordField: 'password' },
    admin: { idField: 'admin_id', passwordField: 'password' },
    parents: { idField: 'parent_userId', passwordField: 'parent_password' }
};

// Redirect URLs for each user type
const REDIRECT_URLS = {
    student: './student-module/home.html',
    teacher: './teacher-module/home.html',
    parents: './parents-module/attendance.html',
    admin: './admin/admindashboard.html'
};

// Load balancing and request batching
const REQUEST_QUEUE = [];
const BATCH_SIZE = 5;
const BATCH_TIMEOUT = 100; // 100ms batching window

// Enhanced Security and Anti-Bot Protection
const SECURITY_CONFIG = {
    maxRequestsPerMinute: 10,
    maxFailedAttempts: 3,
    lockoutDuration: 300000, // 5 minutes
    suspiciousPatterns: [
        /bot/i, /crawler/i, /spider/i, /scraper/i,
        /curl/i, /wget/i, /python/i, /requests/i,
        /headless/i, /phantom/i, /selenium/i, /puppeteer/i,
        /playwright/i, /webdriver/i, /automation/i, /harvester/i
    ],
    rateLimitWindow: 60000, // 1 minute
    requestHistory: new Map(),
    blockedIPs: new Set(),
    // Enhanced security features
    enableGeoBlocking: false,
    enableBehavioralAnalysis: true,
    enableDeviceFingerprinting: true,
    maxConcurrentSessions: 3,
    sessionTimeout: 1800000 // 30 minutes
};

// Performance monitoring
const PERFORMANCE_CONFIG = {
    enableCompression: true,
    enableMinification: true,
    cacheStrategy: 'aggressive',
    requestTimeout: 5000,
    retryAttempts: 2
};

// Simple authentication functions
window.SimpleAuth = {
    /**
     * Batch multiple requests for better performance
     */
    async batchRequest(apiEndpoint, credentials) {
        return new Promise((resolve, reject) => {
            REQUEST_QUEUE.push({ apiEndpoint, credentials, resolve, reject });
            
            // Process batch if it reaches size limit or timeout
            if (REQUEST_QUEUE.length >= BATCH_SIZE) {
                this.processBatch();
            } else if (REQUEST_QUEUE.length === 1) {
                // Start timeout for first request
                setTimeout(() => this.processBatch(), BATCH_TIMEOUT);
            }
        });
    },

    /**
     * Process batched requests
     */
    async processBatch() {
        if (REQUEST_QUEUE.length === 0) return;
        
        const batch = REQUEST_QUEUE.splice(0, BATCH_SIZE);
        const uniqueEndpoints = [...new Set(batch.map(req => req.apiEndpoint))];
        
        try {
            // Fetch all unique endpoints in parallel
            const responses = await Promise.all(
                uniqueEndpoints.map(endpoint => 
                    fetch(endpoint, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'max-age=300',
                            'Connection': 'keep-alive',
                            'Keep-Alive': 'timeout=5, max=1000'
                        }
                    })
                )
            );
            
            const responseData = await Promise.all(
                responses.map(response => response.json())
            );
            
            // Create endpoint to data mapping
            const endpointData = {};
            uniqueEndpoints.forEach((endpoint, index) => {
                endpointData[endpoint] = responseData[index];
            });
            
            // Resolve all requests in the batch
            batch.forEach(request => {
                try {
                    const data = endpointData[request.apiEndpoint];
                    request.resolve(data);
                } catch (error) {
                    request.reject(error);
                }
            });
            
        } catch (error) {
            // Reject all requests in batch
            batch.forEach(request => request.reject(error));
        }
        
        // Process remaining requests if any
        if (REQUEST_QUEUE.length > 0) {
            setTimeout(() => this.processBatch(), BATCH_TIMEOUT);
        }
    },
    /**
     * Enhanced security check for bot detection and advanced threats
     */
    checkSecurity(credentials) {
        // Check rate limiting
        if (!this.checkRateLimit()) {
            throw new Error('Too many requests. Please wait before trying again.');
        }
        
        // Check for suspicious patterns
        if (this.detectBot(credentials)) {
            throw new Error('Suspicious activity detected. Access denied.');
        }
        
        // Check user agent
        if (this.checkUserAgent()) {
            throw new Error('Invalid client detected.');
        }
        
        // Enhanced security checks
        if (SECURITY_CONFIG.enableBehavioralAnalysis && this.detectAutomatedBehavior()) {
            throw new Error('Automated behavior detected. Please use a regular browser.');
        }
        
        if (SECURITY_CONFIG.enableDeviceFingerprinting && this.checkDeviceFingerprint()) {
            throw new Error('Device verification failed.');
        }
        
        // Check concurrent sessions
        if (!this.checkConcurrentSessions()) {
            throw new Error('Maximum concurrent sessions exceeded.');
        }
        
        return true;
    },

    /**
     * Rate limiting check
     */
    checkRateLimit() {
        const now = Date.now();
        const clientId = this.getClientId();
        const history = SECURITY_CONFIG.requestHistory.get(clientId) || [];
        
        // Remove old requests
        const recentRequests = history.filter(time => now - time < SECURITY_CONFIG.rateLimitWindow);
        
        if (recentRequests.length >= SECURITY_CONFIG.maxRequestsPerMinute) {
            console.warn('🚫 Rate limit exceeded for client:', clientId);
            return false;
        }
        
        // Add current request
        recentRequests.push(now);
        SECURITY_CONFIG.requestHistory.set(clientId, recentRequests);
        
        return true;
    },

    /**
     * Bot detection
     */
    detectBot(credentials) {
        // Check for automated patterns
        const userAgent = navigator.userAgent.toLowerCase();
        
        for (const pattern of SECURITY_CONFIG.suspiciousPatterns) {
            if (pattern.test(userAgent)) {
                console.warn('🤖 Bot detected:', userAgent);
                return true;
            }
        }
        
        // Check for rapid credential changes
        if (this.isRapidCredentialChange(credentials)) {
            console.warn('🤖 Rapid credential changes detected');
            return true;
        }
        
        return false;
    },

    /**
     * Check user agent validity
     */
    checkUserAgent() {
        const userAgent = navigator.userAgent;
        
        // Check for missing or suspicious user agent
        if (!userAgent || userAgent.length < 10) {
            return true;
        }
        
        // Check for common bot user agents
        const botPatterns = [
            /^$/, /^curl/, /^wget/, /^python/, /^requests/,
            /bot/, /crawler/, /spider/, /scraper/
        ];
        
        return botPatterns.some(pattern => pattern.test(userAgent));
    },

    /**
     * Get unique client identifier
     */
    getClientId() {
        // Use a combination of factors for client identification
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('Client fingerprint', 2, 2);
        
        const fingerprint = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            canvas.toDataURL()
        ].join('|');
        
        return btoa(fingerprint).substring(0, 16);
    },

    /**
     * Check for rapid credential changes
     */
    isRapidCredentialChange(credentials) {
        const now = Date.now();
        const clientId = this.getClientId();
        const key = `cred_${clientId}`;
        
        const lastCredentials = localStorage.getItem(key);
        const lastTime = localStorage.getItem(`${key}_time`);
        
        if (lastCredentials && lastTime) {
            const timeDiff = now - parseInt(lastTime);
            const credDiff = lastCredentials !== JSON.stringify(credentials);
            
            // If credentials changed within 5 seconds, it's suspicious
            if (credDiff && timeDiff < 5000) {
                return true;
            }
        }
        
        // Store current credentials
        localStorage.setItem(key, JSON.stringify(credentials));
        localStorage.setItem(`${key}_time`, now.toString());
        
        return false;
    },

    /**
     * Optimized login with caching, performance enhancements, and security
     */
    async login(credentials) {
        const startTime = performance.now();
        
        try {
            console.log('🚀 Secure login attempt for:', credentials.userType);
            
            // Security checks first
            this.checkSecurity(credentials);
            
            // Validate input
            if (!credentials.userType || !credentials.id || !credentials.password) {
                throw new Error('All fields are required');
            }
            
            // Check cache first for faster response
            const cacheKey = `${credentials.userType}_${credentials.id}`;
            const cachedUser = this.getCachedUser(cacheKey);
            
            if (cachedUser && this.isCacheValid(cachedUser)) {
                console.log('⚡ Using cached user data');
                this.storeUserData(cachedUser.user, credentials.userType);
                return {
                    success: true,
                    user: cachedUser.user,
                    userType: credentials.userType,
                    fromCache: true
                };
            }
            
            // Get the appropriate API endpoint
            const apiEndpoint = AUTH_API_ENDPOINTS[credentials.userType];
            if (!apiEndpoint) {
                throw new Error('Invalid user type');
            }
            
            console.log('🌐 Calling API:', apiEndpoint);
            
            // Enhanced security headers and request optimization
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), PERFORMANCE_CONFIG.requestTimeout);
            
            // Generate security token
            const securityToken = this.generateSecurityToken();
            
            // Fetch all users from the specific API endpoint with enhanced security
            const response = await fetch(apiEndpoint, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'max-age=300',
                    'Connection': 'keep-alive',
                    'Keep-Alive': 'timeout=5, max=1000',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-Security-Token': securityToken,
                    'X-Client-Fingerprint': this.getClientId(),
                    'X-Timestamp': Date.now().toString(),
                    'User-Agent': navigator.userAgent,
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br'
                },
                signal: controller.signal,
                priority: 'high',
                credentials: 'same-origin',
                mode: 'cors'
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error('Failed to fetch user data');
            }
            
            const responseData = await response.json();
            console.log('📦 Fetched response:', responseData);
            
            // Extract the users array based on user type
            let allUsers;
            if (credentials.userType === 'student' && responseData.students) {
                allUsers = responseData.students;
            } else if (credentials.userType === 'teacher' && responseData.teachers) {
                allUsers = responseData.teachers;
            } else if (credentials.userType === 'admin' && responseData.admins) {
                allUsers = responseData.admins;
            } else if (credentials.userType === 'parents' && responseData.parents) {
                allUsers = responseData.parents;
            } else {
                // Fallback: try to use the response directly if it's an array
                allUsers = Array.isArray(responseData) ? responseData : [];
            }
            
            console.log('🔍 Debug - User Type:', credentials.userType);
            console.log('🔍 Debug - API Response:', responseData);
            console.log('🔍 Debug - Extracted users array:', allUsers);
            console.log('🔍 Debug - Users count:', allUsers.length);
            
            // Use optimized user search
            const userData = this.findUserOptimized(allUsers, credentials);
            
            if (!userData) {
                throw new Error('Invalid credentials');
            }
            
            // Check if user is active
            if (userData.is_active === false) {
                throw new Error('Account is deactivated');
            }
            
            // Set user data
            const user = {
                ...userData,
                loginTime: new Date().toISOString(),
                userType: credentials.userType
            };
            
            // Cache the user data for future requests
            this.cacheUser(cacheKey, user);
            
            // Store in localStorage
            localStorage.setItem('bc3620_user', JSON.stringify(user));
            localStorage.setItem('bc3620_userType', credentials.userType);
            localStorage.setItem('bc3620_loginTime', new Date().toISOString());
            
            const endTime = performance.now();
            const loginTime = Math.round(endTime - startTime);
            console.log(`⚡ Login successful in ${loginTime}ms:`, user);
            
            return {
                success: true,
                user: user,
                userType: credentials.userType,
                loginTime: loginTime
            };
            
        } catch (error) {
            const endTime = performance.now();
            const loginTime = Math.round(endTime - startTime);
            console.error(`❌ Login failed in ${loginTime}ms:`, error);
            throw error;
        }
    },

    /**
     * Enhanced caching with AWS ElastiCache integration
     */
    async cacheUser(key, userData) {
        try {
            const cacheData = {
                user: userData,
                timestamp: Date.now(),
                expires: Date.now() + (CACHE_CONFIG.ttl * 1000),
                source: 'local'
            };
            
            // Local caching (immediate)
            sessionStorage.setItem(`auth_cache_${key}`, JSON.stringify(cacheData));
            
            // AWS ElastiCache caching (async, for high availability)
            if (CACHE_CONFIG.enabled) {
                this.cacheToRedis(key, cacheData).catch(error => {
                    console.warn('Redis cache failed, using local cache:', error);
                });
            }
            
            // Update cache metrics
            this.cacheHits = (this.cacheHits || 0) + 1;
            
        } catch (error) {
            console.warn('Failed to cache user data:', error);
        }
    },

    /**
     * Cache to AWS ElastiCache Redis
     */
    async cacheToRedis(key, data) {
        try {
            // This would be implemented in your backend Lambda function
            // For now, we'll simulate the API call
            const response = await fetch('/api/cache', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify({
                    key: `${CACHE_CONFIG.keyPrefix}${key}`,
                    data: data,
                    ttl: CACHE_CONFIG.ttl
                })
            });
            
            if (!response.ok) {
                throw new Error(`Redis cache failed: ${response.status}`);
            }
            
            console.log('✅ Data cached to Redis successfully');
            
        } catch (error) {
            console.warn('Redis caching failed:', error);
            throw error;
        }
    },

    /**
     * Get from AWS ElastiCache Redis
     */
    async getFromRedis(key) {
        try {
            const response = await fetch(`/api/cache/${CACHE_CONFIG.keyPrefix}${key}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.getAuthToken()}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Data retrieved from Redis');
                return data;
            }
            
            return null;
            
        } catch (error) {
            console.warn('Redis retrieval failed:', error);
            return null;
        }
    },

    /**
     * Get authentication token for API calls
     */
    getAuthToken() {
        return localStorage.getItem('bc3620_token') || 'anonymous';
    },

    /**
     * Generate security token for request validation
     */
    generateSecurityToken() {
        const timestamp = Date.now();
        const clientId = this.getClientId();
        const random = Math.random().toString(36).substring(2);
        
        // Create a simple hash-like token
        const tokenData = `${timestamp}_${clientId}_${random}`;
        return btoa(tokenData).replace(/[^a-zA-Z0-9]/g, '');
    },

    /**
     * Validate response security
     */
    validateResponse(response) {
        // Check for security headers
        const securityHeaders = [
            'X-Content-Type-Options',
            'X-Frame-Options',
            'X-XSS-Protection'
        ];
        
        for (const header of securityHeaders) {
            if (!response.headers.get(header)) {
                console.warn(`Missing security header: ${header}`);
            }
        }
        
        return true;
    },

    /**
     * Get cached user data
     */
    getCachedUser(key) {
        try {
            const cached = sessionStorage.getItem(`auth_cache_${key}`);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.warn('Failed to get cached user data:', error);
            return null;
        }
    },

    /**
     * Check if cache is still valid
     */
    isCacheValid(cachedData) {
        return cachedData && cachedData.expires > Date.now();
    },

    /**
     * Load monitoring and capacity management
     */
    getLoadMetrics() {
        return {
            activeRequests: REQUEST_QUEUE.length,
            cacheHitRate: this.getCacheHitRate(),
            averageResponseTime: this.getAverageResponseTime(),
            concurrentUsers: this.getConcurrentUsers(),
            systemCapacity: this.getSystemCapacity()
        };
    },

    /**
     * Get cache hit rate percentage
     */
    getCacheHitRate() {
        const totalRequests = this.totalRequests || 0;
        const cacheHits = this.cacheHits || 0;
        return totalRequests > 0 ? Math.round((cacheHits / totalRequests) * 100) : 0;
    },

    /**
     * Get average response time
     */
    getAverageResponseTime() {
        const times = this.responseTimes || [];
        if (times.length === 0) return 0;
        return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    },

    /**
     * Get estimated concurrent users
     */
    getConcurrentUsers() {
        // Estimate based on active requests and response times
        const activeRequests = REQUEST_QUEUE.length;
        const avgResponseTime = this.getAverageResponseTime();
        return Math.min(activeRequests * 2, 1000); // Conservative estimate
    },

    /**
     * Get system capacity status
     */
    getSystemCapacity() {
        const metrics = this.getLoadMetrics();
        if (metrics.concurrentUsers < 100) return 'LOW';
        if (metrics.concurrentUsers < 500) return 'MEDIUM';
        if (metrics.concurrentUsers < 1000) return 'HIGH';
        return 'CRITICAL';
    },

    /**
     * Optimized user search with early exit
     */
    findUserOptimized(allUsers, credentials) {
        const idField = AUTH_FIELD_MAPPINGS[credentials.userType].idField;
        const passwordField = AUTH_FIELD_MAPPINGS[credentials.userType].passwordField;
        
        console.log('🔍 Debug - Field mappings:', { idField, passwordField });
        console.log('🔍 Debug - Input credentials:', { id: credentials.id, password: credentials.password });
        
        // Pre-process input for faster comparison
        const inputId = String(credentials.id).trim();
        const inputPassword = String(credentials.password).trim();
        
        console.log('🔍 Debug - Processed input:', { inputId, inputPassword });
        
        // Use for loop for better performance than find()
        for (let i = 0; i < allUsers.length; i++) {
            const user = allUsers[i];
            const userId = String(user[idField]).trim();
            const userPassword = String(user[passwordField]).trim();
            
            console.log(`🔍 Debug - User ${i}:`, {
                user: user,
                userId: userId,
                userPassword: userPassword,
                idMatch: userId === inputId,
                passwordMatch: userPassword === inputPassword
            });
            
            if (userId === inputId && userPassword === inputPassword) {
                console.log('✅ Debug - User found!', user);
                return user;
            }
        }
        
        console.log('❌ Debug - No matching user found');
        return null;
    },

    /**
     * Get redirect URL for user type
     */
    getRedirectUrl(userType) {
        return REDIRECT_URLS[userType] || './login.html';
    },

    /**
     * Redirect user to appropriate dashboard
     */
    redirectToDashboard() {
        const userType = localStorage.getItem('bc3620_userType');
        if (!userType) {
            window.location.href = './login.html';
            return;
        }
        
        const redirectUrl = this.getRedirectUrl(userType);
        console.log('Redirecting to:', redirectUrl);
        window.location.href = redirectUrl;
    },

    /**
     * Detect automated behavior patterns
     */
    detectAutomatedBehavior() {
        // Check for rapid, consistent timing patterns
        const now = Date.now();
        const lastActivity = localStorage.getItem('last_user_activity');
        
        if (lastActivity) {
            const timeDiff = now - parseInt(lastActivity);
            // If requests are too regular (within 100ms), might be automated
            if (timeDiff < 100) {
                console.warn('🚫 Automated behavior detected: Too regular timing');
                return true;
            }
        }
        
        localStorage.setItem('last_user_activity', now.toString());
        
        // Check for lack of human-like interaction
        const mouseMovements = parseInt(localStorage.getItem('mouse_movements') || '0');
        const keyPresses = parseInt(localStorage.getItem('key_presses') || '0');
        
        if (mouseMovements === 0 && keyPresses > 10) {
            console.warn('🚫 Automated behavior detected: No mouse movement');
            return true;
        }
        
        return false;
    },

    /**
     * Enhanced device fingerprinting
     */
    checkDeviceFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillText('Device fingerprint check', 2, 2);
            
            const fingerprint = [
                navigator.userAgent,
                navigator.language,
                screen.width + 'x' + screen.height,
                new Date().getTimezoneOffset(),
                canvas.toDataURL(),
                navigator.hardwareConcurrency || 'unknown',
                navigator.maxTouchPoints || '0'
            ].join('|');
            
            const currentFingerprint = btoa(fingerprint).substring(0, 32);
            const storedFingerprint = localStorage.getItem('device_fingerprint');
            
            if (storedFingerprint && storedFingerprint !== currentFingerprint) {
                console.warn('🚫 Device fingerprint mismatch detected');
                return true;
            }
            
            localStorage.setItem('device_fingerprint', currentFingerprint);
            return false;
            
        } catch (error) {
            console.warn('Device fingerprinting failed:', error);
            return false;
        }
    },

    /**
     * Check concurrent sessions
     */
    checkConcurrentSessions() {
        const sessionKey = `session_${Date.now()}`;
        const activeSessions = JSON.parse(localStorage.getItem('active_sessions') || '[]');
        
        // Remove expired sessions
        const validSessions = activeSessions.filter(session => 
            Date.now() - session.timestamp < SECURITY_CONFIG.sessionTimeout
        );
        
        if (validSessions.length >= SECURITY_CONFIG.maxConcurrentSessions) {
            console.warn('🚫 Maximum concurrent sessions exceeded');
            return false;
        }
        
        // Add current session
        validSessions.push({
            id: sessionKey,
            timestamp: Date.now()
        });
        
        localStorage.setItem('active_sessions', JSON.stringify(validSessions));
        return true;
    },

    /**
     * Enhanced logout with session cleanup
     */
    logout() {
        // Clear all session data
        localStorage.removeItem('bc3620_user');
        localStorage.removeItem('bc3620_userType');
        localStorage.removeItem('bc3620_loginTime');
        
        // Clear security data
        localStorage.removeItem('last_user_activity');
        localStorage.removeItem('mouse_movements');
        localStorage.removeItem('key_presses');
        localStorage.removeItem('active_sessions');
        
        // Clear any rate limiting data
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('rate_') || key.startsWith('cred_')) {
                localStorage.removeItem(key);
            }
        });
        
        window.location.href = './login.html';
    }
};

console.log('SimpleAuth loaded successfully');
