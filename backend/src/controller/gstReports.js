/**
 * GST Reports Controller
 * GSTR-1, GSTR-3B, HSN Summary, E-Invoice, E-Way Bill tracker
 */
const db = require('../models');
const moment = require('moment');

// ─── GSTR-1 ──────────────────────────────────────────────────────────────────
// B2B, B2C, CDNR, CDNUR, HSN Summary

const getGSTR1 = async (req, res) => {
    try {
        const month = req.query.month || moment().format('MM');
        const year  = req.query.year  || moment().format('YYYY');
        const from  = `${year}-${month.padStart(2,'0')}-01`;
        const to    = moment(from).endOf('month').format('YYYY-MM-DD');
        const sellerGstin = req.query.gstin || process.env.SELLER_GSTIN || '';

        // B2B — Registered buyers
        const [b2b] = await db.sequelize.query(`
            SELECT
                o.id, o."orderNumber", o."orderDate",
                o."customerName", o."customerGstin",
                o."placeOfSupply", o."supplyType", o."reverseCharge",
                o."subTotal" AS taxable_value,
                COALESCE(o.cgst, 0) AS cgst, COALESCE(o.sgst, 0) AS sgst,
                COALESCE(o.igst, 0) AS igst, COALESCE(o.cess, 0) AS cess,
                o.total
            FROM orders o
            WHERE o."isDeleted" = false
              AND o."orderDate" BETWEEN :from AND :to
              AND o."customerGstin" IS NOT NULL
              AND o."customerGstin" != ''
            ORDER BY o."customerGstin", o."orderDate"
        `, { replacements: { from, to } });

        // B2C Large — Unregistered, inter-state, > ₹2.5 lakh
        const [b2cLarge] = await db.sequelize.query(`
            SELECT
                o."placeOfSupply", o."supplyType",
                SUM(o."subTotal") AS taxable_value,
                SUM(COALESCE(o.igst, 0)) AS igst,
                SUM(COALESCE(o.cess, 0)) AS cess,
                SUM(o.total) AS total
            FROM orders o
            WHERE o."isDeleted" = false
              AND o."orderDate" BETWEEN :from AND :to
              AND (o."customerGstin" IS NULL OR o."customerGstin" = '')
              AND o."supplyType" = 'INTERSTATE'
              AND o.total > 250000
            GROUP BY o."placeOfSupply", o."supplyType"
        `, { replacements: { from, to } });

        // B2C Small — Others
        const [b2cSmall] = await db.sequelize.query(`
            SELECT
                SUM(o."subTotal") AS taxable_value,
                SUM(COALESCE(o.cgst, 0)) AS cgst,
                SUM(COALESCE(o.sgst, 0)) AS sgst,
                SUM(COALESCE(o.igst, 0)) AS igst,
                SUM(COALESCE(o.cess, 0)) AS cess,
                SUM(o.total) AS total,
                COUNT(*) AS invoice_count
            FROM orders o
            WHERE o."isDeleted" = false
              AND o."orderDate" BETWEEN :from AND :to
              AND (o."customerGstin" IS NULL OR o."customerGstin" = '')
              AND NOT (o."supplyType" = 'INTERSTATE' AND o.total > 250000)
        `, { replacements: { from, to } });

        // HSN Summary
        const [hsnSummary] = await db.sequelize.query(`
            SELECT
                oi."hsnCode",
                SUM(oi.quantity) AS total_qty,
                SUM(oi."totalPrice") AS taxable_value,
                SUM(COALESCE(oi.cgst, 0)) AS cgst,
                SUM(COALESCE(oi.sgst, 0)) AS sgst,
                SUM(COALESCE(oi.igst, 0)) AS igst,
                oi.unit
            FROM order_items oi
            INNER JOIN orders o ON o.id = oi."orderId"
            WHERE o."isDeleted" = false
              AND o."orderDate" BETWEEN :from AND :to
              AND oi."hsnCode" IS NOT NULL AND oi."hsnCode" != ''
            GROUP BY oi."hsnCode", oi.unit
            ORDER BY taxable_value DESC
        `, { replacements: { from, to } });

        // Credit Notes (CDNR)
        const [cdnr] = await db.sequelize.query(`
            SELECT
                cn.id, cn."noteNumber", cn."noteDate",
                cn."partyName", cn."partyId",
                cn."subTotal" AS taxable_value,
                cn.cgst, cn.sgst, cn.igst, cn.total,
                c.gstin AS buyerGstin
            FROM credit_notes cn
            LEFT JOIN customers c ON c.id = cn."partyId"
            WHERE cn."isDeleted" = false
              AND cn."noteDate" BETWEEN :from AND :to
              AND cn."partyType" = 'customer'
        `, { replacements: { from, to } });

        const summary = {
            period: `${moment(from).format('MMM YYYY')}`,
            gstin: sellerGstin,
            b2bTotal:    b2b.reduce((s, r) => s + Number(r.total || 0), 0),
            b2cLargeTotal: b2cLarge.reduce((s, r) => s + Number(r.total || 0), 0),
            b2cSmallTotal: b2cSmall[0] ? Number(b2cSmall[0].total || 0) : 0,
            cdnrTotal:   cdnr.reduce((s, r) => s + Number(r.total || 0), 0),
            totalTaxable: b2b.reduce((s, r) => s + Number(r.taxable_value || 0), 0)
                        + (b2cSmall[0] ? Number(b2cSmall[0].taxable_value || 0) : 0)
        };

        return res.json({
            status: 200,
            data: { period: { from, to, month, year }, summary, b2b, b2cLarge, b2cSmall: b2cSmall[0] || {}, hsnSummary, cdnr }
        });
    } catch (err) {
        console.error('GSTR-1 error:', err);
        return res.status(500).json({ status: 500, message: err.message });
    }
};

// ─── GSTR-3B ─────────────────────────────────────────────────────────────────

const getGSTR3B = async (req, res) => {
    try {
        const month = req.query.month || moment().format('MM');
        const year  = req.query.year  || moment().format('YYYY');
        const from  = `${year}-${month.padStart(2,'0')}-01`;
        const to    = moment(from).endOf('month').format('YYYY-MM-DD');

        // Outward Supplies (Sales)
        const [outward] = await db.sequelize.query(`
            SELECT
                SUM(o."subTotal") AS taxable_value,
                SUM(COALESCE(o.cgst, 0)) AS cgst,
                SUM(COALESCE(o.sgst, 0)) AS sgst,
                SUM(COALESCE(o.igst, 0)) AS igst,
                SUM(COALESCE(o.cess, 0)) AS cess,
                SUM(CASE WHEN o."supplyType" = 'EXPORT' THEN o.total ELSE 0 END) AS exports,
                SUM(CASE WHEN o."reverseCharge" = true THEN o."subTotal" ELSE 0 END) AS reverse_charge
            FROM orders o
            WHERE o."isDeleted" = false AND o."orderDate" BETWEEN :from AND :to
        `, { replacements: { from, to } });

        // ITC (Input Tax Credit from purchases)
        const [inward] = await db.sequelize.query(`
            SELECT
                SUM(pb."subTotal") AS taxable_value,
                SUM(COALESCE(pb.cgst, 0)) AS cgst,
                SUM(COALESCE(pb.sgst, 0)) AS sgst,
                SUM(COALESCE(pb.igst, 0)) AS igst,
                SUM(COALESCE(pb.cess, 0)) AS cess,
                SUM(CASE WHEN pb."reverseCharge" = true THEN COALESCE(pb.cgst,0) + COALESCE(pb.sgst,0) + COALESCE(pb.igst,0) ELSE 0 END) AS itc_on_rcs
            FROM purchase_bills pb
            WHERE pb."isDeleted" = false AND pb."billDate" BETWEEN :from AND :to
        `, { replacements: { from, to } });

        const out = outward[0] || {};
        const inp = inward[0]  || {};

        const outputTax = Number(out.cgst||0) + Number(out.sgst||0) + Number(out.igst||0);
        const itcAvailable = Number(inp.cgst||0) + Number(inp.sgst||0) + Number(inp.igst||0);
        const netTaxPayable = Math.max(0, outputTax - itcAvailable);

        return res.json({
            status: 200,
            data: {
                period: { from, to, month, year },
                section31: { // Outward Supplies
                    taxableValue: Number(out.taxable_value||0),
                    cgst: Number(out.cgst||0), sgst: Number(out.sgst||0),
                    igst: Number(out.igst||0), cess: Number(out.cess||0),
                    exports: Number(out.exports||0)
                },
                section4: { // Eligible ITC
                    taxableValue: Number(inp.taxable_value||0),
                    cgst: Number(inp.cgst||0), sgst: Number(inp.sgst||0),
                    igst: Number(inp.igst||0), cess: Number(inp.cess||0)
                },
                taxLiability: {
                    outputTax,
                    itcAvailable,
                    netTaxPayable
                }
            }
        });
    } catch (err) {
        console.error('GSTR-3B error:', err);
        return res.status(500).json({ status: 500, message: err.message });
    }
};

// ─── HSN CODE CRUD ───────────────────────────────────────────────────────────

const getHSNCodes = async (req, res) => {
    try {
        const { search, type } = req.query;
        const where = {};
        if (type) where.type = type;

        let codes;
        if (search) {
            const [rows] = await db.sequelize.query(`
                SELECT * FROM hsn_codes
                WHERE (code ILIKE :s OR description ILIKE :s)
                AND "isActive" = true
                ORDER BY code LIMIT 50
            `, { replacements: { s: `%${search}%` } });
            codes = rows;
        } else {
            codes = await db.hsnCode.findAll({ where: { isActive: true, ...where }, order: [['code', 'ASC']] });
        }

        return res.json({ status: 200, data: codes });
    } catch (err) {
        return res.status(500).json({ status: 500, message: err.message });
    }
};

const createHSNCode = async (req, res) => {
    try {
        const { code, description, gstRate, type } = req.body;
        if (!code || !gstRate) return res.status(400).json({ status: 400, message: 'code and gstRate required' });
        const half = Number(gstRate) / 2;
        const hsn = await db.hsnCode.create({
            code: code.trim(),
            description,
            gstRate:  Number(gstRate),
            cgstRate: half,
            sgstRate: half,
            igstRate: Number(gstRate),
            type: type || 'GOODS'
        });
        return res.status(201).json({ status: 201, data: hsn });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ status: 409, message: 'HSN code already exists' });
        return res.status(500).json({ status: 500, message: err.message });
    }
};

module.exports = { getGSTR1, getGSTR3B, getHSNCodes, createHSNCode };
