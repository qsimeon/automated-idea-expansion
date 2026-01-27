-- ============================================================================
-- DATABASE RESET WITH EPOCH INCREMENT
-- ============================================================================
--
-- IMPORTANT: Use this script when you want to completely reset the database
-- and invalidate all existing JWT tokens (users must sign in again)
--
-- This script:
-- 1. Deletes all user data (ideas, outputs, credentials, etc.)
-- 2. Deletes all users (which cascades due to foreign keys)
-- 3. Keeps the schema intact
-- 4. INCREMENTS database_version to invalidate all existing JWT tokens
--
-- After running this:
-- - All JWT tokens are automatically invalidated
-- - No stale token issues
-- - Users must sign in again when they next access the app
--
-- HOW TO RUN:
-- 1. Go to https://app.supabase.com
-- 2. SQL Editor → New Query
-- 3. Copy ALL of this file
-- 4. Paste and click "Run"
-- 5. Done! Database is reset and all tokens are invalidated
--
-- ============================================================================

-- Delete all user data (cascades will handle everything)
DELETE FROM users;

-- Increment database_version to invalidate all existing JWT tokens
UPDATE config SET value = (value::int + 1)::text WHERE key = 'database_version';

-- Verify the new version
SELECT '✅ Database reset complete!' AS status;
SELECT '📌 All JWT tokens are now INVALID - users must sign in again' AS important;
SELECT value AS new_database_version FROM config WHERE key = 'database_version';
SELECT 'Next step: Run npm run db:seed-admin to create admin user' AS next_step;
