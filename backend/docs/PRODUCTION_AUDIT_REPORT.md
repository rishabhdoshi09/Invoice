# PRODUCTION AUDIT REPORT - Critical Loopholes Found
## Date: February 13, 2026

---

## 🔴 CRITICAL LOOPHOLES (Must Fix)

### LOOPHOLE 1: Orphaned Credit Sales
**Issue:** Orders with `customerName` but no `customerId` don't appear in customer ledger.
**Impact:** ₹5,900 in receivables are invisible in customer ledger.
**Root Cause:** Old orders or orders created via certain paths don't link to customer record.
**Fix Required:**
```sql
-- Fix orphaned orders by creating/linking customers
UPDATE orders o
SET "customerId" = c.id
FROM customers c
WHERE o."customerName" = c.name
AND o."customerId" IS NULL
AND o."isDeleted" = false;
```

### LOOPHOLE 2: Customer Balance Not Calculated Dynamically
**Issue:** `currentBalance` in customers table is stored and can get out of sync.
**Impact:** Customer ledger shows wrong balance.
**Root Cause:** Balance is stored as a field instead of calculated from transactions.
**Fix Required:** Always calculate balance as: `openingBalance + SUM(orders.dueAmount) - SUM(payments.amount)`

### LOOPHOLE 3: Delete Order Doesn't Reverse Customer Balance
**Issue:** When an order is deleted, customer's `currentBalance` is NOT reduced.
**Location:** `/backend/src/controller/order.js` - `deleteOrder` function
**Impact:** Customer balance remains inflated after order deletion.

### LOOPHOLE 4: Payment Status Toggle - Missing Transaction
**Issue:** `togglePaymentStatus` updates customer balance without database transaction.
**Location:** `/backend/src/controller/order.js` - line 645-662
**Impact:** If update fails midway, data becomes inconsistent.

### LOOPHOLE 5: Credit Sale Customer Creation Race Condition
**Issue:** When creating credit sale, customer lookup by name can create duplicates.
**Location:** `/backend/src/controller/order.js` - lines 94-131
**Impact:** Same customer can exist twice with different IDs.

---

## 🟡 MEDIUM PRIORITY ISSUES

### ISSUE 1: Ledger Entries Not Created for Toggle Status
**Issue:** When toggling paid→unpaid, ledger entries are not updated.
**Impact:** Double-entry accounting is broken for status changes.

### ISSUE 2: Order Delete Doesn't Remove Ledger Entries
**Issue:** Deleting an order leaves orphan ledger entries.
**Impact:** Accounting reports will be incorrect.

### ISSUE 3: Daily Summary Uses createdAt, Frontend Uses orderDate
**Issue:** Mismatch between how backend calculates totals vs what's displayed.
**Impact:** Day Start page may show different totals than expected.

### ISSUE 4: Payment Delete Missing Transaction Wrapper
**Issue:** `/backend/src/controller/payment.js` - `deletePayment` references `transaction` variable that doesn't exist.
**Location:** Line 391
**Impact:** Error when deleting payments, ledger entries not cleaned up.

---

## 🟢 RECOMMENDATIONS

1. **Use Calculated Balances:** Don't store `currentBalance`. Calculate it from transactions.

2. **Wrap All Financial Operations in Transactions:**
   ```javascript
   await db.sequelize.transaction(async (t) => {
       // All updates here
   });
   ```

3. **Add Database Constraints:**
   ```sql
   ALTER TABLE orders ADD CONSTRAINT orders_customer_fk 
   FOREIGN KEY ("customerId") REFERENCES customers(id);
   ```

4. **Create Audit Trail:** Log all balance changes with before/after values.

5. **Add Reconciliation Script:** Daily job to verify balances match transactions.

---

## IMMEDIATE ACTION ITEMS

1. Fix `deletePayment` transaction bug (syntax error)
2. Add transaction wrapper to `togglePaymentStatus`
3. Fix orphaned orders (link to customers)
4. Add customer balance reversal on order delete
5. Recalculate all customer balances from transactions
