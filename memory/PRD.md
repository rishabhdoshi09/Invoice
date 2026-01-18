# BizLedger - Invoice & Billing System

## Original Problem Statement
A billing/invoicing system with React frontend + Node.js backend + PostgreSQL database for managing customer invoices, orders, payments, and financial tracking.

## User Personas
- **Admin:** Full access to all features, dashboard, audit logs, user management, GST Export Tool
- **Billing Staff:** Limited access for creating orders, recording payments

## Core Requirements
1. Order/Invoice Management (CRUD)
2. Customer Management
3. Product Management
4. Payment Tracking (Credit Sales, Receivables, Payables)
5. Daily Sales Summary & Dashboard
6. Audit Logging
7. Invoice Number Sequencing (GST-compliant)
8. GST Export Tool for CA/Portal submission

---

## What's Been Implemented

### Authentication & Users
- JWT-based authentication
- Role-based access (admin, billing_staff)
- User management

### Orders & Invoicing
- Order creation with GST-compliant invoice numbers (INV/YYYY-YY/XXXX format)
- Credit Sale toggle (unpaid orders tracking)
- Order editing (admin only)
- Order deletion with audit logging
- Order list with date/time display and filtering
- Transaction-based order creation (atomic operations)

### Dashboard (Admin)
- Today's Sales total
- Opening Balance tracking
- Expected Cash in Drawer calculation
- Activity Log
- Deletions Log
- Daily Summaries with date range
- Day Start page with charts

### Payments
- Daily Payments page with Outstanding Receivables/Payables
- Smart autocomplete for parties with outstanding balances
- Payment recording
- View Bill feature for credit sales

### Financial Tracking
- Ledger entries for sales
- Daily summary auto-calculation

### GST Export Tool (NEW - Jan 18, 2026)
- **Admin-only** page at `/gst-export`
- Configure price adjustment rules (e.g., ₹200-299 → ₹220)
- Automatically recalculates quantity to preserve line totals
- Side-by-side comparison: Original vs GST Adjusted Invoice
- Export Original CSV (for internal records)
- Export Adjusted CSV (for CA/GST portal)
- Price rules saved in localStorage for persistence
- All GST-required fields: Invoice Number, Date, Customer, GSTIN, HSN Code, CGST/SGST

---

## Fixed Issues (Jan 18, 2026)

### ✅ P0 - SequelizeUniqueConstraintError (FIXED)
- **Root Cause:** Transaction not passed through DAO/Service layers
- **Fix:** Added transaction support to order/orderItems DAO/Service
- **Status:** Verified working

### ✅ P0 - Invalid Date Display (FIXED)
- **Root Cause:** Frontend formatDate() didn't handle DD-MM-YYYY format
- **Fix:** Updated formatDate() to parse DD-MM-YYYY format
- **Status:** Verified working

---

## New Feature: GST Export Tool

### Purpose
Automate invoice adjustments for GST compliance when submitting to CA or GST portal.

### How It Works
1. **Configure Price Rules:** Set price ranges and target prices
   - Example: ₹200-299 → ₹220, ₹300-399 → ₹330
2. **Automatic Adjustment:** Quantity recalculated to preserve line total
   - Original: ₹250 × 0.5kg = ₹125
   - Adjusted: ₹220 × 0.568kg = ₹125 (same total)
3. **View Comparison:** Side-by-side Original vs Adjusted preview
4. **Export:** Download CSV with both original and adjusted values

### Files
- Frontend: `/app/frontend/src/components/admin/gstExport/GstExportTool.jsx`
- Backend: `/app/backend/src/routes/gstExport.js`
- Route: `/gst-export` (Admin only)

---

## API Endpoints

### Auth
- POST /api/auth/login

### Orders
- GET /api/orders
- POST /api/orders
- GET /api/orders/:id
- PUT /api/orders/:id
- DELETE /api/orders/:id

### GST Export (NEW)
- POST /api/gst-export/excel - Generate CSV export
- GET /api/gst-export/summary - Get export summary stats
- POST /api/gst-export/log - Log export action for audit

### Dashboard
- GET /api/dashboard/summary/today
- POST /api/dashboard/summary/opening-balance

---

## Database Schema (Key Tables)

### orders
- id (UUID, PK)
- orderNumber (UNIQUE) - Format: INV/YYYY-YY/XXXX
- orderDate (STRING) - Format: DD-MM-YYYY
- customerName, customerMobile
- total, paidAmount, dueAmount
- paymentStatus (ENUM: paid, partial, unpaid)

### invoice_sequences
- id, prefix, currentNumber, dailyNumber, lastDate, lastFinancialYear

---

## Test Credentials
- Admin: admin / admin123
- Staff: staff / staff123

---

## Tech Stack
- Frontend: React, Redux, RTK Query, Formik, MUI, Recharts
- Backend: Node.js, Express, Sequelize
- Database: PostgreSQL

---

## Upcoming Tasks
- Purchase Bill Paid/Not Paid toggle for accounts payable tracking

## Future/Backlog
- Complete RTK Query migration
- Refactor orders/create.jsx (2000+ lines)
- PDF export for adjusted invoices

---

## Last Updated
January 18, 2026
