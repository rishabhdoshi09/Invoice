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
- Ledger-Authoritative Balance (Tally Formula)
- Receipt Allocation (Tally's Bill-Wise / Against Ref)
- Invoice Immutability Guard
- No Auto-FIFO Payment Allocation
- Frontend — Customer Dialog with Allocate Tab

### Phase 3: System Hardening & Reporting (Completed - Mar 13 2026)
- Telegram Alert Retry Mechanism
- FOR UPDATE Row-Level Locks (Concurrency Protection)
- Posting Matrix Reference Page
- Ledger Module (9 tabs)
- Account Ledger Page (Tally-style)
- Indian Financial Year Date Fix

### Phase 4: Automation Removal (Completed - Mar 14 2026)
- DELETED backfillAllocations, reconcileAll methods
- Only remaining allocation path: POST /api/receipts/allocate

### Phase 5: Forensic Audit Tool (Completed - Mar 15 2026)
- Forensic Audit card with 3 diagnostic categories
- Read-only scan + user-driven fix

### Phase 6: Payment Recovery Script (Completed - Mar 15 2026)
- 8-Step Payment Status Recovery
- Toggle endpoint hardened (Step 8)

### Phase 7: Forensic Classification (Completed - Mar 15 2026)
- 5-Category Order Classification Based on Payment Evidence
- Repair with Dry-Run

### Phase 8: Classification Bug Fix (Completed - Mar 15 2026)
- **FIXED:** Changed advance payment matching from UUID-based to name-based
- `pay_advance` CTE now joins on `LOWER(TRIM(customerName)) = LOWER(TRIM(partyName))`
- Added `pay_any_by_name` CTE as fallback for ALL payment types by customer name
- Added performance index on `LOWER(TRIM(partyName))`
- This resolves the false-positive SUSPICIOUS_PAID issue for customers with On Account payments

### Earlier Completed Work
- Full-stack invoicing system with orders, payments, customers, suppliers
- Double-entry ledger infrastructure
- Audit logging system
- PDF invoice generation
- Telegram alerts (daily summary, fraud detection)
- WhatsApp integration
- Daily summary calculations
- GST export, Tally export

## Prioritized Backlog

### P0 — Data Corruption Fix (RESOLVED)
- Forensic classification now correctly uses name-based matching for advance payments
- User needs to verify on local DB

### P1 — Upcoming
- Build frontend UI for core ledger reports (Account Ledger, Trial Balance, P&L, Balance Sheet)
- Implement Telegram alert retry mechanism
- Review FOR UPDATE row-level locks for concurrency

### P2 — Future
- Role-Based Access Control (RBAC)
- Financial period lock
- Reconciliation dashboard (visual tool)
- Ledger recalculation utility

### P3 — Backlog
- Credit Note / Debit Note / Write-off voucher types
- Adjustment entry UI

## Test Credentials
- Username: `admin`
- Password: `yttriumR`
- Telegram Bot Token: `8336582297:AAF3EtRshWDu3p57L9SHaWd3RvALD2OIrc8`
- Telegram Chat ID: `6016362708`

## Key API Endpoints
- `POST /api/auth/login`
- `GET /api/data-audit/classify` — Forensic classification (name-based matching)
- `POST /api/data-audit/repair/preview` — Dry-run repair
- `POST /api/data-audit/repair/execute` — Execute repair with audit trail
- `GET /api/data-audit/diagnose` — Diagnostic endpoint
- `GET /api/data-audit/forensic` — Forensic scan (read-only)
- `POST /api/data-audit/fix` — Fix selected orders
- `GET /api/data-audit/recovery/preview` — Recovery dry run
- `POST /api/data-audit/recovery/execute` — Execute recovery
- `GET /api/data-audit/recovery/validate` — Post-repair validation
- `PATCH /api/orders/:orderId/payment-status` — Toggle (creates payment+allocation)

## Key Files
- `backend/src/controller/forensicClassification.js` — Classification SQL with name-based matching
- `backend/src/routes/dataIntegrityAudit.js` — Route definitions
- `frontend/src/components/admin/ledger/LedgerModule.jsx` — Forensic tool UI
