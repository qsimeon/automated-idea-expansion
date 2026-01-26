# System Architecture - Detailed Diagram

**Automated Idea Expansion** - Transform raw ideas into production-quality content

Last Updated: January 26, 2026

---

## High-Level System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTOMATED IDEA EXPANSION                     │
│                   (Transform Ideas to Content)                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
                ▼                             ▼
        ┌───────────────┐           ┌────────────────┐
        │  USER INPUT   │           │  AUTHENTICATION│
        │               │           │                │
        │ • Raw Ideas   │           │ GitHub OAuth   │
        │ • Preferences │           │ ↓              │
        │ • Settings    │           │ NextAuth JWT   │
        └───────┬───────┘           └────────┬───────┘
                │                            │
                └────────────┬───────────────┘
                             │
                             ▼
        ┌─────────────────────────────────────┐
        │     PRESENTATION LAYER              │
        │  (Next.js App Router Components)    │
        │                                     │
        │  ┌──────────┐  ┌──────────┐        │
        │  │  IDEAS   │  │ OUTPUTS  │        │
        │  │  PAGE    │  │   PAGE   │        │
        │  └─────┬────┘  └────┬─────┘        │
        │        │            │              │
        │        └────┬───────┘              │
        │             │                      │
        │        ┌────▼────┐                │
        │        │ OUTPUT  │                │
        │        │ VIEWER  │                │
        │        └────┬────┘                │
        └─────────────┼────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────────────┐
        │      API LAYER (Route Handlers)     │
        │                                     │
        │  POST /api/expand         (Start)  │
        │  POST /api/ideas          (Create) │
        │  GET  /api/ideas/:id      (Read)   │
        │  PUT  /api/ideas/:id      (Update) │
        │  GET  /api/outputs        (List)   │
        │  GET  /api/outputs/:id    (View)   │
        │  DELETE /api/outputs/:id  (Delete) │
        │  GET  /api/auth/*         (NextAuth)│
        │  GET  /api/usage          (Info)   │
        └─────────────┬──────────────────────┘
                      │
                      ▼
        ┌──────────────────────────────────┐
        │   ORCHESTRATION LAYER            │
        │    (LangGraph State Machine)      │
        │                                  │
        │   graph.ts:                      │
        │   - State management             │
        │   - Agent routing                │
        │   - Error handling               │
        │                                  │
        │  ┌──────────┐  ┌────────────┐   │
        │  │ ROUTER   │→ │ CREATOR    │   │
        │  │ AGENT    │  │ AGENT      │   │
        │  └──────────┘  └──────┬─────┘   │
        └────────────────┬──────┴────────┘
                         │
                    ┌────┴────┐
                    │          │
                    ▼          ▼
        ┌────────────────┐  ┌─────────────────┐
        │  BLOG CREATOR  │  │  CODE CREATOR   │
        │  (4 stages)    │  │  (5 stages)     │
        │                │  │                 │
        │ 1. Planning    │  │ 1. Planning     │
        │    (GPT-4o)    │  │    (GPT-4o)     │
        │                │  │                 │
        │ 2. Generation  │  │ 2. Generation   │
        │    (Sonnet 4.5)│  │    (Sonnet 4.5) │
        │                │  │                 │
        │ 3. Images      │  │ 3. Review       │
        │    (FAL.ai)    │  │    (GPT-4o)     │
        │                │  │                 │
        │ 4. Review      │  │ 4. Iteration    │
        │    (GPT-4o)    │  │    (if needed)  │
        │                │  │                 │
        │                │  │ 5. GitHub Pub   │
        │                │  │    (optional)   │
        └────────┬───────┘  └────────┬────────┘
                 │                   │
                 └─────────┬─────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │     DATABASE LAYER               │
        │   (Supabase + PostgreSQL)        │
        │                                  │
        │  ┌─────────┐  ┌──────────────┐  │
        │  │  users  │  │    ideas     │  │
        │  └─────────┘  └──────────────┘  │
        │                                  │
        │  ┌─────────────┐  ┌────────┐    │
        │  │   outputs   │  │executions│  │
        │  └─────────────┘  └────────┘    │
        │                                  │
        │  ┌─────────────┐  ┌────────────┐│
        │  │ credentials │  │usage_tracking││
        │  └─────────────┘  └────────────┘│
        │                                  │
        └──────────────────────────────────┘
```

---

## Detailed Component Breakdown

### 1. User Input Layer

```
┌────────────────────────────────┐
│   USER INPUT                   │
│                                │
│  ┌──────────────────────────┐  │
│  │  Raw Idea Content        │  │
│  │  (Plain text from user)  │  │
│  │                          │  │
│  │  Example:                │  │
│  │  "Build a sentiment      │  │
│  │   analyzer for tweets"   │  │
│  └──────────────┬───────────┘  │
│                 │               │
│  ┌──────────────▼─────────────┐ │
│  │  AI Processing:           │ │
│  │  - Extract title          │ │
│  │  - Generate description   │ │
│  │  - Categorize idea        │ │
│  │  - Estimate complexity    │ │
│  └──────────────┬────────────┘ │
│                 │              │
│  ┌──────────────▼─────────────┐ │
│  │  Structured Idea Object:  │ │
│  │  {                        │ │
│  │    id: string             │ │
│  │    title: string          │ │
│  │    description: string    │ │
│  │    status: 'pending'      │ │
│  │  }                        │ │
│  └──────────────────────────┘ │
│                                │
└────────────────────────────────┘
```

### 2. Authentication Flow

```
┌──────────────────────────────────────────────┐
│  GITHUB OAUTH FLOW                           │
│                                              │
│  Step 1: User clicks "Sign in with GitHub"  │
│    ↓                                         │
│  Step 2: Redirect to GitHub auth            │
│    ↓                                         │
│  Step 3: User authorizes app (scopes:       │
│    - read:user                              │
│    - user:email                             │
│    - public_repo)                           │
│    ↓                                         │
│  Step 4: GitHub redirects with code         │
│    ↓                                         │
│  Step 5: NextAuth exchanges code for token  │
│    ↓                                         │
│  Step 6: Create user record in Supabase     │
│    ↓                                         │
│  Step 7: Encrypt & store GitHub token       │
│    ↓                                         │
│  Step 8: Issue JWT to user                  │
│    ↓                                         │
│  Result: User authenticated, can expand     │
│          ideas and publish code             │
│                                              │
│  JWT stored in httpOnly cookie (secure)     │
│  Contains: user.id, user.email,             │
│            user.name, expiration (30 days)  │
└──────────────────────────────────────────────┘
```

### 3. Expansion Pipeline

```
REQUEST: POST /api/expand { ideaId: "abc123" }
    ↓
┌─────────────────────────────────────────────────┐
│ 1. VALIDATION LAYER                             │
│    ✓ Validate ideaId not empty                 │
│    ✓ Fetch idea from database                  │
│    ✓ Check user owns idea (auth middleware)    │
│    ✓ Check usage quotas (free vs paid)         │
│    ✗ If validation fails → 400/403             │
└──────────────┬──────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────┐
│ 2. ORCHESTRATION LAYER (LangGraph)              │
│                                                  │
│    Create execution record: status='running'    │
│    Initialize state:                            │
│    {                                            │
│      userId: string                            │
│      selectedIdea: Idea                        │
│      chosenFormat: null                        │
│      generatedContent: null                    │
│      errors: []                                │
│    }                                           │
└──────────────┬──────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────┐
│ 3. ROUTER AGENT                                 │
│    Model: GPT-4o (structured output)           │
│                                                  │
│    Input: idea.title + idea.description        │
│    Decision: blog_post vs github_repo          │
│    Output: {                                    │
│      format: 'blog_post' | 'github_repo'       │
│      reasoning: string                         │
│      confidence: 0-100                         │
│    }                                           │
└──────────────┬──────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────┐
│ 4. CREATOR AGENT - FORMAT-SPECIFIC PATH         │
│                                                  │
│    IF format === 'blog_post':                   │
│    ├─ blogCreator(state) [4 stages]           │
│    │  ├─ Planning (structure + tone)           │
│    │  ├─ Generation (cells as JSON)            │
│    │  ├─ Image Creation (for each image cell)  │
│    │  └─ Review (quality score)                │
│    │                                           │
│    IF format === 'github_repo':                │
│    ├─ codeCreator(state) [5+ stages]          │
│       ├─ Planning (architecture + language)    │
│       ├─ Generation (files + README)           │
│       ├─ Review (quality across 5 dimensions)  │
│       ├─ Iteration (if needed, max 5 attempts)│
│       └─ Publish to GitHub (if token present) │
│                                                │
└──────────────┬──────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────┐
│ 5. PERSISTENCE LAYER                            │
│    Save execution result:                       │
│    ├─ execution record (status='completed')    │
│    ├─ output record (with generated content)   │
│    ├─ update idea.status (pending→expanded)   │
│    ├─ update usage tracking (decrement credits)│
│    └─ store any errors/warnings               │
└──────────────┬──────────────────────────────────┘
               ▼
RESPONSE: { outputId: "xyz789", format: "blog_post" }
```

### 4. Blog Post Generation (4 Stages)

```
BLOG POST GENERATION PIPELINE
├─ Stage 1: PLANNING
│  ├─ Input: Idea title + description
│  ├─ Model: GPT-4o (structured output)
│  ├─ Task: Decide
│  │  - Title
│  │  - Sections (array of topic strings)
│  │  - Tone (professional|casual|technical)
│  │  - Image placement (description)
│  ├─ Output: Plan object (Zod-validated)
│  └─ Duration: 2-3 seconds
│
├─ Stage 2: CONTENT GENERATION
│  ├─ Input: Plan object
│  ├─ Model: Claude Sonnet 4.5 (best for writing)
│  ├─ Task: Generate blog cells (JSON array)
│  │  - Markdown cells (h2, p, li, blockquote, code)
│  │  - Image cells (prompt + placement info)
│  │  - Structure: {
│  │      cells: [
│  │        {type: 'markdown', content: string},
│  │        {type: 'image', prompt: string}
│  │      ]
│  │    }
│  ├─ Output: BlogContent (Zod-validated)
│  └─ Duration: 5-15 seconds
│
├─ Stage 3: IMAGE GENERATION
│  ├─ Input: Image cells from Stage 2
│  ├─ Provider: FAL.ai (primary) → HF → Replicate
│  ├─ Task: Generate image for each image cell
│  │  - Claude (GPT-4o) expands prompt with context
│  │  - FAL.ai generates image (2-5 seconds)
│  │  - Fallback to HuggingFace or Replicate
│  ├─ Output: BlogContent with image URLs
│  └─ Duration: 15-60 seconds total
│
└─ Stage 4: REVIEW & FINALIZATION
   ├─ Input: Full blog content + images
   ├─ Model: GPT-4o (critique)
   ├─ Task: Score on 5 dimensions:
   │  - Clarity (is it well-written?)
   │  - Engagement (is it interesting?)
   │  - Structure (is it well-organized?)
   │  - Accuracy (is it factually correct?)
   │  - Completeness (does it cover the topic?)
   ├─ Output: Score (0-100) + suggestions
   └─ Duration: 2-3 seconds
```

### 5. Code Project Generation (5+ Stages)

```
CODE PROJECT GENERATION PIPELINE
├─ Stage 1: PLANNING
│  ├─ Input: Idea title + description
│  ├─ Model: GPT-4o (structured output)
│  ├─ Task: Decide
│  │  - Output type (notebook|cli-app|library|etc)
│  │  - Language (python|js|typescript|rust)
│  │  - Architecture (simple|modular|full-stack)
│  │  - Model tier (simple/modular/complex)
│  │  - Critical files to create
│  ├─ Output: CodePlan (Zod-validated)
│  └─ Duration: 2-3 seconds
│
├─ Stage 2: CODE GENERATION
│  ├─ Input: CodePlan
│  ├─ Model Selection:
│  │  - Simple/Modular: Claude Sonnet 4.5
│  │  - Complex: O1/O3 extended thinking
│  ├─ For Notebooks:
│  │  - Generate notebook cells (code + markdown)
│  │  - Generate critical Python modules
│  │  - Generate README (schema-driven)
│  │  - Generate requirements.txt
│  ├─ For CLI/Web/Library:
│  │  - Generate all planned files
│  │  - Enforce multi-file architecture
│  │  - Generate README with examples
│  │  - Add package.json/setup.py
│  ├─ Output: GeneratedCode (file array)
│  └─ Duration: 10-30 seconds
│
├─ Stage 3: CODE REVIEW
│  ├─ Input: GeneratedCode + CodePlan
│  ├─ Model: GPT-4o (structured review)
│  ├─ Score on 5 dimensions:
│  │  - Correctness (35%): No syntax errors, logic sound
│  │  - Security (25%): No hardcoded secrets, input validation
│  │  - Code Quality (20%): Clean, readable, maintainable
│  │  - Completeness (10%): All planned features implemented
│  │  - Documentation (10%): README, examples, comments
│  ├─ Output: CodeReview with score (0-100)
│  └─ Duration: 5-10 seconds
│
├─ Stage 4: ITERATION LOOP (if needed, max 5 attempts)
│  ├─ Check: If score >= 75 AND recommendation == 'approve'
│  │  ├─ ✓ PASS: Approve code, skip to publish
│  │  ├─ If score < 60: Regenerate all
│  │  └─ Else: Apply targeted fixes
│  │
│  ├─ Action A: Full Regeneration (score too low)
│  │  ├─ Call generateCode again with feedback
│  │  ├─ Re-review
│  │  └─ Check for improvement
│  │
│  ├─ Action B: Targeted Fixes (specific issues)
│  │  ├─ Call fixerAgent with issues
│  │  ├─ Modify only problematic files
│  │  ├─ Re-review
│  │  └─ Check for improvement
│  │
│  └─ Loop until: score >= 75 OR attempts == 5
│
└─ Stage 5: GITHUB PUBLISHING (optional)
   ├─ Condition: IF GITHUB_TOKEN present AND user approved
   ├─ Task:
   │  - Create repo on user's GitHub
   │  - Push all generated files
   │  - Create initial commit
   │  - Add description & topics
   ├─ Output: GitHub URL
   └─ Duration: 5-10 seconds
```

### 6. Database Schema

```
┌──────────────────────────────────────┐
│ users                                │
├──────────────────────────────────────┤
│ id (uuid) PRIMARY KEY                │
│ email (text) UNIQUE                  │
│ name (text, nullable)                │
│ timezone (text)                      │
│ created_at (timestamp)               │
│ updated_at (timestamp)               │
└──────────────────────────────────────┘
        │
        ├─── 1 : N ──→ ideas
        ├─── 1 : N ──→ outputs
        ├─── 1 : N ──→ executions
        ├─── 1 : N ──→ credentials
        └─── 1 : N ──→ usage_tracking

┌──────────────────────────────────────┐
│ ideas                                │
├──────────────────────────────────────┤
│ id (uuid) PRIMARY KEY                │
│ user_id (uuid) FOREIGN KEY           │
│ title (text)                         │
│ description (text, nullable)         │
│ status (enum: pending|expanded|...)  │
│ created_at (timestamp)               │
│ updated_at (timestamp)               │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ outputs                              │
├──────────────────────────────────────┤
│ id (uuid) PRIMARY KEY                │
│ user_id (uuid) FOREIGN KEY           │
│ idea_id (uuid, nullable) FOREIGN KEY │
│ execution_id (uuid) FOREIGN KEY      │
│ format (enum: blog_post|github_repo) │
│ content (jsonb) ← Full output        │
│ published (boolean)                  │
│ publication_url (text, nullable)     │
│ publication_metadata (jsonb)         │
│ created_at (timestamp)               │
│ published_at (timestamp, nullable)   │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ executions                           │
├──────────────────────────────────────┤
│ id (uuid) PRIMARY KEY                │
│ user_id (uuid) FOREIGN KEY           │
│ idea_id (uuid, nullable) FOREIGN KEY │
│ status (enum: running|completed|...) │
│ started_at (timestamp)               │
│ completed_at (timestamp, nullable)   │
│ tokens_used (integer)                │
│ error_message (text, nullable)       │
│ error_step (text, nullable)          │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ credentials                          │
├──────────────────────────────────────┤
│ id (uuid) PRIMARY KEY                │
│ user_id (uuid) FOREIGN KEY           │
│ provider (enum: github|openai|..)    │
│ encrypted_value (text) ← AES-256     │
│ is_active (boolean)                  │
│ validation_status (enum: valid|...)  │
│ created_at (timestamp)               │
│ updated_at (timestamp)               │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ usage_tracking                       │
├──────────────────────────────────────┤
│ id (uuid) PRIMARY KEY                │
│ user_id (uuid) FOREIGN KEY           │
│ free_expansions_remaining (integer)  │
│ paid_credits_remaining (integer)     │
│ total_expansions (integer)           │
│ created_at (timestamp)               │
│ updated_at (timestamp)               │
└──────────────────────────────────────┘
```

### 7. Security Layers

```
┌─────────────────────────────────────────────────────┐
│ SECURITY ARCHITECTURE                              │
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │ Layer 1: TRANSPORT                           │   │
│ │ ├─ HTTPS only (enforced by Vercel)          │   │
│ │ ├─ TLS 1.3 minimum                          │   │
│ │ └─ No mixed content                         │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │ Layer 2: AUTHENTICATION                      │   │
│ │ ├─ GitHub OAuth 2.0 (industry standard)     │   │
│ │ ├─ JWT tokens (HS256 signed)                │   │
│ │ ├─ httpOnly cookies (XSS protection)        │   │
│ │ ├─ 30-day expiration                        │   │
│ │ └─ CSRF tokens (NextAuth automatic)         │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │ Layer 3: AUTHORIZATION                       │   │
│ │ ├─ Row-Level Security (Supabase)            │   │
│ │ ├─ Users can only access own data           │   │
│ │ ├─ API routes check session.user.id         │   │
│ │ └─ Idea/output queries filtered by user_id  │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │ Layer 4: DATA ENCRYPTION                     │   │
│ │ ├─ GitHub token: AES-256-GCM                │   │
│ │ ├─ Encryption key: 32-byte random           │   │
│ │ ├─ IV: Unique per token                     │   │
│ │ └─ Auth tag: Integrity verification         │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │ Layer 5: SECRETS MANAGEMENT                  │   │
│ │ ├─ No hardcoded secrets in code             │   │
│ │ ├─ All secrets from environment variables   │   │
│ │ ├─ Vercel stores secrets encrypted          │   │
│ │ ├─ Service role key never exposed           │   │
│ │ └─ API keys never logged                    │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │ Layer 6: INPUT VALIDATION                    │   │
│ │ ├─ Zod schemas validate all inputs          │   │
│ │ ├─ No direct string interpolation           │   │
│ │ ├─ Parameterized Supabase queries           │   │
│ │ └─ Length/type limits enforced              │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Model Selection Strategy

```
┌─────────────────────────────────────────────────┐
│ MODEL SELECTION BY TASK                         │
│                                                 │
│ PLANNING & ROUTING                              │
│ ├─ GPT-4o (mini variant)                       │
│ ├─ Task: Structured decisions                  │
│ ├─ Cost: ~$0.0005 per call                     │
│ └─ Speed: 1-3 seconds                          │
│                                                 │
│ CODE/BLOG GENERATION                            │
│ ├─ Claude Sonnet 4.5 (default)                 │
│ ├─ Task: High-quality content creation         │
│ ├─ Cost: ~$0.003-0.01 per call                 │
│ ├─ Speed: 5-30 seconds                         │
│ └─ Why: Best code/writing quality per LMSYS   │
│                                                 │
│ COMPLEX CODE (O1/O3 Extended Thinking)         │
│ ├─ Condition: modelTier == 'complex'           │
│ ├─ Cost: ~$0.15-0.30 per call (10x more)      │
│ ├─ Speed: 30-60 seconds                        │
│ └─ Why: Better architectural decisions         │
│                                                 │
│ CRITIQUE & REVIEW                               │
│ ├─ GPT-4o (mini variant)                       │
│ ├─ Task: Quality evaluation (5 dimensions)     │
│ ├─ Cost: ~$0.0005-0.001 per call               │
│ └─ Speed: 2-5 seconds                          │
│                                                 │
│ IMAGE GENERATION                                │
│ ├─ FAL.ai (primary)                            │
│ ├─ Cost: Free tier (100/month) or $0.02-0.05  │
│ ├─ Speed: 2-5 seconds                          │
│ └─ Why: Fast + generous free tier              │
│                                                 │
│ Fallbacks: HuggingFace (free) → Replicate     │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Performance Characteristics

```
TYPICAL EXPANSION TIMELINE

User clicks "Expand"
    ├─ 0-2s   │ Request validation + database fetch
    │         │
    ├─ 2-5s   │ Router Agent (decide blog vs code)
    │         │
    ├─ 5-20s  │ Generator Agent
    │         ├─ Planning (2-3s)
    │         ├─ Generation (5-15s)
    │         ├─ Images (10-30s if enabled)
    │         └─ Review (2-5s)
    │         │
    ├─ 20-55s │ Optional: Iteration (if quality < 75)
    │         │
    └─ 55+s   │ Database save + response
              │
    TOTAL: 30-90 seconds per expansion

COST PER EXPANSION
    ├─ Planning: $0.0005
    ├─ Generation: $0.003-0.01
    ├─ Review: $0.0005
    ├─ Images: $0.00-0.05
    └─ TOTAL: $0.01-0.06 per expansion
```

---

## Deployment Topology

```
┌──────────────────────────────────────────────────┐
│ PRODUCTION ARCHITECTURE (Vercel)                │
│                                                  │
│ ┌──────────────────────────────────────────────┐│
│ │ VERCEL EDGE (Global CDN)                    ││
│ │ ├─ Next.js App Router                       ││
│ │ ├─ Static pages (homepage, auth)            ││
│ │ ├─ Redirect to nearest region               ││
│ │ └─ <100ms latency (global)                  ││
│ └──────────────────────────────────────────────┘│
│                      │                          │
│                      ▼                          │
│ ┌──────────────────────────────────────────────┐│
│ │ VERCEL SERVERLESS FUNCTIONS (US-East)       ││
│ │ ├─ API routes (/api/*)                      ││
│ │ ├─ NextAuth handlers                        ││
│ │ ├─ Agent orchestration (LangGraph)          ││
│ │ ├─ Cold start: 1-3s (first request)         ││
│ │ ├─ Warm: <100ms (cached)                    ││
│ │ └─ Auto-scales (0 → 100s of instances)      ││
│ └──────────────────────────────────────────────┘│
│           │              │               │      │
│           ▼              ▼               ▼      │
│    ┌─────────┐    ┌──────────┐    ┌────────┐  │
│    │ Supabase│    │ OpenAI   │    │Anthropic  │
│    │(Postgres)    │  API     │    │  API   │  │
│    └─────────┘    └──────────┘    └────────┘  │
│       │                                        │
│       └─ Point-in-time restore backup (daily) │
│                                                │
└──────────────────────────────────────────────────┘
```

---

This architecture ensures:
- ✅ **Scalability**: Auto-scaling serverless functions
- ✅ **Reliability**: Geographically distributed, 99.95% uptime SLA
- ✅ **Security**: HTTPS, encryption, RLS, authentication
- ✅ **Cost-effectiveness**: Pay-per-execution model
- ✅ **Developer experience**: Simple deployment, excellent logging
