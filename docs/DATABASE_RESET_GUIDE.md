# Database Reset Guide

**Purpose**: Reset Supabase database to a clean production state before deploying to Vercel

**Result**:
- ✅ All generated content deleted (ideas, outputs, executions)
- ✅ Only your user account remains
- ✅ Your account starts with 100 credits
- ✅ Database schema intact (tables, RLS policies, everything else)

---

## When to Reset

**Before First Production Deployment**: ✅ Recommended
- Removes any test data from local development
- Gives you a clean production state
- Ensures metrics start from 0

**During Development**: ❌ Not needed
- You can manually delete ideas/outputs via the UI
- Or use individual DELETE queries

---

## How to Reset (5 Steps, ~2 Minutes)

### Step 1: Backup Your Database (Optional but Recommended)
Go to Supabase Dashboard:
1. Select your project
2. Settings → Backups
3. Click "Create a backup" (stores backup for 7 days)

### Step 2: Find Your GitHub Email
```
This is the email you used to sign up / authenticate with GitHub
Example: you@gmail.com or you@company.com
```

### Step 3: Open SQL Editor in Supabase
1. Go to https://app.supabase.com
2. Select your project
3. Left sidebar → **SQL Editor**
4. Click **New query**

### Step 4: Paste and Run the Reset Script
```
File: scripts/reset-db-for-production.sql
```

**Steps in the SQL file:**

```sql
-- Step 1: Verify your user exists
SELECT id, email, name FROM users WHERE email = 'YOUR_EMAIL' LIMIT 1;
-- Replace YOUR_EMAIL with your actual GitHub email
-- (Copy from the results of this query)

-- Step 2: Delete all generated content
DELETE FROM executions;
DELETE FROM outputs;
DELETE FROM ideas;
DELETE FROM credentials WHERE user_id NOT IN (...);

-- Step 3: Delete all other users
DELETE FROM users WHERE email != 'YOUR_EMAIL';

-- Step 4: Reset your usage to 100 credits
UPDATE usage_tracking
SET paid_credits_remaining = 100, ...
WHERE user_id = (SELECT id FROM users WHERE email = 'YOUR_EMAIL');

-- Step 5: Verify with counts
SELECT COUNT(*) FROM users;        -- Should show: 1
SELECT COUNT(*) FROM ideas;        -- Should show: 0
SELECT COUNT(*) FROM outputs;      -- Should show: 0
```

### Step 5: Verify the Reset Worked

After running, check the bottom of the SQL output:

**Expected Results:**
```
users           | 1
ideas           | 0
outputs         | 0
executions      | 0
credentials     | 1 (your GitHub token)
usage_tracking  | 1 (with 100 paid_credits_remaining)
```

**Your usage should show:**
```
user_id: [your-id]
free_expansions_remaining: 0        (already used 5 free)
paid_credits_remaining: 100         (100 credits to start)
total_expansions: 0                 (counter reset)
```

---

## What Gets Deleted

| Table | Deleted? | Why |
|-------|----------|-----|
| **ideas** | ✅ Yes | Test ideas from development |
| **outputs** | ✅ Yes | Generated blog posts and code projects |
| **executions** | ✅ Yes | Execution logs (can be regenerated) |
| **usage_tracking** | 🔄 Modified | Your record updated to 100 credits |
| **credentials** | 🔄 Modified | Only your GitHub token kept |
| **users** | 🔄 Modified | Only your user kept, others deleted |

**NOT Deleted:**
- Database schema (tables, columns, indexes)
- RLS policies
- Database functions
- Supabase configuration

---

## What Gets Reset

### Your User Account
- ✅ Stays the same
- ✅ Email unchanged
- ✅ GitHub token (encrypted) kept
- ✅ Name unchanged
- ✅ Timezone unchanged

### Your Usage Tracking
- 🔄 Free expansions: **0** (you've used all 5 free, but it's ok)
- 🔄 Paid credits: **100** (fresh slate)
- 🔄 Total expansions: **0** (counter reset)

### Your Generated Content
- ❌ All ideas deleted
- ❌ All outputs deleted
- ❌ All executions deleted
- 💡 You can start fresh generating new content

---

## If Something Goes Wrong

### "User not found with email X"
- Check you typed the email correctly (case-sensitive!)
- Verify the user exists: `SELECT email FROM users;`
- Use the correct email from the results

### "Cannot delete from users" (constraint error)
- Some other table references this user
- Run the script again - it should delete in correct order
- If still fails, delete from that table first

### Want to Undo the Reset
- **Option 1**: Restore from backup (if you created one)
  1. Supabase Dashboard → Settings → Backups
  2. Click "Restore" on the backup you created

- **Option 2**: Manually re-add data
  - Create ideas again via the UI
  - They'll be in the database

- **Option 3**: Ask Claude Code to help recreate data

---

## Safety Tips

✅ **Do backup first** - Click "Create backup" in Supabase before resetting

✅ **Test in development** - Run on your local DB first if you're unsure

✅ **Check email twice** - Replace YOUR_EMAIL correctly, or it'll delete the wrong user

✅ **Verify after** - Run the verification queries at the end to confirm

---

## Quick Reference

### Find Your Email
```sql
SELECT DISTINCT email FROM users;
```

### Check Current State
```sql
SELECT
  (SELECT COUNT(*) FROM users) as user_count,
  (SELECT COUNT(*) FROM ideas) as idea_count,
  (SELECT COUNT(*) FROM outputs) as output_count;
```

### See Your Credits
```sql
SELECT user_id, free_expansions_remaining, paid_credits_remaining
FROM usage_tracking;
```

### Restore Full Backup
1. Supabase → Settings → Backups
2. Click "Restore"
3. Choose backup date
4. Confirm

---

## After Reset

You're now ready to deploy to Vercel! ✅

Next steps:
1. ✅ Database reset
2. ⬜ Deploy to Vercel (see docs/VERCEL_DEPLOYMENT.md)
3. ⬜ Test on production
4. ⬜ Launch!

---

**Questions?**

Check:
- Your email is correct (case-sensitive)
- Your Supabase project is selected
- SQL syntax looks right
- Run one statement at a time if unsure

Still stuck? Run verification queries to see current state, then ask for help.
