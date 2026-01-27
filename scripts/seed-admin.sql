-- ============================================================================
-- SEED ADMIN USER
-- ============================================================================
--
-- Creates admin user with 100 credits (5 free + 95 paid).
-- Safe to run multiple times (idempotent).
--
-- HOW TO RUN:
-- 1. Go to https://app.supabase.com
-- 2. SQL Editor → New Query
-- 3. Copy ALL of this file
-- 4. Paste and click "Run"
--
-- CUSTOMIZATION:
-- Change the email, name, or timezone below as needed.
--
-- ============================================================================

-- Create or update admin user
INSERT INTO users (id, email, name, timezone, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001'::UUID,
  'qsimeon@mit.edu',
  'Quilee Simeon',
  'America/New_York',
  NOW(),
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  name = 'Quilee Simeon',
  timezone = 'America/New_York',
  updated_at = NOW();

-- Set up usage tracking with 5 free + 95 paid credits
INSERT INTO usage_tracking (
  user_id,
  free_expansions_remaining,
  paid_credits_remaining,
  total_expansions_used,
  total_free_used,
  total_paid_used,
  created_at,
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001'::UUID,
  5,
  95,
  0,
  0,
  0,
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO UPDATE SET
  free_expansions_remaining = 5,
  paid_credits_remaining = 95,
  updated_at = NOW();

-- ============================================================================

SELECT '✅ Admin user seeded successfully!' AS status;
SELECT u.email, u.name, u.timezone, ut.free_expansions_remaining, ut.paid_credits_remaining
FROM users u
JOIN usage_tracking ut ON u.id = ut.user_id
WHERE u.email = 'qsimeon@mit.edu'
AS result;
