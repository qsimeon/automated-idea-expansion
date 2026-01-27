-- ============================================================================
-- COMPLETE DATABASE RESET
-- ============================================================================
--
-- Safely deletes EVERYTHING from the database.
-- Use this to start completely fresh.
--
-- IMPORTANT: This is DESTRUCTIVE. All data is permanently deleted.
-- Use only when you want a clean slate.
--
-- HOW TO RUN:
-- 1. Go to https://app.supabase.com
-- 2. SQL Editor → New Query
-- 3. Copy ALL of this file
-- 4. Paste and click "Run"
-- 5. Then run: scripts/setup-db.sql to recreate from scratch
--
-- ============================================================================

-- Drop in correct order to respect dependencies:
-- 1. Triggers (depend on functions and tables)
-- 2. Functions (may reference tables)
-- 3. Tables (CASCADE handles FK dependencies)

-- Drop triggers first (they depend on functions and tables)
DROP TRIGGER IF EXISTS trigger_init_user_usage ON users;
DROP TRIGGER IF EXISTS trigger_update_usage_tracking_timestamp ON usage_tracking;
DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON blog_posts;
DROP TRIGGER IF EXISTS update_credentials_updated_at ON credentials;
DROP TRIGGER IF EXISTS update_ideas_updated_at ON ideas;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

-- Drop functions (they reference tables, so drop before tables)
DROP FUNCTION IF EXISTS init_user_usage CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
DROP FUNCTION IF EXISTS check_user_has_credits CASCADE;
DROP FUNCTION IF EXISTS consume_expansion_credit CASCADE;
DROP FUNCTION IF EXISTS add_paid_credits CASCADE;

-- Drop tables last (CASCADE handles FK dependencies automatically)
DROP TABLE IF EXISTS payment_receipts CASCADE;
DROP TABLE IF EXISTS blog_posts CASCADE;
DROP TABLE IF EXISTS outputs CASCADE;
DROP TABLE IF EXISTS executions CASCADE;
DROP TABLE IF EXISTS usage_tracking CASCADE;
DROP TABLE IF EXISTS credentials CASCADE;
DROP TABLE IF EXISTS ideas CASCADE;
DROP TABLE IF EXISTS config CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================================

SELECT '✅ Database completely reset!' AS status;
SELECT 'Next step: Run scripts/setup-db.sql to create schema' AS next_step;
