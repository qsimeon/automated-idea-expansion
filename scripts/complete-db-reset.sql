-- ============================================================================
-- COMPLETE DATABASE RESET - START FROM SCRATCH
-- ============================================================================
--
-- WARNING: ⚠️  THIS DELETES EVERYTHING!
-- All tables, functions, data, policies will be removed.
-- CANNOT BE UNDONE!
--
-- STEPS:
-- 1. Go to https://app.supabase.com
-- 2. Select your project
-- 3. SQL Editor → New Query
-- 4. Copy ALL of this script
-- 5. Paste and click "Run"
-- 6. Wait for completion
-- 7. Then run: scripts/setup-db.sql
--
-- ============================================================================

-- Drop all tables (CASCADE deletes dependencies)
DROP TABLE IF EXISTS payment_receipts CASCADE;
DROP TABLE IF EXISTS usage_tracking CASCADE;
DROP TABLE IF EXISTS blog_posts CASCADE;
DROP TABLE IF EXISTS outputs CASCADE;
DROP TABLE IF EXISTS executions CASCADE;
DROP TABLE IF EXISTS ideas CASCADE;
DROP TABLE IF EXISTS credentials CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop all functions
DROP FUNCTION IF EXISTS check_user_has_credits(UUID) CASCADE;
DROP FUNCTION IF EXISTS consume_expansion_credit(UUID) CASCADE;
DROP FUNCTION IF EXISTS add_paid_credits(UUID, INTEGER, NUMERIC, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS init_user_usage() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Verify deletion
SELECT 'Database completely reset!' as result;
