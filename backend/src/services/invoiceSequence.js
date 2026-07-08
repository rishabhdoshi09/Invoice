const db = require('../models');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment-timezone');

// Helper to get financial year string (e.g., "2025-26")
const getFinancialYear = (date = new Date()) => {
    const d = moment(date);
    const month = d.month(); // 0-indexed (0 = January)
    const year = d.year();
    
    // Financial year in India runs from April 1 to March 31
    // If month is Jan-Mar (0-2), we're in previous year's FY
    // If month is Apr-Dec (3-11), we're in current year's FY
    if (month < 3) {
        // January to March - FY started last year
        return `${year - 1}-${String(year).slice(-2)}`;
    } else {
        // April to December - FY starts this year
        return `${year}-${String(year + 1).slice(-2)}`;
    }
};

module.exports = {
    // Get or create the invoice sequence record
    getSequence: async () => {
        let sequence = await db.invoiceSequence.findOne();
        
        if (!sequence) {
            sequence = await db.invoiceSequence.create({
                id: uuidv4(),
                prefix: 'INV',
                currentNumber: 0,
                dailyNumber: 0,
                lastDate: null
            });
        }
        
        return sequence;
    },

    // Generate the next invoice number (server-side, tamper-proof)
    // Format: INV/2025-26/0001 (GST Compatible - Financial Year based)
    generateInvoiceNumber: async (transaction = null) => {
        const today = moment().format('YYYY-MM-DD');
        const currentFY = getFinancialYear();
        
        // Use FOR UPDATE lock to prevent race conditions
        const options = transaction ? { 
            transaction, 
            lock: transaction.LOCK.UPDATE  // Strong lock for concurrent access
        } : {};
        
        let sequence = await db.invoiceSequence.findOne(options);
        
        if (!sequence) {
            sequence = await db.invoiceSequence.create({
                id: uuidv4(),
                prefix: 'INV',
                currentNumber: 0,
                dailyNumber: 0,
                lastDate: today,
                lastFinancialYear: currentFY
            }, transaction ? { transaction } : {});
        }

        // Check if we need to reset for new financial year
        const lastFY = sequence.lastFinancialYear || getFinancialYear(sequence.lastDate || today);
        let newGlobalNumber;

        if (lastFY !== currentFY) {
            // New financial year - reset counter
            newGlobalNumber = 1;
        } else {
            // Same financial year - increment
            newGlobalNumber = sequence.currentNumber + 1;
        }

        // SELF-HEALING GUARD: the sequence row is a separate counter from the
        // orders table — if it ever desyncs (row recreated after loss, manual
        // edit, restore from an older backup, etc.) it will keep generating a
        // number that already exists. Because generation runs inside the same
        // transaction as the order insert, a collision rolls back the counter
        // increment too, so a desynced counter repeats the SAME colliding
        // number forever instead of failing once. Guard against that by
        // checking the actual max invoice number for this prefix+FY and
        // jumping ahead of it if the counter has fallen behind reality.
        const prefix = sequence.prefix || 'INV';
        const likeCandidate = `${prefix}/${currentFY}/%`;
        const [rows] = await db.sequelize.query(
            `SELECT MAX(CAST(SUBSTRING("orderNumber" FROM '(\\d+)$') AS INTEGER)) AS "maxSuffix"
             FROM orders
             WHERE "orderNumber" LIKE :likeCandidate`,
            { replacements: { likeCandidate }, transaction: transaction || undefined }
        );
        const maxSuffix = rows && rows[0] ? rows[0].maxSuffix : null;
        if (maxSuffix && Number(maxSuffix) >= newGlobalNumber) {
            newGlobalNumber = Number(maxSuffix) + 1;
        }
        
        // Check if we need to reset daily number
        let newDailyNumber;
        if (sequence.lastDate !== today) {
            // New day - reset daily counter
            newDailyNumber = 1;
        } else {
            // Same day - increment
            newDailyNumber = sequence.dailyNumber + 1;
        }

        // Update sequence
        await sequence.update({
            currentNumber: newGlobalNumber,
            dailyNumber: newDailyNumber,
            lastDate: today,
            lastFinancialYear: currentFY
        }, transaction ? { transaction } : {});

        // Generate invoice number format: INV/2025-26/0001 (GST Compatible)
        const paddedNumber = String(newGlobalNumber).padStart(4, '0');
        
        return {
            invoiceNumber: `${sequence.prefix}/${currentFY}/${paddedNumber}`,
            globalSequence: newGlobalNumber,
            dailySequence: newDailyNumber,
            date: today,
            financialYear: currentFY
        };
    },

    // Get current sequence info
    getSequenceInfo: async () => {
        const sequence = await db.invoiceSequence.findOne();
        const currentFY = getFinancialYear();
        
        if (!sequence) {
            return {
                currentNumber: 0,
                nextNumber: 1,
                dailyNumber: 0,
                lastDate: null,
                prefix: 'INV',
                financialYear: currentFY
            };
        }

        return {
            currentNumber: sequence.currentNumber,
            nextNumber: (sequence.currentNumber || 0) + 1,
            dailyNumber: sequence.dailyNumber,
            lastDate: sequence.lastDate,
            prefix: sequence.prefix || 'INV',
            financialYear: currentFY,
            lastFinancialYear: sequence.lastFinancialYear
        };
    },
    
    // Helper function exported for use elsewhere
    getFinancialYear
};
