const Dao = require("../dao");

module.exports = {
    getLedgerByName: async (ledgerName) => {
        try {
            const res = await Dao.ledger.getLedgerByName(ledgerName);
            return res;
        } catch (error) {
            throw error;
        }
    }
};
