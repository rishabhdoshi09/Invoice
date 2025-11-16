const db = require('../models');

module.exports = {
    getLedgerByName: async (ledgerName) => {
        try {
            const res = await db.ledger.findOne({ where: { ledgerName } });
            return res;
        } catch (error) {
            console.log(error);
            throw new Error(error);
        }
    }
};
