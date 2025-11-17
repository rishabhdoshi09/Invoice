const Dao = require("../dao");

module.exports = {
    getLedgerByName: async (ledgerName, transaction = null) => {
        try {
            const res = await Dao.ledger.getLedgerByName(ledgerName, transaction);
            return res;
        } catch (error) {
            throw error;
        }
    },
    findOrCreateByName: async (ledgerName, defaults = {}, transaction = null) => {
        try {
            const res = await Dao.ledger.findOrCreateByName(ledgerName, defaults, transaction);
            return res;
        } catch (error) {
            throw error;
        }
    }
};
