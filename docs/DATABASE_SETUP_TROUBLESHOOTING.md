# Database Setup Troubleshooting

Quick guide to fix common database setup issues in Supabase SQL Editor.

---

## Common Issues & Solutions

### Issue 1: "ERROR 42710: policy already exists"

**When you see this:**
```
Error: Failed to run sql query: ERROR: 42710: policy "Users can view own record" for table "users" already exists
```

**What it means:**
Your database schema already exists from a previous setup. The policies are already created.

**Solutions:**

**Option A: Use reset-db-delete-data.sql (RECOMMENDED)**
- This deletes only DATA, keeps your schema
- Run: `scripts/reset-db-delete-data.sql`
- Then: Seed admin user if needed: `scripts/seed-admin-user.sql`
- ✅ Safe! Schema is preserved.

**Option B: Complete reset (if you want to start completely fresh)**
- Run: `scripts/complete-db-reset.sql`
- Then: Run `scripts/setup-db.sql`
- Then: Run `scripts/migrations/002-add-usage-tracking-simple.sql`
- Then: Run `scripts/seed-admin-user.sql`
- ⚠️ Deletes EVERYTHING, start from scratch.

**Option C: Just skip setup-db.sql**
- If your schema already exists and works fine, you don't need to run setup-db.sql again
- Just run: `scripts/seed-admin-user.sql` to create/update admin user
- ✅ Fastest option if schema is already good.

---

### Issue 2: "ERROR 42P01: relation 'users' does not exist"

**When you see this:**
```
Error: Failed to run sql query: ERROR: 42P01: relation "users" does not exist
```

**What it means:**
You tried to delete tables that don't exist yet. This happens when:
- You run `complete-db-reset.sql` on a brand new database
- You run `reset-db-delete-data.sql` before schema was created

**Solution:**
This is actually **NORMAL and HARMLESS**. The script has `DROP TABLE IF EXISTS` which gracefully handles missing tables.

**If you see this message:**
1. ✅ **It's OK** - The script continues and handles it properly
2. Just wait for the script to finish
3. You should then run: `scripts/setup-db.sql`

---

### Issue 3: "ERROR 42601: syntax error at or near 'AS' on LINE 74"

**When you see this:**
```
Error: Failed to run sql query: ERROR: 42601: syntax error at or near "AS" LINE 74: SELECT id, email, name FROM users WHERE email = 'qsimeon@mit.edu' AS admin_user_result; ^
```

**What it means:**
Invalid SQL syntax. (This was a bug in the script that has been fixed.)

**Solution:**
✅ **FIXED** - Update your script to the latest version:
```bash
# Pull latest changes
git pull origin main

# Or manually copy the latest reset-db-delete-data.sql from GitHub
```

The line now reads correctly:
```sql
SELECT id, email, name FROM users WHERE email = 'qsimeon@mit.edu' LIMIT 1;
```

---

## Recommended Setup Procedure

If starting completely fresh:

### Step 1: Complete Reset (if database already has data)
```sql
-- In Supabase SQL Editor
Copy scripts/complete-db-reset.sql and run it
-- Note: You may see "table does not exist" errors - that's OK!
```

### Step 2: Create Schema
```sql
-- In Supabase SQL Editor
Copy scripts/setup-db.sql and run it
-- Should see: table creation messages, policy creation messages, no errors
```

### Step 3: Add Credit System
```sql
-- In Supabase SQL Editor
Copy scripts/migrations/002-add-usage-tracking-simple.sql and run it
-- Should see: migration complete message
```

### Step 4: Seed Admin User
```sql
-- In Supabase SQL Editor
Copy scripts/seed-admin-user.sql and run it
-- OR run locally:
npm run db:seed-admin
```

### Step 5: Verify
```sql
-- In Supabase SQL Editor
-- Check tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Check admin user
SELECT u.email, ut.free_expansions_remaining, ut.paid_credits_remaining
FROM users u
JOIN usage_tracking ut ON u.id = ut.user_id
WHERE u.email = 'qsimeon@mit.edu';
-- Expected: email=qsimeon@mit.edu, free=5, paid=95
```

---

## Which Script to Use When

| Situation | Script | Action |
|-----------|--------|--------|
| **First time setup** | setup-db.sql | Creates all tables and schema |
| | + migration 002 | Adds credit system |
| | + seed-admin | Creates admin user |
| **Have schema, clean data** | reset-db-delete-data.sql | Delete data, keep schema |
| | + seed-admin | Create admin user |
| **Start completely over** | complete-db-reset.sql | Delete EVERYTHING |
| | + setup-db.sql | Recreate schema |
| | + migration 002 | Add credit system |
| | + seed-admin | Create admin user |
| **Just reset data before deploy** | reset-db-delete-data.sql | Safe cleanup |
| **Add credit system to existing DB** | migration 002 | Adds tables/functions |
| **Create/update admin user** | seed-admin.sql | Just admin user |

---

## Database States

### After `setup-db.sql`:
```
✅ Tables: users, ideas, outputs, executions, credentials, blog_posts
✅ RLS Policies: All configured
✅ Indexes: All configured
✅ Storage: images bucket created
❌ Usage tracking: NOT YET (need migration 002)
❌ Users: None (created on first login)
```

### After migration 002:
```
✅ Previous + everything below:
✅ Tables: usage_tracking, payment_receipts
✅ Functions: check_user_has_credits, consume_expansion_credit, add_paid_credits
✅ Triggers: Auto-init usage tracking on user creation
❌ Users: Still none (created on first login)
```

### After `seed-admin-user.sql`:
```
✅ Previous + everything below:
✅ Admin user: qsimeon@mit.edu with 100 credits
✅ Ready to deploy!
```

---

## Checking Your Database State

```sql
-- See all tables
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Count of rows in each table
SELECT 'users' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'ideas', COUNT(*) FROM ideas
UNION ALL
SELECT 'outputs', COUNT(*) FROM outputs
UNION ALL
SELECT 'executions', COUNT(*) FROM executions
UNION ALL
SELECT 'credentials', COUNT(*) FROM credentials
UNION ALL
SELECT 'usage_tracking', COUNT(*) FROM usage_tracking
UNION ALL
SELECT 'payment_receipts', COUNT(*) FROM payment_receipts
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Should show "t" (true) for rowsecurity on all tables

-- Check functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;
-- Should include: check_user_has_credits, consume_expansion_credit, add_paid_credits
```

---

## Still Having Issues?

1. **Check Supabase project is active** (Settings → Project → Status should be "Active")
2. **Copy script content EXACTLY** (no modifications)
3. **Run one query at a time** if the full script fails
4. **Check browser console** for error details
5. **Verify your .env.local** has correct Supabase keys

For detailed database documentation, see: [DATABASE.md](./DATABASE.md)

---

## Script Files Location

```
scripts/
├── setup-db.sql                          # Initial schema setup
├── migrations/
│   └── 002-add-usage-tracking-simple.sql # Credit system
├── reset-db-delete-data.sql              # Delete data, keep schema
├── complete-db-reset.sql                 # Delete everything
├── seed-admin-user.sql                   # Seed admin (SQL)
├── db-helper.ts                          # Development tools
└── admin/
    ├── seed-admin-user.ts                # Seed admin (TypeScript)
    ├── grant-credits.ts                  # Grant credits to user
    └── check-user-usage.ts               # Check user credits
```

All scripts in `docs/DATABASE.md` with full documentation.
