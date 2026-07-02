const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const db = require('../models');
const { calculateNetSalary } = require('../services/salaryCalculation');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// settled = cash paid + advance given this month
const statusFor = (paidAmount, advanceDeduction, netSalary) => {
    const settled = round2(paidAmount + advanceDeduction);
    if (settled >= netSalary - 0.01) return 'paid';
    if (settled > 0) return 'partial';
    return 'unpaid';
};

// Recomputes and persists the salary record for one employee/month.
// Factors in both leave deductions and advance deductions.
const syncSalaryRecord = async (employee, month, year, transaction) => {
    const leaves = await db.employeeLeave.findAll({ where: { employeeId: employee.id }, transaction });
    const leaveDatesSet = new Set(
        leaves
            .map(l => moment(l.leaveDate, ['DD-MM-YYYY', 'YYYY-MM-DD']))
            .filter(m => m.month() + 1 === Number(month) && m.year() === Number(year))
            .map(m => m.format('DD-MM-YYYY'))
    );

    const { daysInMonth, leaveDays, netSalary, dailyRate, deduction, preJoinDays, preJoinDeduction } =
        calculateNetSalary(employee.monthlySalary, year, month, leaveDatesSet, employee.joinDate);

    // Sum all non-deleted advances for this employee/month
    const advances = await db.employeeAdvance.findAll({
        where: { employeeId: employee.id, month: Number(month), year: Number(year), isDeleted: false },
        transaction
    });
    const advanceDeduction = round2(advances.reduce((s, a) => s + Number(a.amount), 0));

    let record = await db.salaryPayment.findOne({
        where: { employeeId: employee.id, month: Number(month), year: Number(year) },
        transaction
    });

    const paidAmount = record ? Number(record.paidAmount) : 0;
    const dueAmount = Math.max(0, round2(netSalary - advanceDeduction - paidAmount));
    const status = statusFor(paidAmount, advanceDeduction, netSalary);

    if (record) {
        await record.update({
            monthlySalary: employee.monthlySalary,
            daysInMonth, leaveDays, netSalary, advanceDeduction, dueAmount, status
        }, { transaction });
    } else {
        record = await db.salaryPayment.create({
            employeeId: employee.id,
            month: Number(month),
            year: Number(year),
            monthlySalary: employee.monthlySalary,
            daysInMonth, leaveDays, netSalary,
            advanceDeduction,
            paidAmount: 0,
            dueAmount,
            status
        }, { transaction });
    }

    // Attach computed extras for the API response
    record._dailyRate = dailyRate;
    record._leaveDeduction = deduction;
    record._preJoinDays = preJoinDays;
    record._preJoinDeduction = preJoinDeduction;
    return record;
};

module.exports = {
    // GET /salary?month=&year=
    listSalary: async (req, res) => {
        try {
            const month = Number(req.query.month) || (moment().month() + 1);
            const year = Number(req.query.year) || moment().year();

            const employees = await db.employee.findAll({
                where: { isDeleted: false, isActive: true },
                order: [['name', 'ASC']]
            });

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
                        dailyRate: round2(record._dailyRate || 0),
                        leaveDeduction: round2(record._leaveDeduction || 0),
                        preJoinDays: record._preJoinDays || 0,
                        preJoinDeduction: round2(record._preJoinDeduction || 0),
                        joinDate: employee.joinDate || null,
                        netSalary: Number(record.netSalary),
                        advanceDeduction: Number(record.advanceDeduction),
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
                totalAdvance: acc.totalAdvance + r.advanceDeduction,
                totalDue: acc.totalDue + r.dueAmount
            }), { totalNetSalary: 0, totalPaid: 0, totalAdvance: 0, totalDue: 0 });

            res.json({ status: 200, data: { rows: records, summary, month, year } });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    // GET /salary/:id
    getSalaryDetail: async (req, res) => {
        try {
            const record = await db.salaryPayment.findOne({
                where: { id: req.params.salaryId, isDeleted: false },
                include: [{ model: db.employee, as: 'employee' }]
            });
            if (!record) return res.status(404).json({ status: 404, message: 'Salary record not found.' });

            const [payments, advances] = await Promise.all([
                db.payment.findAll({
                    where: { referenceType: 'salary', referenceId: record.id, isDeleted: false },
                    order: [['createdAt', 'ASC']]
                }),
                db.employeeAdvance.findAll({
                    where: {
                        employeeId: record.employeeId,
                        month: record.month,
                        year: record.year,
                        isDeleted: false
                    },
                    order: [['createdAt', 'ASC']]
                })
            ]);

            res.json({ status: 200, data: { record, payments, advances } });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    // POST /salary/:id/pay
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
                const advanceDeduction = Number(record.advanceDeduction);
                const newDueAmount = Math.max(0, round2(Number(record.netSalary) - advanceDeduction - newPaidAmount));
                const status = statusFor(newPaidAmount, advanceDeduction, Number(record.netSalary));

                await record.update({ paidAmount: newPaidAmount, dueAmount: newDueAmount, status }, { transaction });
                return { payment, record };
            });

            console.log(`[SALARY] Paid ₹${payAmt} to ${record.employee.name} for ${record.month}/${record.year} (${result.record.status})`);
            res.json({ status: 200, data: result });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    // DELETE /salary/payments/:paymentId
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
                const advanceDeduction = Number(record.advanceDeduction);
                const newDueAmount = Math.max(0, round2(Number(record.netSalary) - advanceDeduction - newPaidAmount));
                const status = statusFor(newPaidAmount, advanceDeduction, Number(record.netSalary));

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
    },

    // POST /employees/:employeeId/advances
    recordAdvance: async (req, res) => {
        try {
            const { employeeId } = req.params;
            const employee = await db.employee.findOne({ where: { id: employeeId, isDeleted: false } });
            if (!employee) return res.status(404).json({ status: 404, message: 'Employee not found.' });

            const { amount, advanceDate, month, year, notes } = req.body;
            const amt = round2(amount);
            if (!amt || amt <= 0) return res.status(400).json({ status: 400, message: 'amount must be positive.' });

            const m = Number(month) || (moment().month() + 1);
            const y = Number(year) || moment().year();

            const advance = await db.employeeAdvance.create({
                employeeId,
                month: m,
                year: y,
                amount: amt,
                advanceDate: advanceDate || moment().format('DD-MM-YYYY'),
                notes: notes?.trim() || null,
                recordedBy: req.user?.name || req.user?.username || null
            });

            // Re-sync the salary record so advanceDeduction & dueAmount update immediately
            await db.sequelize.transaction(async (transaction) => {
                await syncSalaryRecord(employee, m, y, transaction);
            });

            res.json({ status: 200, data: advance });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    // GET /employees/:employeeId/advances?month=&year=
    listAdvances: async (req, res) => {
        try {
            const { employeeId } = req.params;
            const month = Number(req.query.month) || (moment().month() + 1);
            const year = Number(req.query.year) || moment().year();

            const advances = await db.employeeAdvance.findAll({
                where: { employeeId, month, year, isDeleted: false },
                order: [['createdAt', 'ASC']]
            });

            res.json({ status: 200, data: advances });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    // DELETE /employees/:employeeId/advances/:advanceId
    deleteAdvance: async (req, res) => {
        try {
            const { employeeId, advanceId } = req.params;
            const advance = await db.employeeAdvance.findOne({
                where: { id: advanceId, employeeId, isDeleted: false }
            });
            if (!advance) return res.status(404).json({ status: 404, message: 'Advance not found.' });

            const employee = await db.employee.findOne({ where: { id: employeeId } });

            await advance.update({
                isDeleted: true,
                updatedAt: new Date()
            });

            // Re-sync salary so dueAmount reflects the removed advance
            if (employee) {
                await db.sequelize.transaction(async (transaction) => {
                    await syncSalaryRecord(employee, advance.month, advance.year, transaction);
                });
            }

            res.json({ status: 200, message: 'Advance removed.' });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    }
};
