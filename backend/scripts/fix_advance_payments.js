/**
 * One-time migration script: Fix historical advance payment double-counting
 * 
 * Problem: Advance payments (referenceType='advance', referenceId=NULL) represent
 * money that may have ALSO been recorded as order.paidAmount, causing double-counting
 * in customer balance calculations.
 * 
 * Solution: For each customer with standalone advances AND fully-paid orders,
 * retroactively link advances to orders (FIFO) to prevent double-counting.
 * 
 * Usage: node scripts/fix_advance_payments.js [--dry-run]
 */

const db = require('../src/models');
const { Op } = require('sequelize');

const isDryRun = process.argv.includes('--dry-run');

async function fixAdvancePayments() {
    console.log(`\n=== Fix Advance Payment Double-Counting ${isDryRun ? '(DRY RUN)' : ''} ===\n`);

    try {
        await db.sequelize.authenticate();
        console.log('Database connected.\n');

        // Find all standalone advance payments for customers
        const advances = await db.payment.findAll({
            where: {
                partyType: 'customer',
                referenceType: 'advance',
                isDeleted: false,
                referenceId: null
            },
            order: [['createdAt', 'ASC']]
        });

        console.log(`Found ${advances.length} standalone advance payments.\n`);

        if (advances.length === 0) {
            console.log('Nothing to fix. Exiting.');
            process.exit(0);
        }

        // Group advances by customer (partyId or partyName)
        const customerAdvances = {};
        for (const adv of advances) {
            const key = adv.partyId || adv.partyName;
            if (!customerAdvances[key]) customerAdvances[key] = [];
            customerAdvances[key].push(adv);
        }

        let totalFixed = 0;
        let totalAmount = 0;

        for (const [customerKey, custAdvances] of Object.entries(customerAdvances)) {
            // Find orders for this customer that are PAID but were originally credit
            // (i.e., orders where paidAmount > 0 and there's a matching advance)
            const whereCondition = {
                isDeleted: false,
                paymentStatus: ['unpaid', 'partial']
            };

            // Match by customerId or customerName
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerKey);
            if (isUUID) {
                whereCondition.customerId = customerKey;
            } else {
                whereCondition.customerName = customerKey;
            }

            const unpaidOrders = await db.order.findAll({
                where: whereCondition,
                order: [['createdAt', 'ASC']]
            });

            if (unpaidOrders.length === 0) {
                console.log(`  Customer "${customerKey}": ${custAdvances.length} advance(s), but no unpaid orders → skipping`);
                continue;
            }

            console.log(`  Customer "${customerKey}": ${custAdvances.length} advance(s), ${unpaidOrders.length} unpaid order(s)`);

            // FIFO: apply advances to unpaid orders
            let advIdx = 0;
            let orderIdx = 0;
            let advRemaining = Number(custAdvances[0].amount);

            while (advIdx < custAdvances.length && orderIdx < unpaidOrders.length) {
                const advance = custAdvances[advIdx];
                const order = unpaidOrders[orderIdx];
                const orderDue = Number(order.dueAmount) || (Number(order.total) - Number(order.paidAmount));

                if (orderDue <= 0) {
                    orderIdx++;
                    continue;
                }

                const consumeAmount = Math.min(advRemaining, orderDue);

                console.log(`    → Apply ₹${consumeAmount} from ${advance.paymentNumber} to order ${order.orderNumber}`);

                if (!isDryRun) {
                    await db.sequelize.transaction(async (t) => {
                        if (consumeAmount >= advRemaining) {
                            // Full consumption of this advance
                            await advance.update({
                                referenceType: 'order',
                                referenceId: order.id,
                                referenceNumber: order.orderNumber
                            }, { transaction: t });
                        } else {
                            // Partial consumption: reduce advance amount
                            await advance.update({
                                amount: advRemaining - consumeAmount
                            }, { transaction: t });
                        }

                        // Update order
                        const newPaid = Number(order.paidAmount || 0) + consumeAmount;
                        const newDue = Math.max(0, Number(order.total) - newPaid);
                        let status = 'unpaid';
                        if (newPaid >= Number(order.total)) status = 'paid';
                        else if (newPaid > 0) status = 'partial';

                        await order.update({
                            paidAmount: newPaid,
                            dueAmount: newDue,
                            paymentStatus: status
                        }, { transaction: t });
                    });
                }

                totalFixed++;
                totalAmount += consumeAmount;

                advRemaining -= consumeAmount;
                const orderNewDue = orderDue - consumeAmount;

                if (advRemaining <= 0) {
                    advIdx++;
                    if (advIdx < custAdvances.length) {
                        advRemaining = Number(custAdvances[advIdx].amount);
                    }
                }
                if (orderNewDue <= 0) {
                    orderIdx++;
                }
            }
        }

        console.log(`\n=== Summary ===`);
        console.log(`Allocations made: ${totalFixed}`);
        console.log(`Total amount allocated: ₹${totalAmount}`);
        console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes made)' : 'LIVE (changes committed)'}`);

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }

    process.exit(0);
}

fixAdvancePayments();
