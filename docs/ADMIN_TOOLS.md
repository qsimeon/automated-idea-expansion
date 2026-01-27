# Admin Tools Guide

Complete documentation for admin tools for managing users, granting credits, and debugging the database.

---

## Table of Contents

1. [Overview](#overview)
2. [Seed Admin User](#seed-admin-user)
3. [Check User Usage](#check-user-usage)
4. [Grant Credits Manually](#grant-credits-manually)
5. [Buy Me a Coffee Workflow](#buy-me-a-coffee-workflow)
6. [Database Debugging](#database-debugging)
7. [User Management](#user-management)
8. [Monitoring & Analytics](#monitoring--analytics)
9. [Troubleshooting](#troubleshooting)

---

## Overview

Admin tools are scripts and SQL queries for:
- Creating/managing users
- Granting credits after payment
- Debugging database issues
- Monitoring usage and performance
- Viewing payment history

**Location:** `scripts/admin/` directory

**Requirements:**
- `.env.local` with `SUPABASE_SERVICE_ROLE_KEY`
- NodeJS 18+ and npm
- Access to Supabase dashboard (for SQL queries)

---

## Seed Admin User

Creates or resets admin user with 100 credits.

### SQL Version (Supabase SQL Editor)

**File:** `scripts/seed-admin-user.sql`

**How to run:**
1. Go to Supabase Dashboard → SQL Editor
2. Click "New Query"
3. Copy `scripts/seed-admin-user.sql`
4. Click "Run"

**What it does:**
- Creates user `qsimeon@mit.edu` (or updates if exists)
- Sets name to "Quilee Simeon"
- Sets timezone to "America/New_York"
- Creates `usage_tracking` record with 5 free + 95 paid credits

**Verification:**
```sql
SELECT u.email, u.name, ut.free_expansions_remaining, ut.paid_credits_remaining
FROM users u
JOIN usage_tracking ut ON u.id = ut.user_id
WHERE u.email = 'qsimeon@mit.edu';

-- Expected:
-- | email           | name            | free | paid |
-- |-----------------|-----------------|------|------|
-- | qsimeon@mit.edu | Quilee Simeon   |  5   | 95   |
```

### TypeScript Version (Local)

**File:** `scripts/admin/seed-admin-user.ts`

**How to run:**
```bash
npm run db:seed-admin
```

Or directly:
```bash
npx tsx scripts/admin/seed-admin-user.ts
```

**Output:**
```
🌱 Seeding admin user...

Step 1: Creating/updating user...
✅ User created/updated: qsimeon@mit.edu

Step 2: Setting up usage tracking...
✅ Usage tracking configured

Step 3: Verifying...
✅ Verification successful

═══════════════════════════════════════════════════════════
✨ Admin user seeding complete!

Email:         qsimeon@mit.edu
Name:          Quilee Simeon
Timezone:      America/New_York
Free Credits:  5
Paid Credits:  95
Total Credits: 100
═══════════════════════════════════════════════════════════

✅ Ready to deploy! Admin user can now log in via GitHub.
```

### Customization

To use different email (not qsimeon@mit.edu):

**SQL version:**
```sql
-- Edit the script:
-- Replace 'qsimeon@mit.edu' with 'your-email@example.com'
-- Replace 'Quilee Simeon' with 'Your Name'
INSERT INTO users (email, name, timezone)
VALUES ('your-email@example.com', 'Your Name', 'America/New_York')
...
```

**TypeScript version:**
Edit `scripts/admin/seed-admin-user.ts` line ~50:
```typescript
const DEFAULT_ADMIN: AdminUserConfig = {
  email: 'your-email@example.com',
  name: 'Your Name',
  timezone: 'America/New_York',
  freeCredits: 5,
  paidCredits: 95,
};
```

---

## Check User Usage

View a user's credit balance and usage history.

### Command Line

**File:** `scripts/admin/check-user-usage.ts`

**How to run:**
```bash
npm run db:check-usage
# Or directly:
npx tsx scripts/admin/check-user-usage.ts user@example.com
```

**Output:**
```
🔍 Checking usage for user@example.com...

User: user@example.com
Free Credits: 5
Paid Credits: 0
Total Remaining: 5
Total Used: 0

Last expansion: None
```

### SQL Query

```sql
-- Check single user
SELECT
  u.email,
  u.name,
  ut.free_expansions_remaining,
  ut.paid_credits_remaining,
  (ut.free_expansions_remaining + ut.paid_credits_remaining) as total_remaining,
  ut.total_expansions_used,
  ut.total_free_used,
  ut.total_paid_used
FROM users u
JOIN usage_tracking ut ON u.id = ut.user_id
WHERE u.email = 'user@example.com';
```

### All Users Summary

```sql
-- Check all users and their credits
SELECT
  u.email,
  u.name,
  COUNT(DISTINCT i.id) as ideas_created,
  COUNT(DISTINCT o.id) as outputs_generated,
  ut.free_expansions_remaining,
  ut.paid_credits_remaining,
  (ut.free_expansions_remaining + ut.paid_credits_remaining) as total_remaining,
  ut.total_expansions_used,
  u.created_at
FROM users u
LEFT JOIN usage_tracking ut ON u.id = ut.user_id
LEFT JOIN ideas i ON u.id = i.user_id
LEFT JOIN outputs o ON u.id = o.user_id
GROUP BY u.id, u.email, u.name, ut.free_expansions_remaining, ut.paid_credits_remaining, ut.total_expansions_used, u.created_at
ORDER BY ut.total_expansions_used DESC, u.created_at DESC;
```

### Find Users with Zero Credits

```sql
-- Users who are out of credits
SELECT
  u.email,
  u.name,
  ut.free_expansions_remaining,
  ut.paid_credits_remaining,
  ut.total_expansions_used,
  MAX(e.completed_at) as last_expansion
FROM users u
JOIN usage_tracking ut ON u.id = ut.user_id
LEFT JOIN executions e ON u.id = e.user_id
WHERE (ut.free_expansions_remaining + ut.paid_credits_remaining) = 0
GROUP BY u.id, u.email, u.name, ut.free_expansions_remaining, ut.paid_credits_remaining, ut.total_expansions_used
ORDER BY MAX(e.completed_at) DESC NULLS LAST;
```

---

## Grant Credits Manually

Add paid credits to user account after Buy Me a Coffee payment verification.

### File

`scripts/admin/grant-credits.ts`

### Usage

```bash
npx tsx scripts/admin/grant-credits.ts <email> <credits> <amount> [bmc_ref] [notes]

# Or via npm
npm run admin:grant-credits <email> <credits> <amount> [bmc_ref] [notes]
```

### Examples

```bash
# Grant 5 credits after $5 payment
npx tsx scripts/admin/grant-credits.ts john@example.com 5 5.00 "BMC-20260127-ABC123"

# Grant 10 credits with notes
npx tsx scripts/admin/grant-credits.ts jane@example.com 10 10.00 "BMC-xyz" "Bulk purchase"

# Minimal (just required args)
npx tsx scripts/admin/grant-credits.ts user@example.com 1 1.00 "email-received-20260127"
```

### Arguments

| Argument | Required | Description | Example |
|----------|----------|-------------|---------|
| email | Yes | User's email | user@example.com |
| credits | Yes | Credits to grant | 5 |
| amount | Yes | USD amount paid | 5.00 |
| bmc_ref | No | Buy Me a Coffee ref | "BMC-12345" |
| notes | No | Admin notes | "Verified payment" |

### Output

```
💳 Processing credit grant...

User Email: john@example.com
Credits to Grant: 5
Reference: BMC-20260127-ABC123

Step 1: Looking up user...
✅ User found: John Doe

Step 2: Getting current credits...
Current Credits: 0

Step 3: Creating payment receipt...
✅ Payment receipt created

Step 4: Verifying...
✅ Verification successful

═══════════════════════════════════════════════════════════
✨ Credits granted successfully!

User:              john@example.com
Credits Added:     5
Previous Total:    0
New Total:         5
Receipt ID:        550e8400-e29b-41d4-a716-446655440000
Reference:         BMC-20260127-ABC123
═══════════════════════════════════════════════════════════

✅ User can now expand ideas with new credits!
```

### Troubleshooting

- **"User not found"** → Check email spelling, user must sign up first
- **"Invalid credits"** → Must be positive integer (e.g., 5, not -5)
- **"Database error"** → Check `.env.local` has SUPABASE_SERVICE_ROLE_KEY

---

## Buy Me a Coffee Workflow

Complete workflow for processing payments and granting credits.

### Step 1: User Makes Payment

**What user does:**
1. In app, clicks "Buy More Credits" button
2. Button links to: `https://buymeacoffee.com/your-username`
3. User selects amount (e.g., $5 for 5 credits)
4. User completes payment

### Step 2: You Receive Notification

**What happens:**
1. You receive email from Buy Me a Coffee
2. Email contains:
   ```
   Subject: You received a $5 coffee from John Doe

   New supporter: John Doe
   Email: john@example.com
   Message: "I'd like 5 credits please"
   Amount: $5.00
   Reference: BMC-2024-01-27-ABC123
   Date: January 27, 2026
   ```

### Step 3: Verify Payment

**What to check:**
1. Email is from buymeacoffee.com (official domain)
2. Amount matches credit request in message
3. Email address looks legitimate (not spam)
4. Reference ID is unique (first time for this user)

### Step 4: Grant Credits

**Run admin script:**
```bash
npx tsx scripts/admin/grant-credits.ts john@example.com 5 5.00 "BMC-2024-01-27-ABC123"
```

### Step 5: Verify in Database

**SQL query:**
```sql
SELECT * FROM payment_receipts
WHERE bmc_reference = 'BMC-2024-01-27-ABC123';
```

### Step 6: Optional: Send Email to User

**Email template:**
```
Subject: Your credits have been added! ✨

Hi John,

I've verified your $5.00 payment and added 5 credits to your account!

You can now expand 5 more ideas. Just log in and start expanding.

Thanks for supporting the project! 🎉

Best,
[Your name]
```

### Security Best Practices

1. **Verify email sender** - Check it's from buymeacoffee.com
2. **Check reference ID** - Make sure it's unique
3. **Verify amount matches** - $1 = 1 credit
4. **Look for red flags:**
   - Requests for free credits
   - Unusual email domains
   - Multiple "typo" attempts
5. **Create audit trail** - Use bmc_reference for tracking

---

## Database Debugging

### Database Helper Tool

**File:** `scripts/db-helper.ts`

**Commands:**
```bash
npm run db check-ideas      # List all ideas
npm run db check-outputs    # List all outputs
npm run db check-join       # Test join queries
npm run db check-fk         # Verify foreign keys
npm run db clear            # Delete test user data (dev only)
```

### Check Ideas

```bash
npm run db check-ideas
```

**Output:**
```
📋 Checking ideas...

Found 3 ideas:

1. [pending] "Build a blog platform"
   ID: 550e8400-e29b-41d4-a716-446655440000
   Created: 1/27/2026, 10:30:45 AM

2. [expanded] "Create a CLI tool"
   ID: 660e8400-e29b-41d4-a716-446655440001
   Created: 1/27/2026, 11:15:22 AM

3. [pending] "Design a logo"
   ID: 770e8400-e29b-41d4-a716-446655440002
   Created: 1/27/2026, 2:45:10 PM
```

### Check Outputs

```bash
npm run db check-outputs
```

**Output:**
```
📄 Checking outputs...

Found 2 outputs:

1. [blog_post] Output ID: 550e8400-e29b-41d4-a716-446655440100
   Idea ID: 550e8400-e29b-41d4-a716-446655440000
   Created: 1/27/2026, 10:35:12 AM

2. [github_repo] Output ID: 660e8400-e29b-41d4-a716-446655440101
   Idea ID: 660e8400-e29b-41d4-a716-446655440001
   Created: 1/27/2026, 11:20:45 AM
```

### Check Foreign Keys

```bash
npm run db check-fk
```

**Output:**
```
🔑 Checking foreign key constraints...

ideas.user_id → users.id
outputs.user_id → users.id
outputs.idea_id → ideas.id
outputs.execution_id → executions.id
executions.user_id → users.id
```

### Manual SQL Queries

**Check table row counts:**
```sql
SELECT
  'users' as table_name, COUNT(*) as count FROM users
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
```

**Check RLS policies are enabled:**
```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('users', 'ideas', 'outputs', 'executions', 'credentials', 'usage_tracking', 'payment_receipts');
```

---

## User Management

### Create User Manually

**Rare - Users are auto-created via GitHub OAuth!**

If you need to create user manually:

```sql
INSERT INTO users (email, name, timezone)
VALUES ('user@example.com', 'John Doe', 'America/New_York');

-- Trigger automatically creates usage_tracking with 5 free credits
```

### View All Users

```sql
SELECT
  id,
  email,
  name,
  timezone,
  created_at,
  updated_at
FROM users
ORDER BY created_at DESC;
```

### Delete User

**Warning: Cascades to all related data!**

```sql
DELETE FROM users WHERE email = 'user@example.com';
-- This also deletes: ideas, outputs, executions, credentials, etc.
```

### Update User Info

```sql
UPDATE users
SET name = 'New Name', timezone = 'Europe/London'
WHERE email = 'user@example.com';
```

### View User's Credentials

```sql
SELECT
  provider,
  is_active,
  validation_status,
  created_at
FROM credentials
WHERE user_id = (SELECT id FROM users WHERE email = 'user@example.com');
```

---

## Monitoring & Analytics

### Usage Statistics

**Ideas created per user:**
```sql
SELECT
  u.email,
  COUNT(i.id) as ideas_count,
  COUNT(CASE WHEN i.status = 'expanded' THEN 1 END) as expanded_count,
  COUNT(CASE WHEN i.status = 'pending' THEN 1 END) as pending_count
FROM users u
LEFT JOIN ideas i ON u.id = i.user_id
GROUP BY u.id, u.email
ORDER BY ideas_count DESC;
```

**Outputs per user:**
```sql
SELECT
  u.email,
  COUNT(o.id) as outputs_count,
  COUNT(CASE WHEN o.format = 'blog_post' THEN 1 END) as blogs,
  COUNT(CASE WHEN o.format = 'github_repo' THEN 1 END) as repos,
  COUNT(CASE WHEN o.format = 'image' THEN 1 END) as images
FROM users u
LEFT JOIN outputs o ON u.id = o.user_id
GROUP BY u.id, u.email
ORDER BY outputs_count DESC;
```

**Execution statistics:**
```sql
SELECT
  u.email,
  COUNT(*) as total_executions,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
  SUM(COALESCE(tokens_used, 0)) as total_tokens,
  AVG(duration_seconds)::NUMERIC(10, 2) as avg_duration_seconds
FROM executions e
JOIN users u ON e.user_id = u.id
GROUP BY u.id, u.email
ORDER BY total_executions DESC;
```

**Failed expansions analysis:**
```sql
SELECT
  u.email,
  e.error_step,
  e.error_message,
  COUNT(*) as count,
  MAX(e.completed_at) as latest_error
FROM executions e
JOIN users u ON e.user_id = u.id
WHERE e.status = 'failed'
GROUP BY u.id, u.email, e.error_step, e.error_message
ORDER BY count DESC;
```

**Payment statistics:**
```sql
SELECT
  COUNT(*) as total_payments,
  SUM(amount_usd) as total_revenue,
  SUM(credits_purchased) as total_credits_sold,
  AVG(amount_usd) as avg_payment,
  COUNT(DISTINCT user_id) as unique_payers
FROM payment_receipts
WHERE status = 'verified';
```

### Execution Log Analysis

**Recent failures:**
```sql
SELECT
  u.email,
  e.format_chosen,
  e.error_step,
  e.error_message,
  e.completed_at
FROM executions e
JOIN users u ON e.user_id = u.id
WHERE e.status = 'failed'
ORDER BY e.completed_at DESC
LIMIT 10;
```

**Performance metrics:**
```sql
SELECT
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_seconds) as p50_duration,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_seconds) as p95_duration,
  AVG(tokens_used) as avg_tokens,
  MAX(tokens_used) as max_tokens
FROM executions
WHERE status = 'completed';
```

---

## Troubleshooting

### Issue: "User not found"

**When running:**
```bash
npx tsx scripts/admin/grant-credits.ts user@example.com ...
```

**Cause:** User hasn't signed up yet (no GitHub OAuth)

**Solution:**
1. User must sign in with GitHub first
2. This auto-creates user record
3. Then run grant-credits script

### Issue: "Permission denied" error

**When running admin scripts**

**Cause:** Missing `.env.local` or wrong `SUPABASE_SERVICE_ROLE_KEY`

**Solution:**
1. Create `.env.local` in project root
2. Add: `SUPABASE_SERVICE_ROLE_KEY=<your-key>`
3. Get key from Supabase Dashboard → Settings → API
4. Make sure it's the SERVICE ROLE key (not anon key)

### Issue: "Database table does not exist"

**When running SQL queries**

**Cause:** Database setup not complete

**Solution:**
1. Run `scripts/setup-db.sql` first
2. Run `scripts/migrations/002-add-usage-tracking-simple.sql` second
3. Then try query again

### Issue: "RLS policy blocking operation"

**When running SQL admin queries**

**Cause:** RLS is filtering data based on current user

**Solution:**
1. Use SUPABASE_SERVICE_ROLE_KEY (which bypasses RLS)
2. Or run queries in Supabase SQL Editor (uses service role)
3. Or use Postgres connection string with admin role

---

## Quick Reference

### Commands

```bash
# Seed admin user
npm run db:seed-admin

# Check user usage
npm run db:check-usage

# Grant credits
npm run admin:grant-credits <email> <credits> <amount> <ref>

# Database debugging
npm run db check-ideas
npm run db check-outputs
npm run db check-join
```

### SQL Files

| File | Purpose |
|------|---------|
| scripts/seed-admin-user.sql | Create admin with 100 credits |
| scripts/reset-db-delete-data.sql | Delete all data, keep schema |
| scripts/complete-db-reset.sql | Delete everything (danger!) |
| scripts/admin/seed-admin-user.ts | TypeScript version of seeding |
| scripts/admin/grant-credits.ts | Grant credits after payment |
| scripts/admin/check-user-usage.ts | Check user credit balance |

### Common Queries

```sql
-- Check all users
SELECT email, name, created_at FROM users ORDER BY created_at DESC;

-- Check user's credits
SELECT u.email, ut.free_expansions_remaining, ut.paid_credits_remaining
FROM users u JOIN usage_tracking ut ON u.id = ut.user_id
WHERE u.email = 'user@example.com';

-- Check payment history
SELECT u.email, pr.amount_usd, pr.credits_purchased, pr.verified_at
FROM payment_receipts pr
JOIN users u ON pr.user_id = u.id
WHERE pr.status = 'verified'
ORDER BY pr.verified_at DESC;

-- Check failed expansions
SELECT u.email, e.error_step, e.error_message, e.completed_at
FROM executions e
JOIN users u ON e.user_id = u.id
WHERE e.status = 'failed'
ORDER BY e.completed_at DESC LIMIT 10;
```

---

## See Also

- [Database Setup & Management](./DATABASE.md) - Complete database guide
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment
- [Environment Variables](./ENVIRONMENT_VARIABLES.md) - Configuration reference
