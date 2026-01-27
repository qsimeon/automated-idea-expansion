# Database Epoch System & Idea Summarization

This document explains two major features implemented in parallel:

1. **Database Epoch System** - Prevents stale JWT tokens after database resets
2. **Idea Summarization** - AI generates short 1-sentence card titles for ideas

---

## 1. Database Epoch System

### Problem We Solved

**The Root Issue:** JWT tokens are stored in browser cookies (client-side), but the database is server-side. When you reset the database, the browser doesn't know about it—it still has the old JWT token with a deleted user ID.

**Before:** This caused "foreign key constraint" errors when API calls tried to use a userId that no longer existed in the database.

**Why the Right Fix Matters:**
- ❌ **Wrong approach (what we had):** Check if user exists in database and try to recreate them. This is defensive and doesn't solve the root problem.
- ✅ **Right approach (what we have now):** Use a database epoch/version system to detect when the database was reset and automatically invalidate stale tokens.

### How It Works

```typescript
// When user signs in:
1. JWT callback gets database_version from config table (e.g., version = 1)
2. Stores both userId AND dbVersion in the JWT token
3. Token issued to browser cookie

// When user makes an API request later:
1. JWT callback checks: is token.dbVersion == current database_version?
2. If YES: Token is valid, request proceeds ✅
3. If NO: Database was reset, token is stale, force re-login ❌

// When you reset the database:
1. Run: scripts/reset-db-with-epoch.sql
2. This deletes all users (cascades delete ideas, outputs, etc.)
3. This increments database_version (e.g., 1 → 2)
4. All existing tokens become invalid
5. Next request: Users see "sign in again" instead of errors ✅
```

### Implementation Details

**Files Changed:**
- `src/lib/auth.ts` - JWT callback now checks database version
- `src/lib/db/queries.ts` - New `getDatabaseVersion()` function
- `scripts/migrate-add-config-and-summary.sql` - Adds config table
- `scripts/reset-db-with-epoch.sql` - Reset script that increments epoch

**Database Changes:**
```sql
-- New config table (stores database metadata)
CREATE TABLE config (
  key TEXT UNIQUE,      -- 'database_version'
  value TEXT,           -- Current version number (starts at 1)
  updated_at TIMESTAMPTZ
);

-- Initialize with version 1
INSERT INTO config (key, value) VALUES ('database_version', '1');
```

**JWT Token Structure:**
```typescript
interface JWT {
  userId?: string;      // Database user ID
  dbVersion?: number;   // Database epoch version (new!)
  email?: string;
  // ... other NextAuth fields
}
```

### How to Use

#### Initial Setup (One Time)

1. Go to Supabase console: https://app.supabase.com
2. SQL Editor → New Query
3. Copy `scripts/migrate-add-config-and-summary.sql`
4. Paste and click "Run"
5. Restart your app: `npm run dev`

#### Resetting the Database

**For a full reset with token invalidation:**

1. Go to Supabase console
2. SQL Editor → New Query
3. Copy `scripts/reset-db-with-epoch.sql`
4. Paste and click "Run"
5. All existing JWT tokens are now invalid
6. Users will need to sign in again on next access
7. Optionally seed admin: `npm run db:seed-admin`

**What gets deleted:**
- All users (cascades to ideas, outputs, credentials, executions, etc.)
- Everything except the schema structure and config table

**What stays the same:**
- Database version is incremented
- All table structures remain intact
- Storage bucket remains intact

### Key Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Stale tokens** | Cause cryptic DB errors | Automatically detected & rejected |
| **Reset process** | Confusing, user state unclear | Clear: epoch increments, tokens invalid |
| **User experience** | "Something went wrong" | "Please sign in again" |
| **Code complexity** | Defensive checks everywhere | Clean epoch logic in JWT callback |
| **Performance** | Extra DB lookups to verify user | One epoch check in JWT callback |

---

## 2. AI Idea Summarization

### What It Does

When a user saves an idea, an AI agent generates a short 1-sentence summary:

**Card Display:**
```
┌─────────────────────────────────┐
│ How to Train AI Models Cheaply  │  ← AI-generated summary (bold title)
├─────────────────────────────────┤
│ I've been thinking about how to │  ← Full idea (description)
│ train large language models on  │
│ limited budgets. Using quantized│
│ weights and distributed training│
│ could reduce costs significantly│
│ ...                             │
└─────────────────────────────────┘
```

### Why This Is Good Design

**Before:** Card title was just the first 100 chars of the full idea (often incomplete mid-sentence)

**After:**
- Short, punchy 1-sentence title that captures essence
- Human-readable, perfect for browsing
- Full idea preserved as description
- AI-generated, so it's automatic and consistent

**Fits Your Architecture:**
- Follows "schemas all the way down" - uses Zod validation
- Uses structured outputs with LLM (guaranteed JSON)
- Mirrors router-agent pattern
- Graceful fallback: continues without summary if LLM fails

### How It Works

```typescript
// When user saves idea:
POST /api/ideas {
  content: "long paragraph idea text...",
  title?: "optional user title",
  description?: "optional description",
  bullets?: ["optional bullet points"]
}

// Inside the route handler:
1. Validate request
2. Build CreateIdeaInput
3. Call ideaSummarizer(content) ← NEW
4. AI returns: { summary: "Short 1-sentence summary (max 150 chars)" }
5. Create idea with: title = summary, description = full content
6. Return created idea

// If summarizer fails:
- Log warning
- Continue without summary (it's optional)
- User can still use the app
```

### Implementation Details

**New Files:**
- `src/lib/agents/idea-summarizer.ts` - The summarizer agent

**Files Modified:**
- `src/app/api/ideas/route.ts` - Calls summarizer on idea creation
- `src/lib/db/queries.ts` - `createIdea()` accepts summary parameter
- `src/lib/db/schemas.ts` - Added summary to IdeaSchema
- `src/lib/db/types.ts` - Added summary to Idea interface
- `scripts/migrate-add-config-and-summary.sql` - Adds ideas.summary column

**Database Changes:**
```sql
-- Add summary column to ideas table
ALTER TABLE ideas ADD COLUMN summary TEXT;

-- Index for efficient queries
CREATE INDEX idx_ideas_summary ON ideas(summary);
```

### Summary Schema (Zod Validation)

```typescript
export const IdeaSummarySchema = z.object({
  summary: z.string()
    .min(5, "Summary must be at least 5 characters")
    .max(150, "Summary must be under 150 characters")
    .describe("1-sentence summary of the idea, suitable as a card title"),
});
```

**Why these constraints?**
- Min 5 chars: Ensures meaningful content
- Max 150 chars: Keeps it punchy and card-friendly
- Both validated by Zod AND LLM structured output

### LLM Used

**Primary:** Claude Haiku 4.5 (fast, cheap)
**Fallback:** GPT-4o-mini (if Haiku fails)

Both use `.withStructuredOutput()` for guaranteed valid JSON.

### Examples of Generated Summaries

Given idea: *"I want to build a tool that helps developers write better error messages. Most error messages are unhelpful and cryptic. I'm thinking of using AI to suggest improvements..."*

Generated summary: *"AI-powered error message optimizer for developers"* ✅

Given idea: *"Why is coffee better in the morning?"*

Generated summary: *"The science behind morning coffee preferences"* ✅

### Features & Design

| Aspect | Design |
|--------|--------|
| **Length** | Max 150 characters (short, punchy) |
| **Generation** | Automatic, on idea save |
| **Storage** | In database, never regenerated |
| **Fallback** | Graceful - continues without summary |
| **Cost** | Claude Haiku = ~0.1 cents per summary |
| **Speed** | ~1 second per summary |
| **Validation** | Zod schema + LLM structured output |

### How to Use

**For Users:** No change needed! Summaries are generated automatically when saving ideas.

**For Developers:**

```typescript
// To manually summarize an idea:
import { ideaSummarizer } from '@/lib/agents/idea-summarizer';

const idea = "Long idea text...";
const result = await ideaSummarizer(idea);
console.log(result.summary); // "Short 1-sentence summary"

// ideaSummarizer() throws on error, handle with try-catch
try {
  const result = await ideaSummarizer(idea);
} catch (error) {
  console.log('Summarization failed:', error.message);
}
```

---

## Setup Instructions

### Step 1: Run Migration

```bash
# In Supabase console:
# 1. SQL Editor → New Query
# 2. Copy entire content of scripts/migrate-add-config-and-summary.sql
# 3. Click "Run"
# 4. Verify: "✅ Migration complete!"
```

### Step 2: Restart App

```bash
npm run dev
```

### Step 3: Test Both Features

**Test Summarization:**
1. Create a new idea with a long paragraph
2. Check server logs for "🤖 Generating idea summary..."
3. Check response includes `summary` field
4. Verify summary is short (under 150 chars)

**Test Epoch System:**
1. Sign in normally
2. Note current JWT token has dbVersion
3. Run `scripts/reset-db-with-epoch.sql`
4. Try making an API request
5. Should get 401 or redirect to sign in
6. Sign in again - works fine ✅

---

## Troubleshooting

### Summarizer is slow (taking >5 seconds)

This is normal for first request (LLM cold start). Subsequent requests are faster.

If consistently slow:
- Check OpenAI/Anthropic API status
- Check network latency to API endpoints
- Consider using cached summaries for existing ideas

### Summarizer returns the full idea text

This means the LLM didn't respect the structured output schema. This shouldn't happen with `.withStructuredOutput()`, but if it does:
- Check LLM API response
- Verify Zod schema is correct
- Try fallback model (check which model failed)

### Migration fails with "config table already exists"

You've already run the migration. This is fine - the script uses `CREATE TABLE IF NOT EXISTS`.

### Database reset didn't invalidate tokens

Verify:
1. ✅ Ran `scripts/reset-db-with-epoch.sql`
2. ✅ Restarted app
3. ✅ Cleared browser cache/cookies (not just session)
4. ✅ Check Supabase console that `config.database_version` was incremented

---

## Architecture Fit

Both features follow your existing design patterns:

### Epoch System
- ✅ Uses existing Supabase infrastructure
- ✅ Minimal code changes (only JWT callback)
- ✅ No new dependencies
- ✅ Works with Row-Level Security
- ✅ Scales with number of users

### Summarization
- ✅ Follows router-agent pattern
- ✅ Uses Zod schemas (schemas all the way down)
- ✅ Structured LLM outputs (guaranteed JSON)
- ✅ Graceful error handling
- ✅ Integrates seamlessly with idea creation flow
- ✅ Optional feature (continues without summary)

---

## Future Enhancements

### Epoch System
- Add admin dashboard to view/increment database version manually
- Add metric: track how many sessions were invalidated by reset
- Support multiple deployment environments with different epochs

### Summarization
- Cache summaries to avoid regenerating
- Allow manual summary editing
- Add summary generation to existing ideas via batch job
- Different summary lengths for different use cases

---

## References

**Files:**
- `src/lib/agents/idea-summarizer.ts` - Summarizer agent implementation
- `src/lib/auth.ts` - JWT callback with epoch check
- `src/app/api/ideas/route.ts` - Idea creation with summarization
- `scripts/migrate-add-config-and-summary.sql` - Setup script
- `scripts/reset-db-with-epoch.sql` - Reset script

**Concepts:**
- Database versioning: Common in large systems to track schema changes
- Epoch systems: Used by protocols (NTP, Kerberos) for time-based token validation
- Structured outputs: LangChain/LLM feature for guaranteed valid JSON
