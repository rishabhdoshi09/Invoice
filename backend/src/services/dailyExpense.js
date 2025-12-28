const db = require('../models');
const uuidv4 = require('uuid/v4');
const moment = require('moment-timezone');
const { Op } = require('sequelize');

module.exports = {
    // Add a new expense
    addExpense: async (expenseData, user) => {
        const today = moment().format('YYYY-MM-DD');
        
        const expense = await db.dailyExpense.create({
            id: uuidv4(),
            date: expenseData.date || today,
            category: expenseData.category,
            description: expenseData.description || null,
            amount: parseFloat(expenseData.amount),
            paidTo: expenseData.paidTo || null,
            paymentMode: expenseData.paymentMode || 'cash',
            createdBy: user?.id || null,
            createdByName: user?.name || user?.username || 'Unknown'
        });
        
        return expense;
    },

    // Get expenses for a specific date
    getExpensesByDate: async (date) => {
        const dateStr = moment(date).format('YYYY-MM-DD');
        
        const expenses = await db.dailyExpense.findAll({
            where: { date: dateStr },
            order: [['createdAt', 'DESC']]
        });
        
        return expenses;
    },

    // Get today's expenses
    getTodayExpenses: async () => {
        const today = moment().format('YYYY-MM-DD');
        
        const expenses = await db.dailyExpense.findAll({
            where: { date: today },
            order: [['createdAt', 'DESC']]
        });
        
        return expenses;
    },

    // Get total expenses for a date
    getTotalExpensesByDate: async (date) => {
        const dateStr = moment(date).format('YYYY-MM-DD');
        
        const result = await db.dailyExpense.findOne({
            where: { date: dateStr },
            attributes: [
                [db.Sequelize.fn('SUM', db.Sequelize.col('amount')), 'total']
            ],
            raw: true
        });
        
        return parseFloat(result?.total || 0);
    },

    // Get today's total expenses
    getTodayTotalExpenses: async () => {
        const today = moment().format('YYYY-MM-DD');
        return module.exports.getTotalExpensesByDate(today);
    },

    // Delete an expense (admin only)
    deleteExpense: async (expenseId) => {
        const expense = await db.dailyExpense.findOne({
            where: { id: expenseId }
        });
        
        if (!expense) {
            throw new Error('Expense not found');
        }
        
        await expense.destroy();
        return true;
    },

    // Get expenses by category for a date range
    getExpensesByCategory: async (startDate, endDate) => {
        const start = moment(startDate).format('YYYY-MM-DD');
        const end = moment(endDate).format('YYYY-MM-DD');
        
        const expenses = await db.dailyExpense.findAll({
            where: {
                date: {
                    [Op.between]: [start, end]
                }
            },
            attributes: [
                'category',
                [db.Sequelize.fn('SUM', db.Sequelize.col('amount')), 'total'],
                [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'count']
            ],
            group: ['category'],
            raw: true
        });
        
        return expenses;
    }
};
