-- Migration 002: Add Simple Usage Tracking (Buy Me a Coffee Model)
-- Run this AFTER the initial setup-db.sql
--
-- Payment Model:
-- - Users get 5 free expansions
-- - After that, they pay $1 via Buy Me a Coffee
-- - Admin manually verifies payment and adds credits
--
-- Why no Stripe?
-- - Simpler implementation (no webhooks, no checkout flow)
-- - Lower fees (BMC takes 5% vs Stripe's 2.9% + $0.30)
-- - Easier MVP validation
--
-- To run this migration:
-- psql $DATABASE_URL -f scripts/migrations/002-add-usage-tracking-simple.sql

-- ===========================================================
-- TABLE: usage_tracking
-- ===========================================================
-- Tracks expansion usage and credits per user

CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Free expansions (every new user gets 5)
  free_expansions_remaining INT NOT NULL DEFAULT 5 CHECK (free_expansions_remaining >= 0),

  -- Paid credits (purchased via Buy Me a Coffee)
  paid_credits_remaining INT NOT NULL DEFAULT 0 CHECK (paid_credits_remaining >= 0),

  -- Statistics
  total_expansions_used INT NOT NULL DEFAULT 0,
  total_free_used INT NOT NULL DEFAULT 0,
  total_paid_used INT NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one record per user
  UNIQUE(user_id)
);

-- Indexes for performance
CREATE INDEX idx_usage_tracking_user_id ON usage_tracking(user_id);

-- ===========================================================
-- TABLE: payment_receipts
-- ===========================================================
-- Manual record of Buy Me a Coffee payments
-- Admin creates these after verifying BMC payment

CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Payment details
  amount_usd NUMERIC(10, 2) NOT NULL CHECK (amount_usd > 0),
  credits_purchased INT NOT NULL CHECK (credits_purchased > 0),

  -- Buy Me a Coffee info (optional, for record keeping)
  bmc_reference TEXT,  -- BMC transaction ID or supporter name
  notes TEXT,          -- Admin notes about the payment

  -- Metadata
  verified_by TEXT,    -- Which admin verified this
  status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('pending', 'verified', 'refunded')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_payment_receipts_user_id ON payment_receipts(user_id);
CREATE INDEX idx_payment_receipts_status ON payment_receipts(status);
CREATE INDEX idx_payment_receipts_created_at ON payment_receipts(created_at DESC);

-- ===========================================================
-- FUNCTION: Auto-create usage tracking for new users
-- ===========================================================

CREATE OR REPLACE FUNCTION init_user_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- Automatically create usage tracking when user is created
  INSERT INTO usage_tracking (user_id, free_expansions_remaining)
  VALUES (NEW.id, 5)  -- 5 free expansions for new users
  ON CONFLICT (user_id) DO NOTHING;  -- Ignore if already exists

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create usage tracking
DROP TRIGGER IF EXISTS trigger_init_user_usage ON users;
CREATE TRIGGER trigger_init_user_usage
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION init_user_usage();

-- ===========================================================
-- FUNCTION: Update timestamps automatically
-- ===========================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for usage_tracking
DROP TRIGGER IF EXISTS trigger_update_usage_tracking_timestamp ON usage_tracking;
CREATE TRIGGER trigger_update_usage_tracking_timestamp
  BEFORE UPDATE ON usage_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===========================================================
-- ROW LEVEL SECURITY (RLS)
-- ===========================================================

ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage
CREATE POLICY "Users can view own usage"
  ON usage_tracking FOR SELECT
  USING (user_id::text = auth.jwt() ->> 'sub');

-- Users can view their own payment receipts
CREATE POLICY "Users can view own receipts"
  ON payment_receipts FOR SELECT
  USING (user_id::text = auth.jwt() ->> 'sub');

-- Service role can do everything (for admin operations and API)
CREATE POLICY "Service role has full access to usage_tracking"
  ON usage_tracking FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to payment_receipts"
  ON payment_receipts FOR ALL
  USING (true)
  WITH CHECK (true);

-- ===========================================================
-- HELPER FUNCTIONS
-- ===========================================================

-- Function to check if user has available credits
CREATE OR REPLACE FUNCTION check_user_has_credits(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_free_remaining INT;
  v_paid_remaining INT;
BEGIN
  SELECT
    free_expansions_remaining,
    paid_credits_remaining
  INTO v_free_remaining, v_paid_remaining
  FROM usage_tracking
  WHERE user_id = p_user_id;

  -- User has credits if either free or paid is > 0
  RETURN (v_free_remaining > 0 OR v_paid_remaining > 0);
END;
$$ LANGUAGE plpgsql;

-- Function to consume an expansion credit
CREATE OR REPLACE FUNCTION consume_expansion_credit(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_free_remaining INT;
  v_paid_remaining INT;
  v_credit_type TEXT;
BEGIN
  -- Get current credits
  SELECT
    free_expansions_remaining,
    paid_credits_remaining
  INTO v_free_remaining, v_paid_remaining
  FROM usage_tracking
  WHERE user_id = p_user_id;

  -- Check if user has any credits
  IF v_free_remaining <= 0 AND v_paid_remaining <= 0 THEN
    RAISE EXCEPTION 'No credits remaining for user %', p_user_id;
  END IF;

  -- Consume free credits first
  IF v_free_remaining > 0 THEN
    UPDATE usage_tracking
    SET
      free_expansions_remaining = free_expansions_remaining - 1,
      total_expansions_used = total_expansions_used + 1,
      total_free_used = total_free_used + 1
    WHERE user_id = p_user_id;

    v_credit_type := 'free';
  ELSE
    -- Consume paid credits
    UPDATE usage_tracking
    SET
      paid_credits_remaining = paid_credits_remaining - 1,
      total_expansions_used = total_expansions_used + 1,
      total_paid_used = total_paid_used + 1
    WHERE user_id = p_user_id;

    v_credit_type := 'paid';
  END IF;

  RETURN v_credit_type;
END;
$$ LANGUAGE plpgsql;

-- Function to add paid credits (called after BMC payment verified)
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
  -- Create payment receipt
  INSERT INTO payment_receipts (
    user_id,
    amount_usd,
    credits_purchased,
    bmc_reference,
    verified_by,
    notes,
    status
  ) VALUES (
    p_user_id,
    p_amount_usd,
    p_credits,
    p_bmc_reference,
    p_verified_by,
    p_notes,
    'verified'
  )
  RETURNING id INTO v_receipt_id;

  -- Add credits to user's account
  UPDATE usage_tracking
  SET paid_credits_remaining = paid_credits_remaining + p_credits
  WHERE user_id = p_user_id;

  RETURN v_receipt_id;
END;
$$ LANGUAGE plpgsql;

-- ===========================================================
-- SAMPLE DATA (for testing - remove in production)
-- ===========================================================

-- Uncomment to test with existing test user:
-- INSERT INTO usage_tracking (user_id, free_expansions_remaining)
-- VALUES ('00000000-0000-0000-0000-000000000001', 5)
-- ON CONFLICT (user_id) DO NOTHING;

-- ===========================================================
-- MIGRATION COMPLETE
-- ===========================================================

-- Verify tables were created
SELECT 'Migration 002 completed successfully!' AS status;
SELECT 'Created tables: usage_tracking, payment_receipts' AS info;
SELECT 'Created functions: check_user_has_credits, consume_expansion_credit, add_paid_credits' AS info;
