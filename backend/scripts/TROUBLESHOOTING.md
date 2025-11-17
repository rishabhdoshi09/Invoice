# Database Migration Troubleshooting Guide

## Error 1: "must be owner of table customers"

### Problem
Your database user doesn't have permission to alter the `customers` and `suppliers` tables.

### Solutions (Choose One)

#### Solution A: Grant Permissions to Your Current User

Connect to PostgreSQL as a superuser and run:

```sql
-- Replace 'your_username' with your actual database username
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_username;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_username;
ALTER TABLE customers OWNER TO your_username;
ALTER TABLE suppliers OWNER TO your_username;
ALTER TABLE ledgers OWNER TO your_username;
```

Then retry the migration:
```bash
npx sequelize-cli db:migrate
```

#### Solution B: Run Migration as Database Owner

Find out who owns the tables:
```sql
SELECT tablename, tableowner FROM pg_tables WHERE tablename IN ('customers', 'suppliers');
```

Then run the migration using that user's credentials by updating your `.env` file temporarily.

#### Solution C: Use Manual SQL Script (Recommended)

Run the migration manually using the provided SQL script:

```bash
# Option 1: Using psql command line
psql -U your_superuser_username -d your_database_name -f scripts/manual-migration.sql

# Option 2: Using a database GUI (pgAdmin, DBeaver, etc.)
# Just copy the contents of scripts/manual-migration.sql and execute it
```

---

## Error 2: "function uuid_generate_v4() does not exist"

### Problem
PostgreSQL's UUID extension is not enabled in your database.

### Solutions (Choose One)

#### Solution A: Enable UUID Extension

Connect as a superuser and run:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

Then retry the seed:
```bash
npx sequelize-cli db:seed --seed 20241117100001-create-cash-account-ledger.js
```

#### Solution B: Use Updated Seed File (Already Fixed)

I've updated the seed file to use Node.js UUID generation instead of PostgreSQL's function. Just retry:

```bash
npx sequelize-cli db:seed --seed 20241117100001-create-cash-account-ledger.js
```

#### Solution C: Use Manual SQL Script

Run the seed manually:

```bash
# Option 1: Using psql
psql -U your_username -d your_database_name -f scripts/manual-seed.sql

# Option 2: Using database GUI
# Copy contents of scripts/manual-seed.sql and execute
```

---

## Complete Manual Deployment (If All Else Fails)

If you continue to have permission issues, follow these steps:

### Step 1: Connect to Your Database

```bash
# Using psql
psql -U your_username -d your_database_name

# Or use a GUI tool like pgAdmin, DBeaver, TablePlus, etc.
```

### Step 2: Run Migration SQL Manually

Copy and paste this SQL:

```sql
-- Add ledgerId to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS "ledgerId" UUID;
ALTER TABLE customers ADD CONSTRAINT fk_customers_ledger 
    FOREIGN KEY ("ledgerId") REFERENCES ledgers(id) 
    ON UPDATE CASCADE ON DELETE SET NULL;

-- Add ledgerId to suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS "ledgerId" UUID;
ALTER TABLE suppliers ADD CONSTRAINT fk_suppliers_ledger 
    FOREIGN KEY ("ledgerId") REFERENCES ledgers(id) 
    ON UPDATE CASCADE ON DELETE SET NULL;
```

### Step 3: Create Cash Account Ledger

Copy and paste this SQL:

```sql
INSERT INTO ledgers (id, "ledgerName", "ledgerType", "openingBalance", "currentBalance", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    'Cash Account',
    'asset',
    0,
    0,
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM ledgers WHERE "ledgerName" = 'Cash Account'
);
```

**Note:** If `gen_random_uuid()` doesn't work, use one of these alternatives:

```sql
-- Alternative 1: If you have uuid-ossp extension
uuid_generate_v4()

-- Alternative 2: Generate UUID manually
-- Go to https://www.uuidgenerator.net/ and generate a UUID
-- Then use it like this:
'12345678-1234-1234-1234-123456789abc'  -- Replace with your generated UUID
```

### Step 4: Run Fix Script

```bash
node scripts/fix-ledgers.js
```

### Step 5: Restart Backend

```bash
npm start
# OR
pm2 restart invoice-backend
```

---

## Verification Checklist

After running the manual scripts, verify everything worked:

### 1. Check Columns Exist

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('customers', 'suppliers') 
AND column_name = 'ledgerId';
```

**Expected:** 2 rows (one for customers, one for suppliers)

### 2. Check Cash Account Exists

```sql
SELECT * FROM ledgers WHERE "ledgerName" = 'Cash Account';
```

**Expected:** 1 row with Cash Account details

### 3. Check Customers Have Ledgers

```sql
SELECT c.id, c.name, c."ledgerId", l."ledgerName"
FROM customers c
LEFT JOIN ledgers l ON c."ledgerId" = l.id
LIMIT 5;
```

**Expected:** All customers should have a ledgerId and ledgerName

### 4. Check Suppliers Have Ledgers

```sql
SELECT s.id, s.name, s."ledgerId", l."ledgerName"
FROM suppliers s
LEFT JOIN ledgers l ON s."ledgerId" = l.id
LIMIT 5;
```

**Expected:** All suppliers should have a ledgerId and ledgerName

---

## Common PostgreSQL Permission Commands

### Grant All Permissions to User

```sql
-- As superuser (postgres)
GRANT ALL PRIVILEGES ON DATABASE your_database TO your_username;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_username;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_username;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO your_username;
```

### Change Table Owner

```sql
ALTER TABLE customers OWNER TO your_username;
ALTER TABLE suppliers OWNER TO your_username;
ALTER TABLE ledgers OWNER TO your_username;
ALTER TABLE payments OWNER TO your_username;
```

### Enable UUID Extension

```sql
-- As superuser
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## Getting Database Connection Info

### Find Your Database Name

```bash
# In your .env file
cat .env | grep DB_NAME
```

### Find Your Database User

```bash
# In your .env file
cat .env | grep DB_USER
```

### Find Table Owners

```sql
SELECT tablename, tableowner 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

---

## Still Having Issues?

1. **Check your .env file** - Make sure database credentials are correct
2. **Check PostgreSQL is running** - `pg_isready` or check Activity Monitor/Task Manager
3. **Check you can connect** - `psql -U your_username -d your_database`
4. **Check backend logs** - Look for specific error messages
5. **Try the manual SQL scripts** - They bypass Sequelize permission issues

---

## Quick Reference: All Manual Steps

```bash
# 1. Run manual migration
psql -U your_username -d your_database -f scripts/manual-migration.sql

# 2. Run manual seed
psql -U your_username -d your_database -f scripts/manual-seed.sql

# 3. Fix existing data
node scripts/fix-ledgers.js

# 4. Restart server
npm start
```
