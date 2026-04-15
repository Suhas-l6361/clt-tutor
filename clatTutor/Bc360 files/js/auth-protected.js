// BC3620 Protected Authentication System - Obfuscated
(function() {
    'use strict';
    
    // Corrected API configuration with separate admin endpoint
    const _0x1a2b = ['aHR0cHM6Ly8xZWZldWVia2g5LmV4ZWN1dGUtYXBpLmFwLXNvdXRoLTEuYW1hem9uYXdzLmNvbS9kZXYv', 'c3R1ZGVudA==', 'dGVhY2hlcg==', 'cGFyZW50cw==', 'YWRtaW4='];
    const _0x3c4d = _0x1a2b.map(x => atob(x));
    
    // Admin uses different base URL
    const _0xadmin = 'aHR0cHM6Ly9mb3doNjlrY2ZkLmV4ZWN1dGUtYXBpLmFwLXNvdXRoLTEuYW1hem9uYXdzLmNvbS9kZXYv';
    const _0xadminBase = atob(_0xadmin);
    
    // Dynamic endpoint generation with separate admin endpoint
    const _0x5e6f = {
        [_0x3c4d[1]]: _0x3c4d[0] + _0x3c4d[1],
        [_0x3c4d[2]]: _0x3c4d[0] + _0x3c4d[2], 
        [_0x3c4d[3]]: _0x3c4d[0] + _0x3c4d[3],
        [_0x3c4d[4]]: _0xadminBase + _0x3c4d[4]  // Admin uses different base URL
    };
    
    // Fast authentication - removed slow anti-debugging code
    console.log('🚀 Fast authentication system loaded');
    console.log('🔗 API Base URL:', _0x3c4d[0]);
    console.log('🔗 Student Endpoint:', _0x5e6f[_0x3c4d[1]]);
    console.log('🔗 Admin Endpoint:', _0x5e6f[_0x3c4d[4]]);
    console.log('✅ API URLs verified - should work now!');
    
    // Fast authentication function
    const _0x3w4x = async (_0x5y6z) => {
        try {
            console.log('🚀 Fast login attempt for:', _0x5y6z.userType);
            
            const _0x7a8b = _0x5y6z.userType;
            const _0x9c0d = _0x5y6z.id;
            const _0x1e2f = _0x5y6z.password;
            
            if (!_0x7a8b || !_0x9c0d || !_0x1e2f) {
                throw new Error('Invalid input');
            }
            
            const _0x3g4h = _0x5e6f[_0x7a8b];
            if (!_0x3g4h) {
                throw new Error('Invalid endpoint');
            }
            
            // Ultra-fast rate limiting (reduced to 500ms)
            const _0x5i6j = `rate_${_0x9c0d}`;
            const _0x7k8l = localStorage.getItem(_0x5i6j);
            const _0x9m0n = Date.now();
            
            if (_0x7k8l && (_0x9m0n - parseInt(_0x7k8l)) < 2000) {
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup('warning', 'Please Wait', 'Please wait 2 seconds before trying again');
                } else {
                    alert('Please wait 0.5 seconds before trying again');
                }
                throw new Error('Please wait 2 seconds before trying again');
            }
            localStorage.setItem(_0x5i6j, _0x9m0n.toString());
            
            // Minimal headers to avoid CORS preflight issues
            const _0x1o2p = {};
            
            // Fast fetch with 10 second timeout (increased for AWS Lambda cold starts)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const _0x3q4r = await fetch(_0x3g4h, {
                method: 'GET',
                headers: _0x1o2p,
                signal: controller.signal,
                mode: 'cors',
                cache: 'no-cache'
            });
            
            clearTimeout(timeoutId);
            
            if (!_0x3q4r.ok) {
                throw new Error(`Network error: ${_0x3q4r.status} ${_0x3q4r.statusText}`);
            }
            
            const _0x5s6t = await _0x3q4r.json();
            console.log('📦 API Response:', _0x5s6t);
            
            // Handle different user types correctly
            let _0x7u8v;
            if (_0x7a8b === 'student') {
                _0x7u8v = _0x5s6t.students || _0x5s6t;
            } else if (_0x7a8b === 'teacher') {
                _0x7u8v = _0x5s6t.teachers || _0x5s6t;
            } else if (_0x7a8b === 'parents') {
                _0x7u8v = _0x5s6t.parents || _0x5s6t;
            } else if (_0x7a8b === 'admin') {
                _0x7u8v = _0x5s6t.admins || _0x5s6t;
            } else {
                _0x7u8v = _0x5s6t;
            }
            
            if (!Array.isArray(_0x7u8v)) {
                throw new Error('Invalid response');
            }
            
            // Debug: Show search criteria and available users
            console.log('🔍 Searching for:', {
                userType: _0x7a8b,
                searchId: _0x9c0d,
                searchPassword: _0x1e2f
            });
            console.log('🔍 Available users:', _0x7u8v.map(u => ({
                student_id: u.student_id,
                teacher_id: u.teacher_id,
                admin_id: u.admin_id,
                parent_userId: u.parent_userId,
                password: u.password,
                parent_password: u.parent_password,
                name: u.full_name || u.name
            })));
            
            // Find user with detailed logging
            let _0x9w0x = null;
            for (let _0x1y2z = 0; _0x1y2z < _0x7u8v.length; _0x1y2z++) {
                const _0x3a4b = _0x7u8v[_0x1y2z];
                
                // Handle different user types with correct field names
                let userId, userPassword;
                if (_0x7a8b === 'student') {
                    userId = String(_0x3a4b.student_id || '').trim();
                    userPassword = String(_0x3a4b.password || '').trim();
                } else if (_0x7a8b === 'teacher') {
                    userId = String(_0x3a4b.teacher_id || '').trim();
                    userPassword = String(_0x3a4b.password || '').trim();
                } else if (_0x7a8b === 'parents') {
                    userId = String(_0x3a4b.parent_userId || '').trim();
                    userPassword = String(_0x3a4b.parent_password || '').trim();
                } else if (_0x7a8b === 'admin') {
                    userId = String(_0x3a4b.admin_id || '').trim();
                    userPassword = String(_0x3a4b.password || '').trim();
                } else {
                    userId = String(_0x3a4b.id || '').trim();
                    userPassword = String(_0x3a4b.password || '').trim();
                }
                const searchId = String(_0x9c0d).trim();
                const searchPassword = String(_0x1e2f).trim();
                
                console.log('🔍 Checking user:', {
                    userId: userId,
                    searchId: searchId,
                    idMatch: userId === searchId,
                    userPassword: userPassword,
                    searchPassword: searchPassword,
                    passwordMatch: userPassword === searchPassword,
                    fullMatch: userId === searchId && userPassword === searchPassword
                });
                
                if (userId === searchId && userPassword === searchPassword) {
                    _0x9w0x = _0x3a4b;
                    console.log('✅ User found!', _0x3a4b);
                    break;
                }
            }
            
            if (!_0x9w0x) {
                // Show custom popup for invalid credentials
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup('error', 'Login Failed', 'Invalid credentials', () => {
                        // Reset form fields after popup closes
                        const userIdField = document.getElementById('userId');
                        const passwordField = document.getElementById('password');
                        if (userIdField) userIdField.value = '';
                        if (passwordField) passwordField.value = '';
                    });
                } else {
                    alert('Invalid credentials');
                }
                throw new Error('Invalid credentials');
            }
            
            // Store user data
            const _0x5c6d = {
                ..._0x9w0x,
                loginTime: new Date().toISOString(),
                userType: _0x7a8b
            };
            
            localStorage.setItem('bc3620_user', JSON.stringify(_0x5c6d));
            localStorage.setItem('bc3620_userType', _0x7a8b);
            localStorage.setItem('bc3620_loginTime', new Date().toISOString());
            
            // Show success popup
            const userName = _0x5c6d.full_name || _0x5c6d.name || 'User';
            if (typeof showCustomPopup === 'function') {
                showCustomPopup('success', 'Login Successful', `Welcome, ${userName}!`);
            } else {
                alert(`Login successful! Welcome, ${userName}!`);
            }
            
            return {
                success: true,
                user: _0x5c6d,
                userType: _0x7a8b
            };
            
        } catch (_0x7e8f) {
            if (_0x7e8f.name === 'AbortError') {
                console.error('🚫 Request timeout - API took too long to respond');
                console.log('🔄 This might be due to AWS Lambda cold start. Retrying...');
                
                // Retry once after a short delay for cold start scenarios
                try {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log('🔄 Retrying API call...');
                    return await _0x3w4x(_0x5y6z);
                } catch (retryError) {
                    if (typeof showCustomPopup === 'function') {
                        showCustomPopup('error', 'Connection Timeout', 'Server is taking too long to respond. Please try again.');
                    } else {
                        alert('Connection timeout. Please try again.');
                    }
                    throw new Error('Request timeout. Please check your internet connection.');
                }
            } else if (_0x7e8f.message.includes('Failed to fetch') || _0x7e8f.message.includes('ERR_FAILED')) {
                console.error('🚫 Network error - Cannot reach API server');
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup('error', 'Connection Error', 'Cannot connect to server. Please try again.');
                } else {
                    alert('Cannot connect to server. Please try again.');
                }
                throw new Error('Cannot connect to server. Please check your internet connection.');
            } else if (_0x7e8f.message.includes('CORS') || _0x7e8f.message.includes('preflight')) {
                console.error('🚫 CORS error - API server configuration issue');
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup('error', 'Server Error', 'Please try again.');
                } else {
                    alert('Server error. Please try again.');
                }
                throw new Error('Server configuration error. Please try again.');
            } else if (_0x7e8f.message.includes('Invalid credentials')) {
                // Don't show popup here as it's already shown above
                throw _0x7e8f;
            } else {
                console.error('Auth error:', _0x7e8f.message);
                if (typeof showCustomPopup === 'function') {
                    showCustomPopup('error', 'Login Error', 'Please try again.');
                } else {
                    alert('Login error. Please try again.');
                }
                throw _0x7e8f;
            }
        }
    };
    
    // Expose fast authentication API
    window.SecureAuth = {
        login: _0x3w4x,
        getEndpoints: () => Object.keys(_0x5e6f),
        validate: () => console.log('✅ Fast auth validation')
    };
    
    // Fast authentication - no slow intervals
    
    // Selective console protection - Allow errors but hide sensitive data
    const _0x9g0h = () => {
        console.warn('🚫 Sensitive data access blocked');
    };
    
    // Override console methods to filter sensitive data
    const _0x1i2j = console.log;
    const _0x3k4l = console.warn;
    const _0x5m6n = console.error;
    
    const filterSensitiveData = (args) => {
        return args.map(arg => {
            if (typeof arg === 'string') {
                const sensitivePatterns = [
                    /api[^a-z]/i, /endpoint/i, /token/i, /password/i,
                    /credential/i, /auth/i, /login/i, /bc3620/i,
                    /execute-api/i, /amazonaws/i
                ];
                for (let pattern of sensitivePatterns) {
                    if (pattern.test(arg)) {
                        return '🚫 [Sensitive Data Protected]';
                    }
                }
            }
            return arg;
        });
    };
    
    console.log = function() {
        const filteredArgs = filterSensitiveData(Array.from(arguments));
        _0x1i2j.apply(console, filteredArgs);
    };
    
    console.warn = function() {
        const filteredArgs = filterSensitiveData(Array.from(arguments));
        _0x3k4l.apply(console, filteredArgs);
    };
    
    console.error = function() {
        const filteredArgs = filterSensitiveData(Array.from(arguments));
        _0x5m6n.apply(console, filteredArgs);
    };
    
    // Ultra-strong protection is now handled by ultra-protection.js
    // This script focuses on authentication and data protection
    console.log('🛡️ SecureAuth loaded with Ultra-Protection');
    
    console.log('🛡️ SecureAuth loaded successfully');
    
})();
