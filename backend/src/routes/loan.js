const Controller = require('../controller');
const { authenticate, canModify } = require('../middleware/auth');
const { auditMiddleware, captureOriginal } = require('../middleware/auditLogger');
const db = require('../models');

module.exports = (router) => {
    router
        .route('/loans')
        .get(authenticate, Controller.loan.listLoans)
        .post(authenticate, canModify, auditMiddleware('LOAN'), Controller.loan.createLoan);

    router
        .route('/loans/:loanId')
        .get(authenticate, Controller.loan.getLoan)
        .put(authenticate, canModify, captureOriginal(db.loan, 'loanId'), auditMiddleware('LOAN'), Controller.loan.updateLoan)
        .delete(authenticate, canModify, captureOriginal(db.loan, 'loanId'), auditMiddleware('LOAN'), Controller.loan.deleteLoan);

    router
        .route('/loans/:loanId/repayments')
        .post(authenticate, canModify, Controller.loan.recordRepayment);

    router
        .route('/loans/:loanId/repayments/:txnId')
        .delete(authenticate, canModify, Controller.loan.deleteRepayment);
};
