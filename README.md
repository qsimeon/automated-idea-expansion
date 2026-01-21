# Automated Idea Expansion

An AI-powered agent orchestration system that transforms raw ideas into polished content. Add your half-formed thoughts, click "Expand," and watch a multi-stage AI pipeline generate blog posts (with images), code projects, or social media threads.

## 🎯 Current Status

**Phase 2C Complete!** ✅ Unified Content Pipeline + Images as Components + Gemini Integration

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

#### **Phase 4: Multi-Agent Pipeline (LangGraph) - NEW ARCHITECTURE**
- ✅ **Judge Agent** - Evaluates and selects best idea (GPT-5 Nano)
- ✅ **Router Agent** - Decides optimal output format (GPT-5 Nano)
- ✅ **Creator Agents** - Generates content in **3 formats**:
  - 📝 **Blog Posts V2** - Multi-stage pipeline with optional images (1-3):
    - Planning (Gemini Flash) → sections, tone, image specs
    - Generation (Claude Haiku) → markdown + images with captions
    - Review (Gemini Flash) → quality scoring
  - 🦣 **Mastodon Threads** - 500-char social posts with optional hero image
  - 💻 **Code Projects V2** - 5-stage pipeline with iteration:
    - Planning (GPT-5 Nano) → quality rubrics, implementation steps
    - Generation (Claude Sonnet 4.5) → all files with structured outputs
    - Review (GPT-5 Nano) → actionable feedback
    - **Iteration Loop** → Targeted fixes (Fixer Agent) or full regeneration
    - Up to 5 cycles until score ≥75

**Note:** Images are now **components** within blogs/threads, not standalone formats.

### 🎉 Recent Accomplishments:

#### **Unified Content Pipeline (Jan 2026) - LATEST**
- ✅ **Images as Components** - Removed 'image' as standalone format
  - Images now generated as subcomponents within blogs/threads
  - Context-aware generation (images understand content)
  - Up to 3 images per blog with captions and alt text
- ✅ **Blog Creator V2** - Multi-stage pipeline:
  - Planning → Generation (Text + Images) → Review
  - Uses Gemini Flash for planning/review (50% cost savings)
  - Uses Claude Haiku for text generation (superior writing quality)
- ✅ **Google Gemini Integration**:
  - Created model-factory.ts for centralized model selection
  - Gemini Flash for planning/review ($0.075/1M vs $0.15/1M = 50% savings)
  - Automatic fallback to GPT-4o-mini if GOOGLE_API_KEY not set
- ✅ **Enhanced Schemas** - BlogPlan, BlogDraft, BlogReview, ImageSpec, GeneratedImage
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

### 🚧 What's Coming Next:

#### **Phase 2C-D: Additional Publishers**
- ✅ **GitHub Publisher** - Create actual repos with Octokit (COMPLETE!)
- ⏳ **Mastodon Publisher** - Post real threads with masto.js
- ⏳ **Blog Publisher** - Save to database with slug generation
- ⏳ **Image Publisher** - Upload to Supabase Storage

#### **Phase 2E-F: Interactive Code**
- ⏳ E2B code sandboxing (run code in browser)
- ⏳ Jupyter notebook support
- ⏳ Vercel deployment integration

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account (free tier)
- **OpenAI API key** (for GPT-5 Nano)
- **Anthropic API key** (for Claude Sonnet 4.5)
- **GitHub Personal Access Token** (for repo creation)
- (Optional) Mastodon, fal.ai API keys for other formats

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

3. **Create test user:**
   ```sql
   INSERT INTO users (id, clerk_user_id, email, name, timezone)
   VALUES (
     '00000000-0000-0000-0000-000000000001'::uuid,
     'test-user-123',
     'test@example.com',
     'Test User',
     'UTC'
   );
   ```

4. **Add API keys to `.env.local`:**
   ```bash
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # AI Models (Required)
   OPENAI_API_KEY=sk-proj-...           # For GPT-5 Nano (planning, routing, review)
   ANTHROPIC_API_KEY=sk-ant-...         # For Claude Sonnet 4.5 (code generation)

   # Publishing (Required for code projects)
   GITHUB_TOKEN=github_pat_...          # Personal Access Token with repo scope
   GITHUB_USERNAME=your_username

   # Publishing (Optional - for other formats)
   MASTODON_ACCESS_TOKEN=...
   MASTODON_INSTANCE_URL=https://mastodon.social

   # Image Generation (Optional)
   FAL_KEY=...
   HUGGINGFACE_API_KEY=hf_...
   REPLICATE_API_TOKEN=r8_...
   ```

5. **Run development server:**
   ```bash
   npm run dev
   ```

6. **Use the app:**
   - Visit http://localhost:3000/ideas
   - Add an idea: "Build a sentiment analysis CLI tool"
   - Click "✨ Expand Best Idea Now"
   - Watch the terminal for detailed pipeline logs
   - View the generated output!

---

## 🏗️ Architecture

### Multi-Agent Pipeline

```
User Adds Idea
      ↓
  Judge Agent (GPT-5 Nano)
  - Scores all pending ideas
  - Selects best one
  - Provides reasoning
      ↓
  Router Agent (GPT-5 Nano)
  - Analyzes idea characteristics
  - Chooses format: blog_post | twitter_thread | github_repo | image
  - Explains decision
      ↓
  Creator Agent (Orchestrator)
      ↓
  ┌─────────────┼─────────────┐
  │             │             │
Blog Creator  Thread Creator  [Code Creator V2]  Image Creator
  │             │             │                    │
  │             │         Planning Agent          │
  │             │         (GPT-5 Nano)            │
  │             │             ↓                    │
  │             │         Generation Agent        │
  │             │         (Claude Sonnet 4.5)     │
  │             │             ↓                    │
  │             │         Critic Agent            │
  │             │         (GPT-5 Nano)            │
  │             │             ↓                    │
  │             │         Quality Gate            │
  │             │         (score ≥ 75?)           │
  │             │         ↙         ↘             │
  │             │    PASS ✅      FAIL ❌         │
  │             │         ↓           ↓           │
  │             │     Publish    Fixer Agent      │
  │             │                (Claude 4.5)     │
  │             │                     ↓           │
  │             │              Re-review ↻        │
  │             │            (max 5 cycles)       │
  └─────────────┴─────────────┴────────────────────┘
                      ↓
              Output Saved to DB
                      ↓
              User Views Output
```

### 5-Stage Code Creator V2 (Advanced)

The code creator uses a sophisticated multi-stage approach with quality iteration loops:

1. **Planning Agent** (GPT-5 Nano with Zod structured outputs)
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

3. **Critic Agent** (GPT-5 Nano with structured outputs)
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
│       │   ├── judge-agent.ts  # Idea evaluation
│       │   ├── router-agent.ts # Format selection
│       │   ├── creator-agent.ts # Creator orchestrator
│       │   ├── types.ts        # Shared state types
│       │   └── creators/       # Format-specific creators
│       │       ├── blog-creator.ts
│       │       ├── mastodon-creator.ts
│       │       ├── image-creator.ts
│       │       └── code/       # Multi-stage code creator
│       │           ├── types.ts
│       │           ├── planning-agent.ts
│       │           ├── generation-agent.ts
│       │           ├── critic-agent.ts
│       │           └── code-creator-v2.ts
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
| Judge | GPT-5 Nano | ~1,000 | $0.0001 |
| Router | GPT-5 Nano | ~500 | $0.00005 |
| Blog Creator | GPT-5 Nano | ~3,000 | $0.0003 |
| **Total (Blog)** | | ~4,500 | **$0.0005** |
| | | | |
| Code Planning | GPT-5 Nano | ~1,200 | $0.00012 |
| Code Generation | Claude Sonnet 4.5 | ~5,000 | $0.015 |
| Code Critic | GPT-5 Nano | ~4,000 | $0.0004 |
| Code Fixer (if needed) | Claude Sonnet 4.5 | ~3,000 | $0.009 |
| **Total (Code - 0 iterations)** | | ~10,200 | **$0.016** |
| **Total (Code - 2 iterations)** | | ~16,200 | **$0.034** |

**Average: ~$0.02-0.04 per code project** (with quality iteration loops)

### Monthly Estimate
- 30 expansions/month (mixed) = **~$0.50/month**
- 100 expansions/month (mixed) = **~$1.50/month**

Extremely cost-effective thanks to:
- **GPT-5 Nano** ($0.10/1M input tokens) - Ultra-cheap for planning & review
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
| **LangGraph** | **Multi-agent orchestration** | ✅ |
| **Zod** | **Schema validation & structured outputs** | ✅ |
| **OpenAI GPT-5 Nano** | **Planning, routing, review (ultra-cheap!)** | ✅ |
| **Claude Sonnet 4.5** | **Code generation (best-in-class)** | ✅ |
| **fal.ai / HuggingFace** | **AI image generation** | ✅ |
| **Octokit** | **GitHub API for repo creation** | ✅ |
| masto.js | Mastodon API for thread posting | ⏳ Next |
| E2B | Code sandboxing | ⏳ Future |
| Vercel | Hosting & cron jobs | ⏳ Future |

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
- ⏳ Clerk authentication (disabled for development)

---

## 🎓 Learning Outcomes

This project teaches:

1. **Multi-Agent Orchestration**
   - LangGraph state management
   - Sequential and conditional agent flows
   - Agent-to-agent communication patterns

2. **Cost-Effective AI Architecture**
   - Using cheaper models (GPT-4o-mini) for most tasks
   - Ultra-cheap models (Gemini Flash) for validation
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

## 🚧 Roadmap

### ✅ Completed
- [x] Phase 1: Foundation (Next.js, Supabase, TypeScript)
- [x] Phase 2: Ideas & Outputs Management
- [x] Phase 4: Multi-Agent Pipeline (Judge, Router, Creator)
- [x] Phase 2A: Multi-Stage Code Creator (Planning, Generation, Critic)

### 🔄 In Progress
- [ ] Phase 2C: GitHub Publisher (Octokit)
- [ ] Phase 2D: Mastodon Publisher (masto.js)

### 📋 Planned
- [ ] Phase 2E: Interactive Code (E2B sandboxing)
- [ ] Phase 2F: Notebook Support (Binder integration)
- [ ] Phase 7: Daily Automation (Vercel cron)
- [ ] Phase 8: Dashboard & Analytics
- [ ] Phase 9: Production Polish

---

## 🤝 Contributing

This is a learning project following a comprehensive implementation plan. Each phase builds on the previous one.

**Current Focus:** Implementing real publishers (GitHub, Mastodon) so generated content actually gets published!

---

## 📚 Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)
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
   Click "✨ Expand Best Idea Now"
   Watch terminal logs for agent pipeline
   Wait 10-20 seconds
   ```

3. **View the output:**
   ```
   Automatically redirects to /outputs/[id]
   See your generated blog post, code, thread, or image!
   ```

4. **Experiment with different ideas:**
   - Technical: "Build a password strength checker"
   - Educational: "Explain async/await to a beginner"
   - Creative: "A cyberpunk city at sunset"
   - Tool: "Create a JSON formatter CLI"

The agent pipeline will automatically choose the best format for each idea!

---

Built with 🤖 as a comprehensive AI agent orchestration learning project
