# Product Requirements Document — Customer Invoice System

## Original Problem Statement
Build a production-grade, double-entry accounting ledger with a focus on fraud prevention and data integrity, similar in sophistication to Tally ERP. Key requirements include logging suspicious activities, providing an admin audit trail, improving UI/UX for financial entries, and ensuring ledger integrity.

**Critical User Rule (NON-NEGOTIABLE):** "This software won't without my (or biller's) authorisation or intervention do unpaid orders or credit sale orders to paid. This is serious."
- NO automatic FIFO reconciliation
- NO automatic payment-to-invoice matching
- NO automatic status changes on orders/invoices
- ALL payment allocation MUST be explicit user action via `POST /api/receipts/allocate`

## Core Architecture
- **Frontend:** React + Material-UI (port 3000)
- **Backend:** Node.js + Express + Sequelize ORM (port 8001)
- **Database:** PostgreSQL (port 5432)
- **3rd Party:** Telegram Bot API, WhatsApp Web, RS232 Weight Scale, node-cron

## What's Been Implemented

### Phase 8: Classification Bug Fix + Customer Notes (Mar 15 2026)
- **FIXED:** Forensic classification now uses name-based matching instead of UUID
  - `pay_advance` CTE: `LOWER(TRIM(partyName)) = LOWER(TRIM(customerName))`
  - Added `pay_any_by_name` fallback CTE for ALL payment types
  - Added performance index on `LOWER(TRIM(partyName))`
- **NEW:** Customer Notes feature
  - `notes` TEXT field on customers table
  - "Notes" tab in customer dialog (4th tab)
  - Save/load via existing PUT /api/customers/:id

### Earlier Phases (1-7) - All Completed
- Tally-Correct System Hardening (ledger-authoritative balance, receipt allocation)
- Invoice Immutability Guard
- Telegram Alert Retry, FOR UPDATE locks, Posting Matrix
- Ledger Module (9 tabs), Account Ledger
- Automation Removal (deleted auto-reconciliation)
- Forensic Audit Tool (3 categories)
- Payment Recovery Script (8 steps)
- Forensic Classification (5+ categories with evidence hierarchy)
- Full invoicing system, double-entry ledger, audit logging, PDF generation
- Telegram/WhatsApp integration, GST/Tally export

## Prioritized Backlog

### P0 — RESOLVED
- Forensic classification name-based matching fix deployed
- User needs to restart local backend and verify

### P1 — Upcoming
- Toggle paid → auto-allocate from existing On Account payments (prevent future data mismatch)
- Build frontend UI for core ledger reports
- Telegram alert retry mechanism review

### P2 — Future
- Role-Based Access Control (RBAC)
- Financial period lock
- Reconciliation dashboard

### P3 — Backlog
- Credit Note / Debit Note / Write-off voucher types
- Adjustment entry UI

## Test Credentials
- Username: `admin`
- Password: `yttriumR`

## Key Files
- `backend/src/controller/forensicClassification.js` — Classification SQL (name-based matching)
- `backend/src/models/customer.js` — Customer model with notes field
- `backend/src/validations/customer.js` — Validation with notes
- `frontend/src/components/admin/customers/list.jsx` — Customer dialog with Notes tab
