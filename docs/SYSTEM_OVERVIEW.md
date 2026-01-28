# System Overview

> **Last Updated:** January 27, 2026
> **Architecture:** LangGraph Multi-Agent Pipeline
> **Status:** Production Ready ✅

## Quick Navigation

This document provides the **complete system architecture** and component reference. See also:
- **[README.md](../README.md)** - Getting started and feature overview
- **[DATABASE.md](./DATABASE.md)** - Database setup and schema
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System design patterns

---

## High-Level Architecture

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                      FRONTEND LAYER                               ┃
┃            (Next.js 16 / React 19 / Server Components)            ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  [/ideas] [/outputs] [/auth/signin]  →  Idea submission & results ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                                  │
                                  ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                       API LAYER                                   ┃
┃  (/api/expand, /api/ideas/*, /api/outputs/*, /api/auth/*)        ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃  • Auth check (NextAuth JWT + DB validation)                     ┃
┃  • Credit validation (free + paid)                               ┃
┃  • CRUD operations (ideas, outputs)                              ┃
┃  • Orchestrator invocation                                       ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
                                  │
                                  ↓
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                  LANGGRAPH ORCHESTRATOR                           ┃
┃   (src/lib/agents/graph.ts - StateGraph Executor)                ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃                                                                   ┃
┃  Router Agent → Creator Agent → Format-Specific Creators         ┃
┃  (GPT-4o-mini)  (Orchestrator)  (Blog or Code)                   ┃
┃                                                                   ┃
┃  Each agent receives AgentState with execution context           ┃
┃  and outputs updated state for next agent                        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
     │              │                    │                    │
     ↓              ↓                    ↓                    ↓
 OpenAI       Anthropic          FAL.ai / HF           GitHub API
 (GPT-4o      (Claude            (Image Gen)           (Publish
  models)     models)
```

---

## Component Breakdown

### Frontend (src/app/)
- **page.tsx** - Home page with navigation
- **ideas/page.tsx** - Idea management and submission
- **outputs/page.tsx** - List all generated outputs
- **outputs/[id]/page.tsx** - Format-specific result viewer
- **auth/signin/page.tsx** - GitHub OAuth authentication
- **api/** - Route handlers for all endpoints

### API Layer (src/app/api/)
- **expand/route.ts** - Main orchestrator trigger (validates → invokes graph)
- **ideas/route.ts** - Create/list ideas
- **ideas/[id]/route.ts** - Get/update/delete single idea
- **outputs/route.ts** - List generated outputs
- **outputs/[id]/route.ts** - Get/delete single output
- **usage/route.ts** - Check remaining credits
- **auth/[...nextauth]/route.ts** - NextAuth OAuth handler

### Agent System (src/lib/agents/)

**Core Orchestration:**
- **graph.ts** - Defines StateGraph with Router → Creator nodes
- **types.ts** - AgentState schema (shared state between agents)

**Decision-Making:**
- **router-agent.ts** - Analyzes idea → selects `blog_post` or `github_repo`

**Content Generation:**
- **creator-agent.ts** - Routes to appropriate creator based on format

**Blog Pipeline (src/lib/agents/creators/blog/):**
- **blog-creator.ts** - 3-stage orchestrator
  - Stage 1: Plan (sections, tone, image specs)
  - Stage 2: Generate (markdown + images)
  - Stage 3: Review (quality score)
- **blog-schemas.ts** - Zod schemas for blog output structure
- Uses **image-creator.ts** for AI image generation

**Code Pipeline (src/lib/agents/creators/code/):**
- **code-creator.ts** - Orchestrator with quality gates
- **planning-agent.ts** - Decides output type (notebook/CLI/web/lib/demo)
- **generation-agent.ts** - Generates all files
- **critic-agent.ts** - Reviews against quality rubrics
- **fixer-agent.ts** - Auto-fixes issues if score < 75
- **notebook-generator.ts** - Converts code → Jupyter notebook
- **types.ts** - State schemas for code pipeline

**Supporting:**
- **idea-summarizer.ts** - AI-generated 1-sentence summaries for ideas
- **image-creator.ts** - Multi-API image generation (FAL.ai → HF → Replicate)
- **publishers/github-publisher.ts** - Creates GitHub repos with user's OAuth token

### Database (src/lib/db/)
- **supabase.ts** - Client initialization with service role
- **queries.ts** - CRUD operations (users, ideas, outputs, executions)
- **schemas.ts** - Zod validation schemas
- **types.ts** - TypeScript interfaces for all data

### Authentication (src/lib/auth.ts)
- NextAuth configuration with GitHub OAuth provider
- JWT token management with database epoch system
- User creation on first sign-in with automatic credit allocation

### Supporting Systems
- **src/lib/logging/logger.ts** - Structured logging with execution tracing
- **src/lib/usage/check-usage.ts** - Credit validation and consumption
- **src/lib/crypto/encryption.ts** - AES-256-GCM encryption for API keys
- **src/lib/utils.ts** - Tailwind CSS class utilities

---

## Database Schema

**Core Tables (src/lib/db/queries.ts):**
- `users` - User accounts with timezone
- `ideas` - Raw ideas with status, summary, priority score
- `outputs` - Generated content (blog posts, code, etc.)
- `executions` - Pipeline run logs with status and timing
- `credentials` - Encrypted API keys (OpenAI, GitHub, etc.)
- `usage_tracking` - Credit balances (free + paid)
- `payment_receipts` - Purchase history
- `config` - System metadata (database_version for JWT epoch)

**See [DATABASE.md](./DATABASE.md) for complete schema documentation.**

---

## Execution Flow

### Blog Creation (Complete Path)

```
User Submits Idea
       ↓
API /expand validates auth + credits
       ↓
LangGraph invokes Router Agent
       ↓
Router decides: "blog_post"
       ↓
LangGraph invokes Creator Agent
       ↓
Blog Creator PLAN stage
  • GPT-4o-mini analyzes idea
  • Creates outline, sections, tone
  • Specifies image placement + descriptions
       ↓
Blog Creator GENERATE stage
  • Claude Sonnet 4.5 writes markdown
  • Image-Creator generates images
    - Tries FAL.ai (FLUX Schnell)
    - Falls back to HF Inference (SDXL)
    - Falls back to Replicate (FLUX Dev)
  • Auto-generates social media post
       ↓
Blog Creator REVIEW stage
  • GPT-4o-mini scores clarity, accuracy, engagement
  • Returns quality score (0-100)
       ↓
Save to database (outputs, executions)
       ↓
Frontend displays result with title, markdown, images, social post
```

### Code Creation (Complete Path)

```
User Submits Idea
       ↓
API /expand validates auth + credits
       ↓
LangGraph invokes Router Agent
       ↓
Router decides: "github_repo"
       ↓
LangGraph invokes Creator Agent
       ↓
Code Creator PLAN stage
  • GPT-4o-mini analyzes requirements
  • Decides: notebook | CLI | web app | library | demo
  • Chooses language: Python | JavaScript | TypeScript | Rust
  • Creates quality rubrics
       ↓
Code Creator GENERATE stage
  • Claude Sonnet 4.5 generates all files
  • Creates README with examples
  • Includes requirements.txt / package.json
       ↓
Code Creator REVIEW stage
  • GPT-4o-mini scores: correctness, security, quality, completeness
  • If score ≥ 75: APPROVED
  • If score < 75: Suggest fixes
       ↓
Quality Gate Check
  ✓ APPROVED → Proceed to Publisher
  ✗ SCORE < 75 → Fixer Agent (max 3 iterations)
       ↓
GitHub Publisher
  • Check user has GitHub OAuth token
  • Create repo in user's account
  • Push all files
  • Return repo URL
       ↓
Save to database (outputs, executions)
       ↓
Frontend displays result with repo link + files
```

---

## Key Technologies

| Technology | Purpose | Status |
|------------|---------|--------|
| Next.js 16 | Full-stack framework | ✅ |
| React 19 | UI components | ✅ |
| TypeScript | Type safety | ✅ |
| Supabase | PostgreSQL database + auth | ✅ |
| NextAuth | OAuth authentication | ✅ |
| LangGraph | Agent orchestration | ✅ |
| LangChain | LLM framework | ✅ |
| Zod | Schema validation | ✅ |
| OpenAI | GPT-4o-mini (routing, planning, review) | ✅ |
| Anthropic | Claude models (content generation) | ✅ |
| FAL.ai | AI image generation | ✅ |
| Octokit | GitHub API integration | ✅ |

---

## Environment Variables

**Required for startup:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `ENCRYPTION_KEY`

**Optional (for image generation):**
- `FAL_KEY` (preferred)
- `HUGGINGFACE_API_KEY` (fallback)
- `REPLICATE_API_TOKEN` (fallback)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete variable reference.

---

## File Structure

```
src/
├── app/
│   ├── api/                         # API routes
│   │   ├── expand/                  # Main orchestrator
│   │   ├── ideas/[id]/              # Idea CRUD
│   │   ├── outputs/[id]/            # Output CRUD
│   │   ├── usage/                   # Credit check
│   │   └── auth/[...nextauth]/      # NextAuth
│   ├── ideas/                       # Idea UI
│   ├── outputs/[id]/                # Result viewer
│   ├── auth/signin/                 # Sign in page
│   ├── layout.tsx                   # Root layout
│   └── page.tsx                     # Home page
│
├── lib/
│   ├── agents/                      # LangGraph agents
│   │   ├── graph.ts                 # Core orchestrator
│   │   ├── router-agent.ts          # Format decision
│   │   ├── creator-agent.ts         # Creator router
│   │   ├── types.ts                 # AgentState schema
│   │   ├── creators/                # Format-specific
│   │   │   ├── blog/                # Blog pipeline
│   │   │   ├── code/                # Code pipeline
│   │   │   └── image-creator.ts     # Image generation
│   │   └── publishers/              # Publication
│   │       └── github-publisher.ts
│   │
│   ├── db/                          # Database layer
│   │   ├── supabase.ts
│   │   ├── queries.ts
│   │   ├── schemas.ts
│   │   └── types.ts
│   │
│   ├── auth.ts                      # NextAuth config
│   ├── logging/logger.ts            # Structured logging
│   ├── usage/check-usage.ts         # Credit system
│   ├── crypto/encryption.ts         # Secrets encryption
│   └── utils.ts                     # Utilities
│
├── components/                      # React components
│   └── ui/                          # UI components (buttons, etc)
│
├── middleware.ts                    # Auth middleware
└── env.d.ts                         # Environment types

scripts/
├── setup-db.sql                     # Initial schema
├── reset-db.sql                     # Data cleanup
├── seed-admin.sql                   # Admin user
├── db-helper.ts                     # Dev utilities
└── admin/                           # Admin scripts
    ├── seed-admin-user.ts
    ├── grant-credits.ts
    └── check-user-usage.ts

docs/
├── DATABASE.md                      # Database setup
├── DEPLOYMENT.md                    # Production guide
├── ARCHITECTURE.md                  # Design patterns
├── SYSTEM_OVERVIEW.md              # This file
└── archive/                         # Historical docs
```

---

## How Data Flows Through the System

1. **User creates idea** in /ideas UI → API POST /api/ideas
2. **API stores idea** in database → Returns to user
3. **User clicks "Expand"** → API POST /api/expand
4. **API validates** auth, checks credits, creates execution record
5. **API invokes LangGraph** with selectedIdea
6. **LangGraph orchestrates agents:**
   - Router analyzes idea → sets chosenFormat
   - Creator routes to appropriate creator
   - Blog/Code Creator executes multi-stage pipeline
   - External APIs (OpenAI, Anthropic, FAL.ai) called
7. **Results saved** to database (outputs, executions)
8. **API returns** output data
9. **Frontend displays** result in format-specific viewer
10. **User can share** results or regenerate with modifications

---

## Performance Characteristics

- **Blog generation:** ~10-20 seconds (includes 3 images)
- **Code generation:** ~15-30 seconds (includes review + potential fix cycles)
- **Token usage:** $0.02-0.04 per expansion (very cost-effective)
- **Database queries:** <10ms (Supabase indexes optimized)
- **API response time:** 100-200ms (before agent execution)

---

## Security Architecture

- **Authentication:** NextAuth + GitHub OAuth (no passwords)
- **Authorization:** Row-Level Security (RLS) on all database tables
- **API Keys:** AES-256-GCM encrypted in database
- **GitHub Tokens:** User-specific, encrypted, validated before use
- **Input validation:** Zod schemas at system boundaries
- **No user data:** Ideas and outputs belong to user (RLS enforced)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for security best practices.

---

## Monitoring & Debugging

**Execution Logging:**
- Every pipeline run creates execution record with timing
- Structured logs available in Vercel (on production)
- Logger class tracks execution ID across agents

**Database Introspection:**
- `npm run db` - CLI helper for testing queries
- `scripts/admin/check-user-usage.ts` - View user credits
- `scripts/admin/grant-credits.ts` - Manually add credits

**Development:**
- `npm run dev` - Local development with hot reload
- `npm run build` - Production build verification
- `npm run lint` - Code style checking

---

## Next Steps

- Deploy to Vercel with environment variables
- Configure GitHub OAuth for production domain
- Set up monitoring and error tracking
- Plan for team collaboration features

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete production setup.
