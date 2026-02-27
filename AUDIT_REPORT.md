# Comprehensive Code Audit Report
**Application**: Double-Entry Accounting Ledger & Invoicing System  
**Date**: 27 Feb 2026  
**Scope**: Full-stack (React + Express + PostgreSQL)

---

## EXECUTIVE SUMMARY

| Area | Score | Risk Level |
|------|-------|------------|
| **Core Accounting Logic** | 9/10 | LOW |
| **Fraud Detection** | 8/10 | LOW |
| **Data Integrity** | 6/10 | MEDIUM |
| **Security** | 4/10 | HIGH |
| **Code Quality** | 5/10 | MEDIUM |
| **DevOps & Deployment** | 3/10 | HIGH |

**Overall**: The accounting logic is solid and production-worthy. The fraud detection system is well-designed. However, there are **critical security gaps** and **data integrity risks** that should be addressed before considering this production-ready for sensitive financial data.

---

## 1. STRENGTHS (What's Working Well)

### 1.1 Double-Entry Ledger Design
- Clean separation between old system and new ledger (additive, reversible)
- Every transaction creates balanced journal batches (debit = credit)
- Health check endpoint validates system-wide balance
- Drift detection runs daily to catch mismatches early

### 1.2 Fraud Detection
- Silent audit trail logs are excellent — billers can't detect they're being monitored
- Weight scale tracking with "used/unused" status is a smart anti-fraud measure
- Item deletion logging captures product details, value, time, and context

### 1.3 Migration Strategy
- Historical data migration is repeatable and idempotent
- Safe reconciliation mode does read-only comparison
- Backfill endpoint handles cash receipt gaps

### 1.4 Business Logic
- Payment toggle with ledger integration is correctly implemented
- Customer/supplier balance calculations properly account for soft-deletes
- Opening balance handling works for both customers and suppliers

---

## 2. CRITICAL SECURITY VULNERABILITIES

### 2.1 No Rate Limiting (CRITICAL)
**Risk**: Brute-force attacks on login, API abuse  
**Current**: Zero rate limiting on any endpoint  
**Fix**: Add `express-rate-limit` middleware
```
Priority: P0 — Takes 30 minutes to implement
```

### 2.2 CORS Wide Open (HIGH)
**Risk**: Any website can make API calls to your backend  
**Current**: `app.use(cors())` — allows ALL origins  
**Fix**: Whitelist only your frontend domains
```javascript
app.use(cors({ origin: ['https://your-domain.com'] }))
```
```
Priority: P0 — Takes 5 minutes
```

### 2.3 JWT Secret Hardcoded Risk (HIGH)
**Risk**: If JWT secret is weak or leaked, anyone can forge admin tokens  
**Verify**: Ensure `JWT_SECRET` in .env is a strong random string (32+ chars)  
```
Priority: P0 — Verify immediately
```

### 2.4 No Input Sanitization on Raw Queries (MEDIUM)
**Risk**: 28 raw SQL queries found — potential SQL injection  
**Current**: Most use Sequelize replacements (parameterized), which is good  
**Audit**: Verify ALL raw queries use `replacements:` not string interpolation  
```
Priority: P1 — Audit takes 1 hour
```

### 2.5 Setup Endpoint Always Available (MEDIUM)
**Risk**: `/api/auth/setup` and `/api/auth/setup-check` have no authentication  
**Current**: Anyone can check if setup is complete. If the setup logic doesn't properly prevent re-setup after initial admin creation, this is exploitable.  
**Fix**: Disable setup endpoint after first admin is created  
```
Priority: P1
```

---

## 3. DATA INTEGRITY RISKS

### 3.1 Race Conditions (HIGH)
**Risk**: Concurrent requests can cause incorrect balances  
**Current**: 19 `findOne`/`findByPk` calls WITHOUT transaction; only 1 WITH transaction  
**Example**: Two billers toggling the same order's payment status simultaneously could create double ledger entries  
**Fix**: Add `FOR UPDATE` row locks in critical paths:
- `togglePaymentStatus` 
- `createOrder` (customer balance update)
- `deleteOrder` (ledger reversal)
- `createPayment` (party balance update)
```
Priority: P0 — Most critical data integrity fix
```

### 3.2 No Unique Constraint on Customer Name + Mobile (MEDIUM)
**Risk**: Duplicate customer records with slightly different names ("Sharma" vs "SHARMA")  
**Current**: Customer lookup is case-sensitive  
**Fix**: Add case-insensitive unique index or normalize names on insert  
```
Priority: P1
```

### 3.3 Decimal Precision (LOW)
**Current**: `DECIMAL(15,2)` is correct for financial data  
**Note**: Ensure all JavaScript calculations use `Number()` consistently — avoid floating-point arithmetic bugs  
```
Status: OK — properly handled
```

---

## 4. CODE QUALITY ISSUES

### 4.1 Large Files (Maintainability Risk)
| File | Lines | Concern |
|------|-------|---------|
| `ledgerMigrationService.js` | 1031 | Should split into separate migration handlers |
| `order.js` (controller) | 857 | Handles creation, editing, deletion, toggle, notes, audit |
| `ledgerService.js` | 807 | Core service — acceptable but could use splitting |
| `realTimeLedger.js` | 668 | Growing with each new feature |
| `payment.js` (controller) | 639 | Complex payment logic |

**Recommendation**: Extract order controller into smaller modules (orderCreate, orderUpdate, orderToggle, etc.)

### 4.2 Inconsistent Error Handling
**Current**: Mix of:
- `throw new Error(...)` 
- `return res.status(500).send({...})`
- `console.error` + silent failure
- Try/catch that swallows errors

**Fix**: Create a centralized error handler middleware:
```javascript
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ 
        status: err.status || 500, 
        message: err.message 
    });
});
```
```
Priority: P2
```

### 4.3 No Input Validation on 7 of 15 Controllers
**Current**: Only 8 of 15 controllers have Joi validation  
**Missing validation on**: dashboard, ledger, stock, audit, reports, supplier, dailyExpense  
**Risk**: Invalid data can reach the database  
```
Priority: P1
```

---

## 5. FRAUD DETECTION GAPS

### 5.1 What the Audit Trail COVERS (Good)
- Item deletion from bill before submission
- Bill deletion after submission  
- Weight scale usage and whether weight was added to a bill
- Manual vs. scale item differentiation
- Payment status toggles (now with ledger entries)

### 5.2 What the Audit Trail MISSES (Gaps)

| Gap | Risk | Recommendation |
|-----|------|----------------|
| **Price modifications** | Biller reduces item price before submitting | Log original price vs submitted price |
| **Quantity modifications** | Biller reduces quantity (e.g., 5kg → 4kg) | Log weight from scale vs entered quantity |
| **Discount abuse** | Biller applies unauthorized discounts | Require admin approval for discounts > X% |
| **Order editing after submission** | Biller edits a submitted order | Log all field changes with before/after values |
| **Customer swapping** | Biller changes customer on a credit sale | Log customer name changes on orders |
| **Void patterns** | Biller creates and immediately deletes orders | Alert when delete rate > threshold |
| **Cash handling** | Biller collects cash but marks as unpaid | Cross-reference payment toggles with cash drawer |

### 5.3 Recommended Fraud Alerts
```
P0: Alert when same biller deletes > 3 items per day
P0: Alert when order is created and deleted within 5 minutes
P1: Alert when total weight from scale ≠ total weight in bill
P1: Alert when price entered < minimum product price
P2: Weekly summary of all modifications by each biller
```

---

## 6. ARCHITECTURE & DEVOPS

### 6.1 Database Migrations (FIXED in this session)
**Before**: Manual ALTER TABLE commands shared via chat  
**After**: `sequelize-cli` with consolidated migration file  
**Command**: `npx sequelize-cli db:migrate`

### 6.2 No Backup Strategy (CRITICAL)
**Risk**: Database corruption or accidental deletion = total data loss  
**Fix**: 
```
P0: Set up pg_dump cron job (daily automated backups)
P0: Test restore procedure
P1: Set up point-in-time recovery (WAL archiving)
```

### 6.3 No Logging Infrastructure
**Current**: `console.log` everywhere  
**Fix**: Use `winston` or `pino` with:
- Log levels (error, warn, info, debug)
- File rotation
- Structured JSON format for analysis
```
Priority: P2
```

### 6.4 No Health Check Endpoint
**Current**: No simple `/health` endpoint for monitoring  
**Fix**: Add endpoint that checks DB connectivity + returns version  
```
Priority: P2
```

---

## 7. RECOMMENDED ACTION PLAN

### Phase 1: Critical Security (1-2 days)
1. Add rate limiting (`express-rate-limit`) — all endpoints
2. Restrict CORS to your domain
3. Verify JWT secret strength
4. Disable `/api/auth/setup` after first admin

### Phase 2: Data Integrity (2-3 days)
1. Add `FOR UPDATE` row locks in payment toggle, order create, payment create
2. Add input validation to all controllers
3. Set up database backup cron job

### Phase 3: Fraud Detection Enhancement (1 week)
1. Log price/quantity modifications
2. Add suspicious activity alerts (threshold-based)
3. Build weekly biller activity summary

### Phase 4: Code Quality (Ongoing)
1. Centralize error handling
2. Split large controllers
3. Add structured logging
4. Write integration tests for critical flows

---

## 8. WHAT KEEPS YOUR DATA SAFE TODAY

Despite the issues above, several things are working in your favor:
1. **Double-entry accounting** — Every transaction is balanced. If something goes wrong, the health check will catch it.
2. **Silent audit trail** — Your biller doesn't know they're being watched.
3. **Ledger is additive** — Old system data is untouched. You can always fall back.
4. **Soft deletes** — Nothing is truly deleted. Every deletion is recoverable.
5. **Drift detection** — Daily automated check catches discrepancies.

---

*Report generated as part of the comprehensive code audit requested by the application owner.*
