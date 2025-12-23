import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Get stored token
export const getToken = () => {
    return localStorage.getItem('token');
};

// Set token in localStorage and axios defaults
export const setToken = (token) => {
    if (token) {
        localStorage.setItem('token', token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization'];
    }
};

// Initialize auth from localStorage on app load
export const initAuth = () => {
    const token = getToken();
    if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        return true;
    }
    return false;
};

// Check if initial setup is required
export const checkSetup = async () => {
    try {
        const response = await axios.get(`${API_URL}/api/auth/setup-check`);
        return response.data.data.setupRequired;
    } catch (error) {
        console.error('Setup check error:', error);
        return false;
    }
};

// Initial admin setup
export const setupAdmin = async (userData) => {
    try {
        const response = await axios.post(`${API_URL}/api/auth/setup`, userData);
        const { token, user } = response.data.data;
        setToken(token);
        return { user, token };
    } catch (error) {
        throw error.response?.data?.message || 'Setup failed';
    }
};

// Login
export const login = async (username, password) => {
    try {
        const response = await axios.post(`${API_URL}/api/auth/login`, {
            username,
            password
        });
        const { token, user } = response.data.data;
        setToken(token);
        return { user, token };
    } catch (error) {
        throw error.response?.data?.message || 'Login failed';
    }
};

// Logout
export const logout = async () => {
    try {
        const token = getToken();
        if (token) {
            await axios.post(`${API_URL}/api/auth/logout`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
        }
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        setToken(null);
        localStorage.removeItem('user');
    }
};

// Get current user
export const getCurrentUser = async () => {
    try {
        const response = await axios.get(`${API_URL}/api/auth/me`);
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to get user';
    }
};

// Change password
export const changePassword = async (currentPassword, newPassword) => {
    try {
        const response = await axios.put(`${API_URL}/api/auth/change-password`, {
            currentPassword,
            newPassword
        });
        return response.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to change password';
    }
};

// Admin: Create new user
export const createUser = async (userData) => {
    try {
        const response = await axios.post(`${API_URL}/api/users`, userData);
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to create user';
    }
};

// Admin: List all users
export const listUsers = async () => {
    try {
        const response = await axios.get(`${API_URL}/api/users`);
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to list users';
    }
};

// Admin: Update user
export const updateUser = async (userId, updates) => {
    try {
        const response = await axios.put(`${API_URL}/api/users/${userId}`, updates);
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to update user';
    }
};

// Admin: Delete user
export const deleteUser = async (userId) => {
    try {
        await axios.delete(`${API_URL}/api/users/${userId}`);
    } catch (error) {
        throw error.response?.data?.message || 'Failed to delete user';
    }
};
