import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as authService from '../services/auth';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [setupRequired, setSetupRequired] = useState(false);

    // Check auth status on mount
    useEffect(() => {
        const initializeAuth = async () => {
            try {
                // Check if setup is required
                const needsSetup = await authService.checkSetup();
                setSetupRequired(needsSetup);

                if (!needsSetup) {
                    // Try to restore session from token
                    const hasToken = authService.initAuth();
                    if (hasToken) {
                        try {
                            const userData = await authService.getCurrentUser();
                            setUser(userData);
                        } catch (error) {
                            // Token invalid, clear it
                            authService.setToken(null);
                        }
                    }
                }
            } catch (error) {
                console.error('Auth initialization error:', error);
            } finally {
                setLoading(false);
            }
        };

        initializeAuth();
    }, []);

    const login = useCallback(async (username, password) => {
        const { user: userData } = await authService.login(username, password);
        setUser(userData);
        return userData;
    }, []);

    const logout = useCallback(async () => {
        await authService.logout();
        setUser(null);
    }, []);

    const setupAdmin = useCallback(async (userData) => {
        const { user: newUser } = await authService.setupAdmin(userData);
        setUser(newUser);
        setSetupRequired(false);
        return newUser;
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            const userData = await authService.getCurrentUser();
            setUser(userData);
            return userData;
        } catch (error) {
            setUser(null);
            throw error;
        }
    }, []);

    const isAdmin = user?.role === 'admin';
    const isBillingStaff = user?.role === 'billing_staff';
    const isAuthenticated = !!user;

    const value = {
        user,
        loading,
        setupRequired,
        isAuthenticated,
        isAdmin,
        isBillingStaff,
        login,
        logout,
        setupAdmin,
        refreshUser
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
