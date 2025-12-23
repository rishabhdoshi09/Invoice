const db = require('../models');
const { generateToken } = require('../middleware/auth');
const { logAuthEvent } = require('../middleware/auditLogger');
const uuidv4 = require('uuid/v4');

module.exports = {
    // Check if any users exist (for initial setup)
    checkSetupRequired: async () => {
        const count = await db.user.count({ where: { isDeleted: false } });
        return count === 0;
    },

    // Initial admin setup (first user)
    setupAdmin: async (userData, req) => {
        // Check if setup is still allowed
        const count = await db.user.count({ where: { isDeleted: false } });
        if (count > 0) {
            throw new Error('Setup already completed. Admin user exists.');
        }

        const user = await db.user.create({
            id: uuidv4(),
            username: userData.username,
            password: userData.password,
            name: userData.name,
            email: userData.email || null,
            role: 'admin', // First user is always admin
            isActive: true
        });

        const token = generateToken(user);

        await logAuthEvent(req, 'CREATE', user.id, user.username, true, {
            role: 'admin',
            reason: 'Initial admin setup'
        });

        return {
            user: user.toSafeJSON(),
            token
        };
    },

    // Login
    login: async (username, password, req) => {
        const user = await db.user.findOne({
            where: {
                username,
                isDeleted: false
            }
        });

        if (!user) {
            await logAuthEvent(req, 'LOGIN_FAILED', null, username, false, {
                reason: 'User not found'
            });
            throw new Error('Invalid credentials');
        }

        if (!user.isActive) {
            await logAuthEvent(req, 'LOGIN_FAILED', user.id, username, false, {
                reason: 'Account deactivated'
            });
            throw new Error('Account is deactivated. Contact administrator.');
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            await logAuthEvent(req, 'LOGIN_FAILED', user.id, username, false, {
                reason: 'Invalid password'
            });
            throw new Error('Invalid credentials');
        }

        // Update last login
        await user.update({ lastLogin: new Date() });

        const token = generateToken(user);

        await logAuthEvent(req, 'LOGIN', user.id, user.username, true, {
            role: user.role
        });

        return {
            user: user.toSafeJSON(),
            token
        };
    },

    // Logout (just for audit logging)
    logout: async (req) => {
        if (req.user) {
            await logAuthEvent(req, 'LOGOUT', req.user.id, req.user.username, true, {
                role: req.user.role
            });
        }
        return true;
    },

    // Create new user (admin only)
    createUser: async (userData, creatorReq) => {
        // Check if username exists
        const existing = await db.user.findOne({
            where: { username: userData.username }
        });

        if (existing) {
            throw new Error('Username already exists');
        }

        const user = await db.user.create({
            id: uuidv4(),
            username: userData.username,
            password: userData.password,
            name: userData.name,
            email: userData.email || null,
            role: userData.role || 'billing_staff',
            isActive: true
        });

        await logAuthEvent(creatorReq, 'CREATE', user.id, user.username, true, {
            role: user.role,
            createdBy: creatorReq.user?.username
        });

        return user.toSafeJSON();
    },

    // List all users (admin only)
    listUsers: async () => {
        const users = await db.user.findAll({
            where: { isDeleted: false },
            order: [['createdAt', 'DESC']]
        });

        return users.map(u => u.toSafeJSON());
    },

    // Get user by ID
    getUser: async (id) => {
        const user = await db.user.findOne({
            where: { id, isDeleted: false }
        });

        if (!user) {
            throw new Error('User not found');
        }

        return user.toSafeJSON();
    },

    // Update user (admin only)
    updateUser: async (id, updates, req) => {
        const user = await db.user.findOne({
            where: { id, isDeleted: false }
        });

        if (!user) {
            throw new Error('User not found');
        }

        // Don't allow changing the last admin's role
        if (user.role === 'admin' && updates.role && updates.role !== 'admin') {
            const adminCount = await db.user.count({
                where: { role: 'admin', isDeleted: false, isActive: true }
            });
            if (adminCount <= 1) {
                throw new Error('Cannot demote the last admin');
            }
        }

        const allowedUpdates = ['name', 'email', 'role', 'isActive'];
        const updateObj = {};
        for (const key of allowedUpdates) {
            if (updates[key] !== undefined) {
                updateObj[key] = updates[key];
            }
        }

        // Handle password change separately
        if (updates.password) {
            updateObj.password = updates.password;
        }

        await user.update(updateObj);

        return user.toSafeJSON();
    },

    // Soft delete user (admin only)
    deleteUser: async (id, req) => {
        const user = await db.user.findOne({
            where: { id, isDeleted: false }
        });

        if (!user) {
            throw new Error('User not found');
        }

        // Don't allow deleting the last admin
        if (user.role === 'admin') {
            const adminCount = await db.user.count({
                where: { role: 'admin', isDeleted: false }
            });
            if (adminCount <= 1) {
                throw new Error('Cannot delete the last admin');
            }
        }

        // Don't allow self-deletion
        if (req.user && req.user.id === id) {
            throw new Error('Cannot delete your own account');
        }

        await user.update({
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: req.user?.id
        });

        return true;
    },

    // Change own password
    changePassword: async (userId, currentPassword, newPassword) => {
        const user = await db.user.findOne({
            where: { id: userId, isDeleted: false }
        });

        if (!user) {
            throw new Error('User not found');
        }

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            throw new Error('Current password is incorrect');
        }

        await user.update({ password: newPassword });

        return true;
    }
};
