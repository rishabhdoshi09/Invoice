# BizLedger - Invoice & Billing System

## Original Problem Statement
A billing/invoicing system with React frontend + Node.js backend + PostgreSQL database for managing customer invoices, orders, payments, and financial tracking.

## User Personas
- **Admin:** Full access to all features, dashboard, audit logs, user management
- **Billing Staff:** Limited access for creating orders, recording payments

## Core Requirements
1. Order/Invoice Management (CRUD)
2. Customer Management
3. Product Management
4. Payment Tracking (Credit Sales, Receivables, Payables)
5. Daily Sales Summary & Dashboard
6. Audit Logging
7. Invoice Number Sequencing

---

## What's Been Implemented

### Authentication & Users
- JWT-based authentication
- Role-based access (admin, billing_staff)
- User management

### Orders & Invoicing
- Order creation with auto-generated invoice numbers (INV-YYYYMMDD-XXXXXX)
- Credit Sale toggle (unpaid orders tracking)
- Order editing (admin only)
- Order deletion with audit logging
- Order list with date filtering

### Dashboard (Admin)
- Today's Sales total
- Opening Balance tracking
- Expected Cash in Drawer calculation
- Activity Log
- Deletions Log
- Daily Summaries with date range

### Payments
- Daily Payments page with Outstanding Receivables/Payables
- Smart autocomplete for parties with outstanding balances
- Payment recording

### Financial Tracking
- Ledger entries for sales
- Daily summary auto-calculation

---

## Known Issues (Priority Order)

### 🔴 P0 - Critical
1. **SequelizeUniqueConstraintError on order creation**
   - Root cause: `invoice_sequences` table counter de-syncs
   - Status: Needs permanent fix in backend logic

### 🟠 P1 - High Priority
2. **Price input race condition**
   - Fast typing in price field drops digits
   - Previous fix caused UI freeze, was reverted

3. **New orders not appearing instantly**
   - Redux caching issue
   - Fix implemented but unverified

### 🟡 P2 - Medium Priority
4. **Refactor orders/create.jsx** (1900+ lines)
5. **Migrate Redux to RTK Query**

---

## Upcoming Tasks
- Purchase Bill Paid/Not Paid toggle

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

### Dashboard
- GET /api/dashboard/summary/today
- GET /api/dashboard/summary/date/:date
- GET /api/dashboard/summary/range
- POST /api/dashboard/summary/recalculate/:date
- POST /api/dashboard/summary/opening-balance
- GET /api/dashboard/stats
- GET /api/dashboard/audit-logs

---

## Database Schema (Key Tables)

### orders
- id (UUID, PK)
- orderNumber (UNIQUE)
- orderDate
- customerName
- total, paidAmount, dueAmount
- paymentStatus (ENUM: paid, partial, unpaid)
- createdBy, modifiedBy

### invoice_sequences
- id, prefix, currentNumber, dailyNumber, lastDate

### daily_summaries
- date, totalSales, totalOrders, openingBalance, isClosed

---

## Test Credentials
- Admin: admin / admin123
- Staff: staff / staff123

---

## Verified Tests (Jan 11, 2026)

### Totals Verification Test ✅
- Created 40 random bills via API
- Sum: ₹36,895.57
- Dashboard total: ₹36,895.57
- DB query total: ₹36,895.57
- **All match correctly**

---

## Tech Stack
- Frontend: React, Redux, Formik, MUI
- Backend: Node.js, Express, Sequelize
- Database: PostgreSQL
