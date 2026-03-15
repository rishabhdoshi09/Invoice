# Product Requirements Document — Customer Invoice System

## Original Problem Statement
Build a production-grade, double-entry accounting ledger with fraud prevention and data integrity. Fix critical data corruption where orders are incorrectly marked as "paid" by system auto-reconciliation.

**Critical Rule:** Order is paid ONLY when real payment entry exists against it. Human toggles are preserved, system toggles are undone.

## Core Architecture
- **Frontend:** React + Material-UI (port 3000)
- **Backend:** Node.js + Express + Sequelize ORM (port 8001)
- **Database:** PostgreSQL (port 5432)

## What's Been Implemented

### Phase 8: Forensic Classification Rewrite (Mar 15 2026)
- **Classification uses `modifiedByName`** as primary indicator:
  - `HUMAN_TOGGLED`: modifiedByName has real person → preserve
  - `SYSTEM_TOGGLED`: modifiedByName empty → undo
  - `CASH_SALE`: created as paid at POS → preserve
  - `RECEIPT_PAID` / `PARTIAL_PAID`: has receipt_allocations → preserve
  - `CREDIT_UNPAID`: already unpaid → no change
- Removed ADVANCE_PAID, PAYMENT_PAID, SUSPICIOUS_PAID categories
- All paid orders without receipt_allocations go through modifiedByName check
- **FIFO Reconstruction endpoint** (`POST /api/data-audit/reconstruct-fifo`):
  - Step 1: Reset system-toggled orders to unpaid (skip human toggles + cash sales)
  - Step 2: FIFO allocate existing payments against orders
  - Step 3: Update order statuses from allocations
  - Supports dry run
- **Toggle History tab** in customer dialog (audit_logs for ORDER_PAYMENT_STATUS)
- **Customer Notes tab** with save (notes TEXT column on customers)
- Auto-migration for notes column on startup
- Production data: 237 system-toggled, 18 human-toggled (Rishabh Doshi: 10, BIlling staff: 8)

### Earlier Phases (1-7) — All Completed
- Tally-Correct System Hardening, Receipt Allocation, Invoice Immutability
- Automation Removal (deleted auto-reconciliation)
- Forensic Audit Tool, Payment Recovery Script
- Full invoicing, double-entry ledger, audit logging, PDF generation
- Telegram/WhatsApp, GST/Tally export

## Key API Endpoints
- `GET /api/data-audit/classify` — Classification with modifiedByName logic
- `POST /api/data-audit/reconstruct-fifo` — FIFO reconstruction (dryRun support)
- `POST /api/data-audit/repair/preview` — Repair preview
- `POST /api/data-audit/repair/execute` — Execute repair
- `GET /api/data-audit/diagnose` — Diagnostic endpoint
- `GET /api/customers/:id/transactions` — Now includes toggleHistory

## Key Files
- `backend/src/controller/forensicClassification.js` — Classification + FIFO reconstruction
- `backend/src/dao/customer.js` — Customer data with toggle history
- `backend/src/routes/dataIntegrityAudit.js` — Routes
- `frontend/src/components/admin/customers/list.jsx` — Customer dialog with Toggle History + Notes tabs
- `backend/index.js` — Auto-migration for notes column

## Prioritized Backlog
### P0 — User Action Required
- Run classification on local DB, verify counts, execute reconstruct-fifo

### P1 — Upcoming
- Toggle paid → auto-allocate from On Account payments
- Core ledger reports UI (Trial Balance, P&L, Balance Sheet)

### P2 — Future
- RBAC, Financial period lock, Reconciliation dashboard
- Credit Note / Debit Note voucher types

## Test Credentials
- Username: admin / Password: yttriumR
