# Product Requirements Document — Customer Invoice System

## Original Problem Statement
Build a production-grade, double-entry accounting ledger with fraud prevention and data integrity. Fix critical data corruption where orders are incorrectly marked as "paid" by system auto-reconciliation.

**Critical Rule:** Order is paid ONLY when real payment entry exists against it. Human toggles are preserved, system toggles are undone.

**Guiding Principle:** "Bina President kuch nahi" — No silent operations. Every financial action must be explicitly authorized and leave an audit trail with before/after values.

## Core Architecture
- **Frontend:** React + Material-UI (port 3000)
- **Backend:** Node.js + Express + Sequelize ORM (port 8001)
- **Database:** PostgreSQL 15 (port 5432)

## What's Been Implemented

### Phase 11: Critical Bug Fixes (Feb 15, 2026)
- **Bug 1 FIXED:** `linkSuggestion is not defined` — Variable was declared inside transaction scope but referenced outside. Moved declaration before transaction block.
- **Bug 2 FIXED:** `invalid input value for enum "ORDER_PAYMENT_STATUS"` — Added `ORDER_PAYMENT_STATUS` and `CONFIRM_LINK` to PostgreSQL `enum_audit_logs_action` via ALTER TYPE + Sequelize model update.
- **Migration:** `20260215000001-add-audit-enum-values.js` created for the enum changes.
- **Day Start Cash Verification:** User verified formula consistency between UI and backend — confirmed correct.
- **Testing:** 16/16 backend tests passed via testing agent (iteration_24).

### Phase 10: Presidential Authority + Full Audit Trail (Feb 2026)
- **No silent operations**: Customer linking requires user confirmation via `linkSuggestion` prompt
- **Full audit trail**: Every payment create/delete, customer delete/merge/link-orphans, order confirm-link now creates audit_log
- **One-click Audit Trail tab**: New "Audit Trail" tab in Ledger with filters (action, entity, user, date, search) + summary chips + color-coded table
- **API**: `GET /api/audit-trail` with query filters
- **Toggle fix**: paid→unpaid now SOFT-deletes only `PAY-TOGGLE-*` payments (not all payments)
- **Hard delete**: Customer delete properly unlinks orders/payments first
- **Merge/Link**: Requires typed confirmation ("MERGE"/"LINK") + admin role

### Phase 9: Forensic + FIFO Merged Reconstruction (Feb 2026)
- Merged forensic classification with FIFO tool — classifies ALL orders first
- Only resets `SYSTEM_TOGGLED` orders within damage window
- Preserves: `HUMAN_TOGGLED`, `CASH_SALE`, `RECEIPT_PAID`, `PARTIAL_PAID`, `CREDIT_UNPAID`
- Customer balance recalculation after FIFO
- DB Backup button: One-click `pg_dump` download before executing

### Phase 8: Forensic Classification Rewrite
- Classification uses `modifiedByName` as primary indicator
- FIFO Reconstruction endpoint (`POST /api/data-audit/reconstruct-fifo`)
- Toggle History tab in customer dialog
- Customer Notes tab

### Earlier Phases (1-7) — All Completed
- Tally-Correct System Hardening, Receipt Allocation, Invoice Immutability
- Automation Removal (deleted auto-reconciliation)
- Forensic Audit Tool, Payment Recovery Script
- Full invoicing, double-entry ledger, audit logging, PDF generation
- Telegram/WhatsApp, GST/Tally export

## Key API Endpoints
- `POST /api/orders` — WORKING (Bug 1 fixed)
- `PATCH /api/orders/:id/payment-status` — WORKING (Bug 2 fixed)
- `POST /api/orders/:id/confirm-link` — Links order to customer with audit trail
- `GET /api/data-audit/classify` — Classification with modifiedByName logic
- `POST /api/data-audit/reconstruct-fifo` — FIFO reconstruction (dryRun support)
- `GET /api/customers/duplicates` — Find duplicate customers
- `GET /api/customers/ghosts` — Find orphaned records
- `POST /api/customers/:targetId/merge` — Merge customers
- `GET /api/audit-trail` — Fetch audit logs with filters

## Key Files
- `backend/src/controller/order.js` — Order CRUD + toggle + confirm-link
- `backend/src/controller/forensicClassification.js` — Classification + FIFO reconstruction
- `backend/src/middleware/auditLogger.js` — Central audit log function
- `backend/src/models/auditLog.js` — Audit log model with full ENUM
- `backend/src/migrations/20260215000001-add-audit-enum-values.js` — Enum migration
- `frontend/src/components/admin/ledger/LedgerModule.jsx` — Repair tool + audit trail UI

## Audit Log Action ENUM Values
CREATE, UPDATE, DELETE, RESTORE, LOGIN, LOGOUT, LOGIN_FAILED, VIEW, ORDER_PAYMENT_STATUS, CONFIRM_LINK

### P0 — User Verification Pending
- Dry Run of data repair tool (forensic classification accuracy check)

### P1 — Upcoming
- Admin UI for Customer Management (duplicates/ghosts/merge interface)
- Core ledger reports UI (Trial Balance, P&L, Balance Sheet)
- Toggle paid → auto-allocate from On Account payments

### P2 — Future
- Telegram alert stability (retry mechanism for ENETUNREACH)
- Concurrency review (FOR UPDATE row-level locks)
- RBAC (Role-Based Access Control)
- Financial period lock
- Reconciliation dashboard
- Credit Note / Debit Note voucher types

### Refactoring Needed
- Break down `forensicClassification.js` into smaller modules

## Test Credentials
- Username: admin / Password: yttriumR
