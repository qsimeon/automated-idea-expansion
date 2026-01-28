# Automated Idea Expansion

An AI-powered agent orchestration system that transforms raw ideas into polished content. Add your half-formed thoughts, click "Expand," and watch a multi-stage AI pipeline generate blog posts (with images + social share tweet) or complete code projects.

## 🎯 Current Status

**Production Ready!** ✅ Ready for Vercel Deployment

### ✅ What's Working:

#### **Phase 1: Foundation**
- ✅ Next.js 15 with TypeScript
- ✅ Supabase PostgreSQL database with Row-Level Security
- ✅ Complete database schema
- ✅ Environment configuration (.env.local)

#### **Phase 2: Ideas & Outputs Management**
- ✅ Simple one-field form to capture raw ideas
- ✅ Ideas CRUD API (`GET`, `POST`, `PUT`, `DELETE`)
- ✅ Ideas list page with pending/expanded organization
- ✅ Outputs viewer with format-specific displays
- ✅ Delete functionality for both ideas and outputs

#### **Phase 4: Multi-Agent Pipeline (LangGraph) - CURRENT ARCHITECTURE**
- ✅ **User Selection** - You choose which idea to expand (no automatic judging)
- ✅ **Router Agent** - Decides optimal output format: blog or code (GPT-4o-mini)
- ✅ **Creator Agents** - Generates content in **2 formats**:
  - 📝 **Blog Posts** - 4-stage cell-based pipeline with images + social share:
    - Planning (GPT-4o-mini) → sections, tone, image specs
    - Generation (Claude Sonnet 4.5) → cell-based content (MarkdownCell + ImageCell) + 1-3 images
    - Social Share (integrated) → auto-generated tweet (280 chars max, 2-3 hashtags)
    - Review (GPT-4o-mini) → quality scoring
    - **Architecture:** Atomic content blocks, no markdown string manipulation
  - 💻 **Code Projects** - 5-stage pipeline with iteration:
    - Planning (GPT-4o-mini) → quality rubrics, implementation steps
    - Generation (Claude Sonnet 4.5) → all files with structured outputs
    - Review (GPT-4o-mini) → actionable feedback
    - **Iteration Loop** → Targeted fixes (Fixer Agent) or full regeneration
    - Up to 3 cycles until score ≥75

**Note:** Images and social posts are **components** of blogs, not standalone formats.

### 🎉 Production-Ready Features:

#### **Per-User GitHub Publishing (Jan 2026) - SECURITY FIX**
- ✅ **Each user publishes to their own GitHub account** (not site owner's!)
- ✅ User's OAuth token encrypted with AES-256-GCM
- ✅ Automatic credential retrieval and decryption
- ✅ Graceful fallback to dry-run if user hasn't authenticated

#### **Database Reset for Production (Jan 2026)**
- ✅ **One-command database reset** to clean production state
- ✅ Preserves schema and RLS policies
- ✅ Documented with step-by-step guide
- ✅ Verified and tested for Vercel deployment

#### **Cell-Based Architecture & Model Optimization (Jan 2026)**
- ✅ **Cell-Based Blog Architecture** - Atomic content blocks:
  - MarkdownCell + ImageCell discriminated unions
  - No markdown string manipulation (schemas all the way down)
  - Type-safe at every layer with Zod validation
- ✅ **Images as Components** - Removed 'image' as standalone format:
  - Images generated as first-class cells within blog content
  - Context-aware generation (images understand blog content)
  - Up to 3 images per blog with captions and alt text
- ✅ **Optimized Model Selection**:
  - GPT-4o-mini for planning (fast, cost-effective, low cost)
  - Claude Sonnet 4.5 for blog generation (handles complex nested schemas)
  - GPT-4o-mini for review/routing/judging
  - Direct model instantiation (removed model-factory abstraction)
- ✅ **Social Share Integration** - Auto-generated tweets embedded in blog generation
- ✅ **GitHub Repo Links** - Added "View on GitHub" buttons to code output cards

#### **Structured Outputs Migration (Jan 2026)**
- ✅ Implemented Zod schemas across entire pipeline
- ✅ Planning agent now uses structured outputs (eliminated 70+ lines of parsing)
- ✅ Critic agent uses structured outputs (eliminated 127 lines of parsing)
- ✅ CLI/Demo generators use structured outputs
- ✅ Notebook generator V2 uses structured outputs
- ✅ Zero JSON parsing errors - guaranteed valid output
- ✅ ~340 lines of complex parsing code removed

#### **Quality Iteration Loops (Jan 2026)**
- ✅ Added fixer agent for targeted file regeneration
- ✅ Implemented quality gates (score ≥ 75)
- ✅ Up to 5 iteration cycles
- ✅ Smart decisions (regenerate all vs fix specific files)
- ✅ Score tracking and decline detection

---

## 🏗️ System Architecture

The automated idea expansion pipeline uses LangGraph to orchestrate a multi-stage AI workflow:

### High-Level Flow

```
User Submits Idea → User Selects Idea → Router Agent → Creator Agent → Saved Output
                     (Click "Expand")        ↓               ↓
                                         Chooses         Generates
                                         format          content
                                         (blog           (4-5 stages
                                         or              depending on
                                         code)           format)

Blog Pipeline:
  Planning → Generation (text + images) → Social Share → Review → Output

Code Pipeline:
  Planning → Generation → Review → Iteration (if needed) → GitHub Publish → Output
```

### Agent Pipeline Details

**1. Router Agent** (`router-agent.ts`)
- **Model:** GPT-4o-mini
- **Task:** Decide optimal output format based on value to audience
- **Options:**
  - `blog_post` - Written content (explanations, tutorials, tips) with images + social share
  - `github_repo` - Code demonstrations, experiments, interactive projects
- **Output:** Format + reasoning

**2. Creator Agent** (`creator-agent.ts`)
- **Task:** Route to format-specific creator and orchestrate generation

#### Blog Creator (4 stages)
```
Plan → Generate (Cells) → Social → Review
  ↓         ↓                ↓        ↓
GPT-4o- Claude          Integrated  GPT-4o
mini    Sonnet 4.5                  mini
```
- **Stage 1 (Plan):** Decide title, sections, tone, image specs (GPT-4o-mini)
- **Stage 2 (Generate):** Create cell-based content (MarkdownCell + ImageCell) + images (Claude Sonnet 4.5)
- **Stage 3 (Social):** Auto-generate tweet with hashtags (integrated in generation)
- **Stage 4 (Review):** Score on clarity, accuracy, engagement, structure (GPT-4o-mini)

#### Code Creator (5 stages with iteration)
```
Plan → Generate → Review → Iterate? → Publish
  ↓       ↓         ↓         ↓          ↓
GPT-4o Claude    GPT-4o  Score<75?    GitHub
mini   Sonnet    mini    Fix/Regen    (or dry-run)
```
- **Stage 1 (Plan):** Decide output type, language, architecture, quality rubric
- **Stage 2 (Generate):** Create all files, README, dependencies
- **Stage 3 (Review):** Score on correctness, security, quality, completeness
- **Stage 4 (Iterate):** If score < 75, either regenerate (score < 60) or fix specific files
- **Stage 5 (Publish):** Create GitHub repo (real or dry-run)

### Model Selection Strategy

| Task | Model | Why? |
|------|-------|------|
| Router | GPT-4o-mini | Fast, cheap ($0.15/1M input), good routing decisions |
| Blog Planning | GPT-4o-mini | Fast, cost-effective, low cost |
| Blog Generation | Claude Sonnet 4.5 | Superior writing quality, handles complex schemas |
| Code Planning | GPT-4o-mini | Fast, cost-effective, good at structure |
| Code Generation | Claude Sonnet 4.5 | Best at code (benchmarks leader, $3/1M input) |
| Review | GPT-4o-mini | Fast, consistent evaluation |

### Typical Costs Per Expansion

- **Blog Post:** ~$0.019 (planning + writing + 3 images + review)
- **Code Project:** $0.016-0.034 (depends on iterations, GitHub publishing)

---

## 📋 Understanding the Logs

The system uses emoji-prefixed structured logging for easy visual parsing and tracing:

### Log Emoji Guide

| Emoji | Meaning | Appears In |
|-------|---------|------------|
| 📥 | Request received | API endpoint |
| 🚀 | Pipeline starting | Graph orchestrator |
| 🎯 | Routing/deciding | Router agent |
| 📝 | Blog creation | Blog creator |
| 💻 | Code creation | Code creator |
| 📋 | Planning stage | All creators (stage 1) |
| 🛠️ | Generation stage | All creators (stage 2) |
| 🔍 | Review stage | All creators (stage 3) |
| 🔄 | Iteration/regeneration | Code creator (stage 4) |
| ✅ | Success/complete | All stages |
| ❌ | Error/failure | Error handling |
| ⚠️ | Warning | Fallbacks, issues |
| 💰 | Token usage | Token tracking |
| 🐛 | Issues found | Code review |
| 🔒 | Security concerns | Code review |

### Log Format

Each log entry includes:
- **Timestamp:** ISO 8601 format
- **Log Level:** DEBUG, INFO, WARN, ERROR
- **Execution ID:** Unique identifier for tracing (e.g., `exec-abc123`)
- **Stage:** Which agent or component is logging
- **Message:** Human-readable description
- **Metadata:** Structured data (counts, IDs, scores, etc.)

**Example:**
```
[2026-01-21T15:30:45.123Z] INFO  [exec-abc123] [judge-agent] 📊 Evaluating ideas
   candidateCount: 5
   specificIdeaId: auto-judge (will select best)
```

### Reading a Full Log Sequence

Example of a successful blog expansion:

```
[2026-01-22T15:30:45.123Z] INFO  [exec-abc123] [api-endpoint] 📥 Expand request received
   ideaId: abc-123
   title: "Understanding depth perception"

[2026-01-22T15:30:46.789Z] INFO  [exec-abc123] [router-agent] 🎯 Analyzing idea for format

[2026-01-22T15:30:48.123Z] INFO  [exec-abc123] [router-agent] ✅ Format selected
   format: blog_post

[2026-01-22T15:30:48.456Z] INFO  [exec-abc123] [blog-creator] === BLOG CREATOR V3 STARTED ===

[2026-01-21T15:30:50.456Z] INFO  [exec-abc123] [blog-creator] STAGE 1: Planning started

[2026-01-21T15:30:52.789Z] INFO  [exec-abc123] [blog-creator] STAGE 1: Planning complete
   sectionsCount: 5
   imagesCount: 2

[2026-01-21T15:30:53.123Z] INFO  [exec-abc123] [blog-creator] STAGE 2: Generation started

[2026-01-21T15:31:05.456Z] INFO  [exec-abc123] [blog-creator] STAGE 2: Generation complete
   wordCount: 1847
   imagesGenerated: 2

[2026-01-21T15:31:05.789Z] INFO  [exec-abc123] [blog-creator] STAGE 3: Review started

[2026-01-21T15:31:07.123Z] INFO  [exec-abc123] [blog-creator] STAGE 3: Review complete
   overallScore: 88
   recommendation: approve

[2026-01-21T15:31:07.456Z] INFO  [exec-abc123] [blog-creator] === BLOG CREATOR V2 COMPLETE ===
   durationMs: 17333
   totalTokensUsed: 15234

[2026-01-21T15:31:08.789Z] INFO  [exec-abc123] [api-endpoint] ✅ Expansion complete
   status: success
   durationSeconds: 23
```

### Troubleshooting with Logs

**Finding Errors:**
1. Look for `ERROR` log level or `❌` emoji
2. Find the execution ID (e.g., `[exec-abc123]`)
3. Search for that execution ID to see full context
4. Check which stage failed (judge/router/creator)
5. Look at the error details and stack trace

**Tracing an Execution:**
1. Get the execution ID from the first log line
2. Filter/search logs for that ID
3. Follow the progression:
   ```
   api-endpoint → router-agent → creator → api-endpoint
   ```

**Common Issues:**

| Error Pattern | Likely Cause | Solution |
|---------------|--------------|----------|
| `Cannot read properties of undefined (reading '_zod')` | Model instantiation issue | ✅ Fixed in this update |
| `Failed to generate content: 401` | API key invalid/missing | Check `.env.local` |
| `Quality score < 75 after 5 iterations` | Idea too complex/vague | Refine idea description |
| `No pending ideas available` | All ideas already expanded | Add new ideas |
| `GitHub credentials not found` | Missing GitHub token | Add to `.env.local` (optional) |


---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account (free tier)
- GitHub account (for OAuth)
- **OpenAI API key** (for planning & review)
- **Anthropic API key** (for code generation)
- (Optional) FAL.ai, HuggingFace API keys for image generation

### Setup

1. **Clone and install:**
   ```bash
   git clone <your-repo>
   cd automated-idea-expansion
   npm install
   ```

2. **Configure Supabase:**
   - Create project at https://supabase.com
   - Run `scripts/setup-db.sql` in SQL Editor
   - Copy connection details to `.env.local`

3. **Configure GitHub OAuth (CRITICAL - You MUST use YOUR OWN OAuth app):**

   **Why**: This allows users to publish to THEIR OWN GitHub accounts, not yours.

   **Steps:**
   a. Go to https://github.com/settings/developers
   b. Click "New OAuth App"
   c. Fill in:
      - Application name: "Automated Idea Expansion (Local Dev)"
      - Homepage URL: `http://localhost:3000`
      - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
   d. Click "Register application"
   e. Click "Generate a new client secret"
   f. Copy both Client ID and Client Secret to your `.env.local` (see step 4)

   **Important Notes:**
   - DO NOT use someone else's OAuth credentials
   - Each developer should create their own OAuth app
   - For production deployment, create a separate OAuth app with your production domain
   - The callback URL MUST match exactly (including http vs https and port)

4. **Create test user account:**
   - Users are created automatically on first GitHub OAuth sign-in
   - Click "Sign in with GitHub" at `http://localhost:3000` to create your account
   - No manual SQL insert needed!

5. **Configure environment variables in `.env.local`:**

   Copy `.env.example` to `.env.local` and fill in all values:
   ```bash
   cp .env.example .env.local
   ```

   **Required Variables** (app won't start without these):
   ```bash
   # Supabase Database (from step 2)
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

   # GitHub OAuth (from step 3 - YOUR OWN OAuth app)
   GITHUB_CLIENT_ID=Iv1.abc123def456
   GITHUB_CLIENT_SECRET=1234567890abcdef...

   # NextAuth Configuration
   NEXTAUTH_SECRET=$(openssl rand -base64 32)  # Run this command
   NEXTAUTH_URL=http://localhost:3000

   # Encryption for GitHub tokens
   ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

   # AI Models (REQUIRED)
   OPENAI_API_KEY=sk-proj-...              # https://platform.openai.com/api-keys
   ANTHROPIC_API_KEY=sk-ant-...            # https://console.anthropic.com/
   ```

   **Optional Variables** (for image generation):
   ```bash
   FAL_KEY=...                             # https://fal.ai/dashboard
   HUGGINGFACE_API_KEY=hf_...             # https://huggingface.co/settings/tokens
   REPLICATE_API_TOKEN=r8_...             # https://replicate.com/account
   ```

   See `docs/DATABASE.md` under "Initial Setup" for environment variable details.

6. **Run development server:**
   ```bash
   npm run dev
   ```

7. **Use the app:**
   - Visit http://localhost:3000/ideas
   - Add an idea: "Build a sentiment analysis CLI tool"
   - Click "Expand" on the idea you want to generate content for
   - Watch the terminal for detailed pipeline logs
   - View the generated output!

---

## 🏗️ Architecture

### Multi-Agent Pipeline

```
User Submits Idea
      ↓
User Selects Idea to Expand (Click "Expand" button)
      ↓
  Router Agent (GPT-4o-mini)
  - Analyzes idea characteristics
  - Chooses format: blog_post | github_repo
  - Explains decision
      ↓
  Creator Agent (Orchestrator)
      ↓
  ┌─────────────┼─────────────┐
  │             │             │
Blog Creator V3            Code Creator V2
  │                             │
  │                         Planning Agent
  │                         (GPT-4o-mini)
  │                             ↓
  │                         Generation Agent
  │                         (Claude Sonnet 4.5)
  │                             ↓
  │                         Critic Agent
  │                         (GPT-4o-mini)
  │                             ↓
  │                         Quality Gate
  │                         (score ≥ 75?)
  │                         ↙         ↘
  │                    PASS ✅      FAIL ❌
  │                         ↓           ↓
  │                     Publish    Fixer Agent
  │                                (Claude 4.5)
  │                                     ↓
  │                              Re-review ↻
  │                            (max 3 cycles)
  └─────────────┴─────────────────────────────┘
                      ↓
              Output Saved to DB
                      ↓
              User Views Output
```

### 5-Stage Code Creator V2 (Advanced)

The code creator uses a sophisticated multi-stage approach with quality iteration loops:

1. **Planning Agent** (GPT-4o-mini with Zod structured outputs)
   - Analyzes idea requirements
   - Decides: notebook, CLI app, web app, library, or demo script
   - Chooses language: Python, JavaScript, TypeScript, Rust
   - Selects framework: React, Next.js, Flask, FastAPI, etc.
   - **Creates quality rubrics** (correctness, security, quality, completeness)
   - **Defines implementation steps** for validation

2. **Generation Agent** (Claude Sonnet 4.5 with structured outputs)
   - Creates complete file structure
   - Generates working, executable code
   - Adds dependencies (requirements.txt, package.json)
   - Includes examples and documentation
   - Uses Zod schemas to guarantee valid output

3. **Critic Agent** (GPT-4o-mini with structured outputs)
   - Reviews against quality rubrics
   - Checks security vulnerabilities
   - Validates best practices
   - Scores 0-100 by category (correctness, security, quality, completeness)
   - Provides **actionable fix suggestions** with code examples
   - Recommends: approve/revise/regenerate

4. **Quality Gate** (score ≥ 75?)
   - **PASS** → Publish to GitHub ✅
   - **FAIL** → Fixer Agent

5. **Fixer Agent** (Claude Sonnet 4.5 - only if needed)
   - Regenerates **specific problematic files** (not entire project)
   - Uses critic's fix suggestions
   - Preserves working files
   - Returns to Critic for re-review
   - **Max 5 iterations** to prevent infinite loops

**Architecture Benefits:**
- ✅ **Structured outputs** eliminate JSON parsing errors (Zod schemas)
- ✅ **Quality enforcement** (minimum score 75/100)
- ✅ **Cost-optimized** (only fix 1-3 files per iteration, not all)
- ✅ **Rubric-based evaluation** (consistent quality criteria)
- ✅ **~340 lines of parsing code eliminated** across all agents

**Cost per code project:** ~$0.02-0.04 (with 0-2 iterations average)

---

### Structured Outputs Architecture

All agents use **Zod schemas with `.withStructuredOutput()`** to guarantee valid JSON:

```typescript
// Before: Manual JSON parsing (fragile)
const response = await model.invoke(prompt);
const text = response.content.toString();
let cleaned = text.replace(/```json/g, '').replace(/```/g, '');
const parsed = JSON.parse(cleaned); // ❌ Can fail!

// After: Structured outputs (guaranteed)
const schema = z.object({
  code: z.string().describe('Complete working code'),
  packages: z.array(z.string()).describe('Required packages'),
});
const structuredModel = model.withStructuredOutput(schema);
const result = await structuredModel.invoke(prompt); // ✅ Always valid!
```

**Benefits:**
- Zero JSON parsing errors
- Type-safe at runtime
- Self-documenting schemas
- ~70% less code per agent

---

## 📁 Project Structure

```
automated-idea-expansion/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── ideas/[id]/     # Ideas CRUD
│   │   │   ├── outputs/[id]/   # Outputs CRUD + Delete
│   │   │   └── expand/         # Trigger agent pipeline
│   │   ├── ideas/              # Ideas management UI
│   │   ├── outputs/            # Outputs list & viewer
│   │   │   └── [id]/           # Format-specific viewers
│   │   └── page.tsx            # Homepage
│   │
│   └── lib/
│       ├── agents/             # LangGraph AI agents
│       │   ├── graph.ts        # Pipeline orchestration
│       │   ├── router-agent.ts # Format selection
│       │   ├── creator-agent.ts # Creator orchestrator
│       │   ├── types.ts        # Shared state types
│       │   └── creators/       # Format-specific creators
│       │       ├── blog/       # Blog creation
│       │       │   ├── blog-creator.ts
│       │       │   └── blog-schemas.ts
│       │       ├── image-creator.ts
│       │       └── code/       # Code creation
│       │           ├── types.ts
│       │           ├── code-creator.ts
│       │           ├── planning-agent.ts
│       │           ├── generation-agent.ts
│       │           └── critic-agent.ts
│       │
│       └── db/
│           ├── supabase.ts     # DB client
│           ├── queries.ts      # Database queries
│           └── types.ts        # TypeScript types
│
├── scripts/
│   ├── setup-db.sql            # Database schema
│   └── db-helper.ts            # Database utilities
│
└── .env.local                  # API keys (not in git)
```

---

## 🗄️ Database Schema

**Tables:**
- `users` - User accounts
- `ideas` - Raw ideas (status: pending/expanded/archived)
- `outputs` - Generated content (format, content JSON)
- `executions` - Pipeline run logs (for monitoring)
- `blog_posts` - Published blog posts (future)

All tables have Row-Level Security (RLS) enabled.

---

## 💰 Cost Breakdown

### Per Idea Expansion

| Agent | Model | Avg Tokens | Cost |
|-------|-------|-----------|------|
| Router | GPT-4o-mini | ~500 | $0.00005 |
| Blog Planning | GPT-4o-mini | ~1,500 | $0.00023 |
| Blog Generation | Claude Sonnet 4.5 | ~5,000 | $0.015 |
| Images (3x) | FLUX Schnell | N/A | $0.003 |
| Review | GPT-4o-mini | ~1,000 | $0.0001 |
| **Total (Blog)** | | ~8,000 | **$0.019** |
| | | | |
| Router | GPT-4o-mini | ~500 | $0.00005 |
| Code Planning | GPT-4o-mini | ~1,200 | $0.00012 |
| Code Generation | Claude Sonnet 4.5 | ~5,000 | $0.015 |
| Code Critic | GPT-4o-mini | ~4,000 | $0.0004 |
| Code Fixer (if needed) | Claude Sonnet 4.5 | ~3,000 | $0.009 |
| **Total (Code - 0 iterations)** | | ~10,700 | **$0.016** |
| **Total (Code - 2 iterations)** | | ~16,700 | **$0.034** |

**Average: ~$0.02-0.04 per code project** (with quality iteration loops)

### Monthly Estimate
- 30 expansions/month (mixed) = **~$0.50/month**
- 100 expansions/month (mixed) = **~$1.50/month**

Extremely cost-effective thanks to:
- **GPT-4o-mini** ($0.15/1M input tokens) - Fast and cheap for planning & review
- **Claude Sonnet 4.5** ($3/1M input tokens) - Best-in-class code generation
- **Structured outputs** - Eliminates wasted tokens from parsing errors
- **Targeted fixes** - Only regenerate 1-3 files per iteration, not entire project

---

## 🛠️ Tech Stack

| Technology | Purpose | Status |
|------------|---------|--------|
| Next.js 15 | Full-stack React framework | ✅ |
| TypeScript | Type-safe development | ✅ |
| Supabase | PostgreSQL database with RLS | ✅ |
| **NextAuth** | **GitHub OAuth authentication** | ✅ |
| **LangGraph** | **Multi-agent orchestration** | ✅ |
| **Zod** | **Schema validation & structured outputs** | ✅ |
| **OpenAI GPT-4o-mini** | **Planning, routing, review** | ✅ |
| **Claude Sonnet 4.5** | **Code generation (best-in-class)** | ✅ |
| **fal.ai / HuggingFace** | **AI image generation** | ✅ |
| **Octokit** | **GitHub API for repo creation** | ✅ |
| E2B | Code sandboxing | ⏳ Future |
| Vercel | Hosting & cron jobs | ⏳ Ready |

---

## 📖 Example: Code Project Generation

```bash
# Terminal output when expanding "Build a sentiment analysis CLI tool"

🚀 === MULTI-STAGE CODE CREATOR V2 ===
   Idea: "Build a sentiment analysis CLI tool"

📋 STAGE 1: Planning
   Agent: Planning Agent
   ✅ Plan: cli-app using python
   📊 Complexity: medium
   💡 Reasoning: CLI tool best for utilities, Python for NLP libraries
   💰 Tokens: 743

🛠️  STAGE 2: Code Generation
   Agent: Generation Agent
   ✅ Generated 3 files
   📁 Files: main.py, README.md, requirements.txt
   💰 Tokens: 2,847

🔍 STAGE 3: Code Review
   Agent: Critic Agent
   📊 Quality Score: 88/100
   🐛 Issues: 2 warnings
   ⚠️  [main.py:23] Consider adding input validation
   ⚠️  [main.py:45] Error handling could be more specific
   ✅ Recommendation: approve
   💰 Tokens: 1,932

✅ === PIPELINE COMPLETE ===
   Total tokens: 5,522
   Estimated cost: $0.0012
```

**Generated files include:**
- Working Python CLI with argparse
- Comprehensive README with usage examples
- requirements.txt with necessary packages
- Error handling and input validation
- Example usage and test cases

---

## 🔐 Security

- ✅ Row-Level Security (RLS) on all database tables
- ✅ API keys stored in `.env.local` (never committed)
- ✅ Input validation on all endpoints
- ✅ Secure async params handling (Next.js 15)
- ✅ GitHub OAuth authentication

---

## 🎓 Learning Outcomes

This project teaches:

1. **Multi-Agent Orchestration**
   - LangGraph state management
   - Sequential and conditional agent flows
   - Agent-to-agent communication patterns

2. **Cost-Effective AI Architecture**
   - Using GPT-4o-mini for planning/review (fast and cost-effective)
   - Claude Haiku for text generation (superior writing quality)
   - Claude Sonnet for code generation (best coding capabilities)
   - Token usage monitoring and optimization

3. **Modern Full-Stack Development**
   - Next.js 15 App Router
   - Server Components and Server Actions
   - TypeScript with strict typing
   - Supabase for database + storage

4. **AI Agent Patterns**
   - Judge-Router-Creator pattern
   - Multi-stage pipelines with critics
   - Fallback and error handling strategies

---

## 🚀 Roadmap

### ✅ Production-Ready
- [x] Authentication (GitHub OAuth + NextAuth)
- [x] Multi-Agent Pipeline (Router → Creator)
- [x] Blog Generation (4 stages with images)
- [x] Code Generation (5 stages with quality gates)
- [x] GitHub Publishing (per-user OAuth tokens)
- [x] Credit System (5 free + paid)
- [x] Database Persistence (Supabase PostgreSQL)
- [x] Security (AES-256-GCM encryption, RLS policies)

### 📋 Post-Launch (Month 1-2)
- [ ] Email notifications for purchases
- [ ] Ability to edit/regenerate outputs
- [ ] Additional output formats (Twitter threads, LinkedIn posts)
- [ ] Referral system (free credits for referrals)
- [ ] Advanced analytics dashboard

### 🚀 Future (Month 3+)
- [ ] Team/organization accounts
- [ ] Stripe integration (credit bundles)
- [ ] API access for power users
- [ ] Mobile app (React Native)

---

## 🤝 Contributing

This is a learning project following a comprehensive implementation plan. Each phase builds on the previous one.

**Current Focus:** Implementing real publishers (GitHub, Mastodon) so generated content actually gets published!

---

## 📚 Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Anthropic API Reference](https://docs.anthropic.com/en/api/getting-started)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js 15 Documentation](https://nextjs.org/docs)

---

## 🎯 Getting Started Tutorial

1. **Add your first idea:**
   ```
   Navigate to /ideas
   Enter: "Explain how transformers work in machine learning"
   Click "Save Idea"
   ```

2. **Expand it:**
   ```
   Click the "Expand" button on your idea
   Watch terminal logs for agent pipeline
   Wait 10-30 seconds
   ```

3. **View the output:**
   ```
   Automatically redirects to /outputs/[id]
   See your generated blog post or code project!
   ```

4. **Experiment with different ideas:**
   - Technical: "Build a password strength checker"
   - Educational: "Explain async/await to a beginner"
   - Tool: "Create a JSON formatter CLI"
   - Tutorial: "How to deploy a Next.js app"

The Router Agent will automatically choose the best format (blog or code) for each idea!

---

## 📚 Documentation

Complete guides for setup, architecture, and deployment:

- **[Architecture](./docs/ARCHITECTURE.md)** - Complete system design & reference
  - System overview and design philosophy
  - Complete system architecture diagrams (all layers)
  - Key architectural decisions and rationale
  - Execution flows for blog and code creation
  - Component breakdown with file references
  - Model selection strategy
  - Database schema and security architecture

- **[Database Setup & Management](./docs/DATABASE.md)** - Complete database guide
  - Initial setup from scratch
  - Table schema and relationships
  - Row-Level Security (RLS)
  - Admin operations and credit management

- **[Deployment Guide](./docs/DEPLOYMENT.md)** - Deploy to Vercel
  - Environment variables
  - GitHub OAuth configuration
  - Production deployment checklist
  - Monitoring and troubleshooting

---

Built with 🤖 as a comprehensive AI agent orchestration learning project
