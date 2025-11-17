const db = require('../models');

module.exports = {
    getLedgerByName: async (ledgerName, transaction = null) => {
        try {
            const options = { where: { ledgerName } };
            if (transaction) {
                options.transaction = transaction;
            }
            const res = await db.ledger.findOne(options);
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    },

    findOrCreateByName: async (ledgerName, defaults = {}, transaction = null) => {
        try {
            const options = {
                where: { ledgerName },
                defaults: { ledgerName, ...defaults }
            };
            if (transaction) {
                options.transaction = transaction;
            }
            const [ledger, created] = await db.ledger.findOrCreate(options);
            return ledger;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
};
