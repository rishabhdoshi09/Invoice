const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');

module.exports = (router) => {
    router
        .route('/salary')
        .get(authenticate, Controller.salary.listSalary);

    router
        .route('/salary/:salaryId')
        .get(authenticate, Controller.salary.getSalaryDetail);

    router
        .route('/salary/:salaryId/pay')
        .post(authenticate, canModify, Controller.salary.paySalary);

    router
        .route('/salary/payments/:paymentId')
        .delete(authenticate, canModify, Controller.salary.reverseSalaryPayment);

    // Advance tracking
    router
        .route('/employees/:employeeId/advances')
        .get(authenticate, Controller.salary.listAdvances)
        .post(authenticate, canModify, Controller.salary.recordAdvance);

    router
        .route('/employees/:employeeId/advances/:advanceId')
        .delete(authenticate, canModify, Controller.salary.deleteAdvance);
};
