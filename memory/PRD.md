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
9. **Real-Time Alerts**: Telegram bot for instant fraud alerts and new bill notifications.
10. **Alt Name Support**: Include product alternate names in Telegram bill alerts.

## Architecture
```
backend/src/
  models/       → account.js, journalBatch.js, ledgerEntry.js, billAuditLog.js, weightLog.js
  services/     → ledgerService.js, ledgerMigrationService.js, realTimeLedger.js, telegramAlert.js
  controller/   → ledger.js, audit.js, telegram.js, order.js
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
- `POST /api/telegram/full-audit-report` — send audit report to Telegram
- `POST /api/migrations/backfill-cash-receipts` — fix historical ledger drift

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
- [x] Tally-style Supplier Ledger — Redesigned supplier detail dialog
- [x] Smart Quick Entry Bar — Streamlined entry for suppliers, payments, purchases
- [x] Payment Status Toggle ↔ Ledger Integration
- [x] Invoice Cash Receipt Posting
- [x] Telegram Fraud Alert Bot — Real-time alerts for all suspicious activities
- [x] Daily fraud summary via Telegram (9:00 PM IST)
- [x] Full audit report to Telegram (mirrors /bill-audit page)
- [x] "Send Report to Telegram" button on bill-audit page
- [x] Alt Name (altName) support in Telegram bill creation alerts
- [x] Closing balance (Expected Cash in Drawer) in Telegram bill alerts
- [x] Supplier auto-fill & batch mode in purchase bill / payment forms
- [x] Quick Sale tab on Customers page for rapid date-wise bulk entry with batch mode
- [x] IPv4 network fix for Telegram (dns.setDefaultResultOrder)
- [x] Database migration system using sequelize-cli
- [x] Historical data backfill for ledger drift

## Prioritized Backlog

### P0 — Critical Security (Next)
- [ ] Add rate limiting (`express-rate-limit`) to all API endpoints
- [ ] Restrict CORS to specific frontend domain
- [ ] Disable `/api/auth/setup` endpoint after first admin created
- [ ] Add `FOR UPDATE` row locks in payment toggle, order create, payment create

### P1 — Core Features
- [ ] Present comprehensive code audit report to user
- [ ] Frontend reports: Account Ledger, Trial Balance, P&L, Balance Sheet
- [ ] Add input validation (Joi) to remaining 7 controllers
- [ ] Set up automated database backup (pg_dump cron)

### P2 — Future
- [ ] Centralize error handling with middleware
- [ ] Structured logging (winston/pino)
- [ ] Split large controllers into smaller modules
- [ ] Role-Based Access Control (RBAC)
- [ ] Weekly biller activity summary report
- [ ] Frontend state management refactor (Redux/Zustand)

## Known Issues
- Old invoice module balance calculations are fragile (will be superseded by ledger)
- PostgreSQL not available in preview pod by default (user tests locally)
- User's local dev env has IPv6 connectivity issues (code workaround in place)

## Test Credentials
- Username: `Rishabh`, Password: `molybdenumR@99877`
- Telegram Bot Token: `8336582297:AAF3EtRshWDu3p57L9SHaWd3RvALD2OIrc8`
- Telegram Chat ID: `6016362708`
