const Services = require('../services');
const Joi = require('joi');

const loginSchema = Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required()
});

const setupSchema = Joi.object({
    username: Joi.string().min(3).max(50).required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().allow('', null).optional()
});

const createUserSchema = Joi.object({
    username: Joi.string().min(3).max(50).required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().allow('', null).optional(),
    role: Joi.string().valid('admin', 'billing_staff').default('billing_staff')
});

const updateUserSchema = Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    email: Joi.string().email().allow('', null).optional(),
    role: Joi.string().valid('admin', 'billing_staff').optional(),
    isActive: Joi.boolean().optional(),
    password: Joi.string().min(6).optional()
});

const changePasswordSchema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required()
});

module.exports = {
    // Check if initial setup is required
    checkSetup: async (req, res) => {
        try {
            const setupRequired = await Services.auth.checkSetupRequired();
            return res.status(200).json({
                status: 200,
                data: { setupRequired }
            });
        } catch (error) {
            console.error('Check setup error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Initial admin setup
    setup: async (req, res) => {
        try {
            const { error, value } = setupSchema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const result = await Services.auth.setupAdmin(value, req);
            
            return res.status(200).json({
                status: 200,
                message: 'Admin account created successfully',
                data: result
            });
        } catch (error) {
            console.error('Setup error:', error);
            return res.status(400).json({
                status: 400,
                message: error.message
            });
        }
    },

    // Login
    login: async (req, res) => {
        try {
            const { error, value } = loginSchema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const result = await Services.auth.login(value.username, value.password, req);
            
            return res.status(200).json({
                status: 200,
                message: 'Login successful',
                data: result
            });
        } catch (error) {
            console.error('Login error:', error);
            return res.status(401).json({
                status: 401,
                message: error.message || 'Invalid credentials'
            });
        }
    },

    // Logout
    logout: async (req, res) => {
        try {
            await Services.auth.logout(req);
            
            return res.status(200).json({
                status: 200,
                message: 'Logged out successfully'
            });
        } catch (error) {
            console.error('Logout error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Get current user
    me: async (req, res) => {
        try {
            const user = await Services.auth.getUser(req.user.id);
            
            return res.status(200).json({
                status: 200,
                data: user
            });
        } catch (error) {
            console.error('Get me error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Create new user (admin only)
    createUser: async (req, res) => {
        try {
            const { error, value } = createUserSchema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const user = await Services.auth.createUser(value, req);
            
            return res.status(200).json({
                status: 200,
                message: 'User created successfully',
                data: user
            });
        } catch (error) {
            console.error('Create user error:', error);
            return res.status(400).json({
                status: 400,
                message: error.message
            });
        }
    },

    // List users (admin only)
    listUsers: async (req, res) => {
        try {
            const users = await Services.auth.listUsers();
            
            return res.status(200).json({
                status: 200,
                data: users
            });
        } catch (error) {
            console.error('List users error:', error);
            return res.status(500).json({
                status: 500,
                message: error.message
            });
        }
    },

    // Get user by ID (admin only)
    getUser: async (req, res) => {
        try {
            const user = await Services.auth.getUser(req.params.userId);
            
            return res.status(200).json({
                status: 200,
                data: user
            });
        } catch (error) {
            console.error('Get user error:', error);
            return res.status(404).json({
                status: 404,
                message: error.message
            });
        }
    },

    // Update user (admin only)
    updateUser: async (req, res) => {
        try {
            const { error, value } = updateUserSchema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    status: 400,
                    message: error.details[0].message
                });
            }

            const user = await Services.auth.updateUser(req.params.userId, value, req);
            
            return res.status(200).json({
                status: 200,
                message: 'User updated successfully',
                data: user
            });
        } catch (error) {
            console.error('Update user error:', error);
            return res.status(400).json({
                status: 400,
                message: error.message
            });
        }
    },

    // Delete user (admin only)
    deleteUser: async (req, res) => {
        try {
            await Services.auth.deleteUser(req.params.userId, req);
            
            return res.status(200).json({
                status: 200,
                message: 'User deleted successfully'
            });
        } catch (error) {
            console.error('Delete user error:', error);
            return res.status(400).json({
                status: 400,
                message: error.message
            });
        }
    },

    // Change own password
    changePassword: async (req, res) => {
        try {
            const { error, value } = changePasswordSchema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    status: 400,
                    message: error.details[0].message
                });
            }

            await Services.auth.changePassword(
                req.user.id,
                value.currentPassword,
                value.newPassword
            );
            
            return res.status(200).json({
                status: 200,
                message: 'Password changed successfully'
            });
        } catch (error) {
            console.error('Change password error:', error);
            return res.status(400).json({
                status: 400,
                message: error.message
            });
        }
    }
};
