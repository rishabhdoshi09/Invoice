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

### Phase 12: Double-Counting Fix (Mar 16, 2026)
**Root cause:** When a credit sale was toggled to "paid" after a customer receipt, the same money appeared in both Cash Sales AND Customer Receipts.

**Fix implemented:**
- **paymentMode field** added to orders: `CASH` (paid at POS) or `CREDIT` (unpaid at creation). Set at creation, NEVER changes.
- **Cash Sales = SUM(total) WHERE paymentMode='CASH'** — Not derived from paidAmount
- **Toggle simplified**: Only updates `paymentStatus` and `dueAmount`. Does NOT change `paidAmount` or create synthetic `PAY-TOGGLE` payments
- **Customer Receipts**: Excludes legacy `PAY-TOGGLE-*` payment records
- **Backfill migration**: Existing paid orders (no modifiedByName) → CASH, all others → CREDIT
- **Formula**: `Expected Cash = Opening Balance + Cash Sales (CASH orders) + Customer Receipts - Supplier Payments - Expenses`
- **Testing**: 13/13 tests passed (iteration_25)

### Phase 11: Critical Bug Fixes (Feb 15, 2026)
- **Bug 1 FIXED:** `linkSuggestion is not defined` — Variable scoping issue
- **Bug 2 FIXED:** `ORDER_PAYMENT_STATUS` and `CONFIRM_LINK` enum values added to audit_logs
- **Testing**: 16/16 tests passed (iteration_24)

### Phase 10: Presidential Authority + Full Audit Trail (Feb 2026)
- No silent operations: Customer linking requires user confirmation via `linkSuggestion`
- Full audit trail with before/after values for all financial operations
- Audit Trail tab in Ledger with filters
- Toggle fix: paid→unpaid no longer hard-deletes payments
- Merge/Link requires typed confirmation + admin role

### Phase 9: Forensic + FIFO Merged Reconstruction
- Forensic classification with FIFO tool — only resets SYSTEM_TOGGLED orders
- Customer balance recalculation after FIFO
- DB Backup button

### Phases 1-8: All Completed
- Full invoicing, double-entry ledger, audit logging, PDF generation
- Tally-Correct System Hardening, Receipt Allocation, Invoice Immutability
- Automation Removal, Forensic Audit, Payment Recovery
- Telegram/WhatsApp, GST/Tally export

## Key Data Model Changes
### orders.paymentMode (ENUM: CASH/CREDIT)
- **CASH**: paidAmount >= total at creation (POS sale)
- **CREDIT**: paidAmount = 0 or partial at creation
- **IMMUTABLE**: Never changes after creation, even on toggle
- Used for Day Start Cash Sales calculation

## Key API Endpoints
- `POST /api/orders` — Sets paymentMode at creation
- `PATCH /api/orders/:id/payment-status` — Toggle (status only, no paidAmount/paymentMode changes)
- `GET /api/dashboard/summary/realtime/:date` — Day Start with paymentMode-based Cash Sales
- `POST /api/orders/:id/confirm-link` — Link order to customer with audit
- `GET /api/data-audit/classify` — Forensic classification
- `POST /api/data-audit/reconstruct-fifo` — FIFO reconstruction
- `GET /api/audit-trail` — Audit log viewer

## Key Files
- `backend/src/models/order.js` — paymentMode ENUM field
- `backend/src/controller/order.js` — createOrder (paymentMode), togglePaymentStatus (simplified)
- `backend/src/services/dailySummary.js` — getRealTimeSummary (Cash Sales from CASH orders)
- `backend/src/services/telegramAlert.js` — Cash calculation using paymentMode
- `backend/src/middleware/auditLogger.js` — Central audit log
- `backend/index.js` — Auto-migration for paymentMode + backfill
- `frontend/src/components/admin/dayStart/DayStart.jsx` — Day Start UI

## Audit Log Action ENUM Values
CREATE, UPDATE, DELETE, RESTORE, LOGIN, LOGOUT, LOGIN_FAILED, VIEW, ORDER_PAYMENT_STATUS, CONFIRM_LINK

### P0 — User Verification Pending
- Dry Run of data repair tool (forensic classification accuracy check)
- Verify Day Start numbers on production data match expected values

### P1 — Upcoming
- Admin UI for Customer Management (duplicates/ghosts/merge interface)
- Core ledger reports UI (Trial Balance, P&L, Balance Sheet)
- Toggle paid → auto-allocate from On Account payments

### P2 — Future
- Telegram alert stability (retry for ENETUNREACH)
- Concurrency review (FOR UPDATE row-level locks)
- RBAC (Role-Based Access Control)
- Financial period lock, Reconciliation dashboard
- Credit Note / Debit Note voucher types

### Refactoring Needed
- Break down forensicClassification.js into smaller modules

## Test Credentials
- Username: admin / Password: yttriumR
