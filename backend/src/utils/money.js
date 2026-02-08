/**
 * Money Utility Module
 * 
 * Provides fixed-decimal arithmetic for all currency operations.
 * All internal calculations use integer paise to avoid floating-point errors.
 * 
 * IMPORTANT: Use this module for ALL monetary calculations in the application.
 */

const Money = {
    /**
     * Convert rupees to paise (integer)
     * @param {number} rupees - Amount in rupees
     * @returns {number} Amount in paise (integer)
     */
    toPaise: (rupees) => {
        if (rupees === null || rupees === undefined) return 0;
        return Math.round(Number(rupees) * 100);
    },
    
    /**
     * Convert paise to rupees (2 decimal places)
     * @param {number} paise - Amount in paise
     * @returns {number} Amount in rupees
     */
    toRupees: (paise) => {
        if (paise === null || paise === undefined) return 0;
        return Number((paise / 100).toFixed(2));
    },
    
    /**
     * Add multiple amounts (in rupees)
     * @param {...number} amounts - Amounts to add
     * @returns {number} Sum in rupees
     */
    add: (...amounts) => {
        const sumPaise = amounts.reduce((sum, amt) => sum + Money.toPaise(amt), 0);
        return Money.toRupees(sumPaise);
    },
    
    /**
     * Subtract amounts (in rupees)
     * @param {number} a - First amount
     * @param {number} b - Amount to subtract
     * @returns {number} Difference in rupees
     */
    subtract: (a, b) => {
        const resultPaise = Money.toPaise(a) - Money.toPaise(b);
        return Money.toRupees(resultPaise);
    },
    
    /**
     * Multiply price by quantity (handles sub-paisa precision)
     * @param {number} price - Unit price in rupees
     * @param {number} quantity - Quantity
     * @returns {number} Total in rupees (rounded to 2 decimals)
     */
    multiply: (price, quantity) => {
        // Multiply first, then convert and round
        const result = Number(price) * Number(quantity) * 100;
        return Number((Math.round(result) / 100).toFixed(2));
    },
    
    /**
     * Calculate line item total
     * @param {number} price - Unit price
     * @param {number} quantity - Quantity
     * @returns {number} Line total in rupees
     */
    lineTotal: (price, quantity) => {
        return Money.multiply(price, quantity);
    },
    
    /**
     * Calculate tax amount
     * @param {number} amount - Base amount in rupees
     * @param {number} taxPercent - Tax percentage (e.g., 18 for 18%)
     * @returns {number} Tax amount in rupees
     */
    calculateTax: (amount, taxPercent) => {
        const amountPaise = Money.toPaise(amount);
        const taxPaise = Math.round(amountPaise * taxPercent / 100);
        return Money.toRupees(taxPaise);
    },
    
    /**
     * Calculate total with tax
     * @param {number} subTotal - Subtotal in rupees
     * @param {number} taxPercent - Tax percentage
     * @returns {{subTotal: number, tax: number, total: number}}
     */
    calculateTotal: (subTotal, taxPercent = 0) => {
        const tax = Money.calculateTax(subTotal, taxPercent);
        const total = Money.add(subTotal, tax);
        return { subTotal, tax, total };
    },
    
    /**
     * Round to 2 decimal places
     * @param {number} amount - Amount to round
     * @returns {number} Rounded amount
     */
    round: (amount) => {
        return Math.round(Number(amount) * 100) / 100;
    },
    
    /**
     * Compare two amounts for equality (within 1 paisa tolerance)
     * @param {number} a - First amount
     * @param {number} b - Second amount
     * @returns {boolean} True if equal
     */
    equals: (a, b) => {
        return Math.abs(Money.toPaise(a) - Money.toPaise(b)) <= 1;
    },
    
    /**
     * Format amount for display
     * @param {number} amount - Amount in rupees
     * @param {boolean} showSymbol - Whether to show ₹ symbol
     * @returns {string} Formatted string
     */
    format: (amount, showSymbol = true) => {
        const formatted = Number(amount).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return showSymbol ? `₹${formatted}` : formatted;
    },
    
    /**
     * Parse amount from string (removes currency symbols, commas)
     * @param {string} str - String to parse
     * @returns {number} Parsed amount
     */
    parse: (str) => {
        if (typeof str === 'number') return Money.round(str);
        const cleaned = String(str).replace(/[₹,\s]/g, '');
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : Money.round(parsed);
    },
    
    /**
     * Safe sum of an array of amounts
     * @param {number[]} amounts - Array of amounts
     * @returns {number} Sum
     */
    sum: (amounts) => {
        if (!Array.isArray(amounts)) return 0;
        return Money.add(...amounts);
    },
    
    /**
     * Calculate due amount
     * @param {number} total - Total amount
     * @param {number} paid - Amount paid
     * @returns {number} Due amount
     */
    calculateDue: (total, paid) => {
        return Money.subtract(total, paid);
    }
};

module.exports = Money;
