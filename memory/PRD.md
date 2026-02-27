# Product Requirements Document — Accounting Ledger Module

## Original Problem Statement
Build a production-grade, double-entry accounting ledger module on top of an existing invoicing application (React + Express + PostgreSQL). The module must be additive and reversible — no modifications to existing `orders` or `payments` tables.

Additionally, the user suspects billing fraud and needs a comprehensive **Bill Tampering Audit Trail** to silently log item deletions, bill deletions, and weight scale usage.

## Core Requirements
1. **Additive Architecture**: New tables (`accounts`, `journal_batches`, `ledger_entries`) without altering existing tables.
2. **Double-Entry Principle**: Every financial event recorded as balanced debit/credit entries.
3. **Calculated Balances**: No stored balances — always computed from ledger entries.
4. **Data Migration**: Repeatable, reversible migration of historical data from `orders`/`payments`.
5. **Safety & Production-Readiness**: DB transactions, validation, indexes, FK constraints.
6. **UI Integration**: `/ledger` tab for reports and migration tools.
7. **Fraud Detection**: Silent audit trail logging item deletions, bill deletions, weight scale usage.
8. **Tally-style Supplier Ledger**: Date-sorted, debit/credit/running balance view.

## Architecture
```
backend/src/
  models/       → account.js, journalBatch.js, ledgerEntry.js, billAuditLog.model.js, weightLog.model.js
  services/     → ledgerService.js, ledgerMigrationService.js, realTimeLedger.js
  controller/   → ledger.js, audit.js
  routes/       → ledger.js, audit.js
frontend/src/
  components/admin/ledger/ → LedgerModule.jsx
  components/admin/audit/ → BillAuditLogs.jsx
  components/admin/suppliers/ → list.jsx (Tally-style ledger)
```

## Key API Endpoints
- `POST /api/ledger/accounts/initialize` — seed chart of accounts
- `GET /api/ledger/accounts` — list accounts
- `POST /api/ledger/journal-batches` — create journal batch
- `GET /api/ledger/health-check` — system-wide debit/credit balance check
- `POST /api/ledger/migration/run` — run data migration
- `GET /api/ledger/reports/trial-balance`
- `GET /api/ledger/reports/profit-loss`
- `GET /api/ledger/reports/balance-sheet`
- `POST /api/audit/item-deleted` — log item deletion
- `GET /api/audit/tampering-logs` — get audit logs
- `POST /api/audit/weight-capture` — log weight fetch

## What's Been Implemented

### Completed (Feb 2026)
- [x] Ledger module scaffolding: models, services, controller, routes
- [x] Chart of accounts with 18 default accounts
- [x] Double-entry journal batch creation with full validation
- [x] Safe Verification Mode (17/17 tests passed)
- [x] Safe Reconciliation Validator
- [x] Real-Time Ledger Posting (SAFE PARALLEL MODE)
- [x] Purchase Bill + Supplier Payment → Ledger Posting
- [x] Daily Drift Check
- [x] Ledger Admin Dashboard (frontend `/ledger`)
- [x] Soft Delete + Ledger Reversal
- [x] Journal batch reversal
- [x] Report queries: Trial Balance, P&L, Balance Sheet, Account Ledger
- [x] Migration service
- [x] Fraud Detection & Audit Trail (bill_audit_logs, weight_logs)
- [x] Admin-only Bill Audit Trail page (`/bill-audit`)
- [x] **Tally-style Supplier Ledger** — Redesigned supplier detail dialog
- [x] **Smart Quick Entry Bar** — Streamlined entry for suppliers, payments, purchases
- [x] **Payment Status Toggle ↔ Ledger Integration** — When toggling orders between paid/unpaid:
  - `paid → unpaid`: Posts PAYMENT_TOGGLE reversal (DR Customer Receivable, CR Cash)
  - `unpaid → paid`: Posts PAYMENT_TOGGLE receipt (DR Cash, CR Customer Receivable)
  - All toggles create permanent, balanced journal batches with full audit trail
- [x] **Invoice Cash Receipt Posting** — When orders are created as "paid", now correctly posts both:
  - INVOICE batch: DR Customer Receivable, CR Sales Revenue (the sale)
  - INVOICE_CASH batch: DR Cash, CR Customer Receivable (the cash receipt)
  - This fixes the root cause of drift between old system and ledger for paid orders
- [x] **Telegram Fraud Alert Bot** — Real-time alerts to admin's phone via Telegram:
  - Instant alerts: Item deleted from bill, bill deleted, payment status toggled
  - Daily summary at 9:00 PM IST with red flag analysis
  - Full audit report to Telegram (mirrors /bill-audit page completely):
    - Tab 1: Item Deletions — product name, qty, price, value, type (Scale/Manual), by whom, time, invoice#, customer
    - Tab 2: Weight Fetches — consumed vs unmatched, with details
    - Payment Toggles — all status changes with amounts and descriptions
    - Alert levels: 🟢 ALL CLEAR / 🟡 NEEDS ATTENTION / 🔴 HIGH RISK
  - "Send Report to Telegram" button on the bill-audit page UI
  - API endpoints: test, daily-summary, full-report

## Prioritized Backlog

### P0 — Critical Security (Next)
- [ ] Add rate limiting (`express-rate-limit`) to all API endpoints
- [ ] Restrict CORS to specific frontend domain
- [ ] Disable `/api/auth/setup` endpoint after first admin created
- [ ] Add `FOR UPDATE` row locks in payment toggle, order create, payment create

### P1 — Core Features
- [ ] Frontend reports: Account Ledger, Trial Balance, P&L, Balance Sheet
- [ ] Add input validation (Joi) to remaining 7 controllers
- [ ] Set up automated database backup (pg_dump cron)
- [ ] Enhanced fraud alerts (price modification logging, suspicious activity thresholds)

### P2 — Future
- [ ] Centralize error handling with middleware
- [ ] Structured logging (winston/pino)
- [ ] Split large controllers into smaller modules
- [ ] Role-Based Access Control (RBAC)
- [ ] Weekly biller activity summary report
- [ ] Customer/Supplier balance comparison widget (old vs ledger)

## Known Issues
- Old invoice module balance calculations are fragile (will be superseded by ledger)
- PostgreSQL not available in preview pod by default (user tests locally)
- User's local dev env is fragile due to lack of automated DB migrations

## Test Credentials
- Username: `Rishabh`, Password: `molybdenumR@99877`
