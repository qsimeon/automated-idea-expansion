# Vercel Deployment Guide

**Target**: Deploy to Vercel for production use
**Status**: Ready to deploy
**Timeline**: ~30 minutes for first-time setup

---

## Pre-Deployment Checklist

Before deploying, ensure:

- [ ] All environment variables prepared (see ENVIRONMENT_VARIABLES.md)
- [ ] GitHub OAuth app configured for production URL
- [ ] Build passes locally: `npm run build`
- [ ] All tests pass (if applicable)
- [ ] `.env.local` is NOT committed to git
- [ ] Database migrations run on production Supabase

---

## Step 1: Prepare Environment Variables

### 1.1 Gather All Required Values

Use the table below to collect all 11 required environment variables:

| Variable | Source | Security Level | Notes |
|----------|--------|-----------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard | Public | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard | Public | Anon key (safe in browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard | **Secret** | Must be secret - never in frontend |
| `GITHUB_CLIENT_ID` | GitHub Settings | Public | OAuth app ID |
| `GITHUB_CLIENT_SECRET` | GitHub Settings | **Secret** | Only shown once - save now |
| `NEXTAUTH_SECRET` | Generate (see below) | **Secret** | Generate fresh for production |
| `NEXTAUTH_URL` | Your domain | Public | e.g., `https://ideas.vercel.app` |
| `ENCRYPTION_KEY` | Generate (see below) | **Secret** | 64-char hex string |
| `OPENAI_API_KEY` | OpenAI Dashboard | **Secret** | For planning & review |
| `ANTHROPIC_API_KEY` | Anthropic Console | **Secret** | For code/blog generation |
| `GITHUB_TOKEN` | GitHub Settings (optional) | **Secret** | For publishing code repos |

### 1.2 Generate Secrets

Generate `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
# Copy the output
```

Generate `ENCRYPTION_KEY`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy the 64-character hex string
```

### 1.3 Get Supabase Keys

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Settings → API
4. Copy:
   - `NEXT_PUBLIC_SUPABASE_URL` (Project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Anon Key)
   - `SUPABASE_SERVICE_ROLE_KEY` (Service Role Key - **keep secret**)

### 1.4 Configure GitHub OAuth for Production

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "OAuth Apps" in the left sidebar
3. Find your app, click "Edit"
4. Update **Authorization callback URL**:
   - **Old (dev)**: `http://localhost:3000/api/auth/callback/github`
   - **New (prod)**: `https://your-domain.vercel.app/api/auth/callback/github`

   ⚠️ **Important**: Replace `your-domain` with your actual Vercel domain
5. Click "Update application"

### 1.5 Get GitHub OAuth Credentials

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Find your OAuth App
3. Copy:
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET` (only shown once!)

---

## Step 2: Create Vercel Project

### 2.1 Connect Repository

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Select GitHub repository: `automated-idea-expansion`
4. Click "Import"

### 2.2 Configure Build Settings

Vercel should auto-detect Next.js. Verify:
- **Framework**: Next.js
- **Build Command**: `next build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`

---

## Step 3: Add Environment Variables

### 3.1 Via Vercel Dashboard (Recommended)

1. **In Vercel Dashboard**, click on your project
2. Go to **Settings** → **Environment Variables**
3. For each variable, click **"Add"** and enter:
   - **Name**: Variable name (e.g., `NEXT_PUBLIC_SUPABASE_URL`)
   - **Value**: The value you collected in Step 1
   - **Environments**: Select **Production**

### 3.2 Variable Entry Order

Enter in this order (public first, then secrets):

**Public Variables** (safe in frontend):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ0eXAiOiJKV1QiLCJhbGc...
GITHUB_CLIENT_ID=abc123def456
NEXTAUTH_URL=https://your-domain.vercel.app
```

**Secret Variables** (encrypted by Vercel):
```
SUPABASE_SERVICE_ROLE_KEY=eyJ0eXAiOiJKV1QiLCJhbGc...
GITHUB_CLIENT_SECRET=your_client_secret_here
NEXTAUTH_SECRET=your_nextauth_secret_here
ENCRYPTION_KEY=your_64_char_hex_string
OPENAI_API_KEY=sk-proj-xxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxx
GITHUB_TOKEN=ghp_xxxxx (if publishing code)
```

### 3.3 Verify Variables Saved

After adding all variables:
1. Refresh the page
2. Verify count matches your expected variables
3. Don't show values in browser (Vercel hides them)

---

## Step 4: Deploy

### 4.1 Automatic Deployment

Once environment variables are set:

1. **Click "Deploy"** button
2. Wait for build to complete (~3-5 minutes)
3. Monitor build logs for errors
4. See success message: "Congratulations, your project has been successfully deployed"

### 4.2 Monitor Build Logs

During build, watch for:
- ✅ Dependencies installed
- ✅ TypeScript compilation passes
- ✅ Next.js build succeeds
- ❌ Stop if you see any errors

Common errors:
- **"Missing environment variable X"** → Add it to Vercel dashboard
- **"Cannot find module"** → Clear node_modules, rebuild
- **"OPENAI_API_KEY is not defined"** → Missing from Vercel dashboard

---

## Step 5: Post-Deployment Testing

### 5.1 Test Live URL

After deployment succeeds:

1. Click **"Visit"** or go to `https://your-domain.vercel.app`
2. You should see the homepage
3. Verify it loads without errors (check browser console)

### 5.2 Test Authentication

1. Click **"Manage Ideas"** button
2. Click **"Sign in with GitHub"**
3. GitHub OAuth flow should appear
4. Authorize the app
5. Should redirect back to ideas page
6. User email should display in header

**If auth fails**:
- Check GitHub OAuth callback URL matches
- Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are correct
- Check browser console for error messages

### 5.3 Test Idea Expansion

1. Create a test idea: "Build a simple calculator app"
2. Click **"Expand"**
3. Watch the expansion pipeline:
   - Should take 30-90 seconds
   - Check browser console for progress logs
   - Should see success message

**If expansion fails**:
- Check Vercel function logs
- Verify AI API keys are correct
- Check Supabase connection
- Review error message for clue

### 5.4 Check Database

Verify data saved to Supabase:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Table Editor**
4. Check tables:
   - `users` - Should have 1 row (your user)
   - `ideas` - Should have 1+ rows
   - `outputs` - Should have 1+ rows
   - `usage_tracking` - Should show your credit count

### 5.5 Test Credits System

1. Create 5 test ideas and expand them
2. After 5th expansion, should see **"No Credits"** banner
3. Click **"Buy Me a Coffee"** button
4. Should link to `buymeacoffee.com/quilee`
5. Verify URL is correct

---

## Step 6: Monitor & Maintain

### 6.1 View Logs

**Function Logs** (what your functions are doing):
1. Go to your Vercel project
2. Click **"Deployments"**
3. Click latest deployment
4. Click **"Logs"**
5. Watch real-time logs as users interact with app

**Browser Logs** (what's happening in browser):
1. Open app in browser
2. Press F12 (Developer Tools)
3. Go to **Console** tab
4. Look for errors/warnings

### 6.2 Monitor Performance

**Vercel Dashboard**:
- Click **"Analytics"** tab
- Track metrics:
  - Page load times
  - Function execution times
  - Error rates

**Recommended thresholds**:
- Page load: < 3 seconds (95th percentile)
- API response: < 5 seconds (for expansion)
- Error rate: < 0.1%

### 6.3 Check Costs

Monitor your spending:

**Vercel costs**:
- Free tier: $0 (up to limited bandwidth)
- Pro: $20/month (includes unlimited bandwidth)
- Analytics: Included

**Database costs** (Supabase):
- Free tier: 500MB storage, 2GB bandwidth
- Pro: $25/month (50GB storage, 250GB bandwidth)

**AI API costs** (typical):
- Per expansion: $0.01-0.06 depending on complexity
- Per month (100 users, 5 expansions each): $30-300

### 6.4 Set Up Alerts

**For Vercel errors**:
1. Go to project Settings
2. Monitoring section (if available)
3. Enable error alerts via email

**For API key usage**:
- OpenAI: https://platform.openai.com/account/billing/overview
- Anthropic: https://console.anthropic.com/account/usage

---

## Troubleshooting

### Issue: "Build failed"

**Causes**:
1. Missing environment variable
2. TypeScript compilation error
3. Dependency resolution issue

**Solution**:
1. Check build logs for specific error
2. Verify all env vars in Vercel dashboard
3. Try rebuilding: Click "Deploy" → "Redeploy"

### Issue: "Sign in fails"

**Causes**:
1. GitHub OAuth callback URL mismatch
2. Wrong CLIENT_ID or CLIENT_SECRET
3. NEXTAUTH_SECRET changed

**Solution**:
1. Verify GitHub OAuth callback URL:
   - Should be: `https://your-domain.vercel.app/api/auth/callback/github`
2. Generate new `NEXTAUTH_SECRET` and redeploy
3. Check auth logs in Vercel

### Issue: "Expansion fails with API error"

**Causes**:
1. Missing AI API key
2. Expired API key
3. API key limit exceeded

**Solution**:
1. Verify API keys in Vercel dashboard
2. Check API key limits:
   - OpenAI: https://platform.openai.com/account/api-keys
   - Anthropic: https://console.anthropic.com/account/api-keys
3. Check rate limits (may need to upgrade)

### Issue: "Database errors"

**Causes**:
1. Wrong Supabase credentials
2. Missing environment variable
3. Network connectivity issue

**Solution**:
1. Verify Supabase URL and keys
2. Test connection locally: `npm run dev`
3. Check Supabase status page

### Issue: "High latency / slow requests"

**Causes**:
1. Cold start (first request after deploy)
2. Large file generation
3. AI model latency

**Solution**:
1. Cold starts are normal (1-3s) - warms up with traffic
2. Complex ideas take longer (use modular/complex tiers)
3. Monitor in Vercel Analytics

---

## Domain Configuration (Optional)

If you want a custom domain instead of vercel.app:

### 6.1 Connect Domain

1. Go to Vercel project
2. Settings → **Domains**
3. Enter your custom domain (e.g., `ideas.yourcompany.com`)
4. Add DNS records as instructed

### 6.2 Update GitHub OAuth

If using custom domain:
1. Update GitHub OAuth callback URL:
   - `https://ideas.yourcompany.com/api/auth/callback/github`
2. Save in GitHub Developer Settings
3. Redeploy on Vercel

---

## Rollback & Revert

If something goes wrong:

### Rollback to Previous Deployment

1. Go to Vercel **Deployments** tab
2. Find previous successful deployment
3. Click the three dots menu
4. Select **"Promote to Production"**

### Revert Code Changes

```bash
git revert HEAD  # Undo last commit
git push origin main  # Push to GitHub
# Vercel will auto-deploy
```

---

## Production Checklist

Before considering "live":

- [ ] GitHub sign-in works
- [ ] Can create ideas
- [ ] Can expand ideas (at least 1 successful expansion)
- [ ] Credit system works (5 free, then paid)
- [ ] No errors in Vercel logs
- [ ] Database has test data
- [ ] All environment variables set and secured
- [ ] Custom domain configured (if desired)
- [ ] Monitoring alerts set up
- [ ] Daily backup strategy confirmed with Supabase

---

## Next Steps

### Immediate (Day 1):
1. ✅ Deploy to Vercel
2. ✅ Test core flows
3. ✅ Monitor logs for errors
4. ✅ Verify database writes

### Short-term (Week 1):
1. Share URL with beta users
2. Gather feedback
3. Fix bugs as they appear
4. Monitor costs

### Medium-term (Month 1):
1. Scale based on usage
2. Add email notifications
3. Improve onboarding
4. Set up analytics

---

## Support Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [NextAuth.js Deployment](https://next-auth.js.org/deployment)
- [Supabase Docs](https://supabase.com/docs)
- [GitHub OAuth Docs](https://docs.github.com/en/developers/apps/building-oauth-apps)

---

## Quick Reference Commands

```bash
# Test locally
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Check for lint errors
npm run lint

# View environment variables (local)
cat .env.local

# Reset local database (if needed)
# Delete all data from Supabase tables and start over
```

---

**You're ready to deploy!** 🚀

Questions? See:
- `docs/ENVIRONMENT_VARIABLES.md` - Env var setup
- `docs/SYSTEM_ARCHITECTURE_DIAGRAM.md` - How it works
- `docs/CLEANUP_SUMMARY.md` - What changed
