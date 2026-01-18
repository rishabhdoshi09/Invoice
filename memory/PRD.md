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
7. Invoice Number Sequencing (GST-compliant)

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

---

## Fixed Issues (Jan 18, 2026)

### ✅ P0 - SequelizeUniqueConstraintError (FIXED)
- **Root Cause:** Transaction not passed through DAO/Service layers
- **Fix:** Added transaction support to:
  - `/app/backend/src/dao/order.js` - createOrder(), getOrder()
  - `/app/backend/src/dao/orderItems.js` - addOrderItems()
  - `/app/backend/src/services/order.js` - createOrder(), getOrder()
  - `/app/backend/src/services/orderItems.js` - addOrderItems()
- **Status:** Verified working - concurrent order creation produces unique invoice numbers

### ✅ P0 - Invalid Date Display (FIXED)
- **Root Cause:** Frontend formatDate() didn't handle DD-MM-YYYY format
- **Fix:** Updated `/app/frontend/src/components/admin/orders/list.jsx` formatDate() to parse DD-MM-YYYY format
- **Status:** Verified working - dates display correctly as DD/MM/YYYY

---

## Known Issues

### 🟠 P1 - Price Input Race Condition (PARTIAL FIX)
- **Description:** Fast typing in price field may drop digits in automated tests
- **Attempted fixes:** 
  - Local state with debounced formik sync
  - Product-ID based key for uncontrolled input
  - DOM direct manipulation
- **Current Status:** Works correctly with manual typing and programmatic `fill()`. Issue only appears with Playwright's `type()` method during automated testing (30ms delay between keystrokes)
- **User Impact:** Low - real users type slower than automated tests
- **File:** `/app/frontend/src/components/admin/orders/create.jsx`

### 🟡 P2 - Refactor orders/create.jsx
- File has 2000+ lines, needs breaking into smaller components
- Technical debt but not blocking functionality

### 🟡 P2 - Complete RTK Query Migration
- App is in hybrid state (RTK Query + old Redux thunks)
- Should be completed for consistency

---

## Upcoming Tasks
- Purchase Bill Paid/Not Paid toggle for accounts payable tracking

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
- orderNumber (UNIQUE) - Format: INV/YYYY-YY/XXXX
- orderDate (STRING) - Format: DD-MM-YYYY
- customerName, customerMobile
- total, paidAmount, dueAmount
- paymentStatus (ENUM: paid, partial, unpaid)
- createdBy, modifiedBy, createdAt, updatedAt

### invoice_sequences
- id, prefix, currentNumber, dailyNumber, lastDate, lastFinancialYear

### daily_summaries
- date, totalSales, totalOrders, openingBalance, isClosed

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

## Last Updated
January 18, 2026
