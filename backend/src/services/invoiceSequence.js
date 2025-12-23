const db = require('../models');
const uuidv4 = require('uuid/v4');
const moment = require('moment-timezone');

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
    generateInvoiceNumber: async (transaction = null) => {
        const today = moment().format('YYYY-MM-DD');
        
        // Use transaction lock to prevent race conditions
        const options = transaction ? { transaction, lock: true } : {};
        
        let sequence = await db.invoiceSequence.findOne(options);
        
        if (!sequence) {
            sequence = await db.invoiceSequence.create({
                id: uuidv4(),
                prefix: 'INV',
                currentNumber: 0,
                dailyNumber: 0,
                lastDate: today
            }, transaction ? { transaction } : {});
        }

        // Increment global number (never resets)
        const newGlobalNumber = sequence.currentNumber + 1;
        
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
            lastDate: today
        }, transaction ? { transaction } : {});

        // Generate invoice number format: INV-YYYYMMDD-XXXX (global sequence)
        const dateStr = moment().format('YYYYMMDD');
        const paddedNumber = String(newGlobalNumber).padStart(6, '0');
        
        return {
            invoiceNumber: `${sequence.prefix}-${dateStr}-${paddedNumber}`,
            globalSequence: newGlobalNumber,
            dailySequence: newDailyNumber,
            date: today
        };
    },

    // Get current sequence info
    getSequenceInfo: async () => {
        const sequence = await db.invoiceSequence.findOne();
        
        if (!sequence) {
            return {
                currentNumber: 0,
                dailyNumber: 0,
                lastDate: null,
                prefix: 'INV'
            };
        }

        return {
            currentNumber: sequence.currentNumber,
            dailyNumber: sequence.dailyNumber,
            lastDate: sequence.lastDate,
            prefix: sequence.prefix
        };
    }
};
