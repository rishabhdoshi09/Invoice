# Product Requirements Document — Customer Invoice System

## Original Problem Statement
Build a production-grade, double-entry accounting ledger with fraud prevention and data integrity. Fix critical data corruption where orders are incorrectly marked as "paid" by system auto-reconciliation.

**Critical Rules:**
- Order is paid ONLY when real payment entry exists against it
- "Bina President kuch nahi" — No silent operations. Every financial action must be explicitly authorized with full audit trail
- Cash Sales derived ONLY from paymentMode='CASH', NEVER from paidAmount

## Core Architecture
- **Frontend:** React + Material-UI (port 3000)
- **Backend:** Node.js + Express + Sequelize ORM (port 8001)
- **Database:** PostgreSQL 15 (port 5432)

## What's Been Implemented

### Phase 14: Critical Accounting Bug Fixes (Mar 17, 2026)
- **P0 FIXED - Double-counting in Day Start:** Backfill migration in `index.js` now correctly classifies orders — checks for linked payment receipts (excluding PAY-TOGGLE) before marking as CASH. Orders with ANY real customer receipts are classified as CREDIT, even if fully paid. Result: Cash Sales and Customer Receipts no longer overlap.
- **P1 FIXED - Customer balance corruption:** `listCustomersWithBalance` SQL query now excludes `PAY-TOGGLE-*` payments from `total_received`/`totalCredit`. 4 legacy PAY-TOGGLE records (₹2500) no longer inflate customer balances.
- **P2 FIXED - Invalid date in Payments tab:** `moment(payment.paymentDate, ['DD-MM-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY']).format('DD-MM-YYYY')` — explicit input format parsing prevents "Invalid date" display.
- **Testing:** 100% pass rate (backend pytest + Playwright frontend), iteration_26.

### Phase 13: Inline Receipt Details + Amount Fix (Mar 16, 2026)
- **Inline Receipt Details:** "From Customers" card now expands to show receipt table inline on the page (not in a dialog). Shows: Payment No, Time, Party Name, Amount, Reference, Linked To, Notes + Total row
- **All summary cards expandable**: Total Payments (with Type column), From Customers, To Suppliers, Expenses
- **Active card state**: Colored border + elevated shadow on selected card
- **String concatenation fix**: `p.amount` from PostgreSQL is a string — added `Number()` conversion in both backend (`getDailySummary`) and frontend to prevent `₹01000.00` bug
- **Amount formatting**: Consistent `toLocaleString('en-IN', { minimumFractionDigits: 2 })` across all amounts

### Phase 12: Double-Counting Fix (Mar 16, 2026)
- **paymentMode field** added to orders: `CASH` (paid at POS) or `CREDIT` (unpaid at creation). Set at creation, NEVER changes.
- **Cash Sales = SUM(total) WHERE paymentMode='CASH'** — Not from paidAmount
- **Toggle simplified**: Only updates `paymentStatus` and `dueAmount`. No synthetic `PAY-TOGGLE` payments, no paidAmount changes
- **Customer Receipts**: Excludes legacy `PAY-TOGGLE-*` payment records
- **Formula**: `Expected Cash = Opening + Cash Sales (CASH orders) + Customer Receipts - Supplier Payments - Expenses`

### Phases 1-11: All Completed
- Full invoicing, double-entry ledger, audit logging, PDF generation
- Forensic classification + FIFO reconstruction
- Tally-Correct System Hardening, Receipt Allocation
- Automation Removal, Payment Recovery
- Telegram/WhatsApp, GST/Tally export
- Presidential Authority + Full Audit Trail
- Critical Bug Fixes (linkSuggestion, ENUM values)

## Key Data Model
### orders.paymentMode (ENUM: CASH/CREDIT)
- CASH: paidAmount >= total at creation AND no linked payment receipts (POS sale)
- CREDIT: paidAmount = 0 or partial at creation, OR has linked payment receipts
- IMMUTABLE: Never changes after creation

## Key API Endpoints
- `POST /api/orders` — Sets paymentMode at creation
- `PATCH /api/orders/:id/payment-status` — Toggle (status only)
- `GET /api/dashboard/summary/realtime/:date` — Day Start with CASH-based Cash Sales
- `GET /api/payments/daily-summary?date=` — Daily payment summary with breakdown
- `GET /api/customers/with-balance` — Customer balances excluding PAY-TOGGLE
- `GET /api/audit-trail` — Audit log viewer

## Pending Tasks

### P0 — User Verification
- Verify Day Start numbers on production data
- Dry Run of data repair tool

### P1 — Upcoming
- Admin UI for Customer Management (duplicates/ghosts/merge)
- Core ledger reports (Trial Balance, P&L, Balance Sheet)
- Admin Dashboard "Today's Sales" string concat bug fix

### P2 — Future
- Telegram alert stability, Concurrency review, RBAC
- Financial period lock, Credit/Debit notes

### Refactoring
- Move backfill logic from index.js to proper one-time migration file
- Break down forensicClassification.js

## Test Credentials
- Username: admin / Password: yttriumR
