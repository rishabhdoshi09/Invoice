const moment = require('moment');

/**
 * Day-wise salary calculation.
 * dailyRate = monthlySalary / daysInMonth.
 * Sundays are always paid (never deducted) even though no work happens.
 * Only leave days marked on a non-Sunday are deducted, pro-rata.
 *
 * @param {number} monthlySalary
 * @param {number} year
 * @param {number} month 1-12
 * @param {Set<string>} leaveDatesSet — leave dates as 'DD-MM-YYYY'
 */
const calculateNetSalary = (monthlySalary, year, month, leaveDatesSet) => {
    const daysInMonth = moment(`${year}-${String(month).padStart(2, '0')}-01`, 'YYYY-MM-DD').daysInMonth();
    const salary = Number(monthlySalary) || 0;
    const dailyRate = daysInMonth > 0 ? salary / daysInMonth : 0;

    let leaveDays = 0;
    let sundaysInMonth = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const dt = moment(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`, 'YYYY-MM-DD');
        const isSunday = dt.day() === 0;
        if (isSunday) sundaysInMonth++;
        if (!isSunday && leaveDatesSet.has(dt.format('DD-MM-YYYY'))) {
            leaveDays++;
        }
    }

    const deduction = Math.round(dailyRate * leaveDays * 100) / 100;
    const netSalary = Math.max(0, Math.round((salary - deduction) * 100) / 100);

    return { daysInMonth, sundaysInMonth, dailyRate, leaveDays, deduction, netSalary };
};

module.exports = { calculateNetSalary };
