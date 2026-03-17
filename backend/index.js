const express = require('express');
const router = express.Router();
const logger = require('morgan');
const cors = require('cors');
const db = require('./src/models');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

app.use(cors());
app.use(logger('dev'));

app.use(bodyParser.json({ limit: '100mb'}));
app.use(bodyParser.urlencoded({ limit: '100mb', extended: false }));

require('./src/routes')(router);
app.use('/api', router);
app.use(express.json({limit: '100mb'}));
app.use(express.urlencoded({ limit: '100mb', extended: false, parameterLimit: 5000 }));
app.use(cookieParser());
app.use(compression());

// Serve static files from the React app
app.use(express.static(path.resolve(__dirname, '..', 'frontend', 'build')));

// The "catchall" handler: for any request that doesn't match one above, send back React's index.html file.
app.get('*', (req, res) => {
  if (!req.url.startsWith('/api')) {
    res.sendFile(path.resolve(__dirname, '..', 'frontend', 'build', 'index.html'));
  }
});

const PORT = 8001;

app.listen(PORT, async () => {
  try {
    await db.sequelize.authenticate();
    console.log('Connection has been established successfully.');

    await db.sequelize.sync({ force: false });
    console.log('Database Synced Successfully');

    // Safe column migrations — adds missing columns without breaking existing ones
    try {
      await db.sequelize.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL`);
    } catch (e) { /* column may already exist */ }

    // Add paymentMode column to orders (CASH/CREDIT) — prevents double-counting in Day Start
    try {
      await db.sequelize.query(`DO $$ BEGIN CREATE TYPE "enum_orders_paymentMode" AS ENUM ('CASH', 'CREDIT'); EXCEPTION WHEN duplicate_object THEN null; END $$;`);
      await db.sequelize.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS "paymentMode" "enum_orders_paymentMode" NOT NULL DEFAULT 'CREDIT'`);

      // Step 1: Fix misclassified orders — any order with linked customer receipts (non-PAY-TOGGLE) is CREDIT
      const [fixedToCredit] = await db.sequelize.query(`
        UPDATE orders SET "paymentMode" = 'CREDIT'
        WHERE "paymentMode" = 'CASH'
          AND "isDeleted" = false
          AND EXISTS (
            SELECT 1 FROM payments
            WHERE payments."referenceId"::text = orders.id::text
              AND payments."referenceType" = 'order'
              AND payments."partyType" = 'customer'
              AND (payments."isDeleted" = false OR payments."isDeleted" IS NULL)
              AND (payments."paymentNumber" IS NULL OR payments."paymentNumber" NOT LIKE 'PAY-TOGGLE-%')
          )
        RETURNING id
      `);
      if (fixedToCredit.length > 0) console.log(`[MIGRATION] Fixed ${fixedToCredit.length} misclassified CASH→CREDIT orders (had linked receipts)`);

      // Step 2: Backfill remaining CREDIT→CASH for orders that are paid at POS with NO linked receipts
      const [backfilled] = await db.sequelize.query(`
        UPDATE orders SET "paymentMode" = 'CASH'
        WHERE "paymentMode" = 'CREDIT'
          AND "paymentStatus" = 'paid'
          AND "paidAmount" >= "total"
          AND "isDeleted" = false
          AND NOT EXISTS (
            SELECT 1 FROM payments
            WHERE payments."referenceId"::text = orders.id::text
              AND payments."referenceType" = 'order'
              AND payments."partyType" = 'customer'
              AND (payments."isDeleted" = false OR payments."isDeleted" IS NULL)
              AND (payments."paymentNumber" IS NULL OR payments."paymentNumber" NOT LIKE 'PAY-TOGGLE-%')
          )
        RETURNING id
      `);
      if (backfilled.length > 0) console.log(`[MIGRATION] Backfilled ${backfilled.length} orders as CASH mode (paid at POS, no receipts)`);
    } catch (e) { console.warn('[MIGRATION] paymentMode:', e.message); }

    // Add ORDER_PAYMENT_STATUS and CONFIRM_LINK to audit_logs action enum
    try {
      await db.sequelize.query("ALTER TYPE enum_audit_logs_action ADD VALUE IF NOT EXISTS 'ORDER_PAYMENT_STATUS'");
      await db.sequelize.query("ALTER TYPE enum_audit_logs_action ADD VALUE IF NOT EXISTS 'CONFIRM_LINK'");
    } catch (e) { /* values may already exist */ }

    // Start scheduled jobs (async, non-blocking)
    try {
      require('./src/scheduler').init(db);
    } catch (e) {
      console.warn('[SCHEDULER] Skipped — ' + e.message);
    }

    console.log(`Server started on port: ${PORT}`);
  } catch (err) {
    console.error('Error during server startup:', err);
    process.exit(1);
  }
});
