# Vercel Deployment Guide

Complete guide for deploying to production. Includes environment variables, GitHub OAuth setup, and post-deployment testing.

**Timeline:** ~30 minutes for first-time setup

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Variables](#environment-variables)
   - [Backend Credentials (Global)](#backend-credentials-global)
   - [User-Specific Credentials (Per-User)](#user-specific-credentials-per-user)
3. [Vercel Setup](#vercel-setup)
4. [Database Preparation](#database-preparation)
5. [GitHub OAuth Setup](#github-oauth-setup)
6. [Buy Me a Coffee Integration](#buy-me-a-coffee-integration)
7. [First Deployment](#first-deployment)
8. [Testing in Production](#testing-in-production)
9. [Monitoring & Maintenance](#monitoring--maintenance)
10. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

Before deploying, ensure:

### Code Ready
- [ ] Latest changes pushed to GitHub: `git push origin main`
- [ ] Build passes locally: `npm run build`
- [ ] No TypeScript errors
- [ ] `.env.local` NOT committed to git (in .gitignore)

### Database Ready
- [ ] Supabase project created
- [ ] `scripts/setup-db.sql` has been run
- [ ] `scripts/migrations/002-add-usage-tracking-simple.sql` has been run
- [ ] Database schema verified (7 tables created)

### Environment Variables Ready
- [ ] All 15 required variables collected (see section 2)
- [ ] API keys have remaining balance
- [ ] Secrets are unique per environment
- [ ] ENCRYPTION_KEY is 64-character hex string

### GitHub OAuth Ready
- [ ] OAuth app created in GitHub Settings
- [ ] Production callback URL ready (will update in step 2)
- [ ] CLIENT_ID and CLIENT_SECRET copied

### Vercel Ready
- [ ] GitHub account connected to Vercel
- [ ] Repository accessible
- [ ] No pending branch protection rules

---

## Environment Variables

### Critical Distinction

**This is the most important concept for production!**

#### Backend Credentials (Global)
These credentials power backend services. They are:
- Shared across all users
- Set in Vercel environment variables
- Never stored in database
- Never exposed to frontend
- The same for all users

**Examples:**
- OPENAI_API_KEY (backend makes AI calls for all users)
- ANTHROPIC_API_KEY (backend makes AI calls for all users)
- SUPABASE_SERVICE_ROLE_KEY (backend admin access)
- NEXTAUTH_SECRET (backend encrypts sessions)
- ENCRYPTION_KEY (backend encrypts tokens)

#### User-Specific Credentials (Per-User)
These credentials are unique to each user. They are:
- Stored encrypted in `credentials` table
- Retrieved per-user during operations
- User provides during OAuth flow
- Different for each user

**Examples:**
- GitHub OAuth Token (per user)
  - User grants during GitHub OAuth flow
  - Stored encrypted in credentials table
  - Used to publish repos to THEIR GitHub
  - NOT in .env - stored in database

**Why the distinction matters:**

In local `.env.local`:
- You simulate being a user
- You put YOUR GitHub OAuth token
- It's used for YOUR GitHub account

In production:
- Each user has their own GitHub OAuth token in the database
- Backend credentials (OPENAI_API_KEY, etc.) are the same for all users
- User credentials are different for each user
- When user publishes code, it goes to THEIR GitHub (not the site owner's)

### Required Backend Environment Variables

Set these in Vercel dashboard (Settings → Environment Variables):

#### Database (Supabase)

**`NEXT_PUBLIC_SUPABASE_URL`** _(Public - safe in browser)_
```
Format: https://your-project.supabase.co
Where to get: Supabase Dashboard → Settings → API
```

**`NEXT_PUBLIC_SUPABASE_ANON_KEY`** _(Public - safe in browser)_
```
Where to get: Supabase Dashboard → Settings → API
Purpose: Client-side database reads with RLS
```

**`SUPABASE_SERVICE_ROLE_KEY`** _(Secret - NEVER expose)_
```
Where to get: Supabase Dashboard → Settings → API → Service Role Key
Purpose: Server-side admin access (bypass RLS)
CRITICAL: This must be server-only, never in frontend code
```

#### GitHub OAuth (Authentication)

**`GITHUB_CLIENT_ID`** _(Public - safe in browser)_
```
Where to get: https://github.com/settings/developers
Purpose: OAuth app identifier
```

**`GITHUB_CLIENT_SECRET`** _(Secret - NEVER expose)_
```
Where to get: https://github.com/settings/developers
Purpose: OAuth app secret (only shown once!)
CRITICAL: Save immediately, cannot be retrieved later
```

#### NextAuth (Session Management)

**`NEXTAUTH_SECRET`** _(Secret - NEVER expose)_
```
How to generate:
  openssl rand -base64 32
  or: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
Purpose: Sign JWTs and encrypt session tokens
CRITICAL: Generate fresh for production
```

**`NEXTAUTH_URL`** _(Public)_
```
Format: https://yourdomain.vercel.app
Or: https://your-custom-domain.com (if using custom domain)
Purpose: NextAuth session validation
Note: Auto-detected in dev, must be explicit in production
```

#### Encryption (Token Storage)

**`ENCRYPTION_KEY`** _(Secret - NEVER expose)_
```
How to generate:
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
Format: Exactly 64 hex characters (32 bytes)
Purpose: AES-256-GCM encryption of stored credentials
CRITICAL: Must be identical across all deployments
Note: If you change this, all encrypted tokens become unreadable!
```

#### AI Models (Content Generation)

**`OPENAI_API_KEY`** _(Secret - NEVER expose)_
```
Where to get: https://platform.openai.com/api-keys
Used for: Planning agent (GPT-4o-mini) for structured reasoning
Cost: ~$0.0005 per expansion
CRITICAL: Keep balance available
Note: Used by backend for all users
```

**`ANTHROPIC_API_KEY`** _(Secret - NEVER expose)_
```
Where to get: https://console.anthropic.com/account/api-keys
Used for: Code and blog generation (Claude Sonnet 4.5)
Cost: ~$0.003-0.01 per expansion
CRITICAL: Keep balance available
Note: Used by backend for all users
```

#### Optional: Buy Me a Coffee Integration

**No API key required!** Buy Me a Coffee integration is manual:
1. User visits your BMC link
2. You receive email notification
3. You manually verify and grant credits via admin script

See: Buy Me a Coffee Integration section below

#### Optional: Image Generation

Select ONE image provider (in priority order):

**`FAL_KEY`** _(Optional - Recommended)_
```
Where to get: https://fal.ai/dashboard/api-keys
Pros: Fast (2-5s), high quality, 100 free images/month
Used for: Blog post illustration generation
```

**`HUGGINGFACE_API_KEY`** _(Optional - Fallback)_
```
Where to get: https://huggingface.co/settings/tokens
Pros: Free tier available
Cons: Slower, lower quality
Used for: Blog post illustration generation (fallback)
```

**`REPLICATE_API_TOKEN`** _(Optional - Fallback)_
```
Where to get: https://replicate.com/account/api-tokens
Pros: Fast, good quality
Cons: Paid service ($0.001/prediction)
Used for: Blog post illustration generation (fallback)
```

**Note:** App works fine without any image key (blog posts skip illustrations)

### Environment Variables NOT Needed in Production

These are **local development only**:
```bash
# ❌ NOT NEEDED in Vercel
# GitHub OAuth token for YOUR account
# In production, each user authenticates via GitHub OAuth
# Their token is stored encrypted in the database
```

### Summary Table

| Variable | Type | Security | Source |
|----------|------|----------|--------|
| NEXT_PUBLIC_SUPABASE_URL | Backend | Public | Supabase |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Backend | Public | Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Backend | Secret | Supabase |
| GITHUB_CLIENT_ID | Backend | Public | GitHub |
| GITHUB_CLIENT_SECRET | Backend | Secret | GitHub |
| NEXTAUTH_SECRET | Backend | Secret | Generate |
| NEXTAUTH_URL | Backend | Public | Your domain |
| ENCRYPTION_KEY | Backend | Secret | Generate |
| OPENAI_API_KEY | Backend | Secret | OpenAI |
| ANTHROPIC_API_KEY | Backend | Secret | Anthropic |
| FAL_KEY | Backend | Secret | FAL.ai (optional) |
| HUGGINGFACE_API_KEY | Backend | Secret | HuggingFace (optional) |
| REPLICATE_API_TOKEN | Backend | Secret | Replicate (optional) |

---

## Vercel Setup

### Step 1: Connect Repository

1. Go to https://vercel.com/dashboard
2. Click "Add New..." → "Project"
3. Select your GitHub repository: `automated-idea-expansion`
4. Click "Import"

### Step 2: Configure Build Settings

Vercel should auto-detect Next.js. Verify:

| Setting | Value |
|---------|-------|
| Framework | Next.js |
| Build Command | `next build` |
| Output Directory | `.next` |
| Install Command | `npm install` |
| Development Branch | main |

### Step 3: Add Environment Variables

1. After selecting repository, click "Environment Variables"
2. Add each variable from the table above
3. For each variable:
   - Name: Variable name (e.g., `NEXT_PUBLIC_SUPABASE_URL`)
   - Value: The actual value
   - Environments: Select "Production"
4. Click "Add"

**Order to add:**
1. First: Public variables (NEXT_PUBLIC_*)
2. Then: Public non-browser variables (GITHUB_CLIENT_ID, NEXTAUTH_URL)
3. Finally: All Secret variables (mark each as Secret)

### Step 4: Review & Deploy

1. Review all settings
2. Click "Deploy"
3. Wait 3-5 minutes for build
4. Check build logs for errors
5. See success: "Congratulations, your project has been successfully deployed"

---

## Database Preparation

Before first deployment, prepare database:

### Step 1: Reset Database

In Supabase SQL Editor, run:
```bash
scripts/reset-db-delete-data.sql
```

This:
- Deletes all test data
- Keeps database schema
- Resets admin user (qsimeon@mit.edu) with 100 credits

### Step 2: Seed Admin User

After reset, run:
```bash
scripts/seed-admin-user.sql
```

Or via TypeScript:
```bash
npm run db:seed-admin
```

### Step 3: Verify

```sql
-- Check admin user has 100 credits
SELECT u.email, ut.free_expansions_remaining, ut.paid_credits_remaining
FROM users u
JOIN usage_tracking ut ON u.id = ut.user_id
WHERE u.email = 'qsimeon@mit.edu';

-- Expected: free=5, paid=95, total=100
```

---

## GitHub OAuth Setup

### Create Production OAuth App

**If you haven't created an OAuth app yet:**

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name:** "Automated Idea Expansion"
   - **Homepage URL:** `https://your-domain.vercel.app` (or custom domain)
   - **Authorization callback URL:** `https://your-domain.vercel.app/api/auth/callback/github`
   - **Description:** (optional) "Expand ideas into blog posts and code"
4. Click "Register application"
5. Copy:
   - `Client ID` → GITHUB_CLIENT_ID
   - `Client Secret` (only shown once!) → GITHUB_CLIENT_SECRET
6. Click "Generate a new client secret" if needed

**If you have a development OAuth app:**

1. Go to https://github.com/settings/developers
2. Find your OAuth app
3. Click "Edit"
4. Update **Authorization callback URL** ONLY:
   - Change from: `http://localhost:3000/api/auth/callback/github`
   - Change to: `https://your-domain.vercel.app/api/auth/callback/github`
5. Click "Update application"

### Copy Credentials to Vercel

1. Copy `GITHUB_CLIENT_ID` from GitHub
2. In Vercel dashboard: Settings → Environment Variables
3. Add `GITHUB_CLIENT_ID` (Public)
4. Copy `GITHUB_CLIENT_SECRET` from GitHub
5. In Vercel dashboard: Add `GITHUB_CLIENT_SECRET` (Secret)
6. Deploy

### Test OAuth Flow

1. Visit your live domain
2. Click "Manage Ideas" button
3. Click "Sign in with GitHub"
4. GitHub should prompt for authorization
5. After authorizing, should redirect back to ideas page
6. You should see your email in header

---

## Buy Me a Coffee Integration

### Setup (No API Key Needed!)

1. Create account at https://buymeacoffee.com
2. Set up your unique link: `https://buymeacoffee.com/your-username`
3. In your app code, update the BMC link in:
   ```typescript
   // src/components/BuyCreditsButton.tsx
   const BMC_LINK = 'https://buymeacoffee.com/your-username';
   ```

### Manual Credit Grant Process

When user buys credits:

1. **User pays** via Buy Me a Coffee
2. **You receive email** from Buy Me a Coffee with:
   - User's name
   - User's email
   - Amount paid
   - Transaction reference
3. **Verify payment** (check email)
4. **Run admin script:**
   ```bash
   npx tsx scripts/admin/grant-credits.ts user@example.com 5 5.00 "BMC-20260127-ABC123"
   ```
5. **Credits added instantly** - user can expand more ideas

### Process Example

```
1. User visits: https://buymeacoffee.com/quilee
2. User buys 5 credits for $5.00
3. You receive email:
   "New supporter: John Doe (john@example.com) - $5.00 - John wants 5 credits"
4. You verify it's legitimate
5. You run:
   npx tsx scripts/admin/grant-credits.ts john@example.com 5 5.00 "BMC-supporter-john-doe"
6. Script creates payment_receipt and adds credits
7. John sees "You now have 5 new credits!"
```

### Future: Automate with Webhooks (Optional)

Buy Me a Coffee supports webhooks on Pro plan, but manual process works fine for MVP:
- Simpler to implement
- No webhook infrastructure needed
- Gives you control (verify before granting)
- Works for typical volume (few purchases per week)

---

## First Deployment

### Pre-Deployment Checklist

Before clicking "Deploy":

- [ ] All environment variables added to Vercel
- [ ] Database reset and admin seeded
- [ ] GitHub OAuth callback URL updated
- [ ] Latest code pushed to GitHub
- [ ] `.env.local` NOT committed

### Deploy

1. In Vercel dashboard, click **"Deploy"**
2. Watch build logs
3. Wait for: "Congratulations, your project has been successfully deployed"
4. Click **"Visit"** for live URL

### Verify Deployment

```bash
# Visit your live URL
https://your-domain.vercel.app

# Should see:
# - Homepage loads
# - No errors in browser console (F12)
# - "Manage Ideas" button visible
```

---

## Testing in Production

### Test 1: Home Page Loads

1. Visit `https://your-domain.vercel.app`
2. Should see homepage
3. No errors in browser console (F12 → Console tab)
4. Page loads in < 3 seconds

### Test 2: GitHub Authentication

1. Click **"Manage Ideas"** button
2. Click **"Sign in with GitHub"**
3. GitHub OAuth flow should appear
4. Authorize the application
5. Should redirect back to `/ideas` page
6. Your GitHub email should display in header
7. Check browser console for no errors

**If auth fails:**
- Verify GitHub OAuth callback URL matches exactly
  - Should be: `https://your-domain.vercel.app/api/auth/callback/github`
  - Check no trailing slash
- Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are correct
- Try generating new client secret in GitHub settings
- Check Vercel function logs for errors

### Test 3: Database Write

1. On Ideas page, create a test idea
   - Title: "Build a simple calculator app"
   - Description: "A CLI calculator tool"
2. Click "Save Idea"
3. Idea should appear in list

**Verify in Supabase:**
1. Go to Supabase Dashboard
2. Select your project
3. Table Editor → `ideas` table
4. Should see your test idea with your user_id

### Test 4: Credit System

1. Create 5 test ideas
2. Expand all 5 (using free credits)
3. On 6th expansion, should see **"No Credits"** error
4. Should see **"Buy More Credits"** button
5. Button should link to your Buy Me a Coffee

**Verify in Supabase:**
1. Table Editor → `usage_tracking`
2. Find your row
3. Should show:
   - `free_expansions_remaining`: 0
   - `paid_credits_remaining`: 95 (admin's 100, minus your 5)
   - `total_expansions_used`: 5

### Test 5: Expansion Pipeline

1. Create test idea: "Build a todo list app"
2. Click **"Expand"**
3. Watch expansion (30-90 seconds depending on format)
4. Should see:
   - "Expanding idea..." message
   - Real-time progress in browser console
   - Success message after completion
5. Browse to Outputs page
6. Should see generated blog post or code repo

**If expansion fails:**
- Check Vercel function logs: Deployments → Latest → Logs
- Look for error message (API key, network, etc.)
- Check Supabase connection
- Verify AI API keys have remaining balance

### Test 6: Code Publishing (if applicable)

If you expanded to code repo:

1. In Outputs page, find code project
2. Click **"View on GitHub"**
3. Should show GitHub repo in YOUR account (from OAuth token)
4. Verify code structure:
   - `package.json`
   - `src/` directory
   - Tests
   - README

### Test 7: User Isolation (RLS)

1. Sign in with different GitHub account
2. Verify:
   - You can only see YOUR ideas
   - You can only see YOUR outputs
   - You can only see YOUR credentials
   - Other users' data is hidden

**Behind the scenes:**
- Supabase RLS policies are enforcing data isolation
- Each user sees only `WHERE user_id = current_user_id`

---

## Monitoring & Maintenance

### Monitor Usage

```bash
# Check user activity
npx tsx scripts/admin/check-user-usage.ts user@example.com

# Or in Supabase SQL Editor:
SELECT u.email, COUNT(DISTINCT i.id) as ideas, COUNT(DISTINCT o.id) as outputs
FROM users u
LEFT JOIN ideas i ON u.id = i.user_id
LEFT JOIN outputs o ON u.id = o.user_id
GROUP BY u.id, u.email
ORDER BY COUNT(o.id) DESC;
```

### View Error Logs

**Vercel Function Logs:**
1. Vercel Dashboard → Your Project
2. Click "Deployments"
3. Click latest deployment
4. Click "Logs"
5. Watch real-time logs as users interact

**Browser Console:**
1. User's browser: Press F12
2. Go to "Console" tab
3. Watch for JavaScript errors
4. Share error message if asking for help

### Monitor Costs

**Vercel:**
- Free tier: ~5GB/month bandwidth
- Pro: $20/month (unlimited bandwidth)
- Visit: https://vercel.com/dashboard/account/billing

**Supabase:**
- Free tier: 500MB storage, 2GB bandwidth
- Pro: $25/month (50GB storage, 250GB bandwidth)
- Visit: https://app.supabase.com/project/[project]/settings/billing

**AI APIs:**
- OpenAI: ~$0.0005 per expansion
- Anthropic: ~$0.003-0.01 per expansion
- Total: ~$0.01-0.04 per expansion
- Monitor: OpenAI & Anthropic dashboards

### Set Up Alerts

**Vercel Error Alerts:**
- Go to project Settings
- Look for "Monitoring" section
- Enable error email alerts

**API Key Alerts:**
- OpenAI: Set usage limits in dashboard
- Anthropic: Monitor in console
- Supabase: Set storage/bandwidth limits

### Backup Strategy

**Automatic Backups (Supabase Pro):**
- Daily backups for 7 days
- Point-in-time recovery
- Go to: Settings → Backups

**Manual Backup (Recommended):**
```bash
pg_dump -h your-project.supabase.co \
  -U postgres \
  -d postgres \
  --password \
  > backup-$(date +%Y%m%d).sql
```

### Performance Optimization

Monitor in Vercel Analytics:
- Page load times (target: < 3s)
- API response times (target: < 5s)
- Error rates (target: < 0.1%)

### Security

- [ ] Review Vercel environment variables monthly
- [ ] Rotate `NEXTAUTH_SECRET` if compromised
- [ ] Rotate API keys quarterly
- [ ] Monitor Supabase access logs
- [ ] Review git history for accidental secrets

---

## Troubleshooting

### Issue: "Build Failed"

**Symptoms:**
- Build logs show error
- Deployment not created
- "Build failed" in Vercel dashboard

**Common causes:**
1. Missing environment variable
2. TypeScript compilation error
3. Dependency issue

**Solutions:**
1. Check Vercel build logs for specific error
2. Verify ALL env vars added (count should be 13+)
3. Try rebuilding: Click "Deploy" → "Redeploy"
4. If persistent, test build locally: `npm run build`

### Issue: "Sign in Fails"

**Symptoms:**
- Click "Sign in with GitHub"
- Get error message or blank page
- Not redirected back to app

**Common causes:**
1. GitHub OAuth callback URL mismatch
2. Wrong CLIENT_ID or CLIENT_SECRET
3. NEXTAUTH_SECRET incorrect

**Solutions:**
1. Verify GitHub OAuth callback URL EXACTLY matches:
   ```
   https://your-domain.vercel.app/api/auth/callback/github
   ```
   - No trailing slash!
   - Exact domain!
   - HTTPS (not HTTP)!
2. Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` match GitHub
3. Regenerate new `NEXTAUTH_SECRET`:
   ```bash
   openssl rand -base64 32
   ```
4. Update in Vercel and redeploy
5. Check Vercel function logs for auth errors

### Issue: "Expansion Fails"

**Symptoms:**
- Click "Expand Idea"
- See "Error" message
- Expansion doesn't start

**Common causes:**
1. Missing AI API key
2. API key with no remaining balance
3. Supabase connection error
4. RLS policy blocking write

**Solutions:**
1. Check Vercel logs for specific error message
2. Verify `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in Vercel
3. Check API key balance:
   - OpenAI: https://platform.openai.com/account/billing/usage
   - Anthropic: https://console.anthropic.com/account/usage
4. Try test expansion locally first: `npm run dev`
5. Check Supabase connection with simple query

### Issue: "Database Connection Error"

**Symptoms:**
- "Could not connect to database" error
- User can sign in but can't see ideas
- Ideas can't be saved

**Common causes:**
1. Wrong Supabase URL
2. Wrong service role key
3. Supabase project paused
4. Network firewall blocking

**Solutions:**
1. Verify `NEXT_PUBLIC_SUPABASE_URL` in Vercel matches Supabase project
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is correct (not anon key!)
3. Check Supabase dashboard:
   - Go to Settings → API
   - Copy keys again
   - Verify project is "Active" (not paused)
4. Test locally: `npm run dev` with same credentials
5. Check Supabase status page for incidents

### Issue: "User Can't See Ideas"

**Symptoms:**
- User signs in successfully
- Ideas list is empty
- No ideas appear even after creating them

**Common causes:**
1. RLS policy not working
2. Ideas created with different user_id
3. Database query error

**Solutions:**
```sql
-- Check RLS policies exist
SELECT * FROM pg_policies WHERE tablename = 'ideas';

-- Check ideas exist for user
SELECT * FROM ideas WHERE user_id = 'user-uuid-here';

-- Verify user_id matches authenticated user
-- (Check browser console: should show user object)

-- Verify RLS is enabled
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
```

### Issue: "Credits Not Consumed"

**Symptoms:**
- User expands idea
- Expansion succeeds
- Credits don't decrease

**Common causes:**
1. `consume_expansion_credit()` function not called
2. Function doesn't exist (migration not run)
3. Database error silently caught

**Solutions:**
1. Verify migration 002 was run:
   ```sql
   SELECT COUNT(*) FROM information_schema.tables
   WHERE table_name = 'usage_tracking';
   ```
2. Verify function exists:
   ```sql
   SELECT routine_name FROM information_schema.routines
   WHERE routine_name = 'consume_expansion_credit';
   ```
3. Test function manually:
   ```sql
   SELECT consume_expansion_credit('user-uuid'::uuid);
   ```
4. Check API endpoint actually calls function
5. Check Vercel logs for function errors

### Issue: "Storage Bucket Permission Denied"

**Symptoms:**
- Image generation fails
- "Permission denied" error
- Can't upload to storage bucket

**Common causes:**
1. Storage policies not created
2. Wrong bucket name
3. File path doesn't match policy

**Solutions:**
```sql
-- Check bucket exists
SELECT * FROM storage.buckets WHERE id = 'images';

-- Check storage policies
SELECT * FROM pg_policies WHERE tablename = 'objects';

-- Recreate bucket and policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;
```

### Issue: "GitHub Token Expired"

**Symptoms:**
- Publishing to GitHub fails
- "Invalid GitHub token" error
- Code repo not published

**Common causes:**
1. User's GitHub OAuth token expired
2. Token revoked in GitHub settings
3. Token doesn't have `public_repo` scope

**Solutions:**
1. User needs to sign out and sign back in
2. This triggers new GitHub OAuth flow
3. New token is stored encrypted
4. User can then publish again

---

## Quick Reference

### Essential Commands

```bash
# Local development
npm run dev

# Production build (test locally)
npm run build

# Start production server locally
npm run start

# Database operations
npm run db:setup            # Show setup instructions
npm run db:migrate          # Show migration instructions
npm run db:seed-admin       # Seed admin user with 100 credits
npm run db:reset-data       # Reset all data (keep schema)
npm run admin:grant-credits # Grant credits to user
npm run db check-ideas      # Check ideas in test database
```

### Essential URLs

| Purpose | URL |
|---------|-----|
| Production | https://your-domain.vercel.app |
| Vercel Dashboard | https://vercel.com/dashboard |
| Supabase Console | https://app.supabase.com |
| GitHub OAuth Settings | https://github.com/settings/developers |
| OpenAI API Keys | https://platform.openai.com/api-keys |
| Anthropic Console | https://console.anthropic.com/account/api-keys |
| Buy Me a Coffee | https://buymeacoffee.com |

### Environment Variables Checklist

```
[ ] NEXT_PUBLIC_SUPABASE_URL
[ ] NEXT_PUBLIC_SUPABASE_ANON_KEY
[ ] SUPABASE_SERVICE_ROLE_KEY
[ ] GITHUB_CLIENT_ID
[ ] GITHUB_CLIENT_SECRET
[ ] NEXTAUTH_SECRET
[ ] NEXTAUTH_URL
[ ] ENCRYPTION_KEY
[ ] OPENAI_API_KEY
[ ] ANTHROPIC_API_KEY
[ ] FAL_KEY (optional)
[ ] HUGGINGFACE_API_KEY (optional)
[ ] REPLICATE_API_TOKEN (optional)
```

---

## Post-Deployment Steps

### Immediate (Day 1)
1. ✅ Deploy to Vercel
2. ✅ Test core flows (sign in, create idea, expand)
3. ✅ Monitor logs for errors
4. ✅ Verify database writes

### Short-term (Week 1)
1. Share URL with beta users
2. Gather feedback
3. Fix bugs as they appear
4. Monitor costs and usage

### Medium-term (Month 1)
1. Scale if needed (Vercel auto-scales)
2. Add new features (based on feedback)
3. Implement email notifications
4. Build admin dashboard

---

## Support Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [NextAuth.js Documentation](https://next-auth.js.org)
- [Supabase Docs](https://supabase.com/docs)
- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)

---

## Next Steps

1. **Gather environment variables** → Follow section 2
2. **Setup Vercel project** → Follow section 3
3. **Prepare database** → Follow section 4
4. **Configure GitHub OAuth** → Follow section 5
5. **Deploy** → Follow section 7
6. **Test in production** → Follow section 8
7. **Monitor & maintain** → Follow section 9

---

## See Also

- [Database Setup & Management](./DATABASE.md) - Complete database guide
- [Admin Tools](./ADMIN_TOOLS.md) - Managing users and credits
- [Environment Variables](./ENVIRONMENT_VARIABLES.md) - Detailed env var reference
- [Architecture Overview](./ARCHITECTURE.md) - System design and patterns
