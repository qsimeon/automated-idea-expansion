-- ============================================================================
-- Reset Database - Delete Data Only (Keep Schema)
-- ============================================================================
--
-- PURPOSE:
-- Resets the database to a clean state for production deployment by deleting
-- all data (ideas, outputs, executions, etc.) while PRESERVING the schema
-- (tables, columns, RLS policies, functions, triggers).
--
-- This is the SAFE version - no schema is deleted!
--
-- WHAT IT DELETES:
-- ✅ All users except the admin user
-- ✅ All ideas, outputs, executions, credentials (cascading)
-- ✅ All payment receipts and usage tracking
-- ✅ All generated content and metadata
--
-- WHAT IT KEEPS:
-- ✅ Database schema (all table definitions)
-- ✅ RLS policies and security configurations
-- ✅ Triggers and functions
-- ✅ Indexes
-- ✅ Storage bucket configuration
-- ✅ Admin user (qsimeon@mit.edu) with 100 credits
--
-- USE CASES:
-- - Preparing for production deployment
-- - Cleaning test data before going live
-- - Starting fresh while keeping the schema
-- - Regular data cleanup while keeping infrastructure
--
-- DO NOT USE IF:
-- ❌ You want to delete schema too (use complete-db-reset.sql)
-- ❌ You have critical production data (back it up first!)
-- ❌ You want to keep any user data (this deletes everything except admin)
--
-- HOW TO RUN:
-- 1. Go to https://app.supabase.com
-- 2. Select your project
-- 3. Go to SQL Editor (left sidebar)
-- 4. Click "New Query"
-- 5. Copy this entire script
-- 6. OPTIONAL: Customize the admin email if different from 'qsimeon@mit.edu'
-- 7. Click "Run"
-- 8. Wait for completion (~5-10 seconds)
-- 9. Verify results (see step 5 below)
--
-- PREREQUISITES:
-- - Database must already exist with schema from setup-db.sql
-- - At least the admin user must exist
--
-- NEXT STEPS AFTER RUNNING:
-- 1. (Optional) Run scripts/seed-admin-user.sql to ensure admin has 100 credits
-- 2. Deploy to production
-- 3. Test as new user:
--    - Sign in with GitHub
--    - Verify you get 5 free credits
--    - Create some ideas
-- 4. Monitor database for the first week
--
-- RECOVERY:
-- If something goes wrong:
-- 1. Check Supabase automatic backups (Pro plan required)
-- 2. Go to Settings → Backups
-- 3. Restore from a previous backup point
-- 4. Or re-run: scripts/setup-db.sql and migration 002
--
-- ============================================================================

-- ============================================================
-- Step 1: Show which admin user we'll preserve
-- ============================================================
-- This query shows which user will be kept
SELECT 'Admin user to preserve:' as info;
SELECT id, email, name FROM users WHERE email = 'qsimeon@mit.edu' LIMIT 1;

-- ============================================================
-- Step 2: Delete all generated content (safe to delete)
-- ============================================================

-- Delete payment receipts (after deleting executions)
DELETE FROM payment_receipts
WHERE user_id != (SELECT id FROM users WHERE email = 'qsimeon@mit.edu');

-- Delete usage tracking for non-admin users
DELETE FROM usage_tracking
WHERE user_id != (SELECT id FROM users WHERE email = 'qsimeon@mit.edu');

-- Delete all outputs
DELETE FROM outputs;

-- Delete all blog posts (cascades with outputs)
DELETE FROM blog_posts;

-- Delete all executions
DELETE FROM executions;

-- Delete all ideas
DELETE FROM ideas;

-- Delete all credentials for non-admin users
DELETE FROM credentials
WHERE user_id != (SELECT id FROM users WHERE email = 'qsimeon@mit.edu');

-- ============================================================
-- Step 3: Delete all users except admin
-- ============================================================
DELETE FROM users WHERE email != 'qsimeon@mit.edu';

-- ============================================================
-- Step 4: Reset admin user usage to 100 credits
-- ============================================================
UPDATE usage_tracking
SET
  free_expansions_remaining = 5,    -- Reset free credits
  paid_credits_remaining = 95,      -- Reset paid credits (total 100)
  total_expansions_used = 0,        -- Reset usage counter
  total_free_used = 0,
  total_paid_used = 0,
  updated_at = NOW()
WHERE user_id = (
  SELECT id FROM users WHERE email = 'qsimeon@mit.edu'
);

-- ============================================================
-- Step 5: Verify the reset worked
-- ============================================================

SELECT '✨ Database reset complete!' AS status;
SELECT 'Remaining data summary:' AS section;

-- Show remaining counts
SELECT 'USERS' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'IDEAS', COUNT(*) FROM ideas
UNION ALL
SELECT 'OUTPUTS', COUNT(*) FROM outputs
UNION ALL
SELECT 'BLOG_POSTS', COUNT(*) FROM blog_posts
UNION ALL
SELECT 'EXECUTIONS', COUNT(*) FROM executions
UNION ALL
SELECT 'CREDENTIALS', COUNT(*) FROM credentials
UNION ALL
SELECT 'PAYMENT_RECEIPTS', COUNT(*) FROM payment_receipts
UNION ALL
SELECT 'USAGE_TRACKING', COUNT(*) FROM usage_tracking
ORDER BY table_name;

-- Show admin user details
SELECT 'Admin user details:' AS section;
SELECT
  u.email,
  u.name,
  u.timezone,
  ut.free_expansions_remaining,
  ut.paid_credits_remaining,
  (ut.free_expansions_remaining + ut.paid_credits_remaining) AS total_credits
FROM users u
JOIN usage_tracking ut ON u.id = ut.user_id
WHERE u.email = 'qsimeon@mit.edu';

-- ============================================================
-- NOTES:
-- - All schema (tables, columns, indexes, policies) is preserved
-- - RLS policies are still active and working
-- - Triggers are still active
-- - Functions are still available
-- - Ready for fresh production deployment
-- ============================================================
