-- ============================================================================
-- Seed Admin User with 100 Credits
-- ============================================================================
--
-- PURPOSE:
-- Creates or updates the admin user (qsimeon@mit.edu) with 100 total credits.
-- Admin user is used for testing and development.
--
-- ADMIN USER DETAILS:
-- - Email: qsimeon@mit.edu
-- - Name: Quilee Simeon
-- - Timezone: America/New_York
-- - Credits: 5 free + 95 paid = 100 total
--
-- PREREQUISITES:
-- - scripts/setup-db.sql must be run first (creates users table)
-- - scripts/migrations/002-add-usage-tracking-simple.sql must be run first (creates usage_tracking table)
--
-- WHEN TO RUN:
-- - After initial database setup
-- - Before first deployment to production
-- - When you want to reset admin credits to 100
--
-- HOW TO RUN:
-- 1. Go to https://app.supabase.com
-- 2. Select your project
-- 3. Go to SQL Editor (left sidebar)
-- 4. Click "New Query"
-- 5. Copy this entire script
-- 6. TO CUSTOMIZE: Replace 'qsimeon@mit.edu' with your email if needed
-- 7. Click "Run"
-- 8. Verify success (check output message)
--
-- VERIFICATION:
-- After running, you should see:
-- - 1 admin user created or updated
-- - 100 credits assigned (5 free + 95 paid)
--
-- Run this query to verify:
-- SELECT u.email, u.name, ut.free_expansions_remaining, ut.paid_credits_remaining
-- FROM users u
-- JOIN usage_tracking ut ON u.id = ut.user_id
-- WHERE u.email = 'qsimeon@mit.edu';
--
-- Expected result:
-- | email               | name            | free | paid |
-- |---------------------|-----------------|------|------|
-- | qsimeon@mit.edu     | Quilee Simeon   |  5   | 95   |
--
-- TROUBLESHOOTING:
-- - "users table does not exist" → Run scripts/setup-db.sql first
-- - "usage_tracking table does not exist" → Run migration 002 first
-- - Admin user already exists → Script uses ON CONFLICT, will update existing user
-- - Want different email → Replace 'qsimeon@mit.edu' with your email before running
--
-- ============================================================================

-- Step 1: Create or update admin user
INSERT INTO users (email, name, timezone)
VALUES ('qsimeon@mit.edu', 'Quilee Simeon', 'America/New_York')
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name,
    timezone = EXCLUDED.timezone,
    updated_at = NOW();

-- Step 2: Grant 100 credits (95 paid since 5 free are default)
-- Get the user ID and update usage_tracking
UPDATE usage_tracking
SET
  free_expansions_remaining = 5,    -- Reset to 5 free (default)
  paid_credits_remaining = 95,       -- Add 95 paid (total 100)
  total_expansions_used = 0,         -- Reset usage counter
  updated_at = NOW()
WHERE user_id = (
  SELECT id FROM users WHERE email = 'qsimeon@mit.edu'
);

-- Step 3: Verify the results
SELECT 'Admin user seeding complete! ✨' AS status;
SELECT
  u.email,
  u.name,
  ut.free_expansions_remaining AS free_credits,
  ut.paid_credits_remaining AS paid_credits,
  (ut.free_expansions_remaining + ut.paid_credits_remaining) AS total_credits
FROM users u
JOIN usage_tracking ut ON u.id = ut.user_id
WHERE u.email = 'qsimeon@mit.edu'
LIMIT 1;
