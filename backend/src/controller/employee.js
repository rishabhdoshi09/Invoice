const db = require('../models');
const moment = require('moment');

module.exports = {
    listEmployees: async (req, res) => {
        try {
            const { includeInactive } = req.query;
            const where = { isDeleted: false };
            if (!includeInactive || includeInactive === 'false') where.isActive = true;

            const employees = await db.employee.findAll({
                where,
                order: [['name', 'ASC']]
            });
            res.json({ status: 200, data: employees });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    createEmployee: async (req, res) => {
        try {
            const { name, mobile, monthlySalary, joinDate, notes } = req.body;
            if (!name || !name.trim() || !monthlySalary || Number(monthlySalary) <= 0) {
                return res.status(400).json({ status: 400, message: 'name and a positive monthlySalary are required.' });
            }
            const employee = await db.employee.create({
                name: name.trim(),
                mobile: mobile?.trim() || null,
                monthlySalary: Number(monthlySalary),
                joinDate: joinDate || moment().format('DD-MM-YYYY'),
                notes: notes?.trim() || null,
                isActive: true
            });
            res.status(201).json({ status: 201, data: employee });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    getEmployee: async (req, res) => {
        try {
            const employee = await db.employee.findOne({ where: { id: req.params.employeeId, isDeleted: false } });
            if (!employee) return res.status(404).json({ status: 404, message: 'Employee not found.' });
            res.json({ status: 200, data: employee });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    updateEmployee: async (req, res) => {
        try {
            const employee = await db.employee.findOne({ where: { id: req.params.employeeId, isDeleted: false } });
            if (!employee) return res.status(404).json({ status: 404, message: 'Employee not found.' });
            const { name, mobile, monthlySalary, joinDate, notes, isActive } = req.body;
            await employee.update({
                name: name?.trim() || employee.name,
                mobile: mobile?.trim() ?? employee.mobile,
                monthlySalary: monthlySalary !== undefined ? Number(monthlySalary) : employee.monthlySalary,
                joinDate: joinDate || employee.joinDate,
                notes: notes?.trim() ?? employee.notes,
                isActive: isActive !== undefined ? !!isActive : employee.isActive
            });
            res.json({ status: 200, data: employee });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    deleteEmployee: async (req, res) => {
        try {
            const employee = await db.employee.findOne({ where: { id: req.params.employeeId, isDeleted: false } });
            if (!employee) return res.status(404).json({ status: 404, message: 'Employee not found.' });
            await employee.update({
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: req.user?.id || null,
                deletedByName: req.user?.name || req.user?.username || null
            });
            res.json({ status: 200, message: 'Employee deleted.' });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    // ── Leave management ────────────────────────────────────────────────────
    listLeaves: async (req, res) => {
        try {
            const employee = await db.employee.findOne({ where: { id: req.params.employeeId, isDeleted: false } });
            if (!employee) return res.status(404).json({ status: 404, message: 'Employee not found.' });

            const { month, year } = req.query;
            const leaves = await db.employeeLeave.findAll({
                where: { employeeId: employee.id },
                order: [['leaveDate', 'DESC']]
            });

            const filtered = (month && year)
                ? leaves.filter(l => {
                    const m = moment(l.leaveDate, ['DD-MM-YYYY', 'YYYY-MM-DD']);
                    return m.month() + 1 === Number(month) && m.year() === Number(year);
                })
                : leaves;

            res.json({ status: 200, data: filtered });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    markLeave: async (req, res) => {
        try {
            const employee = await db.employee.findOne({ where: { id: req.params.employeeId, isDeleted: false } });
            if (!employee) return res.status(404).json({ status: 404, message: 'Employee not found.' });

            const { leaveDate, reason } = req.body;
            if (!leaveDate) return res.status(400).json({ status: 400, message: 'leaveDate is required.' });

            const normalizedDate = moment(leaveDate, ['DD-MM-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY']).format('DD-MM-YYYY');

            const existing = await db.employeeLeave.findOne({ where: { employeeId: employee.id, leaveDate: normalizedDate } });
            if (existing) return res.status(400).json({ status: 400, message: 'Leave already marked for this date.' });

            const leave = await db.employeeLeave.create({
                employeeId: employee.id,
                leaveDate: normalizedDate,
                reason: reason?.trim() || null,
                recordedBy: req.user?.name || req.user?.username || null
            });
            res.status(201).json({ status: 201, data: leave });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    },

    deleteLeave: async (req, res) => {
        try {
            const leave = await db.employeeLeave.findOne({ where: { id: req.params.leaveId, employeeId: req.params.employeeId } });
            if (!leave) return res.status(404).json({ status: 404, message: 'Leave record not found.' });
            await leave.destroy();
            res.json({ status: 200, message: 'Leave removed.' });
        } catch (err) {
            res.status(500).json({ status: 500, message: err.message });
        }
    }
};
