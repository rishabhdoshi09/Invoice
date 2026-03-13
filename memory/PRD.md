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
- Files: `backend/src/controller/receiptAllocation.js`, `backend/src/routes/receiptAllocation.js`, `backend/src/models/receiptAllocation.js`

#### 3. Invoice Immutability Guard
- Direct edits to `paidAmount`, `dueAmount`, `paymentStatus` are BLOCKED on orders
- Changes must go through "Record Payment" → "Allocate" flow
- Returns 400 error with user-friendly message
- File: `backend/src/controller/order.js` (updateOrder method)

#### 4. No Auto-FIFO Payment Allocation
- Customer payments without specific order reference stay as "On Account"
- No automatic application to oldest unpaid invoices
- User must explicitly allocate via Allocate UI
- File: `backend/src/controller/payment.js`

#### 5. Frontend Updates
- Customer dialog shows 3 tabs: Invoices, Receipts, Allocate
- Invoices tab shows derived paid/due from receipt allocations
- Receipts tab shows allocated/unallocated amounts per receipt
- Allocate tab allows manual bill-wise reconciliation
- Balance card shows source indicator (Ledger/Orders)
- File: `frontend/src/components/admin/customers/list.jsx`

#### 6. Chart of Accounts Initialized
- 19 accounts created covering Assets, Liabilities, Equity, Revenue, Expenses
- Double-entry ledger posting for: Invoices, Payments, Payment Toggle, Cash Receipts

### Earlier Completed Work
- Full-stack invoicing system with orders, payments, customers, suppliers
- Double-entry ledger infrastructure (accounts, journal_batches, ledger_entries)
- Audit logging system
- PDF invoice generation
- Telegram alerts
- WhatsApp integration
- Daily summary calculations
- GST export
- Tally export

## Prioritized Backlog

### P1 - In Progress / Next
- Build frontend UI for core ledger reports (Account Ledger, Trial Balance, P&L, Balance Sheet)
- Implement retry mechanism for Telegram alerts
- Implement `FOR UPDATE` row-level locks for concurrency

### P2 - Future
- Implement Role-Based Access Control (RBAC)
- Financial period lock
- Reconciliation dashboard (visual tool to match receipts against invoices)
- Ledger recalculation utility (verify and recompute balances from ledger entries)
- Backup/restore verification

### P3 - Backlog
- Posting matrix for additional voucher types: Credit Note, Debit Note, Advance, Write-off
- Adjustment entry UI (journal entries instead of direct invoice mutation)

## Test Credentials
- Username: `admin`
- Password: `yttriumR`
- Telegram Bot Token: `8336582297:AAF3EtRshWDu3p57L9SHaWd3RvALD2OIrc8`
- Telegram Chat ID: `6016362708`

## Key API Endpoints
- `POST /api/auth/login` — Login
- `GET /api/customers/with-balance` — Customer list with ledger-authoritative balances
- `GET /api/customers/:id/transactions` — Customer detail with derived invoice dues
- `POST /api/receipts/allocate` — Allocate receipt against invoices
- `GET /api/receipts/:paymentId/allocations` — Get allocations for a payment
- `GET /api/invoices/:orderId/allocations` — Get allocations for an invoice
- `DELETE /api/receipts/allocations/:allocationId` — Remove allocation
- `POST /api/orders` — Create invoice
- `PUT /api/orders/:id` — Update order (financial fields blocked)
- `POST /api/payments` — Record payment
- `POST /api/ledger/accounts/initialize` — Initialize Chart of Accounts
