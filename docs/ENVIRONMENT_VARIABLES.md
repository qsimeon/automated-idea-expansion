# Environment Variables Guide

This document explains all environment variables required for the Automated Idea Expansion application.

## Quick Start

Copy `.env.example` to `.env.local` and fill in the required values:

```bash
cp .env.example .env.local
```

---

## Required Variables for All Environments

### Database (Supabase)

**`NEXT_PUBLIC_SUPABASE_URL`** _(Required)_
- **Description**: Your Supabase project URL
- **Format**: `https://your-project.supabase.co`
- **Where to get**: Supabase Dashboard → Settings → API
- **Used in**: All database operations

**`NEXT_PUBLIC_SUPABASE_ANON_KEY`** _(Required)_
- **Description**: Public Supabase API key (safe to expose in browser)
- **Where to get**: Supabase Dashboard → Settings → API → Service Role Key
- **Used in**: Client-side Supabase operations

**`SUPABASE_SERVICE_ROLE_KEY`** _(Required)_
- **Description**: Server-only Supabase key with admin privileges (KEEP SECRET)
- **Where to get**: Supabase Dashboard → Settings → API → Service Role Key
- **Used in**: Server-side operations, RLS bypass, user creation
- **⚠️ CRITICAL**: Never expose this in frontend code or git

### Authentication (NextAuth + GitHub OAuth)

**`GITHUB_CLIENT_ID`** _(Required)_
- **Description**: GitHub OAuth application client ID
- **How to create**:
  1. Go to https://github.com/settings/developers
  2. Click "New OAuth App"
  3. Fill in "Authorization callback URL": `http://localhost:3000/api/auth/callback/github` (dev) or `https://your-domain.com/api/auth/callback/github` (production)
  4. Copy Client ID
- **Used in**: Authentication flow

**`GITHUB_CLIENT_SECRET`** _(Required)_
- **Description**: GitHub OAuth application secret
- **How to create**: Same as above, but copy the "Client Secret" (only shown once!)
- **⚠️ CRITICAL**: Never commit to git

**`NEXTAUTH_SECRET`** _(Required)_
- **Description**: Secret used to sign JWTs and encrypt tokens
- **How to generate**:
  ```bash
  openssl rand -base64 32
  ```
  or
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- **Used in**: JWT signing, session encryption
- **⚠️ CRITICAL**: Never commit to git, regenerate for each environment

**`NEXTAUTH_URL`** _(Required in production)_
- **Description**: Full URL of your application
- **Local dev**: `http://localhost:3000`
- **Production**: `https://your-domain.com`
- **Note**: NextAuth automatically detects this in development, but must be explicit in production

### Encryption

**`ENCRYPTION_KEY`** _(Required)_
- **Description**: 32-byte hex string for AES-256-GCM encryption of stored credentials
- **How to generate**:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Length**: Exactly 64 hex characters (32 bytes)
- **Used in**: Encrypting GitHub tokens before storage
- **⚠️ CRITICAL**: Never commit to git, must be consistent across deploys

### AI Models

**`OPENAI_API_KEY`** _(Required)_
- **Description**: OpenAI API key for GPT-4o-mini and image generation
- **Where to get**: https://platform.openai.com/api-keys
- **Used in**:
  - Planning Agent (GPT-4o-mini for structured output)
  - Code Critic (GPT-4o-mini for quality review)
  - Blog Image Prompts
  - Blog Cells (fallback generation)
- **⚠️ CRITICAL**: Never expose to frontend
- **Cost**: ~$0.001-0.01 per expansion

**`ANTHROPIC_API_KEY`** _(Required)_
- **Description**: Anthropic API key for Claude Sonnet 4.5
- **Where to get**: https://console.anthropic.com/keys
- **Used in**:
  - Code Generation (primary model for quality)
  - Blog Content Generation
  - README generation (schema-driven with structured output)
  - Notebook generator (Python notebooks and modules)
- **⚠️ CRITICAL**: Never expose to frontend
- **Cost**: ~$0.003-0.02 per expansion
- **Note**: Claude consistently outperforms GPT on code quality per LMSYS benchmarks

---

## Optional Variables

### GitHub Publishing (Automatic - No Additional Setup!)

**GitHub Publishing is AUTOMATIC and PER-USER:**

✅ **Each user publishes to their OWN GitHub account** (not the site owner's!)

How it works:
1. User signs in with GitHub OAuth (`GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` above)
2. OAuth automatically captures user's access token with `public_repo` scope
3. Token is encrypted and stored in database (credentials table)
4. When user generates code, repos are created in the USER'S GitHub account
5. No additional environment variables needed!

**Why this is better:**
- ✅ Each user owns their generated repositories
- ✅ Site owner doesn't see user's private GitHub activity
- ✅ No additional API tokens to manage
- ✅ Secure: tokens are encrypted at rest
- ✅ Automatic: no user action required beyond OAuth sign-in

**DEPRECATED (No longer needed):**
- ❌ `GITHUB_TOKEN` - Not used (we use per-user OAuth tokens)
- ❌ `GITHUB_USERNAME` - Not used (each user is their own "owner")

### Image Generation (For Blog Posts)

Select ONE image generation provider (in priority order):

**`FAL_KEY`** _(Optional - primary image generation)_
- **Description**: FAL.ai API key
- **Where to get**: https://fal.ai/dashboard/api-keys
- **Pros**: Fast (2-5s), high quality, generous free tier (100 images/month)
- **Used in**: Blog post illustration generation

**`HUGGINGFACE_API_KEY`** _(Optional - fallback)_
- **Description**: Hugging Face API token
- **Where to get**: https://huggingface.co/settings/tokens
- **Pros**: Free tier available
- **Cons**: Slower, lower quality than FAL
- **Used in**: Blog post illustration generation (fallback)

**`REPLICATE_API_TOKEN`** _(Optional - fallback)_
- **Description**: Replicate API token
- **Where to get**: https://replicate.com/account/api-tokens
- **Pros**: Fast, good quality
- **Cons**: Paid service (default $0.001/prediction)
- **Used in**: Blog post illustration generation (fallback)

**Note**: App works fine without any image key (blog posts skip illustrations)

### Future Features (Not Yet Implemented)

**`CRON_SECRET`**
- Reserved for scheduled tasks
- How to generate: `openssl rand -hex 32`

**`NEXT_PUBLIC_URL`**
- Public URL of application (used in email templates, OG tags)

---

## Environment-Specific Configuration

### Development (`localhost`)

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

GITHUB_CLIENT_ID=your_dev_app_client_id
GITHUB_CLIENT_SECRET=your_dev_app_secret
NEXTAUTH_SECRET=your_dev_secret
NEXTAUTH_URL=http://localhost:3000

ENCRYPTION_KEY=your_64_char_hex_string

OPENAI_API_KEY=sk-proj-xxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxx

GITHUB_TOKEN=ghp_xxxxx (optional)
FAL_KEY=fal-xxxxx (optional)
```

### Production (Vercel)

Use **Vercel Dashboard** → **Settings** → **Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key (select: Secret)

GITHUB_CLIENT_ID=your_prod_app_client_id
GITHUB_CLIENT_SECRET=your_prod_app_secret (select: Secret)
NEXTAUTH_SECRET=your_prod_secret (select: Secret, or auto-generate)
NEXTAUTH_URL=https://your-domain.vercel.app

ENCRYPTION_KEY=your_64_char_hex_string (select: Secret)

OPENAI_API_KEY=sk-proj-xxxxx (select: Secret)
ANTHROPIC_API_KEY=sk-ant-xxxxx (select: Secret)

GITHUB_TOKEN=ghp_xxxxx (select: Secret, optional)
FAL_KEY=fal-xxxxx (optional)
```

---

## Production Deployment Checklist

Before deploying to Vercel:

- [ ] Create/update GitHub OAuth app with production callback URL
- [ ] Generate new `NEXTAUTH_SECRET` for production
- [ ] Verify `ENCRYPTION_KEY` is same as development (or rotate carefully)
- [ ] Add all environment variables to Vercel dashboard
- [ ] Test sign-in with GitHub OAuth on production URL
- [ ] Test idea expansion (verify API keys work)
- [ ] Monitor for errors: Vercel Dashboard → Logs

---

## Troubleshooting

### "Invalid x-api-key" (401 errors)

**Problem**: Requests fail with `401 invalid x-api-key`

**Solutions**:
1. **Wrong API Key**: Double-check you copied the entire key (no spaces)
2. **Environment Variable Not Loaded**: Restart dev server after editing `.env.local`
3. **Variable Name Typo**: Ensure exact spelling (case-sensitive on Linux)
4. **Expired Token**: If using GitHub token, check it hasn't expired

### "Missing ENCRYPTION_KEY"

**Problem**: `Error: ENCRYPTION_KEY must be a 64-character hex string`

**Solution**:
```bash
# Generate and add to .env.local:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### "NEXTAUTH_SECRET is undefined"

**Problem**: NextAuth throws error about missing secret

**Solutions**:
1. Generate secret: `openssl rand -base64 32`
2. Add to `.env.local`
3. Restart dev server: `npm run dev`

### "Clerk authentication failed" (Legacy)

**This is no longer applicable** - Clerk has been removed. Authentication now uses NextAuth + GitHub OAuth only.

---

## Security Best Practices

1. **Never commit secrets**: Add `.env.local` and `.env*.local` to `.gitignore` ✅ (already done)
2. **Use environment variables for all secrets**: Never hardcode API keys
3. **Regenerate secrets**: Generate new `NEXTAUTH_SECRET` per environment
4. **Monitor access**: Check Vercel logs for unauthorized API key attempts
5. **Rotate regularly**: Periodically regenerate GitHub tokens and API keys
6. **Principle of least privilege**: Use scoped tokens (e.g., `public_repo` only for GitHub)

---

## Model Pricing (Estimated Costs)

Per idea expansion:

| Component | Model | Cost |
|-----------|-------|------|
| Planning | GPT-4o-mini | $0.0005 |
| Code Generation | Claude Sonnet 4.5 | $0.003-0.01 |
| Critic Review | GPT-4o-mini | $0.0005 |
| Blog Generation | Claude Sonnet 4.5 | $0.005-0.015 |
| Images | FAL.ai or free tier | $0.00 (free) or $0.02-0.05 (paid) |
| **Total/expansion** | | **$0.01-0.04** |

---

## What if I'm missing an API key?

- **No OpenAI key**: Planning and criticism still work with Anthropic
- **No Anthropic key**: Planning and blog generation work with OpenAI (lower quality code)
- **No GitHub token**: Code repos not auto-published, but generated locally
- **No image key**: Blog posts generated without illustrations
- **No ENCRYPTION_KEY**: App won't start (fatal error)
- **No NEXTAUTH_SECRET**: App won't start (fatal error)

---

## Additional Resources

- [Supabase Setup Guide](https://supabase.com/docs)
- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [NextAuth.js Documentation](https://next-auth.js.org)
- [OpenAI API Keys](https://platform.openai.com/api-keys)
- [Anthropic API Keys](https://console.anthropic.com/keys)
