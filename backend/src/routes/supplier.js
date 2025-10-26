const Controller = require('../controller');

module.exports = (router) => {
    router
        .route('/suppliers')
        .post(Controller.supplier.createSupplier)
        .get(Controller.supplier.listSuppliers)

    router
        .route('/suppliers/:supplierId')
        .get(Controller.supplier.getSupplier)
        .put(Controller.supplier.updateSupplier)
        .delete(Controller.supplier.deleteSupplier)
};
