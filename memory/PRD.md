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
9. Purchase Bills Management with CA Export

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

### GST Export Tool (Jan 18, 2026)
- **Admin-only** page at `/gst-export`
- Configure price adjustment rules (e.g., ₹200-299 → ₹220)
- Automatically recalculates quantity to preserve line totals
- Side-by-side comparison: Original vs GST Adjusted Invoice
- Export Original CSV (for internal records)
- Export Adjusted CSV (for CA/GST portal)
- Price rules saved in localStorage for persistence
- **Indian Tax Format Compliance:**
  - CGST 2.5% and SGST 2.5% columns in expanded rows
  - Taxable Value calculation (price / 1.05)
  - All GST-required fields: Invoice Number, Date, Customer, GSTIN, HSN Code, CGST/SGST

### Purchase Bills CA Features (Jan 18, 2026)
- Purchase Bills page at `/purchases`
- "Export for CA" button with Indian tax format CSV
- Expandable rows showing line items with CGST/SGST breakdown
- View Details dialog with:
  - Bill Number, Date, Supplier, GSTIN
  - Items table: Item, Qty, Price, Taxable, CGST, SGST, Total
- Date format: DD-MM-YYYY throughout

---

## Fixed Issues (Jan 21, 2026)

### ✅ P0 - Outstanding Receivables Total Bug (FIXED)
- **Bug:** Customer "paras" showing ₹75,668 total but had 2 bills totaling ₹80,084
- **Root Cause:** Customer names with different case/whitespace were not being grouped
- **Fix:** Normalized customer names (lowercase, trimmed) for grouping in reports.js
- **Status:** Fixed

### ✅ P0 - Manual Paid/Unpaid Toggle on Order List (IMPLEMENTED)
- **Feature:** Admin can toggle existing order's payment status between "Paid" and "Unpaid"
- **Implementation:**
  - New backend endpoint: POST `/api/orders/:orderId/toggle-payment`
  - Frontend toggle switch in Status column (visible to admin only)
  - Confirmation dialog before status change
  - Updates customer balance when toggling
  - RTK Query mutation with auto cache invalidation
- **Status:** Implemented and tested

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

### ✅ P0 - Purchase Bills Export Date (FIXED)
- **Root Cause:** moment() couldn't parse DD-MM-YYYY string
- **Fix:** Added formatDateForExport() function
- **Status:** Verified working

### ✅ P0 - GST Export CSV Values (FIXED)
- **Root Cause:** Backend not using pre-calculated GST values
- **Fix:** Updated to use baseAmount, cgstAmount, sgstAmount from frontend
- **Status:** Verified working

---

## API Endpoints

### Auth
- POST /api/auth/login
- GET /api/auth/setup-check
- GET /api/auth/me

### Orders
- GET /api/orders
- POST /api/orders
- GET /api/orders/:id
- PUT /api/orders/:id
- DELETE /api/orders/:id

### GST Export
- POST /api/gst-export/excel - Generate CSV export with CGST/SGST
- GET /api/gst-export/summary - Get export summary stats
- POST /api/gst-export/log - Log export action for audit

### Purchases
- GET /api/purchases
- POST /api/purchases
- DELETE /api/purchases/:id

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

### purchaseBills
- id (UUID, PK)
- billNumber (UNIQUE)
- billDate (STRING) - Format: DD-MM-YYYY
- supplierId (FK)
- subTotal, tax, taxPercent, total
- paidAmount, paymentStatus

### purchaseItems
- id (UUID, PK)
- purchaseBillId (FK)
- name, quantity, price, totalPrice

---

## Test Credentials
- Admin: admin / admin123
- Staff: staff / staff123

---

## Tech Stack
- Frontend: React, Redux, RTK Query, Formik, MUI, Recharts, moment.js
- Backend: Node.js, Express, Sequelize
- Database: PostgreSQL

---

## Upcoming Tasks
- **P1:** Add "Paid/Not Paid" toggle when creating purchase bills

## Future/Backlog
- **P2:** Complete RTK Query migration
- **P2:** Refactor orders/create.jsx (1900+ lines)
- **P2:** PDF export for adjusted invoices (GST Export Tool)
- **P2:** Fix price input race condition on /orders/create

---

## Key Files
- GST Export Tool: `/app/frontend/src/components/admin/gstExport/GstExportTool.jsx`
- GST Export Backend: `/app/backend/src/routes/gstExport.js`
- Purchase Bills: `/app/frontend/src/components/admin/purchases/list.jsx`

---

## Last Updated
January 18, 2026
