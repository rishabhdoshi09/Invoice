# Customer Invoicing System - Product Requirements Document

## Original Problem Statement
Build a customer invoicing/billing application for managing orders, products, payments, and generating invoices. The system should support:
- Order creation with weighted and non-weighted products
- Invoice generation with PDF export
- Daily payment tracking
- GST/Tally export for accounting compliance
- Role-based access (Admin, Billing Staff)

## Current Architecture

### Tech Stack
- **Frontend:** React (Create React App), Redux Toolkit, Material-UI (MUI), Formik
- **Backend:** Node.js, Express.js, Sequelize ORM
- **Database:** PostgreSQL
- **Process Manager:** Supervisor

### Code Structure
```
/app/
├── backend/         # Node.js/Express backend
│   ├── src/
│   │   ├── controller/   # API controllers
│   │   ├── dao/          # Data access layer
│   │   ├── middleware/   # Auth, audit logging
│   │   ├── models/       # Sequelize models
│   │   ├── routes/       # Express routes
│   │   ├── services/     # Business logic
│   │   └── validations/  # Input validation
│   └── index.js
├── frontend/        # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── context/      # React context (Auth)
│   │   ├── services/     # API service layer
│   │   └── store/        # Redux store
└── memory/          # Documentation
```

## What's Been Implemented

### Session: January 9, 2026

#### Features Completed:
1. **Admin Quick Reference Guide** - Added helpful guide on order creation page showing:
   - Keyboard shortcuts (/, =, Shift+D, Ctrl+P)
   - Price protection rules
   - Visible only to admin users

2. **Price Input Race Condition Fix** - Resolved issue where rapid typing caused digits to be missed:
   - Implemented local state (`localPrice`) for immediate UI updates
   - Debounced Formik updates (50ms) to prevent race conditions
   - Added proper sync between local state and Formik on blur/product selection

3. **Orders Auto-Refetch** - Fixed issue where new orders didn't appear instantly:
   - Modified `createOrderAction` to trigger automatic list refresh after order creation
   - Added cleanup logic in list component when cache is cleared

4. **Database Schema Sync** - Added missing columns to PostgreSQL tables:
   - orders: `isDeleted`, `deletedAt`, `deletedBy`, `deletedByName`, `customerGstin`, `placeOfSupply`, `staffNotes`, `staffNotesUpdatedAt`, `staffNotesUpdatedBy`, `createdBy`, `createdByName`, `modifiedBy`, `modifiedByName`, `paidAmount`, `dueAmount`, `customerId`, `paymentStatus`
   - orderItems: `altName`
   - Created ledger accounts: Sales Account, Cash Account

## Key API Endpoints
- `GET /api/orders` - List orders with filtering/pagination
- `POST /api/orders` - Create new order
- `DELETE /api/orders/:id` - Soft delete order
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `POST /api/auth/login` - User authentication
- `GET /api/auth/me` - Current user info

## Key Files Reference
- `/app/frontend/src/components/admin/orders/create.jsx` - Order creation page (1900+ lines)
- `/app/frontend/src/components/admin/orders/list.jsx` - Orders list page
- `/app/frontend/src/store/orders.js` - Redux order state management
- `/app/frontend/src/context/AuthContext.jsx` - Authentication context
- `/app/backend/src/controller/order.js` - Order controller
- `/app/backend/src/models/order.js` - Order Sequelize model

## User Roles
- **Admin:** Full access, price protection enabled (bypass with Caps Lock)
- **Billing Staff:** Simplified workflow, no price protection

## Test Credentials
- Username: `admin`
- Password: `admin123`

## Prioritized Backlog

### P0 (Critical)
- None currently

### P1 (High Priority)
- Create guided flow for payment entries (dashboard with clear action buttons)
- Refactor `orders/create.jsx` (1900+ lines) into smaller components

### P2 (Medium Priority)
- Add more keyboard shortcuts for billing staff
- Improve error handling and validation messages
- Add unit tests for critical flows

## Known Issues
- Invoice sequence doesn't auto-update (manual DB fix needed if sequence gets out of sync)
- Some lint warnings in create.jsx (empty catch blocks)

## Notes for Future Development
- Consider using RTK Query for automatic cache management
- The `create.jsx` component is a major source of technical debt
- Role-based features should be tested with actual billing_staff user
