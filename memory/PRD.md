# BizLedger - Invoice & Billing System

## Original Problem Statement
A billing/invoicing system with React frontend + Node.js backend + PostgreSQL database for managing customer invoices, orders, payments, and financial tracking.

---

## Critical Updates (February 18, 2026 - Latest)

### ✅ COMPREHENSIVE DATA INTEGRITY AUDIT & FIX

**User Issue:** "Check all of the application and thoroughly do the audit for each and everything and strictly fix integrity issues - it is literally a headache to try to check the sales and cash expected in the drawer"

**Critical Bugs Found & Fixed:**

#### 1. Double-Counting Bug in Cash Drawer Calculation
**Problem:** When a customer payment was received:
- The order's `paidAmount` was updated (correctly adding to cashSales)
- BUT the payment was ALSO counted in `customerReceipts`
- This caused double-counting and inflated expected cash

**Root Cause:** The `getRealTimeSummary` function was including ALL customer payments in `customerReceipts`, even those that had already updated today's orders' `paidAmount`.

**Solution:** 
- `customerReceipts` now ONLY includes payments for PAST orders (orders from different dates)
- Payments linked to today's orders are excluded to prevent double-counting
- Updated payment controller to set `referenceId` when auto-applying payments to orders

#### 2. Partial Payment Handling Error
**Problem:** For partially paid orders, cashSales was only counting FULLY PAID orders, missing the actual cash received from partial payments.

**Solution:** 
- `cashSales = SUM(paidAmount)` from ALL orders (paid, partial, unpaid)
- This correctly captures:
  - ₹1000 from a PAID order (full total)
  - ₹500 from a PARTIAL order (only what was paid)
  - ₹0 from an UNPAID order

#### 3. Removed Quick Stats Widget
Per user request - removed the floating stats widget that was showing ₹0.

**Files Modified:**
- `backend/src/services/dailySummary.js` - Complete rewrite of `getRealTimeSummary` (lines 351-450)
- `backend/src/controller/payment.js` - Fixed auto-apply payment to set referenceId (lines 223-270)
- `frontend/src/components/admin/dayStart/DayStart.jsx` - Updated to use consistent real-time data
- `frontend/src/App.js` - Removed FloatingStatsWidget

**Correct Cash Drawer Formula:**
```
Expected Cash = Opening Balance 
              + Cash Sales (SUM of paidAmount from today's orders)
              + Customer Receipts (payments for PAST orders only)
              - Supplier Payments
              - Expenses
```

**Test Results:** `/app/test_reports/iteration_12.json` - 100% pass rate (16/16 tests)
- Cash Sales = SUM(paidAmount) ✓
- Credit Sales = SUM(dueAmount) ✓
- No double-counting ✓
- Partial payments handled correctly ✓

---

## Critical Updates (February 16, 2026)
   - Receivable/Payable at a glance
   - Net Position with positive/negative indication
   - Auto-refreshes every 2 minutes
   - File: `/app/frontend/src/components/common/FloatingStats.jsx`

2. **Keyboard Shortcuts System**
   - Complete keyboard shortcuts reference dialog
   - Accessible via ⌨️ icon in header or press `?` anywhere
   - Documents all shortcuts: Global, Order Creation, Navigation, Data Entry
   - File: `/app/frontend/src/components/common/KeyboardShortcuts.jsx`

3. **Smart Notifications System**
   - Real-time notification bell in header
   - Toast notifications for important actions
   - Notification history (last 50)
   - Typed notifications (success, warning, error, sale, payment)
   - File: `/app/frontend/src/components/common/SmartNotifications.jsx`

4. **Enhanced Header**
   - Keyboard shortcuts button (⌨️)
   - Notification bell (🔔)
   - Admin/Staff role badge

**Test Results:** 100% pass rate (All new features verified)
**Test Report:** `/app/test_reports/iteration_10.json`

---

### ✅ Billing Staff Payment Status Toggle with Mandatory Naming

**User Request:** "Allow billing staff to toggle between paid and unpaid with mandatory naming"

**Implementation:**
1. **Billing Staff Access**: Both admin AND billing_staff can now toggle payment status (previously admin-only)
2. **Mandatory Name Field**: A "Your Name (Required for Audit)" field is now required before toggling
3. **Pre-filled Name**: The field is pre-filled with the logged-in user's name
4. **Audit Trail**: The `changedBy` name is recorded in:
   - Order's `modifiedByName` field
   - Audit log with description including who made the change

**Files Modified:**
- `/app/frontend/src/components/admin/orders/list.jsx` - Added `changedByName` state, updated UI with mandatory name field
- `/app/backend/src/routes/order.js` - Removed `canModify` (admin-only) restriction
- `/app/backend/src/controller/order.js` - Added `changedBy` validation and audit logging

**Test Status:** Verified - Toggle works with mandatory naming, receivables updated correctly

---

### ✅ Smart Application Enhancement Complete

**User Request:** "Enhance this whole application to have some smart (advance) features keeping in mind of all the mappings. I don't want unnecessary duplicates - just simple yet powerful, aesthetic and powerful that does all the job for us."

**New Features Implemented:**

1. **Global Search (Ctrl+K)**
   - Universal search bar in header - search orders, customers, suppliers instantly
   - Keyboard navigation (↑↓ to navigate, Enter to select, Esc to close)
   - Results grouped by type with relevant info (balance, status, phone)
   - File: `/app/frontend/src/components/common/GlobalSearch.jsx`

2. **Smart Dashboard (`/admin-dashboard`)**
   - Real-time financial overview: Receivable, Payable, Today's Sales, Net Position
   - Data Integrity Panel: Shows "All Good" when data is properly linked
   - Quick Actions: New Sale, Receive Payment, Make Payment, Add Purchase
   - Recent Sales with proper customer linking indicators
   - File: `/app/frontend/src/components/admin/dashboard/AdminDashboard.jsx`

3. **Login Auto-Redirect**
   - Fixed: After login, users now redirect to /orders automatically
   - File: `/app/frontend/src/components/auth/Login.jsx`

**Test Results:** 100% pass rate (Global Search, Dashboard, Customer List, Order Creation all verified)
**Test Report:** `/app/test_reports/iteration_9.json`

---

### RESOLVED: Customer/Supplier Mapping Issues

**Issues Fixed:**
1. ✅ Credit sales not linking to customers - `customerId` was being set AFTER order creation
2. ✅ Supplier payments not creating suppliers - payments were orphaned with just `partyName`
3. ✅ Orders missing from customer details - legacy orders only had `customerName`, no `customerId`

**Backend Fixes:**
1. **Order Controller** (`/app/backend/src/controller/order.js`):
   - Moved customer creation/lookup BEFORE order creation
   - `customerId` now properly saved with the order
   - Added console logging for debugging

2. **Payment Controller** (`/app/backend/src/controller/payment.js`):
   - Auto-creates supplier if paying to new supplier name
   - Links payment to supplier via `partyId`
   - Updates supplier balance on payment

3. **Customer DAO** (`/app/backend/src/dao/customer.js`):
   - Now matches orders by `customerId` OR `customerName` (for legacy data)
   - Properly calculates balance from linked orders

**SQL Migrations Created:**
- `/app/backend/migrations/fix_order_customer_linking.sql` - Links orders to customers by name
- `/app/backend/migrations/fix_supplier_payments_linking.sql` - Creates suppliers from orphaned payments

### NEW: Advanced Supplier Ledger UI

**Smart Features Added to `/suppliers` page:**

1. **Quick Entry Tabs (No Dialogs):**
   - Tab 1: Add Supplier - Name, Mobile, GSTIN, Opening Balance
   - Tab 2: Quick Payment - With "Create New Supplier" toggle
   - Tab 3: Quick Purchase - With "Create New Supplier" toggle
   - Tab 4: Recent Activity - Shows last 5 payments

2. **Duplicate Detection:**
   - Warns when adding supplier with existing name
   - Shows existing supplier's balance

3. **Smart Payment Features:**
   - Auto-fills amount with due balance when supplier selected
   - "Pay Full" button for quick full payment
   - Shows advance/overpaid status

4. **Quick Actions from Table:**
   - Click PAY icon → Opens payment tab with supplier pre-selected
   - Click PURCHASE icon → Opens purchase tab with supplier pre-selected

5. **Clickable Summary Cards:**
   - Click "Total Payable" → Filters to suppliers with due
   - Click "Advance Given" → Filters to suppliers with advance
   - Click "Total Suppliers" → Shows all

6. **Inline Supplier Creation:**
   - Toggle to create new supplier while making payment/purchase
   - No need to add supplier first

---

## Critical Updates (February 13, 2026)

### P0 RESOLVED: Bill Number Made Optional
**Issue:** Bill Number field was mandatory when creating a purchase bill, but users wanted flexibility to leave it empty.

**Solution Implemented:**
1. ✅ Updated backend validation in `/app/backend/src/validations/purchaseBill.js` to allow empty billNumber
2. ✅ Updated backend controller to auto-generate billNumber if not provided (format: PUR-XXXXXXXX)
3. ✅ Removed asterisk (*) from Bill Number label in frontend UI
4. ✅ Removed frontend validation requiring billNumber
5. ✅ "CREATE PURCHASE BILL" button now enabled without billNumber

**Files Modified:**
- `/app/backend/src/validations/purchaseBill.js` - Changed `billNumber: Joi.string().trim().required()` to `billNumber: Joi.string().trim().allow('').optional()`
- `/app/backend/src/controller/purchaseBill.js` - Added conditional auto-generation of billNumber
- `/app/frontend/src/components/admin/suppliers/list.jsx` - Removed required indicator and validation from UI

**Test Results:** Backend validation tested - PASSED (empty bill numbers accepted)

---

## Critical Updates (February 10, 2026)

### P0 RESOLVED: Sales Total Discrepancy Fix
**Issue:** "Today's Sales" total on Day Start page was showing incorrect values because totalSales included ALL orders (paid + unpaid) instead of only PAID orders.

**Root Cause:** The `recordOrderCreated()` function in dailySummary.js was adding ALL order totals to `totalSales` regardless of payment status.

**Solution Implemented:**
1. ✅ Modified `recordOrderCreated()` to only add to totalSales when order.paymentStatus === 'paid'
2. ✅ Modified `recordOrderDeleted()` to only subtract from totalSales when order was PAID
3. ✅ Added new `recordPaymentStatusChange()` function to handle status toggle updates
4. ✅ Updated `togglePaymentStatus()` in order controller to call the new function
5. ✅ Updated `recalculateSummary()` to only include paid orders
6. ✅ Fixed frontend DayStart.jsx to properly convert API string values to numbers
7. ✅ Created SQL migration script for users to fix historical data

**Files Modified:**
- `/app/backend/src/services/dailySummary.js` - recordOrderCreated(), recordOrderDeleted(), recordPaymentStatusChange(), recalculateSummary()
- `/app/backend/src/controller/order.js` - togglePaymentStatus()
- `/app/frontend/src/components/admin/dayStart/DayStart.jsx` - Fixed Number() conversions

**Files Created:**
- `/app/backend/migrations/fix_daily_summary_totals.sql` - SQL script for users to fix historical data

**Test Results:** All 8 test cases PASSED (see /app/test_reports/iteration_8.json)

---

## Critical Updates (February 8, 2026)

### P0 RESOLVED: Database Persistence
**Issue:** PostgreSQL data was lost on every pod restart because data was stored on ephemeral overlay filesystem.

**Solution Implemented:**
1. ✅ Migrated PostgreSQL data directory to `/app/pgdata` (persistent NVMe volume)
2. ✅ Created initialization scripts for automatic recovery
3. ✅ Implemented backup/restore infrastructure
4. ✅ Crash simulation test passed - 100% data recovery

**Files Created:**
- `/app/backend/scripts/setup_postgres_persistent.sh` - Initial setup
- `/app/backend/scripts/init_postgres.sh` - Pod startup script
- `/app/backend/scripts/backup_postgres.sh` - Backup utility
- `/app/backend/scripts/restore_postgres.sh` - Restore utility
- `/app/backend/scripts/postgres_health.sh` - Health check
- `/app/backend/scripts/crash_simulation_test.sh` - Crash test
- `/app/backend/k8s/deployment.yaml` - Kubernetes reference
- `/app/backend/docs/DATABASE_PERSISTENCE.md` - Full documentation

### Financial Integrity Audit (February 8, 2026)
**All 5 production-level tests PASSED:**
| Test | Status |
|------|--------|
| Concurrency (100 simultaneous) | ✅ PASSED |
| Mutation (Edit/Delete/Void/Refund) | ✅ PASSED |
| Persistence (Crash survival) | ✅ PASSED |
| Numeric Precision (DECIMAL columns) | ✅ PASSED |
| Scale (10,000 invoices) | ✅ PASSED |

**Fixes Applied:**
1. Converted all monetary columns from DOUBLE PRECISION → DECIMAL(15,2)
2. Created Money utility module for fixed-decimal arithmetic
3. Fixed Sequelize DECIMAL string handling

**Files Created:**
- `/app/backend/src/utils/money.js` - Currency utility module
- `/app/backend/migrations/fix_decimal_columns.js` - Schema migration
- `/app/backend/tests/financial_audit.js` - Full audit suite
- `/app/backend/tests/FINANCIAL_AUDIT_REPORT.md` - Detailed report

---

## Recent Changes (January 30, 2026)

### Bug Fix: Product Selection for Weighted Products
**Issue:** Products were not being added to the invoice after pressing `=` key. Weighted products would disappear immediately after selection.

**Root Cause:** When selecting a weighted product, the code immediately attempted to fetch weight from the RS232 scale. Without a physical scale connected, this always failed and reset the entire form, making it impossible to even have a product selected.

**Fix Applied:** Removed auto-fetch weight on product selection in `frontend/src/components/admin/orders/create.jsx` (line 803-813). Now:
1. User selects a weighted product → stays selected
2. Price auto-fills from product database
3. User can modify price if needed
4. User presses `=` to fetch weight from scale and add product
5. If scale not connected, clear error message is shown

**Files Modified:**
- `frontend/src/components/admin/orders/create.jsx` - Removed auto-weight-fetch on product selection

---

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
- **P1:** Full user testing of overhauled Customers and Suppliers pages

## Future/Backlog
- **P2:** Complete RTK Query migration
- **P2:** Refactor orders/create.jsx (1900+ lines)
- **P2:** PDF export for adjusted invoices (GST Export Tool)
- **P2:** Fix price input race condition on /orders/create
- **P2:** Enhance Stock Management module with transaction tracking

---

## Key Files
- GST Export Tool: `/app/frontend/src/components/admin/gstExport/GstExportTool.jsx`
- GST Export Backend: `/app/backend/src/routes/gstExport.js`
- Purchase Bills: `/app/frontend/src/components/admin/purchases/list.jsx`
- Orders List: `/app/frontend/src/components/admin/orders/list.jsx`
- Order Controller: `/app/backend/src/controller/order.js`
- Day Start Page: `/app/frontend/src/components/admin/dayStart/DayStart.jsx`
- Daily Payments: `/app/frontend/src/components/admin/dailyPayments/DailyPayments.jsx`

---

## Completed (Jan 19, 2026)

### ✅ P0 - Day Start Page Cash Calculation (FIXED)
- **Issue:** Credit sales were incorrectly included in "Expected Cash in Drawer"
- **Fix:** Updated formula: `cashSales = totalSales` (since totalSales now only includes PAID orders)
- **Status:** Verified working with credit sale test

### ✅ P0 - Daily Payments Data Entry (VERIFIED)
- **Issue:** User reported data entry not working
- **Status:** Both Quick Expense and Supplier/Customer Payment forms working correctly

### ✅ P0 - Payment Data Entry Fix (FIXED - Jan 20, 2026)
- **Issue:** Supplier and customer payments failing with "WHERE parameter id has invalid undefined value"
- **Root Cause:** Payment controller was trying to lookup customer/supplier by `partyId` even when only `partyName` was provided
- **Fix:** Modified `/app/backend/src/controller/payment.js` to:
  - Handle null `partyId` gracefully
  - Lookup by `partyName` if `partyId` not provided
  - Always record cash receipt/payment even if party not found in database
  - Update customer balance only if customer exists
- **Files Modified:** `/app/backend/src/controller/payment.js`
- **Status:** Verified working via API and UI

### ✅ P0 - Payment Status Toggle on Orders List (NEW FEATURE)
- **Description:** Admin can now toggle payment status (Paid ↔ Unpaid) directly from orders list
- **Implementation:**
  - Click status chip to open confirmation dialog
  - Shows current vs new status with visual chips
  - Warning/success messages about receivables impact
  - Updates customer balance automatically
  - Audit logging for all changes
- **Files Modified:**
  - `/app/frontend/src/components/admin/orders/list.jsx`
  - `/app/backend/src/controller/order.js`
  - `/app/backend/src/routes/order.js`
- **API:** `PATCH /api/orders/:orderId/payment-status`

---

## Last Updated
February 16, 2026

---

## Completed (Feb 10, 2026)

### ✅ P0 - Sales Total Discrepancy (FIXED)
- **Issue:** "Today's Sales" total showing incorrect values - included unpaid orders
- **Root Cause:** Backend was adding ALL orders to totalSales instead of only PAID orders
- **Fix:** Modified dailySummary.js functions to only track PAID orders in totalSales
- **Files Modified:** dailySummary.js, order.js, DayStart.jsx
- **Test Status:** 8/8 test cases PASSED

### ✅ P1 - Customer & Supplier Ledger Pages Redesigned
- **What:** Complete professional redesign of /customers and /suppliers pages
- **Features Added:**
  - 5 summary cards with color-coded metrics
  - Search by name, mobile, GSTIN
  - Filter by balance status (with/without outstanding)
  - Pagination (5, 10, 25, 50 rows)
  - Export to CSV functionality
  - "Add Purchase Bill" feature for suppliers
- **Bug Fixed:** "customerId is not allowed" validation error when creating credit sales
- **Files Modified:** 
  - /frontend/src/components/admin/customers/list.jsx (complete rewrite)
  - /frontend/src/components/admin/suppliers/list.jsx (complete rewrite)

---

## Completed (Feb 3, 2026)

### ✅ P0 - View Recently Deleted Items After Submit (COMPLETED)
- **User Requirement:** User wants to verify which items were deleted from an invoice before printing, even after clicking submit
- **Implementation:**
  - Deleted items persist in a "Recently deleted items" section after invoice submission
  - Section header shows "Items removed from Invoice #[number]" after submit
  - Restore button is available BEFORE submit, hidden AFTER submit
  - Info message: "This list will clear when you add a new item"
  - Deleted items list clears only when first item is added to next invoice
- **Files Modified:**
  - `/app/frontend/src/components/admin/orders/create.jsx`
    - Line 555-561: Added `setRecentlyDeleted([])` when adding new item to next invoice
    - Line 1416-1422: Removed `setRecentlyDeleted([])` from createOrder to persist after submit
    - Line 2111-2148: Enhanced UI section with conditional rendering
- **Test Status:** All 6 test cases PASSED (verified by testing agent)

---

## Known Issues

### Backend - SequelizeUniqueConstraintError (Intermittent)
- **Issue:** Order creation sometimes fails with unique constraint error on invoice number
- **Impact:** Occasional order creation failures
- **Workaround:** Retry order submission

### Infrastructure - Database Not Persistent
- **Issue:** PostgreSQL database resets on environment restarts
- **Impact:** Data loss, need to re-seed after each restart
- **Status:** Requires infrastructure-level fix (persistent volumes)
