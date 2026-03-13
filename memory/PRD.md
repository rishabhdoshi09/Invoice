# Product Requirements Document — Customer Invoice System

## Original Problem Statement
Build a production-grade, double-entry accounting ledger with a focus on fraud prevention and data integrity, similar in sophistication to Tally ERP. Key requirements include logging suspicious activities, providing an admin audit trail, improving UI/UX for financial entries, and ensuring ledger integrity.

**Critical User Rule:** "I don't ever want to automatically update a ledger without me or biller authorizing it."

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
- 7 voucher types documented: Sales Invoice, Cash Sale, Receipt Against Ref, Receipt On Account, Payment Toggle, Supplier Payment
- Tally-correct balance formulas displayed
- File: `frontend/src/components/admin/ledger/LedgerModule.jsx` (tab 7)

#### 9. Ledger Module (8 tabs)
- Dashboard (health check, drift monitor, migration control)
- Chart of Accounts (19 system accounts)
- Trial Balance
- Profit & Loss
- Balance Sheet
- Reconciliation
- Journal Entries
- Posting Matrix (NEW)

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

### P2 - Future
- Implement Role-Based Access Control (RBAC)
- Financial period lock (prevent changes to locked periods)
- Reconciliation dashboard (visual tool)
- Ledger recalculation utility
- Backup/restore verification

### P3 - Backlog
- Credit Note / Debit Note / Write-off voucher types
- Adjustment entry UI (journal entries instead of direct invoice mutation)
- Account Ledger page (individual account transaction history)

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
