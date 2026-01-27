# Database Setup & Management Guide

**Complete database documentation for Automated Idea Expansion**

---

## Table of Contents

1. [Overview](#overview)
2. [Database Architecture](#database-architecture)
3. [Initial Setup (Fresh Start)](#initial-setup-fresh-start)
4. [Tables & Schema](#tables--schema)
5. [Security (RLS Policies)](#security-rls-policies)
6. [Usage Tracking & Credits](#usage-tracking--credits)
7. [Management Scripts](#management-scripts)
8. [Common Operations](#common-operations)
9. [Backup & Recovery](#backup--recovery)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This application uses **PostgreSQL 15 via Supabase** for all data storage. The database is the single source of truth for:

- User accounts and authentication
- Generated ideas, outputs, and content
- Execution logs and audit trails
- User credentials (encrypted)
- Credit usage and payment tracking

### Key Characteristics

| Aspect | Details |
|--------|---------|
| **Database** | PostgreSQL 15 (managed by Supabase) |
| **Authentication** | GitHub OAuth via NextAuth |
| **Security** | Row-Level Security (RLS) on all tables |
| **Encryption** | AES-256-GCM for credentials |
| **Access Control** | Per-user data isolation |
| **Scalability** | Automatic with Supabase |

---

## Database Architecture

### Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         DATABASE SCHEMA                              │
└──────────────────────────────────────────────────────────────────────┘

                            ┌──────────────┐
                            │    USERS     │
                            │──────────────│
                            │ id (PK)      │
                            │ email (UQ)   │────────────┐
                            │ name         │            │
                            │ timezone     │            │
                            │ created_at   │            │
                            │ updated_at   │            │
                            └──────────────┘            │
                                   ▲                    │
                    ┌──────────────┬┼────────────┬──────┴──────────┐
                    │              │ │            │                 │
                    │              │ │            │                 │
         ┌──────────▼──┐  ┌────────▼─▼─┐  ┌──────▼────┐  ┌────────▼──┐
         │   IDEAS     │  │ CREDENTIALS │  │  OUTPUTS  │  │ EXECUTION │
         │─────────────│  │─────────────│  │───────────│  │───────────│
         │ id (PK)     │  │ id (PK)     │  │ id (PK)   │  │ id (PK)   │
         │ user_id (FK)├──┤ user_id(FK) │  │ user_id   │  │ user_id   │
         │ title       │  │ provider(UQ)│  │ execution │  │ selected  │
         │ description │  │ encrypted   │  │ _id (FK)  │  │ _idea_id  │
         │ status      │  │ is_active   │  │ format    │  │ status    │
         │ created_at  │  │ created_at  │  │ published │  │ created_at│
         │ updated_at  │  │ updated_at  │  │ created_at│  └───────────┘
         └──────────────┘  └─────────────┘  └───────────┘
                    │                             ▲
                    │                             │
                    │                ┌────────────┘
                    │                │
                    │      ┌─────────▼──────┐
                    │      │  BLOG_POSTS    │
                    └─────▶│────────────────│
                           │ id (PK)        │
                           │ output_id (FK) │
                           │ title          │
                           │ slug           │
                           │ markdown       │
                           │ created_at     │
                           └────────────────┘

Additional Tables (Credit System):
   USAGE_TRACKING ─┐     PAYMENT_RECEIPTS
   ───────────────┼─────────────────────────
   user_id (FK)   │     id (PK)
   free/paid      │     user_id (FK)
   remaining      │     amount_usd
   created_at     │     bmc_reference
                  │     verified_at
```

### Core Tables

**users** - User accounts created via GitHub OAuth
- `id` (UUID): Primary key
- `email` (TEXT): GitHub email, unique
- `name` (TEXT): GitHub name
- `timezone` (TEXT): User's timezone
- `created_at`, `updated_at`: Timestamps

**ideas** - Raw ideas submitted by users
- `id` (UUID): Primary key
- `user_id` (FK): References users
- `title`, `description`: Content
- `status` (pending/expanded/archived)
- `priority_score` (0-100)
- Indexes on (user_id, status), (created_at), (priority_score)

**credentials** - Encrypted API keys (per-user)
- `id` (UUID): Primary key
- `user_id` (FK): References users
- `provider` (openai/anthropic/github/etc)
- `encrypted_value` (TEXT): AES-256-GCM encrypted
- `is_active`, `validation_status`
- Unique on (user_id, provider)

**outputs** - Generated content (blogs, code, images)
- `id` (UUID): Primary key
- `execution_id` (FK): References executions
- `user_id` (FK): References users
- `idea_id` (FK, nullable): References ideas
- `format` (blog_post/twitter_thread/github_repo/image)
- `content` (JSONB): Format-specific content
- `published` (BOOLEAN): Publish status
- `publication_url` (TEXT): GitHub/Medium URL if published

**executions** - Pipeline run logs and audit trail
- `id` (UUID): Primary key
- `user_id` (FK): References users
- `selected_idea_id` (FK, nullable): References ideas
- `format_chosen`: Which format was selected
- `status` (running/completed/failed/partial)
- `tokens_used` (INTEGER): Token consumption tracking
- `started_at`, `completed_at`: Timing
- `error_message`, `error_step`: Failure tracking

**blog_posts** - Blog-specific output data
- `id` (UUID): Primary key
- `output_id` (FK): References outputs (1:1)
- `user_id` (FK): References users
- `title`, `slug` (UNIQUE per user)
- `markdown_content`, `html_content`
- `is_public`, `published_at`

**usage_tracking** - Credit system (created by migration 002)
- `user_id` (FK, UNIQUE): References users
- `free_expansions_remaining` (INT): Defaults to 5
- `paid_credits_remaining` (INT): User purchases
- `total_expansions_used` (INT): Lifetime counter
- Auto-created when user signs up

**payment_receipts** - Buy Me a Coffee payment records (created by migration 002)
- `id` (UUID): Primary key
- `user_id` (FK): References users
- `amount_usd`, `credits_purchased`
- `bmc_reference`: Buy Me a Coffee reference
- `status` (pending/verified/refunded)
- `verified_at`: When admin verified

---

## Initial Setup (Fresh Start)

Follow these steps to set up a database from scratch:

### Step 1: Create Supabase Project

1. Go to https://supabase.com
2. Click "New Project"
3. Create project in desired region
4. Wait for provisioning (~5 minutes)

### Step 2: Run Initial Setup Script

1. Go to **SQL Editor** in Supabase dashboard
2. Click **New Query**
3. Copy entire content of `scripts/setup-db.sql`
4. Click **Run**
5. Wait for completion (should see all table creation messages)

**What this does:**
- Creates all 6 core tables (users, ideas, credentials, executions, outputs, blog_posts)
- Creates indexes for performance
- Enables Row-Level Security (RLS) on all tables
- Creates RLS policies for data isolation
- Creates update triggers for updated_at
- Creates images storage bucket

### Step 3: Run Migration 002 (Usage Tracking)

1. **SQL Editor** → **New Query**
2. Copy `scripts/migrations/002-add-usage-tracking-simple.sql`
3. Click **Run**

**What this does:**
- Creates `usage_tracking` table
- Creates `payment_receipts` table
- Creates database functions for credit management
- Enables RLS on new tables
- Creates triggers for auto-initialization

### Step 4: Seed Admin User (Optional)

To create admin user with 100 credits:

**Option A: SQL (in Supabase SQL Editor)**
```bash
Copy scripts/seed-admin-user.sql and run it
```

**Option B: TypeScript (locally)**
```bash
npm run db:seed-admin
```

### Step 5: Configure Environment Variables

Create `.env.local`:

```bash
# Database
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# GitHub OAuth
GITHUB_CLIENT_ID=Iv1.abc123def456
GITHUB_CLIENT_SECRET=1234567890abcdef...

# NextAuth
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000

# Encryption
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# AI Models
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Step 6: Test Setup

```bash
npm run dev
# Sign in with GitHub
# Verify you see 5 free credits
```

---

## Tables & Schema

### users Table

**Purpose:** Store user accounts created via GitHub OAuth

**Schema:**
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- `idx_users_email`: Fast email lookups for authentication

**RLS Policies:**
- Users can view their own record
- Users can update their own record
- Service role: full access (for admin operations)

**Usage:**
- Auto-created when user signs in via GitHub OAuth
- One record per unique email
- Updated when user changes profile in GitHub

### ideas Table

**Purpose:** Store raw ideas that users submit for expansion

**Schema:**
```sql
CREATE TABLE ideas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  bullets JSONB DEFAULT '[]'::jsonb,
  external_links JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'expanded', 'archived')),
  priority_score INTEGER DEFAULT 0
    CHECK (priority_score >= 0 AND priority_score <= 100),
  last_evaluated_at TIMESTAMPTZ,
  times_evaluated INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- `idx_ideas_user_status`: Fast queries by user and status
- `idx_ideas_created`: Sort by creation date
- `idx_ideas_priority`: Sort by priority

**RLS Policies:**
- Users can view, create, update, delete only their own ideas

**Status Transitions:**
- `pending` → `expanded` (when user runs expansion)
- `pending` → `archived` (when user archives)
- `expanded` → `archived` (when user archives expanded idea)

### credentials Table

**Purpose:** Store encrypted API keys per user (GitHub OAuth tokens, etc.)

**Schema:**
```sql
CREATE TABLE credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN (...)),
  encrypted_value TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  validation_status TEXT DEFAULT 'not_checked'
    CHECK (validation_status IN ('valid', 'invalid', 'not_checked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);
```

**Encryption:** AES-256-GCM using ENCRYPTION_KEY from env vars

**Providers:** github, openai, anthropic, twitter, replicate, etc.

**RLS Policies:**
- Users can only view, create, update, delete their own credentials
- Service role: full access

**Usage:**
- GitHub OAuth token stored when user authenticates
- Used to publish code repos to user's GitHub account
- Never exposed to frontend

### outputs Table

**Purpose:** Store generated content from expansions (blog posts, code repos, images)

**Schema:**
```sql
CREATE TABLE outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  format TEXT NOT NULL CHECK (format IN (...)),
  content JSONB NOT NULL,
  published BOOLEAN DEFAULT false,
  publication_url TEXT,
  publication_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);
```

**Formats:** blog_post, twitter_thread, github_repo, image

**RLS Policies:**
- Users can only view their own outputs

**Relationships:**
- One-to-many with executions (multiple outputs per execution)
- One-to-many with users
- Optional relationship with ideas

### executions Table

**Purpose:** Audit trail and logs for all pipeline runs

**Schema:**
```sql
CREATE TABLE executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selected_idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  judge_reasoning TEXT,
  judge_score INTEGER CHECK (judge_score >= 0 AND judge_score <= 100),
  format_chosen TEXT CHECK (format_chosen IN (...)),
  format_reasoning TEXT,
  status TEXT DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  error_message TEXT,
  error_step TEXT,
  tokens_used INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

**Status Values:**
- `running`: Currently executing
- `completed`: Successfully finished
- `failed`: Error occurred
- `partial`: Partial success (some outputs generated, some failed)

**RLS Policies:**
- Users can only view their own executions

**Usage:**
- Created when user clicks "Expand"
- Used for performance monitoring (tokens_used, duration)
- Used for debugging (error_message, error_step)

### blog_posts Table

**Purpose:** Blog-specific metadata (separate from generic outputs)

**Schema:**
```sql
CREATE TABLE blog_posts (
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
```

**RLS Policies:**
- Users can view own posts + public posts from others
- Users can create, update, delete own posts

**Relationships:**
- One-to-one with outputs
- Many-to-one with users

### usage_tracking Table (via Migration 002)

**Purpose:** Track free and paid credits per user

**Schema:**
```sql
CREATE TABLE usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  free_expansions_remaining INT NOT NULL DEFAULT 5,
  paid_credits_remaining INT NOT NULL DEFAULT 0,
  total_expansions_used INT NOT NULL DEFAULT 0,
  total_free_used INT NOT NULL DEFAULT 0,
  total_paid_used INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Auto-Initialization:** Trigger creates record when new user is created

**RLS Policies:**
- Users can view their own
- Service role: full access

### payment_receipts Table (via Migration 002)

**Purpose:** Audit trail for Buy Me a Coffee payments

**Schema:**
```sql
CREATE TABLE payment_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_usd NUMERIC(10, 2) NOT NULL,
  credits_purchased INT NOT NULL,
  bmc_reference TEXT,
  notes TEXT,
  verified_by TEXT,
  status TEXT NOT NULL DEFAULT 'verified'
    CHECK (status IN ('pending', 'verified', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Status Values:**
- `pending`: Payment received, awaiting verification
- `verified`: Payment verified, credits added
- `refunded`: Payment refunded

**RLS Policies:**
- Users can view their own
- Service role: full access

---

## Security (RLS Policies)

### What is Row-Level Security (RLS)?

RLS is PostgreSQL's built-in feature that filters data at the database level based on the authenticated user. Each user can only see/modify their own data.

**How it works:**
1. User signs in via GitHub OAuth
2. NextAuth creates JWT with user's ID (from `auth.jwt() ->> 'sub'`)
3. When user queries database, RLS policies check their JWT
4. Only rows matching their user_id are returned
5. Cannot bypass RLS via API (enforced at database level)

### Policies by Table

**users Table:**
```sql
-- Users see only their own record
USING (id::text = auth.jwt() ->> 'sub')
```

**ideas Table:**
```sql
-- Users see only their ideas
USING (user_id::text = auth.jwt() ->> 'sub')

-- Users create ideas for themselves
WITH CHECK (user_id::text = auth.jwt() ->> 'sub')
```

**credentials Table:**
```sql
-- Users see only their credentials
USING (user_id::text = auth.jwt() ->> 'sub')
```

**outputs Table:**
```sql
-- Users see only their outputs
USING (user_id::text = auth.jwt() ->> 'sub')
```

**executions Table:**
```sql
-- Users see only their executions
USING (user_id::text = auth.jwt() ->> 'sub')
```

**blog_posts Table:**
```sql
-- Users see own posts + public posts
USING (
  user_id::text = auth.jwt() ->> 'sub'
  OR is_public = true
)
```

### Service Role Key (Admin Access)

The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS for admin operations:
- Creating users automatically on first login
- Granting credits after payment verification
- Admin debugging and monitoring

**Security Note:** Service role key must be server-only (never exposed to frontend)

---

## Usage Tracking & Credits

### Credit System Overview

**Model:** 5 free + paid credits

**Flow:**
1. User signs up → gets 5 free credits automatically
2. User expands 5 ideas → free credits depleted
3. User sees "Buy More Credits" button
4. User pays $1 via Buy Me a Coffee
5. Admin verifies payment → runs grant-credits script
6. User gets instant access to paid credits

### Database Functions (via Migration 002)

#### check_user_has_credits(user_id UUID) → BOOLEAN

Check if user has available credits (free OR paid > 0)

```sql
SELECT check_user_has_credits('user-uuid'::uuid);
-- Returns: true or false
```

**Used in:**
- Before allowing expansion to start
- Deciding whether to show "Buy Credits" button

#### consume_expansion_credit(user_id UUID) → TEXT

Deduct 1 credit from user's account

**Logic:**
1. Check user has credits
2. Consume free first (if any)
3. Then consume paid (if no free)
4. Return 'free' or 'paid'
5. Increment total_expansions_used counter

**Used in:**
- After successful expansion generation
- Ensures credits only consumed on success

#### add_paid_credits(user_id, credits, amount_usd, ...) → UUID

Add paid credits and create payment receipt

**Called by:**
- `scripts/admin/grant-credits.ts` (CLI)
- Manual SQL execution by admin

**Parameters:**
- `p_user_id`: User's UUID
- `p_credits`: Number of credits to add
- `p_amount_usd`: Amount paid in USD
- `p_bmc_reference`: Buy Me a Coffee reference
- `p_verified_by`: Admin name
- `p_notes`: Optional notes

**Returns:** Receipt UUID for audit trail

### Credit Consumption Example

**User lifecycle:**
```
Sign up → usage_tracking created with free=5, paid=0

Expansion 1 → consume_expansion_credit() → free=4, paid=0
Expansion 2 → consume_expansion_credit() → free=3, paid=0
Expansion 3 → consume_expansion_credit() → free=2, paid=0
Expansion 4 → consume_expansion_credit() → free=1, paid=0
Expansion 5 → consume_expansion_credit() → free=0, paid=0

User buys 5 credits (via BMC) → admin runs grant-credits
grant-credits('user@ex.com', 5, '5.00', 'BMC-123')
→ adds payment_receipt
→ updates usage_tracking to free=0, paid=5

Expansion 6 → consume_expansion_credit() → free=0, paid=4
Expansion 7 → consume_expansion_credit() → free=0, paid=3
... (paid credits consumed)
Expansion 10 → consume_expansion_credit() → free=0, paid=0

User tries expand 11 → check_user_has_credits() → false
→ Show "Buy More Credits" button
```

---

## Management Scripts

### Database Operation Scripts

#### Complete Reset (Danger!)

**File:** `scripts/complete-db-reset.sql`

**What it does:** Drops ALL tables, functions, and data

**When to use:**
- Starting completely from scratch
- After failed setup
- Testing setup procedure

**Warning:** Cannot be undone!

**How to run:**
```bash
# In Supabase SQL Editor
Copy scripts/complete-db-reset.sql and run it
```

**Next steps:**
```bash
npm run db:setup           # Run setup-db.sql
npm run db:migrate         # Run migration 002
npm run db:seed-admin      # Optional: seed admin user
```

#### Reset Data Only (Safe)

**File:** `scripts/reset-db-delete-data.sql`

**What it does:** Deletes all data but keeps schema and admin user

**When to use:**
- Before production deployment
- Cleaning test data
- Regular cleanup

**What's preserved:**
- Database schema
- RLS policies
- Functions and triggers
- Admin user (qsimeon@mit.edu) with 100 credits

**How to run:**
```bash
# In Supabase SQL Editor
Copy scripts/reset-db-delete-data.sql and run it
```

**Verification:**
- Should show: users=1, ideas=0, outputs=0, etc.
- Admin user has 100 credits

#### Seed Admin User

**SQL Version:** `scripts/seed-admin-user.sql`

**TypeScript Version:** `scripts/admin/seed-admin-user.ts`

**What it does:** Creates admin user (qsimeon@mit.edu) with 100 credits

**When to use:**
- After initial setup
- Before deployment
- To reset admin credits

**How to run:**
```bash
# SQL (in Supabase SQL Editor)
Copy scripts/seed-admin-user.sql and run it

# TypeScript (locally)
npm run db:seed-admin
```

**Verification:**
```sql
SELECT u.email, ut.free_expansions_remaining, ut.paid_credits_remaining
FROM users u
JOIN usage_tracking ut ON u.id = ut.user_id
WHERE u.email = 'qsimeon@mit.edu';
-- Should show: free=5, paid=95, total=100
```

#### Grant Credits (Admin Tool)

**File:** `scripts/admin/grant-credits.ts`

**What it does:** Add paid credits to user after BMC payment verification

**Process:**
1. User pays via Buy Me a Coffee
2. You receive email notification
3. Verify payment details
4. Run grant-credits with user email and amount
5. Script creates payment receipt
6. Credits added instantly

**How to use:**
```bash
# Grant 5 credits after $5 payment
npx tsx scripts/admin/grant-credits.ts user@example.com 5 5.00 "BMC-12345"

# Or via npm script
npm run admin:grant-credits user@example.com 5 5.00 "BMC-12345"
```

**Parameters:**
```bash
tsx scripts/admin/grant-credits.ts <email> <credits> <amount> [bmc_ref] [notes]
```

**Output:**
```
💳 Processing credit grant...
User Email: user@example.com
Credits to Grant: 5
Reference: BMC-12345

Step 1: Looking up user...
✅ User found: John Doe

Step 2: Getting current credits...
Current Credits: 0

Step 3: Creating payment receipt...
✅ Payment receipt created

Step 4: Verifying...
✅ Verification successful

═══════════════════════════════════════════════════════════
✨ Credits granted successfully!

User:              user@example.com
Credits Added:     5
Previous Total:    0
New Total:         5
Receipt ID:        550e8400-e29b-41d4-a716-446655440000
Reference:         BMC-12345
═══════════════════════════════════════════════════════════
```

### Development Helper Scripts

#### Database Helper (db-helper.ts)

**File:** `scripts/db-helper.ts`

**Commands:**
```bash
npm run db check-ideas      # List all ideas for test user
npm run db check-outputs    # List all outputs for test user
npm run db check-join       # Test join queries
npm run db check-fk         # Verify foreign keys
npm run db clear            # Delete all test user data
```

---

## Common Operations

### Resetting for Production Deployment

**Checklist:**
```bash
# 1. Delete all test data (keep schema)
npm run db:reset-data
# (Run scripts/reset-db-delete-data.sql in SQL Editor)

# 2. Seed admin user with 100 credits
npm run db:seed-admin
# (Or run scripts/seed-admin-user.sql in SQL Editor)

# 3. Verify
SELECT COUNT(*) FROM users;              -- Should be: 1
SELECT COUNT(*) FROM ideas;              -- Should be: 0
SELECT COUNT(*) FROM outputs;            -- Should be: 0
```

### Adding a New User Manually

Users are auto-created via GitHub OAuth, but to manually add (rare):

```sql
INSERT INTO users (email, name, timezone)
VALUES ('user@example.com', 'John Doe', 'America/New_York');

-- Trigger automatically creates usage_tracking with 5 free credits
```

### Checking Database Health

```bash
# Check all tables exist and have structure
npm run db check-fk

# Check ideas and joins work
npm run db check-join

# List all users and their credits
SELECT
  u.email,
  u.name,
  ut.free_expansions_remaining,
  ut.paid_credits_remaining,
  (ut.free_expansions_remaining + ut.paid_credits_remaining) as total
FROM users u
LEFT JOIN usage_tracking ut ON u.id = ut.user_id
ORDER BY u.created_at DESC;

# Find users with zero credits
SELECT u.email, ut.paid_credits_remaining
FROM users u
JOIN usage_tracking ut ON u.id = ut.user_id
WHERE (ut.free_expansions_remaining + ut.paid_credits_remaining) = 0;
```

### Viewing Execution History

```sql
-- Recent executions
SELECT
  user_id,
  format_chosen,
  status,
  tokens_used,
  duration_seconds,
  error_message,
  started_at
FROM executions
ORDER BY started_at DESC
LIMIT 10;

-- User's execution summary
SELECT
  u.email,
  COUNT(*) as total_executions,
  COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
  SUM(COALESCE(tokens_used, 0)) as total_tokens
FROM executions e
JOIN users u ON e.user_id = u.id
GROUP BY u.email
ORDER BY total_executions DESC;
```

### Viewing Payment History

```sql
-- All payments
SELECT
  u.email,
  pr.amount_usd,
  pr.credits_purchased,
  pr.bmc_reference,
  pr.status,
  pr.verified_at
FROM payment_receipts pr
JOIN users u ON pr.user_id = u.id
ORDER BY pr.verified_at DESC;

-- Payment summary by user
SELECT
  u.email,
  COUNT(*) as payments,
  SUM(pr.credits_purchased) as total_credits,
  SUM(pr.amount_usd) as total_spent
FROM payment_receipts pr
JOIN users u ON pr.user_id = u.id
WHERE pr.status = 'verified'
GROUP BY u.email
ORDER BY total_spent DESC;
```

---

## Backup & Recovery

### Automatic Backups (Supabase Pro)

Supabase automatically backs up databases for Pro plan:
- Daily backups retained for 7 days
- Point-in-time recovery available

**To restore:**
1. Supabase Dashboard → Settings → Backups
2. Click "Restore" next to desired backup
3. Choose restore point
4. Confirm (takes 5-10 minutes)

### Manual Backup

```bash
# Export PostgreSQL dump
pg_dump -h your-project.supabase.co \
  -U postgres \
  -d postgres \
  --password \
  > backup-$(date +%Y%m%d).sql

# This creates a file like: backup-20260127.sql
```

### Restore from Backup

```bash
# Via Supabase Dashboard (recommended)
Settings → Backups → Click "Restore"

# Or via command line (advanced)
psql -h your-project.supabase.co \
  -U postgres \
  -d postgres \
  --password \
  < backup-20260127.sql
```

### Development Backup Best Practices

1. **Before major changes:** Create manual backup
2. **Before running migration:** Create backup
3. **Before resetting:** Create backup (just in case)
4. **Weekly:** Check that automatic backups exist

---

## Troubleshooting

### Issue: "User cannot see their ideas"

**Symptom:** User signs in but ideas list is empty

**Possible causes:**
1. RLS policy not working
2. User not properly authenticated
3. Ideas created with different user_id

**Solutions:**
```bash
# 1. Verify user is authenticated
# (Check browser console: should show user object)

# 2. Check RLS is enabled
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'ideas';

# 3. Check policy exists
SELECT * FROM pg_policies WHERE tablename = 'ideas';

# 4. Manually check user's ideas
SELECT * FROM ideas WHERE user_id = 'your-uuid';
```

### Issue: "Credits not consumed after expansion"

**Symptom:** User expands idea but credits don't decrease

**Possible causes:**
1. consume_expansion_credit() not called in API
2. Function doesn't exist (migration not run)
3. Database error silently caught

**Solutions:**
```bash
# 1. Verify function exists
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'consume_expansion_credit';

# 2. Check migration was run
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name = 'usage_tracking';

# 3. Manually test function
SELECT consume_expansion_credit('user-uuid'::uuid);

# 4. Check API endpoint calls function
grep -r "consume_expansion_credit" src/app/api/
```

### Issue: "Admin user not created"

**Symptom:** seed-admin-user script runs but user doesn't exist

**Possible causes:**
1. Email mismatch in script
2. users/usage_tracking tables don't exist
3. Script didn't actually run

**Solutions:**
```bash
# 1. Check if user exists
SELECT * FROM users WHERE email = 'qsimeon@mit.edu';

# 2. Check tables exist
SELECT tablename FROM pg_tables
WHERE tablename IN ('users', 'usage_tracking');

# 3. Try manual creation
INSERT INTO users (email, name, timezone)
VALUES ('qsimeon@mit.edu', 'Quilee Simeon', 'America/New_York');

INSERT INTO usage_tracking (user_id, free_expansions_remaining, paid_credits_remaining)
SELECT id, 5, 95 FROM users WHERE email = 'qsimeon@mit.edu';
```

### Issue: "Cannot connect to database"

**Symptom:** Connection timeout or "could not connect" error

**Possible causes:**
1. Wrong Supabase URL
2. Wrong credentials (anon vs service role)
3. Supabase project paused
4. Network/firewall blocking

**Solutions:**
```bash
# 1. Verify Supabase URL
echo $NEXT_PUBLIC_SUPABASE_URL

# 2. Verify service role key exists
echo $SUPABASE_SERVICE_ROLE_KEY | head -c 20

# 3. Check Supabase dashboard
# - Go to Settings → API
# - Copy URL and keys again
# - Make sure project is "Active" (not paused)

# 4. Test connection locally
npm run db:seed-admin
# If this works, connection is OK
```

### Issue: "RLS policy blocks legitimate query"

**Symptom:** User query fails with "new row violates row-level security"

**Possible causes:**
1. User_id in new row doesn't match authenticated user
2. RLS policy too restrictive
3. Admin trying to do operation without service role key

**Solutions:**
```bash
# 1. Check policy syntax
SELECT policy_name, qual, with_check
FROM pg_policies
WHERE tablename = 'ideas';

# 2. Check authenticated user
SELECT auth.jwt() ->> 'sub';

# 3. Verify user_id matches
-- Your user UUID should match auth.jwt() ->> 'sub'
```

### Issue: Storage bucket permission denied

**Symptom:** Cannot upload images to storage bucket

**Possible causes:**
1. Storage policies not created
2. Wrong bucket name
3. File path doesn't match policy

**Solutions:**
```bash
# 1. Check bucket exists
SELECT * FROM storage.buckets WHERE id = 'images';

# 2. Check storage policies
SELECT * FROM pg_policies WHERE tablename = 'objects';

# 3. Try manual upload via Supabase dashboard
# Storage → images bucket → Upload file
```

---

## Quick Reference

### NPM Commands

```bash
npm run db:setup              # Show setup instructions
npm run db:migrate            # Show migration instructions
npm run db:seed-admin         # Run admin seeding (TypeScript)
npm run db:reset-data         # Show reset instructions
npm run db:complete-reset     # Show complete reset instructions
npm run admin:grant-credits   # Show grant-credits usage
npm run db check-ideas        # List all ideas
```

### Common SQL Queries

```sql
-- User summary
SELECT
  u.email,
  COUNT(i.id) as ideas,
  COUNT(o.id) as outputs,
  ut.free_expansions_remaining,
  ut.paid_credits_remaining
FROM users u
LEFT JOIN ideas i ON u.id = i.user_id
LEFT JOIN outputs o ON u.id = o.user_id
LEFT JOIN usage_tracking ut ON u.id = ut.user_id
GROUP BY u.id, u.email, ut.free_expansions_remaining, ut.paid_credits_remaining;

-- Top users by output count
SELECT
  u.email,
  COUNT(o.id) as output_count,
  MAX(o.created_at) as latest_output
FROM users u
JOIN outputs o ON u.id = o.user_id
GROUP BY u.id, u.email
ORDER BY output_count DESC;

-- Failed expansions
SELECT
  u.email,
  e.error_step,
  COUNT(*) as count,
  MAX(e.completed_at) as latest
FROM executions e
JOIN users u ON e.user_id = u.id
WHERE e.status = 'failed'
GROUP BY u.email, e.error_step
ORDER BY count DESC;
```

### File Locations

| Purpose | File |
|---------|------|
| Initial setup | scripts/setup-db.sql |
| Add credit system | scripts/migrations/002-add-usage-tracking-simple.sql |
| Delete all data | scripts/reset-db-delete-data.sql |
| Complete reset | scripts/complete-db-reset.sql |
| Seed admin user (SQL) | scripts/seed-admin-user.sql |
| Seed admin user (TS) | scripts/admin/seed-admin-user.ts |
| Grant credits | scripts/admin/grant-credits.ts |
| Development tools | scripts/db-helper.ts |

---

## Next Steps

- **[Deployment Guide](./DEPLOYMENT.md)** - Deploy to production
- **[Admin Tools](./ADMIN_TOOLS.md)** - Manage users and credits
- **[Architecture Overview](./ARCHITECTURE.md)** - Understand system design
- **[Environment Variables](./ENVIRONMENT_VARIABLES.md)** - Configure credentials
