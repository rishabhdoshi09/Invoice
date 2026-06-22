const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const db = require('../models');
const { calculateNetSalary } = require('../services/salaryCalculation');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const statusFor = (paidAmount, dueAmount) => {
    if (paidAmount > 0 && dueAmount <= 0) return 'paid';
    if (paidAmount > 0) return 'partial';
    return 'unpaid';
};

// Recomputes (and persists) the salary "bill" for one employee/month based on
// the employee's current monthly salary and whatever leaves are marked for
// that month. Existing paidAmount carries over — only netSalary/dueAmount/
// status are refreshed, mirroring how a purchase bill's dueAmount is derived.
const syncSalaryRecord = async (employee, month, year, transaction) => {
    const leaves = await db.employeeLeave.findAll({
        where: { employeeId: employee.id },
        transaction
    });
    const leaveDatesSet = new Set(
        leaves
            .map(l => moment(l.leaveDate, ['DD-MM-YYYY', 'YYYY-MM-DD']))
            .filter(m => m.month() + 1 === Number(month) && m.year() === Number(year))
            .map(m => m.format('DD-MM-YYYY'))
    );

    const { daysInMonth, leaveDays, netSalary } = calculateNetSalary(employee.monthlySalary, year, month, leaveDatesSet);

    let record = await db.salaryPayment.findOne({
        where: { employeeId: employee.id, month: Number(month), year: Number(year) },
        transaction
    });

    const paidAmount = record ? Number(record.paidAmount) : 0;
    const dueAmount = Math.max(0, round2(netSalary - paidAmount));
    const status = statusFor(paidAmount, dueAmount);

    if (record) {
        await record.update({
            monthlySalary: employee.monthlySalary,
            daysInMonth, leaveDays, netSalary, dueAmount, status
        }, { transaction });
    } else {
        record = await db.salaryPayment.create({
            employeeId: employee.id,
            month: Number(month),
            year: Number(year),
            monthlySalary: employee.monthlySalary,
            daysInMonth, leaveDays, netSalary,
            paidAmount: 0,
            dueAmount,
            status
        }, { transaction });
    }
    return record;
};

module.exports = {
    // GET /salary?month=&year= — one row per active employee, auto-synced to current leave data
    listSalary: async (req, res) => {
        try {
            const month = Number(req.query.month) || (moment().month() + 1);
            const year = Number(req.query.year) || moment().year();

            const employees = await db.employee.findAll({ where: { isDeleted: false, isActive: true }, order: [['name', 'ASC']] });

            const records = await db.sequelize.transaction(async (transaction) => {
                const out = [];
                for (const employee of employees) {
                    const record = await syncSalaryRecord(employee, month, year, transaction);
                    out.push({
                        id: record.id,
                        employeeId: employee.id,
                        employeeName: employee.name,
                        employeeMobile: employee.mobile,
                        month, year,
                        monthlySalary: Number(record.monthlySalary),
                        daysInMonth: record.daysInMonth,
                        leaveDays: record.leaveDays,
                        netSalary: Number(record.netSalary),
                        paidAmount: Number(record.paidAmount),
                        dueAmount: Number(record.dueAmount),
                        status: record.status
                    });
                }
                return out;
            });

            const summary = records.reduce((acc, r) => ({
                totalNetSalary: acc.totalNetSalary + r.netSalary,
                totalPaid: acc.totalPaid + r.paidAmount,
                totalDue: acc.totalDue + r.dueAmount
            }), { totalNetSalary: 0, totalPaid: 0, totalDue: 0 });

            res.json({ status: 200, data: { rows: records, summary, month, year } });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    // GET /salary/:id — single record + payment history
    getSalaryDetail: async (req, res) => {
        try {
            const record = await db.salaryPayment.findOne({
                where: { id: req.params.salaryId, isDeleted: false },
                include: [{ model: db.employee, as: 'employee' }]
            });
            if (!record) return res.status(404).json({ status: 404, message: 'Salary record not found.' });

            const payments = await db.payment.findAll({
                where: { referenceType: 'salary', referenceId: record.id, isDeleted: false },
                order: [['createdAt', 'ASC']]
            });

            res.json({ status: 200, data: { record, payments } });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    // POST /salary/:id/pay { amount, paymentDate, notes }
    paySalary: async (req, res) => {
        try {
            const record = await db.salaryPayment.findOne({
                where: { id: req.params.salaryId, isDeleted: false },
                include: [{ model: db.employee, as: 'employee' }]
            });
            if (!record) return res.status(404).json({ status: 404, message: 'Salary record not found.' });

            const { amount, paymentDate, notes } = req.body;
            const payAmt = round2(amount);
            if (!payAmt || payAmt <= 0) return res.status(400).json({ status: 400, message: 'amount must be positive.' });
            if (payAmt > Number(record.dueAmount) + 0.01) {
                return res.status(400).json({ status: 400, message: `Amount exceeds due amount of ₹${record.dueAmount}.` });
            }

            const result = await db.sequelize.transaction(async (transaction) => {
                const payment = await db.payment.create({
                    paymentNumber: `SAL-${uuidv4().split('-')[0].toUpperCase()}`,
                    paymentDate: paymentDate || moment().format('DD-MM-YYYY'),
                    partyId: record.employee.id,
                    partyName: record.employee.name,
                    partyType: 'employee',
                    amount: payAmt,
                    referenceType: 'salary',
                    referenceId: record.id,
                    referenceNumber: `${String(record.month).padStart(2, '0')}/${record.year}`,
                    notes: notes?.trim() || null
                }, { transaction });

                const newPaidAmount = round2(Number(record.paidAmount) + payAmt);
                const newDueAmount = Math.max(0, round2(Number(record.netSalary) - newPaidAmount));
                const status = statusFor(newPaidAmount, newDueAmount);

                await record.update({ paidAmount: newPaidAmount, dueAmount: newDueAmount, status }, { transaction });

                return { payment, record };
            });

            console.log(`[SALARY] Paid ₹${payAmt} to ${record.employee.name} for ${record.month}/${record.year} (status: ${result.record.status})`);
            res.json({ status: 200, data: result });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    // DELETE /salary/payments/:paymentId — reverse a salary payout
    reverseSalaryPayment: async (req, res) => {
        try {
            const payment = await db.payment.findOne({
                where: { id: req.params.paymentId, partyType: 'employee', referenceType: 'salary', isDeleted: false }
            });
            if (!payment) return res.status(404).json({ status: 404, message: 'Salary payment not found.' });

            const record = await db.salaryPayment.findOne({ where: { id: payment.referenceId, isDeleted: false } });
            if (!record) return res.status(404).json({ status: 404, message: 'Parent salary record not found.' });

            await db.sequelize.transaction(async (transaction) => {
                const newPaidAmount = Math.max(0, round2(Number(record.paidAmount) - Number(payment.amount)));
                const newDueAmount = Math.max(0, round2(Number(record.netSalary) - newPaidAmount));
                const status = statusFor(newPaidAmount, newDueAmount);

                await record.update({ paidAmount: newPaidAmount, dueAmount: newDueAmount, status }, { transaction });
                await payment.update({
                    isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: req.user?.id || null,
                    deletedByName: req.user?.name || req.user?.username || null
                }, { transaction });
            });

            res.json({ status: 200, message: 'Salary payment reversed.' });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    }
};
