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

    // Start scheduled jobs (async, non-blocking)
    try {
      require('./src/scheduler').init(db);
    } catch (e) {
      console.warn('[SCHEDULER] Skipped — ' + e.message);
    }

    // One-time bulk reconciliation: apply unlinked payments to unpaid orders
    (async () => {
      try {
        const { Op } = require('sequelize');
        const unlinked = await db.payment.findAll({
          where: { partyType: 'customer', referenceType: { [Op.ne]: 'order' }, isDeleted: false, referenceId: null },
          order: [['createdAt', 'ASC']]
        });
        if (unlinked.length === 0) { console.log('[RECONCILE] No unlinked payments found.'); return; }

        // Group by customer (partyId)
        const byCustomer = {};
        for (const p of unlinked) {
          const key = p.partyId || p.partyName;
          if (!byCustomer[key]) byCustomer[key] = [];
          byCustomer[key].push(p);
        }

        let totalFixed = 0;
        for (const [custKey, payments] of Object.entries(byCustomer)) {
          const isUUID = /^[0-9a-f]{8}-/.test(custKey);
          const whereOrder = isUUID
            ? { customerId: custKey, isDeleted: false, paymentStatus: { [Op.in]: ['unpaid', 'partial'] } }
            : { customerName: custKey, customerId: null, isDeleted: false, paymentStatus: { [Op.in]: ['unpaid', 'partial'] } };

          const unpaidOrders = await db.order.findAll({ where: whereOrder, order: [['createdAt', 'ASC']] });
          if (unpaidOrders.length === 0) continue;

          let pIdx = 0, oIdx = 0;
          while (pIdx < payments.length && oIdx < unpaidOrders.length) {
            const pay = payments[pIdx];
            const ord = unpaidOrders[oIdx];
            const due = Number(ord.dueAmount) || 0;
            const amt = Number(pay.amount) || 0;
            if (due <= 0) { oIdx++; continue; }
            if (amt <= 0) { pIdx++; continue; }

            const apply = Math.min(amt, due);
            const t = await db.sequelize.transaction();
            try {
              if (apply >= amt) {
                await pay.update({ referenceType: 'order', referenceId: ord.id, referenceNumber: ord.orderNumber }, { transaction: t });
                pIdx++;
              } else {
                await pay.update({ amount: amt - apply }, { transaction: t });
              }
              const newPaid = Math.round((Number(ord.paidAmount) + apply) * 100) / 100;
              const newDue = Math.round(Math.max(0, Number(ord.total) - newPaid) * 100) / 100;
              await ord.update({ paidAmount: newPaid, dueAmount: newDue, paymentStatus: newDue <= 0 ? 'paid' : 'partial' }, { transaction: t });
              await t.commit();
              totalFixed++;
              if (newDue <= 0) oIdx++;
            } catch (e) { await t.rollback(); pIdx++; }
          }
        }
        if (totalFixed > 0) console.log(`[RECONCILE] Fixed ${totalFixed} unlinked payment(s) on startup.`);
        else console.log('[RECONCILE] All payments already linked.');
      } catch (e) { console.warn('[RECONCILE] Startup reconciliation skipped:', e.message); }
    })();

    console.log(`Server started on port: ${PORT}`);
  } catch (err) {
    console.error('Error during server startup:', err);
    process.exit(1);
  }
});
