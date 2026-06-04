const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controller/gstReports');

module.exports = (router) => {
    router.get('/gst/gstr1',      authenticate, ctrl.getGSTR1);
    router.get('/gst/gstr3b',     authenticate, ctrl.getGSTR3B);
    router.get('/gst/hsn-codes',  authenticate, ctrl.getHSNCodes);
    router.post('/gst/hsn-codes', authenticate, authorize('admin'), ctrl.createHSNCode);
};
