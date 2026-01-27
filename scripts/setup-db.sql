-- ============================================================================
-- DATABASE SETUP - Complete Schema from Scratch
-- ============================================================================
--
-- Creates everything needed for the app to work:
-- - All tables (users, ideas, outputs, etc.)
-- - Config table with database_version (for JWT epoch system)
-- - Ideas table with summary column (for AI summarization)
-- - All indexes, RLS policies, triggers, functions
-- - Storage bucket for images
--
-- This script is idempotent (safe to run multiple times).
-- Use this after reset-db.sql to create a fresh database.
--
-- HOW TO RUN:
-- 1. Go to https://app.supabase.com
-- 2. SQL Editor → New Query
-- 3. Copy ALL of this file
-- 4. Paste and click "Run"
-- 5. Then run: scripts/seed-admin.sql to create admin user
-- 6. Then: npm run dev
--
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CONFIG TABLE (System metadata)
-- ============================================================
-- Stores database_version for JWT epoch system.
-- When you reset the database, increment this to invalidate all tokens.

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
-- USERS TABLE (GitHub OAuth)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================================
-- IDEAS TABLE
-- ============================================================
-- Includes 'summary' column for AI-generated 1-sentence titles
-- Does NOT include 'bullets' (planned but never used)

CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'expanded', 'archived')),
  priority_score INTEGER DEFAULT 0 CHECK (priority_score >= 0 AND priority_score <= 100),
  last_evaluated_at TIMESTAMPTZ,
  times_evaluated INTEGER DEFAULT 0,
  external_links JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ideas_user_status ON ideas(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ideas_created ON ideas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_priority ON ideas(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_summary ON ideas(summary);

-- ============================================================
-- CREDENTIALS TABLE (encrypted API keys)
-- ============================================================

CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'github', 'twitter', 'replicate')),
  encrypted_value TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  validation_status TEXT DEFAULT 'not_checked' CHECK (validation_status IN ('valid', 'invalid', 'not_checked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_credentials_user_provider ON credentials(user_id, provider);

-- ============================================================
-- EXECUTIONS TABLE (daily run logs)
-- ============================================================

CREATE TABLE IF NOT EXISTS executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selected_idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  judge_reasoning TEXT,
  judge_score INTEGER CHECK (judge_score >= 0 AND judge_score <= 100),
  format_chosen TEXT CHECK (format_chosen IN ('blog_post', 'twitter_thread', 'github_repo', 'image')),
  format_reasoning TEXT,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  error_message TEXT,
  error_step TEXT,
  tokens_used INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_executions_user_date ON executions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);

-- ============================================================
-- OUTPUTS TABLE (generated content)
-- ============================================================

CREATE TABLE IF NOT EXISTS outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  format TEXT NOT NULL CHECK (format IN ('blog_post', 'twitter_thread', 'github_repo', 'image')),
  content JSONB NOT NULL,
  published BOOLEAN DEFAULT false,
  publication_url TEXT,
  publication_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outputs_user_date ON outputs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outputs_execution ON outputs(execution_id);
CREATE INDEX IF NOT EXISTS idx_outputs_format ON outputs(format);

-- ============================================================
-- BLOG_POSTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  output_id UUID UNIQUE REFERENCES outputs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  markdown_content TEXT NOT NULL,
  html_content TEXT NOT NULL,
  meta_description TEXT,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_public BOOLEAN DEFAULT true,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_public ON blog_posts(is_public, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_user ON blog_posts(user_id, created_at DESC);

-- ============================================================
-- USAGE TRACKING TABLE (Credit System)
-- ============================================================

CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  free_expansions_remaining INT NOT NULL DEFAULT 5 CHECK (free_expansions_remaining >= 0),
  paid_credits_remaining INT NOT NULL DEFAULT 0 CHECK (paid_credits_remaining >= 0),
  total_expansions_used INT NOT NULL DEFAULT 0,
  total_free_used INT NOT NULL DEFAULT 0,
  total_paid_used INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_id ON usage_tracking(user_id);

-- ============================================================
-- PAYMENT RECEIPTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_usd NUMERIC(10, 2) NOT NULL CHECK (amount_usd > 0),
  credits_purchased INT NOT NULL CHECK (credits_purchased > 0),
  bmc_reference TEXT,
  notes TEXT,
  verified_by TEXT,
  status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('pending', 'verified', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_user_id ON payment_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_status ON payment_receipts(status);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_created_at ON payment_receipts(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies for idempotency
DROP POLICY IF EXISTS "Users can view own record" ON users;
DROP POLICY IF EXISTS "Users can update own record" ON users;
DROP POLICY IF EXISTS "Users can view own ideas" ON ideas;
DROP POLICY IF EXISTS "Users can insert own ideas" ON ideas;
DROP POLICY IF EXISTS "Users can update own ideas" ON ideas;
DROP POLICY IF EXISTS "Users can delete own ideas" ON ideas;
DROP POLICY IF EXISTS "Users can view own credentials" ON credentials;
DROP POLICY IF EXISTS "Users can insert own credentials" ON credentials;
DROP POLICY IF EXISTS "Users can update own credentials" ON credentials;
DROP POLICY IF EXISTS "Users can delete own credentials" ON credentials;
DROP POLICY IF EXISTS "Users can view own executions" ON executions;
DROP POLICY IF EXISTS "Users can view own outputs" ON outputs;
DROP POLICY IF EXISTS "Users can view own blog posts" ON blog_posts;
DROP POLICY IF EXISTS "Users can insert own blog posts" ON blog_posts;
DROP POLICY IF EXISTS "Users can update own blog posts" ON blog_posts;
DROP POLICY IF EXISTS "Users can delete own blog posts" ON blog_posts;
DROP POLICY IF EXISTS "Users can view own usage" ON usage_tracking;
DROP POLICY IF EXISTS "Users can view own receipts" ON payment_receipts;

-- Users table
CREATE POLICY "Users can view own record" ON users FOR SELECT USING (id::text = auth.jwt() ->> 'sub');
CREATE POLICY "Users can update own record" ON users FOR UPDATE USING (id::text = auth.jwt() ->> 'sub');

-- Ideas table
CREATE POLICY "Users can view own ideas" ON ideas FOR SELECT USING (user_id::text = auth.jwt() ->> 'sub');
CREATE POLICY "Users can insert own ideas" ON ideas FOR INSERT WITH CHECK (user_id::text = auth.jwt() ->> 'sub');
CREATE POLICY "Users can update own ideas" ON ideas FOR UPDATE USING (user_id::text = auth.jwt() ->> 'sub');
CREATE POLICY "Users can delete own ideas" ON ideas FOR DELETE USING (user_id::text = auth.jwt() ->> 'sub');

-- Credentials table
CREATE POLICY "Users can view own credentials" ON credentials FOR SELECT USING (user_id::text = auth.jwt() ->> 'sub');
CREATE POLICY "Users can insert own credentials" ON credentials FOR INSERT WITH CHECK (user_id::text = auth.jwt() ->> 'sub');
CREATE POLICY "Users can update own credentials" ON credentials FOR UPDATE USING (user_id::text = auth.jwt() ->> 'sub');
CREATE POLICY "Users can delete own credentials" ON credentials FOR DELETE USING (user_id::text = auth.jwt() ->> 'sub');

-- Executions table
CREATE POLICY "Users can view own executions" ON executions FOR SELECT USING (user_id::text = auth.jwt() ->> 'sub');

-- Outputs table
CREATE POLICY "Users can view own outputs" ON outputs FOR SELECT USING (user_id::text = auth.jwt() ->> 'sub');

-- Blog posts table
CREATE POLICY "Users can view own blog posts" ON blog_posts FOR SELECT USING (user_id::text = auth.jwt() ->> 'sub' OR is_public = true);
CREATE POLICY "Users can insert own blog posts" ON blog_posts FOR INSERT WITH CHECK (user_id::text = auth.jwt() ->> 'sub');
CREATE POLICY "Users can update own blog posts" ON blog_posts FOR UPDATE USING (user_id::text = auth.jwt() ->> 'sub');
CREATE POLICY "Users can delete own blog posts" ON blog_posts FOR DELETE USING (user_id::text = auth.jwt() ->> 'sub');

-- Usage tracking table
CREATE POLICY "Users can view own usage" ON usage_tracking FOR SELECT USING (user_id::text = auth.jwt() ->> 'sub');

-- Payment receipts table
CREATE POLICY "Users can view own receipts" ON payment_receipts FOR SELECT USING (user_id::text = auth.jwt() ->> 'sub');

-- ============================================================
-- TRIGGERS FOR TIMESTAMPS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ideas_updated_at ON ideas;
CREATE TRIGGER update_ideas_updated_at BEFORE UPDATE ON ideas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_credentials_updated_at ON credentials;
CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_blog_posts_updated_at ON blog_posts;
CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON blog_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_usage_tracking_timestamp ON usage_tracking;
CREATE TRIGGER trigger_update_usage_tracking_timestamp BEFORE UPDATE ON usage_tracking FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- AUTO-CREATE USAGE TRACKING FOR NEW USERS
-- ============================================================

CREATE OR REPLACE FUNCTION init_user_usage()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO usage_tracking (user_id, free_expansions_remaining)
  VALUES (NEW.id, 5)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_init_user_usage ON users;
CREATE TRIGGER trigger_init_user_usage AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION init_user_usage();

-- ============================================================
-- CREDIT SYSTEM FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION check_user_has_credits(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_free_remaining INT;
  v_paid_remaining INT;
BEGIN
  SELECT free_expansions_remaining, paid_credits_remaining
  INTO v_free_remaining, v_paid_remaining
  FROM usage_tracking WHERE user_id = p_user_id;
  RETURN (v_free_remaining > 0 OR v_paid_remaining > 0);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION consume_expansion_credit(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_free_remaining INT;
  v_paid_remaining INT;
  v_credit_type TEXT;
BEGIN
  SELECT free_expansions_remaining, paid_credits_remaining
  INTO v_free_remaining, v_paid_remaining
  FROM usage_tracking WHERE user_id = p_user_id;

  IF v_free_remaining <= 0 AND v_paid_remaining <= 0 THEN
    RAISE EXCEPTION 'No credits remaining for user %', p_user_id;
  END IF;

  IF v_free_remaining > 0 THEN
    UPDATE usage_tracking
    SET free_expansions_remaining = free_expansions_remaining - 1,
        total_expansions_used = total_expansions_used + 1,
        total_free_used = total_free_used + 1
    WHERE user_id = p_user_id;
    v_credit_type := 'free';
  ELSE
    UPDATE usage_tracking
    SET paid_credits_remaining = paid_credits_remaining - 1,
        total_expansions_used = total_expansions_used + 1,
        total_paid_used = total_paid_used + 1
    WHERE user_id = p_user_id;
    v_credit_type := 'paid';
  END IF;

  RETURN v_credit_type;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION add_paid_credits(
  p_user_id UUID,
  p_credits INT,
  p_amount_usd NUMERIC,
  p_bmc_reference TEXT DEFAULT NULL,
  p_verified_by TEXT DEFAULT 'admin',
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_receipt_id UUID;
BEGIN
  INSERT INTO payment_receipts (user_id, amount_usd, credits_purchased, bmc_reference, verified_by, notes, status)
  VALUES (p_user_id, p_amount_usd, p_credits, p_bmc_reference, p_verified_by, p_notes, 'verified')
  RETURNING id INTO v_receipt_id;

  UPDATE usage_tracking SET paid_credits_remaining = paid_credits_remaining + p_credits WHERE user_id = p_user_id;

  RETURN v_receipt_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('images', 'images', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;

CREATE POLICY "Users can upload own images" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'images' AND (storage.foldername(name))[1] = auth.jwt() ->> 'sub'
);

CREATE POLICY "Anyone can view images" ON storage.objects FOR SELECT USING (bucket_id = 'images');

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT '✅ Database schema created successfully!' AS status;
SELECT 'Tables: users, ideas, credentials, executions, outputs, blog_posts, usage_tracking, payment_receipts, config' AS tables_created;
SELECT 'Features: RLS policies, triggers, functions, storage bucket, database_version epoch system' AS features_enabled;
SELECT 'Next step: Run scripts/seed-admin.sql to create admin user' AS next_step;
