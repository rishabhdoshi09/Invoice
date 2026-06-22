const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');

module.exports = (router) => {
    router
        .route('/employees')
        .get(authenticate, Controller.employee.listEmployees)
        .post(authenticate, canModify, Controller.employee.createEmployee);

    router
        .route('/employees/:employeeId')
        .get(authenticate, Controller.employee.getEmployee)
        .put(authenticate, canModify, Controller.employee.updateEmployee)
        .delete(authenticate, canModify, Controller.employee.deleteEmployee);

    router
        .route('/employees/:employeeId/leaves')
        .get(authenticate, Controller.employee.listLeaves)
        .post(authenticate, canModify, Controller.employee.markLeave);

    router
        .route('/employees/:employeeId/leaves/:leaveId')
        .delete(authenticate, canModify, Controller.employee.deleteLeave);
};
