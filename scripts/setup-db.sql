-- Automated Idea Expansion - Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS TABLE (synced from Clerk)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast Clerk lookups
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_user_id);

-- ============================================================
-- IDEAS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ideas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  bullets JSONB DEFAULT '[]'::jsonb,
  external_links JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'expanded', 'archived')),
  priority_score INTEGER DEFAULT 0 CHECK (priority_score >= 0 AND priority_score <= 100),
  last_evaluated_at TIMESTAMPTZ,
  times_evaluated INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ideas_user_status ON ideas(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ideas_created ON ideas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_priority ON ideas(priority_score DESC);

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

-- Index for fast provider lookups
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

-- Indexes for execution history queries
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

-- Indexes for output queries
CREATE INDEX IF NOT EXISTS idx_outputs_user_date ON outputs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outputs_execution ON outputs(execution_id);
CREATE INDEX IF NOT EXISTS idx_outputs_format ON outputs(format);

-- ============================================================
-- BLOG_POSTS TABLE (for blog format outputs)
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

-- Indexes for blog queries
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_public ON blog_posts(is_public, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_user ON blog_posts(user_id, created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- USERS: Users can only see their own record
CREATE POLICY "Users can view own record"
  ON users FOR SELECT
  USING (clerk_user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update own record"
  ON users FOR UPDATE
  USING (clerk_user_id = auth.jwt() ->> 'sub');

-- IDEAS: Users can only access their own ideas
CREATE POLICY "Users can view own ideas"
  ON ideas FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own ideas"
  ON ideas FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own ideas"
  ON ideas FOR UPDATE
  USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can delete own ideas"
  ON ideas FOR DELETE
  USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- CREDENTIALS: Users can only access their own credentials
CREATE POLICY "Users can view own credentials"
  ON credentials FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert own credentials"
  ON credentials FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own credentials"
  ON credentials FOR UPDATE
  USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can delete own credentials"
  ON credentials FOR DELETE
  USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- EXECUTIONS: Users can only view their own executions
CREATE POLICY "Users can view own executions"
  ON executions FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- OUTPUTS: Users can only view their own outputs
CREATE POLICY "Users can view own outputs"
  ON outputs FOR SELECT
  USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- BLOG_POSTS: Users can view their own posts, public can view public posts
CREATE POLICY "Users can view own blog posts"
  ON blog_posts FOR SELECT
  USING (
    user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub')
    OR is_public = true
  );

CREATE POLICY "Users can insert own blog posts"
  ON blog_posts FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update own blog posts"
  ON blog_posts FOR UPDATE
  USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

CREATE POLICY "Users can delete own blog posts"
  ON blog_posts FOR DELETE
  USING (user_id IN (SELECT id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'));

-- ============================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ideas_updated_at BEFORE UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STORAGE BUCKET FOR IMAGES
-- ============================================================

-- Create storage bucket for generated images
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Users can upload to their own folder
CREATE POLICY "Users can upload own images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'images'
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'sub'
  );

-- Storage policy: Anyone can view images (public bucket)
CREATE POLICY "Anyone can view images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'images');

-- ============================================================
-- SEED DATA (Optional - for testing)
-- ============================================================

-- Insert a test user (comment out in production)
-- INSERT INTO users (clerk_user_id, email, name)
-- VALUES ('test_user_123', 'test@example.com', 'Test User')
-- ON CONFLICT DO NOTHING;
