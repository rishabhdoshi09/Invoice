const Controller = require('../controller/auth');
const { authenticate, authorize, canModify } = require('../middleware/auth');

module.exports = (router) => {
    // Public routes (no auth required)
    router.get('/auth/setup-check', Controller.checkSetup);
    router.post('/auth/setup', Controller.setup);
    router.post('/auth/login', Controller.login);
    
    // Protected routes
    router.post('/auth/logout', authenticate, Controller.logout);
    router.get('/auth/me', authenticate, Controller.me);
    router.put('/auth/change-password', authenticate, Controller.changePassword);
    
    // Admin only routes
    router.get('/users', authenticate, authorize('admin'), Controller.listUsers);
    router.post('/users', authenticate, authorize('admin'), Controller.createUser);
    router.get('/users/:userId', authenticate, authorize('admin'), Controller.getUser);
    router.put('/users/:userId', authenticate, authorize('admin'), Controller.updateUser);
    router.delete('/users/:userId', authenticate, authorize('admin'), Controller.deleteUser);
};
