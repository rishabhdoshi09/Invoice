# Product Requirements Document — Customer Invoice System

## Original Problem Statement
Build a production-grade, double-entry accounting ledger with a focus on fraud prevention and data integrity, similar in sophistication to Tally ERP. Key requirements include logging suspicious activities, providing an admin audit trail, improving UI/UX for financial entries, and ensuring ledger integrity.

**Critical User Rule (NON-NEGOTIABLE):** "This software won't without my (or biller's) authorisation or intervention do unpaid orders or credit sale orders to paid. This is serious."
- NO automatic FIFO reconciliation
- NO automatic payment-to-invoice matching
- NO automatic status changes on orders/invoices
- ALL payment allocation MUST be explicit user action via `POST /api/receipts/allocate`

**Golden Forensic Rule:** "Agar status change hua hai, to log hona hi chahiye. Log nahi hai to change system bug hai."
(If a status change happened, there must be a log. No log = system bug.)

## Core Architecture
- **Frontend:** React + Material-UI (port 3000)
- **Backend:** Node.js + Express + Sequelize ORM (port 8001)
- **Database:** PostgreSQL (port 5432)
- **3rd Party:** Telegram Bot API, WhatsApp Web, RS232 Weight Scale, node-cron

## What's Been Implemented

### Phase 1+2: Tally-Correct System Hardening (Completed - Mar 13 2026)

#### 1. Ledger-Authoritative Balance (Tally Formula)
- Customer balance = `opening + sum(ledger debits) - sum(ledger credits)`
- Falls back to `opening + sum(dueAmount)` when no ledger entries exist
- Balance source indicator (Ledger / Orders) shown in UI
- File: `backend/src/dao/customer.js`

#### 2. Receipt Allocation (Tally's Bill-Wise / Against Ref)
- New `receipt_allocations` table tracks which payment is allocated against which invoice
- "Against Ref" = payment allocated to specific invoice
- "On Account" = unallocated payment (advance)
- Invoice due is DERIVED: `invoice_total - sum(allocations)`
- Over-allocation prevention for both payment and invoice limits
- API: `POST /api/receipts/allocate`, `GET /api/receipts/:id/allocations`, `GET /api/invoices/:id/allocations`, `DELETE /api/receipts/allocations/:id`

#### 3. Invoice Immutability Guard
- Direct edits to `paidAmount`, `dueAmount`, `paymentStatus` are BLOCKED on orders
- Changes must go through "Record Payment" → "Allocate" flow
- Returns 400 error with user-friendly message

#### 4. No Auto-FIFO Payment Allocation
- Customer payments without specific order reference stay as "On Account"
- No automatic application to oldest unpaid invoices
- User must explicitly allocate via Allocate UI

#### 5. Frontend — Customer Dialog with Allocate Tab
- Customer dialog shows 3 tabs: Invoices, Receipts, Allocate
- Invoices tab shows derived paid/due from receipt allocations
- Receipts tab shows allocated/unallocated amounts per receipt
- Allocate tab allows manual bill-wise reconciliation

### Phase 3: System Hardening & Reporting (Completed - Mar 13 2026)

#### 6. Telegram Alert Retry Mechanism
- Exponential backoff with 3 retries
- Handles rate limiting (HTTP 429), network errors, and timeouts
- Each retry doubles the wait time (1s, 2s, 4s)
- File: `backend/src/services/telegramAlert.js`

#### 7. FOR UPDATE Row-Level Locks (Concurrency Protection)
- Receipt allocation: locks payment and order rows during allocation
- Payment toggle: locks order row to prevent concurrent status changes
- Payment creation: locks order row when processing payment against invoice
- Optimistic concurrency check: verifies status hasn't changed since initial read
- Files: `controller/receiptAllocation.js`, `controller/order.js`, `controller/payment.js`

#### 8. Posting Matrix Reference Page
- New tab in Ledger Module showing voucher type reference
- 7 voucher types documented
- File: `frontend/src/components/admin/ledger/LedgerModule.jsx` (tab 7)

#### 9. Ledger Module (9 tabs)
- Dashboard (health check, drift monitor, migration control, **Forensic Audit**)
- Chart of Accounts (19+ accounts, clickable rows)
- Trial Balance
- Profit & Loss
- Balance Sheet
- Reconciliation
- Journal Entries
- Posting Matrix (voucher type reference)
- Account Ledger (Tally's core feature)

#### 10. Account Ledger Page (Tally-style)
- Click any account in Chart of Accounts to open its full ledger
- Transaction table with running balance
- Date range filter (defaults to Indian FY)

#### 11. Indian Financial Year Date Fix
- FY date range now correctly defaults to Apr 1 of PREVIOUS year when before April

### Phase 4: Automation Removal (Completed - Mar 14 2026)

#### CRITICAL: Removed All Automatic Reconciliation
- **DELETED** `backfillAllocations`, `reconcileAll` methods
- **DELETED** routes `POST /api/receipts/backfill-allocations`, `POST /api/receipts/reconcile`
- Only remaining allocation path: `POST /api/receipts/allocate` (explicit user action)

### Phase 5: Forensic Audit Tool (Completed - Mar 15 2026)

#### Forensic Audit Tool — Replaces All Previous Data Integrity Tools
- **REMOVED** old "Undo Auto-Reconciliation" card from Dashboard
- **REMOVED** old "Reconstruct Order States" card from Dashboard
- **NEW** single "Forensic Audit" card with 3 diagnostic categories:
  1. **Financial Contradictions** — status vs paidAmount/dueAmount mismatch
  2. **Paid Without Evidence** — status='paid' but no cash journal, no toggle log, no payment
  3. **Change Attribution** — who toggled what (from audit logs)
- Read-only scan: `GET /api/data-audit/forensic`
- User-driven fix: `POST /api/data-audit/fix` with orderIds, action, changedBy
- Every fix creates audit log (satisfies user's golden rule)
- Backward compat: old /data-audit/reconstruct endpoints still work
- Files: `backend/src/controller/dataIntegrityAudit.js`, `frontend/src/components/admin/ledger/LedgerModule.jsx`

### Earlier Completed Work
- Full-stack invoicing system with orders, payments, customers, suppliers
- Double-entry ledger infrastructure (accounts, journal_batches, ledger_entries)
- Audit logging system
- PDF invoice generation
- Telegram alerts (daily summary, fraud detection)
- WhatsApp integration
- Daily summary calculations
- GST export, Tally export

## Prioritized Backlog

### P0 — Data Corruption (User's Local DB)
- User's local database has invoices incorrectly marked as "paid" without payment records
- **Forensic Audit tool built** — scans all orders for evidence mismatches
- Tool shows 3 categories: contradictions, paid-without-evidence, change attribution
- User reviews findings and selects which orders to fix
- Evidence-based: no auto-fixing, user must approve every change

### P1 — Customer Duplication Bug Verification
- LATERAL join fix applied but user hasn't confirmed it works on their local DB

### P2 - Future
- Implement Role-Based Access Control (RBAC)
- Financial period lock (prevent changes to locked periods)
- Reconciliation dashboard (visual tool)
- Ledger recalculation utility
- Backup/restore verification

### P3 - Backlog
- Credit Note / Debit Note / Write-off voucher types
- Adjustment entry UI (journal entries instead of direct invoice mutation)

## Test Credentials
- Username: `admin`
- Password: `yttriumR`
- Telegram Bot Token: `8336582297:AAF3EtRshWDu3p57L9SHaWd3RvALD2OIrc8`
- Telegram Chat ID: `6016362708`

## Key API Endpoints
- `POST /api/auth/login`
- `GET /api/customers/with-balance` — Ledger-authoritative balances
- `GET /api/customers/:id/transactions` — Derived invoice dues
- `POST /api/receipts/allocate` — Allocate receipt against invoices
- `GET /api/receipts/:paymentId/allocations`
- `GET /api/invoices/:orderId/allocations`
- `DELETE /api/receipts/allocations/:allocationId`
- `POST /api/orders` — Create invoice
- `PUT /api/orders/:id` — Update (financial fields blocked)
- `POST /api/payments` — Record payment
- `GET /api/ledger/reports/trial-balance`
- `GET /api/ledger/reports/profit-loss`
- `GET /api/ledger/reports/balance-sheet`
- `POST /api/ledger/accounts/initialize`
- `GET /api/ledger/migration/reconciliation`
- **NEW** `GET /api/data-audit/forensic` — Forensic scan (read-only, 3 categories)
- **NEW** `POST /api/data-audit/fix` — Fix selected orders (requires orderIds, action, changedBy)

### REMOVED Endpoints
- ~~`POST /api/receipts/reconcile`~~ — Automatic FIFO reconciliation (DELETED)
- ~~`POST /api/receipts/backfill-allocations`~~ — Automatic FIFO backfill (DELETED)
