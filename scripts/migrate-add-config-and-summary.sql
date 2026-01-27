-- ============================================================================
-- MIGRATION: Add Database Epoch & Idea Summary Fields
-- ============================================================================
--
-- This migration adds:
-- 1. `config` table for storing database_version (prevents stale JWT tokens)
-- 2. `summary` column to `ideas` table (AI-generated 1-sentence summary)
--
-- Run AFTER: scripts/setup-db-complete.sql
--
-- ============================================================================

-- ============================================================
-- CONFIG TABLE (System-wide settings)
-- ============================================================

CREATE TABLE IF NOT EXISTS config (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  updated_by TEXT DEFAULT 'system',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_config_key ON config(key);

-- Initialize database_version to 1
INSERT INTO config (key, value, description, updated_by)
VALUES ('database_version', '1', 'Version number incremented on database resets', 'system')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ADD SUMMARY COLUMN TO IDEAS
-- ============================================================

ALTER TABLE ideas
ADD COLUMN IF NOT EXISTS summary TEXT;

-- Create index for searching by summary
CREATE INDEX IF NOT EXISTS idx_ideas_summary ON ideas(summary);

-- ============================================================
-- VERIFICATION
-- ============================================================

SELECT '✅ Migration complete!' AS status;
SELECT 'Added: config table, ideas.summary column' AS changes;
SELECT 'Next step: Restart application to use new features' AS next_step;
