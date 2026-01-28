# Architecture - Automated Idea Expansion

> **Last Updated:** January 27, 2026
> **Architecture:** LangGraph Multi-Agent Pipeline
> **Status:** Production Ready ✅

---

## Overview

### System Purpose

Transform raw ideas into production-quality content:
- **Blog posts** with images and social media posts
- **Code projects** with tests, docs, and GitHub repositories

### Design Philosophy

1. **User agency over automation** - Users choose which ideas to expand
2. **Structured all the way down** - No string parsing; Zod schemas everywhere
3. **Atomic content blocks** - Cell-based architecture for flexibility
4. **Cost-optimized** - Right model for each task (~$0.02-0.04/expansion)
5. **Quality-driven** - Iterative refinement with quality gates

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Remove Judge Agent** | Users should pick ideas; saves tokens; gives control |
| **Cell-based blogs** | Enables multi-platform rendering, atomic edits, no regex |
| **LangGraph orchestration** | Clear state management, visual debugging, conditional flows |
| **Zod structured outputs** | Type-safe at runtime, no JSON parsing errors |
| **GPT-4o-mini for planning** | Fast, cost-effective structured reasoning |
| **Claude Sonnet 4.5 for generation** | Best writing & code quality (LMSYS benchmarks) |
| **Per-user GitHub publishing** | Each user publishes to THEIR repo, not ours |

---

## Complete System Architecture

```
════════════════════════════════════════════════════════════════════════════════
                   AUTOMATED IDEA EXPANSION ARCHITECTURE
════════════════════════════════════════════════════════════════════════════════

┌──────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                               │
│                                                                               │
│  ┌────────────┐        ┌────────────┐        ┌────────────────────────────┐  │
│  │   /ideas   │        │  /outputs  │        │    /outputs/[id]           │  │
│  │            │        │            │        │                            │  │
│  │ List Ideas │───────▶│ List All   │───────▶│ View Blog/Code Output      │  │
│  │ + Expand   │        │ Outputs    │        │ (Format-Specific Renderer) │  │
│  └────────────┘        └────────────┘        └────────────────────────────┘  │
│       │                                                                       │
│       │ POST /api/expand { ideaId }                                          │
└───────┼────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                             API LAYER (Route Handlers)                        │
│                                                                               │
│  POST /api/expand      GET /api/ideas       DELETE /api/outputs              │
│  POST /api/ideas       PUT /api/ideas       GET /api/outputs                 │
│  NextAuth callbacks   GitHub OAuth flow                                      │
│                                                                               │
│  All requests authenticated via NextAuth JWT sessions                         │
└───────┬────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       AGENT ORCHESTRATION (LangGraph)                         │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                         Agent State (Shared)                           │  │
│  │  { userId, selectedIdea, chosenFormat, generatedContent, errors[] }   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│         START → [Router Agent] → [Creator Agent] → END                        │
│                       ↓                   ↓                                   │
│                  GPT-4o-mini          Routes to format:                       │
│                  Decides format       - Blog Creator                          │
│                  (blog/code)          - Code Creator                          │
│                                                                               │
│  ┌──────────────────────────────────┐  ┌───────────────────────────────────┐ │
│  │  BLOG CREATOR (4 stages)         │  │  CODE CREATOR (5 stages)          │ │
│  │                                  │  │                                   │ │
│  │  1. Plan (GPT-4o-mini)           │  │  1. Plan (GPT-4o-mini)            │ │
│  │     → Sections, tone, images     │  │     → Language, files, rubric     │ │
│  │                                  │  │                                   │ │
│  │  2. Generate (Claude Sonnet 4.5) │  │  2. Generate (Claude Sonnet 4.5)  │ │
│  │     → MarkdownCells + ImageCells │  │     → All code files + README     │ │
│  │     → SocialPost                 │  │                                   │ │
│  │                                  │  │  3. Review (GPT-4o-mini)          │ │
│  │  3. Images (fal.ai/HuggingFace)  │  │     → Score 0-100 + issues        │ │
│  │     → Generate images from specs │  │                                   │ │
│  │                                  │  │  4. Iteration (if score < 75)     │ │
│  │  4. Review (GPT-4o-mini)         │  │     → Fixer Agent or full regen   │ │
│  │     → Score + feedback           │  │     → Max 3 cycles                │ │
│  │                                  │  │                                   │ │
│  │  Output: Blog JSON               │  │  5. Publish (Octokit)             │ │
│  │  - title, cells[], socialPost    │  │     → User's GitHub repo          │ │
│  │  - _reviewScore, _sections[]     │  │     → Uses encrypted OAuth token  │ │
│  │                                  │  │                                   │ │
│  │                                  │  │  Output: Code JSON                │ │
│  │                                  │  │  - repoUrl, files[], metadata     │ │
│  └──────────────────────────────────┘  └───────────────────────────────────┘ │
│                                                                               │
│  All AI outputs validated with Zod schemas (structured output API)            │
└───────┬────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       DATA LAYER (Supabase PostgreSQL)                        │
│                                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌────────────┐  │
│  │  users   │  │  ideas   │  │ outputs  │  │ credentials │  │ executions │  │
│  ├──────────┤  ├──────────┤  ├──────────┤  ├─────────────┤  ├────────────┤  │
│  │ id (PK)  │  │ id (PK)  │  │ id (PK)  │  │ id (PK)     │  │ id (PK)    │  │
│  │ email    │  │ user_id  │  │ user_id  │  │ user_id     │  │ user_id    │  │
│  │ name     │  │ title    │  │ idea_id  │  │ provider    │  │ idea_id    │  │
│  │ ...      │  │ status   │  │ format   │  │ encrypted   │  │ status     │  │
│  └────┬─────┘  │ ...      │  │ content  │  │ ...         │  │ ...        │  │
│       │        └────┬─────┘  └──────────┘  └─────────────┘  └────────────┘  │
│       └─────────────┼───────────────────────────────────────────────────────┤ │
│                     │           Row-Level Security (RLS) Enabled             │ │
│                     │           Users only access their own data             │ │
│                     └─────────────────────────────────────────────────────┤  │
│                                                                               │
│  Security:                                                                    │
│  - GitHub OAuth tokens encrypted with AES-256-GCM                             │
│  - Per-user data isolation via RLS policies                                   │
│  - Service role key used by backend only (never exposed)                      │
└──────────────────────────────────────────────────────────────────────────────┘

════════════════════════════════════════════════════════════════════════════════
                              EXTERNAL SERVICES
════════════════════════════════════════════════════════════════════════════════

┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│   OpenAI     │  │  Anthropic   │  │   fal.ai     │  │   GitHub API         │
│   API        │  │   API        │  │   / HugFace  │  │   (Octokit)          │
├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────────────┤
│ GPT-4o-mini  │  │ Claude       │  │ FLUX Schnell │  │ Per-user OAuth       │
│ (planning +  │  │ Sonnet 4.5   │  │ (image gen)  │  │ Repo creation        │
│  review)     │  │ (generation) │  │              │  │ File uploads         │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────────────┘
```

---

## Execution Flows

### Blog Creation Flow

```
User clicks "Expand" → Router decides "blog_post"
    │
    ▼
PLAN STAGE (GPT-4o-mini)
    → Sections, tone, word count
    → Image specifications and placement
    │
    ▼
GENERATE STAGE (Claude Sonnet 4.5)
    → Write markdown cells
    → Generate social media post
    → Image generation (fal.ai/HuggingFace/Replicate)
    │
    ▼
REVIEW STAGE (GPT-4o-mini)
    → Score on clarity, accuracy, engagement
    → Return quality metrics
    │
    ▼
SAVE TO DATABASE
    → Store output JSON with metadata
    → Update idea status to 'expanded'
    │
    ▼
USER SEES RESULT
    → Display blog post with formatted content and images
```

### Code Creation Flow

```
User clicks "Expand" → Router decides "github_repo"
    │
    ▼
PLAN STAGE (GPT-4o-mini)
    → Language and framework selection
    → Output type (notebook/CLI/web/library/demo)
    → Quality rubrics and implementation steps
    │
    ▼
GENERATE STAGE (Claude Sonnet 4.5)
    → Create all files with working code
    → Generate README and documentation
    → Include examples and tests
    │
    ▼
REVIEW STAGE (GPT-4o-mini)
    → Score on correctness, security, quality, completeness
    → Provide actionable feedback
    │
    ▼
QUALITY GATE (score ≥ 75?)
    ├─ YES (score ≥ 75)
    │   └─ PUBLISH STAGE (Octokit)
    │       → Create GitHub repo in user's account
    │       → Push files and commits
    │       → Return repo URL
    │
    └─ NO (score < 75)
        └─ FIXER STAGE (Claude Sonnet 4.5)
            → Regenerate problematic files
            → Return to Review Stage
            → Max 3 iterations
    │
    ▼
SAVE TO DATABASE
    → Store output JSON with metadata
    → Store GitHub repo URL
    │
    ▼
USER SEES RESULT
    → Display code with repo link and file explorer
```

---

## Data Flow

```
User Action (Click "Expand")
    │
    ├─▶ POST /api/expand { ideaId }
    │
    ├─▶ API validates user session (NextAuth)
    │
    ├─▶ LangGraph pipeline invoked
    │       │
    │       ├─▶ Router Agent decides format
    │       │
    │       ├─▶ Creator Agent generates content
    │       │       │
    │       │       ├─▶ AI model calls (OpenAI, Anthropic)
    │       │       ├─▶ Image generation (fal.ai)
    │       │       └─▶ GitHub publishing (if code)
    │       │
    │       └─▶ Returns structured JSON
    │
    ├─▶ Save output to Supabase
    │
    ├─▶ Update execution record
    │
    └─▶ Return outputId to frontend → Redirect to /outputs/[id]
```

---

## Component Breakdown

### Frontend Layer (src/app/)
- **page.tsx** - Home page with navigation
- **ideas/page.tsx** - Idea management and submission
- **outputs/page.tsx** - List all generated outputs
- **outputs/[id]/page.tsx** - Format-specific result viewer
- **auth/signin/page.tsx** - GitHub OAuth authentication

### API Layer (src/app/api/)
- **expand/route.ts** - Main orchestrator (validates auth → invokes graph)
- **ideas/route.ts** - Create/list ideas
- **ideas/[id]/route.ts** - Get/update/delete single idea
- **outputs/route.ts** - List generated outputs
- **outputs/[id]/route.ts** - Get/delete single output
- **usage/route.ts** - Check remaining credits
- **auth/[...nextauth]/route.ts** - NextAuth OAuth handler

### Agent System (src/lib/agents/)

**Core Orchestration:**
- **graph.ts** - LangGraph StateGraph definition
- **types.ts** - AgentState schema (shared state)

**Decision-Making:**
- **router-agent.ts** - Format selection (blog vs code)

**Content Generation:**
- **creator-agent.ts** - Routes to format-specific creators

**Blog Pipeline:**
- **creators/blog/blog-creator.ts** - 4-stage orchestrator (Plan → Generate → Image → Review)
- **creators/blog/blog-schemas.ts** - Zod schemas for output

**Code Pipeline:**
- **creators/code/code-creator.ts** - 5-stage orchestrator with quality gates
- **creators/code/planning-agent.ts** - Decides output type and language
- **creators/code/generation-agent.ts** - Generates all files
- **creators/code/critic-agent.ts** - Quality review and scoring
- **creators/code/fixer-agent.ts** - Auto-fixes issues

**Supporting Components:**
- **idea-summarizer.ts** - AI-generated idea summaries
- **image-creator.ts** - Multi-API image generation
- **publishers/github-publisher.ts** - GitHub repo creation

### Database Layer (src/lib/db/)
- **supabase.ts** - Client initialization
- **queries.ts** - CRUD operations
- **schemas.ts** - Zod validation schemas
- **types.ts** - TypeScript interfaces

### Supporting Systems
- **src/lib/auth.ts** - NextAuth configuration
- **src/lib/logging/logger.ts** - Structured logging
- **src/lib/crypto/encryption.ts** - AES-256-GCM encryption
- **src/lib/utils.ts** - Utility functions

---

## Model Selection Strategy

Every model choice balances **cost**, **quality**, and **speed**:

| Task | Model | Cost/1M Input | Speed | Quality | Why? |
|------|-------|---|---|---|---|
| **Router** | GPT-4o-mini | $0.15 | ~500ms | Good | Simple decision, no creativity needed |
| **Blog Planning** | GPT-4o-mini | $0.15 | <500ms | Good | Fast structured reasoning |
| **Blog Generation** | Claude Sonnet 4.5 | $3.00 | ~3s | Best | Superior writing quality |
| **Code Planning** | GPT-4o-mini | $0.15 | <500ms | Good | Quick architectural decisions |
| **Code Generation** | Claude Sonnet 4.5 | $3.00 | ~3s | Best | #1 code quality (LMSYS) |
| **Review** | GPT-4o-mini | $0.15 | <500ms | Good | Consistent evaluation |
| **Image Generation** | FLUX Schnell | $0.001/img | ~2s | High | Photorealistic, reliable |

**Why Claude Sonnet 4.5 for generation?**
- LMSYS Chatbot Arena: #1 for code, #2 for writing (Dec 2025)
- $3/1M input (vs $15/1M for Opus)
- Excellent structured output support (Zod schemas)
- ~$0.015 per generation = cost-effective at scale

---

## Database Schema

Core tables with Row-Level Security enabled:

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `users` | User accounts | id, email, name, timezone |
| `ideas` | Raw ideas to expand | id, user_id, title, summary, status |
| `outputs` | Generated content | id, user_id, idea_id, format, content_json |
| `executions` | Pipeline run logs | id, user_id, status, duration_seconds |
| `credentials` | Encrypted API keys | id, user_id, provider, encrypted_value |
| `usage_tracking` | Credit balances | user_id, free_remaining, paid_remaining |
| `config` | System metadata | key, value (database_version for JWT epoch) |

**Security Features:**
- Row-Level Security (RLS): Users only access their own data
- Encrypted credentials: AES-256-GCM for API keys
- Service role isolation: Backend-only access with admin key

---

## API Design

All endpoints require authentication via NextAuth JWT.

```
POST /api/expand
  Input: { ideaId: string }
  Output: { success: boolean, outputId: string, content: any }
  Side effects: Creates execution record, saves output, updates idea status

GET /api/ideas
  Output: { success: boolean, ideas: Idea[] }

POST /api/ideas
  Input: { title: string, description?: string }
  Output: { success: boolean, idea: Idea }

GET/PUT/DELETE /api/ideas/[id]
  GET: Retrieve single idea
  PUT: Update title/description/status
  DELETE: Remove idea and related outputs

GET /api/outputs
  Output: { success: boolean, outputs: Output[] }

GET /api/outputs/[id]
  Output: { success: boolean, output: Output }

DELETE /api/outputs/[id]
  Side effects: Removes output from database

GET /api/usage
  Output: { success: boolean, usage: UsageTracking }
```

---

## Security Architecture

### Authentication
- **GitHub OAuth** via NextAuth
- **JWT tokens** with database epoch system (detects stale tokens after reset)
- **Row-Level Security** on all database tables (enforced by Supabase)

### Authorization
- Each user can only access their own ideas, outputs, and credentials
- Encrypted GitHub token stored per user
- Service role key restricted to backend

### Data Protection
- **API Keys:** AES-256-GCM encryption (user's GitHub token)
- **Secrets:** Stored in `.env.local` (never committed)
- **Database:** Row-Level Security (RLS) enforced
- **Input validation:** Zod schemas at all system boundaries

---

## Key Design Principles

1. **Schema-Driven:** Zod schemas validate ALL structured data (no JSON parsing errors)
2. **Per-User Publishing:** Each user publishes to THEIR GitHub, not ours
3. **Quality Gates:** Code must score ≥75 before publishing
4. **Cell-Based Blogs:** Structured cells (MarkdownCell, ImageCell), not markdown strings
5. **Fail-Fast:** Errors throw immediately, no silent failures
6. **Type-Safe:** TypeScript + Zod = runtime type safety

---

## See Also

- **[README.md](../README.md)** - Getting started and feature overview
- **[DATABASE.md](./DATABASE.md)** - Database setup and management
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide
