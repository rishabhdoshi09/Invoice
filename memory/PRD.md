# Product Requirements Document — Accounting Ledger Module

## Original Problem Statement
Build a production-grade, double-entry accounting ledger module on top of an existing invoicing application (React + Express + PostgreSQL). The module must be additive and reversible — no modifications to existing `orders` or `payments` tables.

## Core Requirements
1. **Additive Architecture**: New tables (`accounts`, `journal_batches`, `ledger_entries`) without altering existing tables.
2. **Double-Entry Principle**: Every financial event recorded as balanced debit/credit entries.
3. **Calculated Balances**: No stored balances — always computed from ledger entries.
4. **Data Migration**: Repeatable, reversible migration of historical data from `orders`/`payments`.
5. **Safety & Production-Readiness**: DB transactions, validation, indexes, FK constraints.
6. **UI Integration**: `/ledger` tab for reports and migration tools.

## Architecture
```
backend/src/
  models/       → account.js, journalBatch.js, ledgerEntry.js
  services/     → ledgerService.js, ledgerMigrationService.js
  controller/   → ledger.js
  routes/       → ledger.js
frontend/src/
  components/admin/ledger/ → LedgerModule.jsx (placeholder)
```

## Key API Endpoints
- `POST /api/ledger/accounts/initialize` — seed chart of accounts
- `GET /api/ledger/accounts` — list accounts
- `POST /api/ledger/journal-batches` — create journal batch (validated, transactional)
- `GET /api/ledger/health-check` — system-wide debit/credit balance check
- `POST /api/ledger/migration/run` — run data migration
- `GET /api/ledger/migration/reconciliation` — old vs new balance comparison
- `GET /api/ledger/reports/trial-balance`
- `GET /api/ledger/reports/profit-loss`
- `GET /api/ledger/reports/balance-sheet`

## What's Been Implemented

### Completed (Feb 2026)
- [x] Ledger module scaffolding: models, services, controller, routes
- [x] Chart of accounts with 18 default accounts (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE)
- [x] Double-entry journal batch creation with full validation
- [x] **Safe Verification Mode** (all 6 features, 17/17 tests passed):
  1. DB transactions (atomic batch + entries)
  2. Strict validation (unbalanced, negative, empty, single-entry, all-zero rejection)
  3. Migration date preservation (uses `createdAt` from original records)
  4. DB indexes on `ledger_entries.accountId`, `ledger_entries.batchId`, `journal_batches.referenceType`
  5. FK constraints: `ledger_entries.accountId → accounts.id`, `ledger_entries.batchId → journal_batches.id`
  6. Health-check endpoint: `GET /api/ledger/health-check`
- [x] **Safe Reconciliation Validator** (`GET /api/ledger/migration/safe-reconciliation`):
  - Per-customer comparison: old balance (opening + SUM(dueAmount)) vs ledger balance
  - System-wide totals: Sales, Payments, Receivables cross-checked
  - Mismatch breakdown with batch-level detail and order-level detail
  - 100% read-only — verified with before/after row count check
- [x] **Real-Time Ledger Posting (SAFE PARALLEL MODE)**:
  - Invoice creation auto-posts INVOICE journal batch (DR Receivable, CR Sales)
  - Payment recording auto-posts PAYMENT journal batch (DR Cash, CR Receivable)
  - Wrapped in SAME transaction as original write (atomicity)
  - Old system (dueAmount/paidAmount) runs unchanged in parallel
  - Duplicate prevention via unique constraint on (referenceType, referenceId)
  - `[LEDGER] POSTED` logging for every batch
  - Fixed double-counting bug in payment.js (removed duplicate order update)
  - `ledger_entries.batchId`/`accountId` made nullable for old system coexistence
- [x] Journal batch reversal
- [x] Report queries: Trial Balance, P&L, Balance Sheet, Account Ledger
- [x] Migration service (orders, payments, purchases) — fixed association bug
- [x] Reconciliation report (old system vs ledger comparison)
- [x] Invoice View and Print features (old system)
- [x] Customer/supplier optional field bug fix (old system)
- [x] Balance calculation revert to stable formula (old system)

## Prioritized Backlog

### P0 — Next Up
- [ ] Build Ledger UI: migration trigger, reconciliation report, health dashboard
- [ ] Test migration end-to-end with real production data

### P1 — Core Features
- [ ] Frontend reports: Account Ledger, Trial Balance, P&L, Balance Sheet
- [ ] Real-time journal posting: hook order/payment creation into ledger
- [ ] Customer/Supplier balance comparison widget (old vs ledger)

### P2 — Future
- [ ] Deprecate old balance calculation; ledger becomes single source of truth
- [ ] Extend for Supplier accounts, Expenses, Bank Reconciliation, GST
- [ ] Refactor large frontend components (`orders/create.jsx`, `customers/list.jsx`)

## Known Issues
- Old invoice module balance calculations are fragile (will be superseded by ledger)
- PostgreSQL not available in preview pod by default (user tests locally)

## Test Credentials
- Username: `Rishabh`, Password: `molybdenumR@99877`
