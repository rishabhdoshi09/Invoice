const moment = require('moment');

// Standard payroll convention: deductions are always computed on a fixed
// 30-day basis (dailyRate = monthlySalary / 30), regardless of whether the
// calendar month has 28, 29, 30 or 31 days.
const RATE_BASIS_DAYS = 30;

/**
 * Day-wise salary calculation.
 * dailyRate = monthlySalary / 30 (fixed basis, not calendar days).
 * Sundays are always paid (never deducted) even though no work happens.
 * Only leave days marked on a non-Sunday are deducted, pro-rata.
 * Days before the employee's join date are not payable at all (including
 * Sundays before joining) — a mid-month joiner only earns from joinDate on.
 *
 * @param {number} monthlySalary
 * @param {number} year
 * @param {number} month 1-12
 * @param {Set<string>} leaveDatesSet — leave dates as 'DD-MM-YYYY'
 * @param {string|null} joinDate — employee join date as 'DD-MM-YYYY' (optional)
 */
const calculateNetSalary = (monthlySalary, year, month, leaveDatesSet, joinDate = null) => {
    const daysInMonth = moment(`${year}-${String(month).padStart(2, '0')}-01`, 'YYYY-MM-DD').daysInMonth();
    const salary = Number(monthlySalary) || 0;
    const dailyRate = salary / RATE_BASIS_DAYS;

    const joinMoment = joinDate ? moment(joinDate, ['DD-MM-YYYY', 'YYYY-MM-DD'], true) : null;
    const hasValidJoin = joinMoment && joinMoment.isValid();

    let leaveDays = 0;
    let sundaysInMonth = 0;
    let preJoinDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const dt = moment(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, 'YYYY-MM-DD');
        const isSunday = dt.day() === 0;
        if (isSunday) sundaysInMonth++;
        if (hasValidJoin && dt.isBefore(joinMoment, 'day')) {
            preJoinDays++;
            continue; // not employed yet — nothing else counts for this day
        }
        if (!isSunday && leaveDatesSet.has(dt.format('DD-MM-YYYY'))) {
            leaveDays++;
        }
    }

    const preJoinDeduction = Math.round(dailyRate * preJoinDays * 100) / 100;
    const deduction = Math.round(dailyRate * leaveDays * 100) / 100;
    const netSalary = Math.max(0, Math.round((salary - preJoinDeduction - deduction) * 100) / 100);

    return { daysInMonth, sundaysInMonth, dailyRate, leaveDays, deduction, preJoinDays, preJoinDeduction, netSalary };
};

module.exports = { calculateNetSalary };
