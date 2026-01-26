-- ==============================================================================
-- SUPABASE DATABASE RESET TO PRODUCTION STATE
--
-- This script resets your Supabase database to a clean production state:
-- - Deletes all ideas, outputs, executions (generated content)
-- - Deletes all users except you
-- - Resets your credit/usage to 100 credits
-- - Keeps the database schema intact
--
-- WARNING: This is DESTRUCTIVE. Back up your database first if you care about data!
--
-- HOW TO RUN:
-- 1. Go to Supabase Dashboard: https://app.supabase.com
-- 2. Select your project
-- 3. Go to SQL Editor (left sidebar)
-- 4. Create new query
-- 5. Paste this entire script
-- 6. Replace YOUR_EMAIL with your actual GitHub email
-- 7. Click "Run"
-- 8. Verify: Check tables are empty except users (1 row = you) and usage_tracking
-- ==============================================================================

-- Step 1: Store your user ID (replace with your email)
-- This query will show you your user ID in results
SELECT id, email, name FROM users WHERE email = 'YOUR_EMAIL' LIMIT 1;

-- Step 2: Delete all generated content (safe to delete - can be regenerated)
-- Delete executions
DELETE FROM executions;

-- Delete outputs
DELETE FROM outputs;

-- Delete ideas
DELETE FROM ideas;

-- Delete credentials for users we're about to delete
DELETE FROM credentials WHERE user_id NOT IN (
  SELECT id FROM users WHERE email = 'YOUR_EMAIL'
);

-- Step 3: Delete all users except you
DELETE FROM users WHERE email != 'YOUR_EMAIL';

-- Step 4: Reset your usage to 100 credits
-- First, get your user ID
UPDATE usage_tracking
SET
  free_expansions_remaining = 0,        -- You've used all 5 free
  paid_credits_remaining = 100,         -- Start with 100 paid credits
  total_expansions_used = 0,            -- Reset counter
  updated_at = NOW()
WHERE user_id = (
  SELECT id FROM users WHERE email = 'YOUR_EMAIL'
);

-- Step 5: Verify the reset worked
-- You should see:
-- - 1 user (you)
-- - 1 usage_tracking record with 100 paid credits
-- - Empty ideas, outputs, executions, credentials tables

SELECT 'USERS' as table_name, COUNT(*) as count FROM users
UNION ALL
SELECT 'IDEAS', COUNT(*) FROM ideas
UNION ALL
SELECT 'OUTPUTS', COUNT(*) FROM outputs
UNION ALL
SELECT 'EXECUTIONS', COUNT(*) FROM executions
UNION ALL
SELECT 'CREDENTIALS', COUNT(*) FROM credentials
UNION ALL
SELECT 'USAGE_TRACKING', COUNT(*) FROM usage_tracking;

-- Check your usage specifically
SELECT user_id, free_expansions_remaining, paid_credits_remaining, total_expansions_used
FROM usage_tracking
WHERE user_id IN (SELECT id FROM users);

-- ==============================================================================
-- NOTES:
-- - This script preserves the database schema (tables, columns, RLS policies)
-- - It only deletes DATA, not structure
-- - Your user account remains with your GitHub credentials encrypted
-- - Ready for fresh production deployment with clean data
-- ==============================================================================
