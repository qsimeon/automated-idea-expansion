# System Architecture - Automated Idea Expansion

**Version:** V3 (Cell-Based Architecture)
**Last Updated:** January 22, 2026
**Status:** Production-ready localhost app

---

## Table of Contents

1. [Overview](#overview)
2. [System Components](#system-components)
3. [Data Flow](#data-flow)
4. [Agent Architecture](#agent-architecture)
5. [Cell-Based Blog System](#cell-based-blog-system)
6. [Code Generation Pipeline](#code-generation-pipeline)
7. [Database Schema](#database-schema)
8. [API Design](#api-design)
9. [Model Selection Rationale](#model-selection-rationale)
10. [Security Architecture](#security-architecture)
11. [Performance Optimization](#performance-optimization)
12. [Future Production Architecture](#future-production-architecture)

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

---

## System Components

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Ideas Page   │  │ Outputs Page │  │ Output       │      │
│  │ /ideas       │  │ /outputs     │  │ Viewer       │      │
│  │              │  │              │  │ /outputs/[id]│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                        API LAYER                             │
│                                                              │
│  POST /api/expand     GET /api/ideas    DELETE /api/outputs │
│  POST /api/ideas      PUT /api/ideas    GET /api/outputs    │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                       │
│                                                              │
│                      LangGraph Pipeline                      │
│                      (src/lib/agents/graph.ts)               │
│                                                              │
│              Router Agent → Creator Agent                    │
└─────────────────────────────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
┌────────────────────────────┐  ┌────────────────────────────┐
│    BLOG CREATOR            │  │    CODE CREATOR            │
│    (cell-based)            │  │    (multi-stage)           │
│                            │  │                            │
│  1. Planning (GPT-4o-mini) │  │  1. Planning (GPT-4o-mini) │
│  2. Generation (Sonnet 4.5)│  │  2. Generation (Sonnet 4.5)│
│  3. Images (FLUX Schnell)  │  │  3. Review (GPT-4o-mini)   │
│  4. Review (GPT-4o-mini)   │  │  4. Iteration (if needed)  │
│                            │  │  5. GitHub Publish         │
└────────────────────────────┘  └────────────────────────────┘
                    │                 │
                    └────────┬────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                              │
│                                                              │
│              Supabase PostgreSQL Database                    │
│           (users, ideas, outputs, executions)                │
└─────────────────────────────────────────────────────────────┘
```

---

## Complete System Architecture Diagram

```
================================================================================
                   AUTOMATED IDEA EXPANSION ARCHITECTURE
================================================================================

┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                              │
│                                                                              │
│  ┌────────────┐        ┌────────────┐        ┌────────────────────────────┐ │
│  │   /ideas   │        │  /outputs  │        │    /outputs/[id]           │ │
│  │            │        │            │        │                            │ │
│  │ List Ideas │───────▶│ List All   │───────▶│ View Blog/Code Output      │ │
│  │ + Expand   │        │ Outputs    │        │ (Format-Specific Renderer) │ │
│  └────────────┘        └────────────┘        └────────────────────────────┘ │
│       │                                                                      │
│       │ POST /api/expand { ideaId }                                         │
└───────┼──────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             API LAYER (Route Handlers)                       │
│                                                                              │
│  POST /api/expand      GET /api/ideas       DELETE /api/outputs             │
│  POST /api/ideas       PUT /api/ideas       GET /api/outputs                │
│  NextAuth callbacks   GitHub OAuth flow                                     │
│                                                                              │
│  All requests authenticated via NextAuth JWT sessions                        │
└───────┬──────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       AGENT ORCHESTRATION (LangGraph)                        │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         Agent State (Shared)                           │ │
│  │  { userId, selectedIdea, chosenFormat, generatedContent, errors[] }   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│         START → [Router Agent] → [Creator Agent] → END                       │
│                       ↓                   ↓                                  │
│                  GPT-4o-mini          Routes to format:                      │
│                  Decides format       - Blog Creator                         │
│                  (blog/code)          - Code Creator                         │
│                                                                              │
│  ┌──────────────────────────────────┐  ┌───────────────────────────────────┐│
│  │  BLOG CREATOR (4 stages)         │  │  CODE CREATOR (5 stages)          ││
│  │                                  │  │                                   ││
│  │  1. Plan (GPT-4o-mini)           │  │  1. Plan (GPT-4o-mini)            ││
│  │     → Sections, tone, images     │  │     → Language, files, rubric     ││
│  │                                  │  │                                   ││
│  │  2. Generate (Claude Sonnet 4.5) │  │  2. Generate (Claude Sonnet 4.5)  ││
│  │     → MarkdownCells + ImageCells │  │     → All code files + README     ││
│  │     → SocialPost                 │  │                                   ││
│  │                                  │  │  3. Review (GPT-4o-mini)          ││
│  │  3. Images (fal.ai/HuggingFace)  │  │     → Score 0-100 + issues        ││
│  │     → Generate images from specs │  │                                   ││
│  │                                  │  │  4. Iteration (if score < 75)     ││
│  │  4. Review (GPT-4o-mini)         │  │     → Fixer Agent or full regen   ││
│  │     → Score + feedback           │  │     → Max 3 cycles                ││
│  │                                  │  │                                   ││
│  │  Output: Blog JSON               │  │  5. Publish (Octokit)             ││
│  │  - title, cells[], socialPost    │  │     → User's GitHub repo          ││
│  │  - _reviewScore, _sections[]     │  │     → Uses encrypted OAuth token  ││
│  │                                  │  │                                   ││
│  │                                  │  │  Output: Code JSON                ││
│  │                                  │  │  - repoUrl, files[], metadata     ││
│  └──────────────────────────────────┘  └───────────────────────────────────┘│
│                                                                              │
│  All AI outputs validated with Zod schemas (structured output API)           │
└───────┬──────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DATA LAYER (Supabase PostgreSQL)                       │
│                                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  users   │  │  ideas   │  │ outputs  │  │ credentials │  │ executions │ │
│  ├──────────┤  ├──────────┤  ├──────────┤  ├─────────────┤  ├────────────┤ │
│  │ id (PK)  │  │ id (PK)  │  │ id (PK)  │  │ id (PK)     │  │ id (PK)    │ │
│  │ email    │  │ user_id  │  │ user_id  │  │ user_id     │  │ user_id    │ │
│  │ name     │  │ title    │  │ idea_id  │  │ provider    │  │ idea_id    │ │
│  │ ...      │  │ status   │  │ format   │  │ encrypted   │  │ status     │ │
│  └────┬─────┘  │ ...      │  │ content  │  │ ...         │  │ ...        │ │
│       │        └────┬─────┘  └──────────┘  └─────────────┘  └────────────┘ │
│       └─────────────┼───────────────────────────────────────────────────────┤
│                     │           Row-Level Security (RLS) Enabled             │
│                     │           Users only access their own data             │
│                     └────────────────────────────────────────────────────────┤
│                                                                              │
│  Security:                                                                   │
│  - GitHub OAuth tokens encrypted with AES-256-GCM                            │
│  - Per-user data isolation via RLS policies                                  │
│  - Service role key used by backend only (never exposed)                     │
└──────────────────────────────────────────────────────────────────────────────┘

================================================================================
                              EXTERNAL SERVICES
================================================================================

┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│   OpenAI     │  │  Anthropic   │  │   fal.ai     │  │   GitHub API         │
│   API        │  │   API        │  │   / HugFace  │  │   (Octokit)          │
├──────────────┤  ├──────────────┤  ├──────────────┤  ├──────────────────────┤
│ GPT-4o-mini  │  │ Claude       │  │ FLUX Schnell │  │ Per-user OAuth       │
│ (planning +  │  │ Sonnet 4.5   │  │ (image gen)  │  │ Repo creation        │
│  review)     │  │ (generation) │  │              │  │ File uploads         │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────────────┘

================================================================================
                                 DATA FLOW
================================================================================

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

================================================================================
                              KEY DESIGN PRINCIPLES
================================================================================

1. Schema-Driven: Zod schemas validate ALL structured data
2. Per-User Publishing: Each user publishes to THEIR GitHub, not owner's
3. Quality Gates: Code must score ≥75 before publishing
4. Cell-Based Blogs: Structured cells, not markdown strings
5. Fail-Fast: Errors throw immediately, no silent failures
6. Type-Safe: TypeScript + Zod = runtime type safety

================================================================================
```

### Component Responsibilities

#### Presentation Layer (Next.js App Router)
- **Ideas Page** (`/app/ideas/page.tsx`): List all ideas, create new, expand selected
- **Outputs Page** (`/app/outputs/page.tsx`): Browse generated content
- **Output Viewer** (`/app/outputs/[id]/page.tsx`): Render blog/code with format-specific UI

#### API Layer (Next.js Route Handlers)
- **POST /api/expand**: Trigger idea expansion pipeline
- **GET/POST/PUT /api/ideas**: CRUD operations for ideas
- **GET/DELETE /api/outputs**: Manage generated outputs

#### Orchestration Layer (LangGraph)
- **Graph** (`graph.ts`): State machine orchestrating agent flow
- **Router Agent** (`router-agent.ts`): Decide format (blog vs code)
- **Creator Agent** (`creator-agent.ts`): Route to format-specific creator

#### Generation Layer (Format-Specific Creators)
- **Blog Creator** (`blog-creator.ts`): 4-stage cell-based pipeline
- **Code Creator** (`code-creator.ts`): 5-stage pipeline with iteration

#### Data Layer (Supabase)
- **PostgreSQL**: Relational data with Row-Level Security
- **Storage**: (Future) Image uploads
- **Auth**: (Future) User authentication

---

## Data Flow

### Expansion Request Flow

```
User clicks "Expand" on idea
         │
         ▼
┌────────────────────────────────────────┐
│ POST /api/expand { ideaId: "..." }    │
│                                        │
│ 1. Extract ideaId from request body   │
│ 2. Validate ideaId exists (400 if not)│
│ 3. Fetch idea from Supabase            │
│ 4. Create execution record (status:    │
│    'running')                          │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│ LangGraph.invoke({                     │
│   userId: TEST_USER_ID,                │
│   selectedIdea: idea,                  │
│   chosenFormat: null,                  │
│   generatedContent: null               │
│ })                                     │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│ Router Agent                           │
│                                        │
│ Analyzes idea.title + idea.description │
│ Decides: blog_post | github_repo       │
│                                        │
│ Returns: { format, reasoning }         │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│ State update:                          │
│ { chosenFormat: "blog_post" }          │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│ Creator Agent                          │
│                                        │
│ if (chosenFormat === 'blog_post')      │
│   → blogCreator(state)                 │
│ else if (chosenFormat === 'github_repo')│
│   → codeCreator(state)                 │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│ Blog Creator V3 (4 stages)             │
│                                        │
│ Stage 1: Planning                      │
│   - Sections, tone, image specs        │
│                                        │
│ Stage 2: Cell Generation               │
│   - MarkdownCells + ImageCells         │
│   - Social media post                  │
│                                        │
│ Stage 3: Image Generation              │
│   - Replace placeholders with URLs     │
│                                        │
│ Stage 4: Review                        │
│   - Score clarity, accuracy, etc.      │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│ State update:                          │
│ { generatedContent: blogOutput }       │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│ Save to database:                      │
│                                        │
│ INSERT INTO outputs (                  │
│   user_id, idea_id, format,            │
│   content_json, status                 │
│ )                                      │
│                                        │
│ UPDATE executions SET                  │
│   status = 'completed',                │
│   completed_at = NOW()                 │
│                                        │
│ UPDATE ideas SET                       │
│   status = 'expanded'                  │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│ Return response:                       │
│                                        │
│ {                                      │
│   success: true,                       │
│   outputId: "output-uuid",             │
│   execution: { ... },                  │
│   content: { preview, format }         │
│ }                                      │
└────────────────────────────────────────┘
```

### State Management in LangGraph

The graph maintains state using TypeScript interfaces:

```typescript
interface AgentState {
  userId: string;              // Current user ID (TEST_USER_ID in dev)
  selectedIdea: Idea | null;   // User-selected idea to expand
  chosenFormat: string | null; // 'blog_post' | 'github_repo'
  generatedContent: any | null;// Output from creator
  errors: string[];            // Accumulated errors
}
```

**State transitions:**

1. **Initial**: `{ userId, selectedIdea, chosenFormat: null, generatedContent: null }`
2. **After Router**: `{ ..., chosenFormat: 'blog_post' }`
3. **After Creator**: `{ ..., generatedContent: blogOutput }`
4. **End**: Return final state to API endpoint

---

## Agent Architecture

### LangGraph State Machine

```typescript
// src/lib/agents/graph.ts

const workflow = new StateGraph(AgentState)
  .addNode('router', routerAgent)     // Decide format
  .addNode('creator', creatorAgent)   // Generate content
  .addEdge(START, 'router')           // Entry point
  .addEdge('router', 'creator')       // Sequential flow
  .addEdge('creator', END);           // Exit point

const graph = workflow.compile();
```

**Why LangGraph?**
- Visual state transitions (inspect with `.getGraph()`)
- Clear separation of agent responsibilities
- Easy to add conditional edges (future: retry logic)
- Built-in checkpointing for long-running operations

### Router Agent

**File**: `src/lib/agents/router-agent.ts`

**Purpose**: Analyze idea and decide optimal format

**Model**: GPT-4o-mini (T=0.5)
- Fast routing decisions (~500ms)
- Consistent, deterministic choices
- Cost-effective ($0.00005/request)

**Input**: `AgentState.selectedIdea`

**Output**: `{ format: 'blog_post' | 'github_repo', reasoning: string }`

**Decision Logic**:
```typescript
const prompt = `
Analyze this idea and decide the best format:

Title: ${idea.title}
Description: ${idea.description}

Formats:
- blog_post: Written explanations, tutorials, guides
- github_repo: Code demonstrations, tools, libraries

Choose the format that delivers the most value to the audience.
`;

const schema = z.object({
  format: z.enum(['blog_post', 'github_repo']),
  reasoning: z.string().describe('Why this format?')
});

const model = new ChatOpenAI({ model: 'gpt-4o-mini', temperature: 0.5 })
  .withStructuredOutput(schema);

const result = await model.invoke(prompt);
```

### Creator Agent

**File**: `src/lib/agents/creator-agent.ts`

**Purpose**: Route to format-specific creator

**Logic**:
```typescript
export async function creatorAgent(state: AgentState): Promise<AgentState> {
  const { chosenFormat, selectedIdea, userId } = state;

  if (chosenFormat === 'blog_post') {
    const blogOutput = await blogCreator(selectedIdea, userId);
    return { ...state, generatedContent: blogOutput };
  }

  else if (chosenFormat === 'github_repo') {
    const codeOutput = await codeCreatorV2(selectedIdea, userId);
    return { ...state, generatedContent: codeOutput };
  }

  throw new Error(`Unknown format: ${chosenFormat}`);
}
```

---

## Cell-Based Blog System

### The Problem with String Manipulation

**Old approach (V1-V2)**:
```typescript
// Generate markdown string
const markdown = await generateBlog(idea);

// Parse markdown (fragile!)
const sections = markdown.split('\n## ');
const images = markdown.match(/!\[.*?\]\((.*?)\)/g);

// Modify content (brittle!)
markdown = markdown.replace('![image](url)', '<img src="url" />');
```

**Issues:**
- ❌ Regex breaks on edge cases
- ❌ No type safety
- ❌ Hard to validate
- ❌ Platform-specific rendering requires string manipulation

### Cell-Based Architecture

**Core Concept**: Blogs are **arrays of typed cells**, not markdown strings.

```typescript
type BlogCell = MarkdownCell | ImageCell;

type MarkdownCell = {
  cellType: "markdown";
  blocks: Array<
    | { blockType: "h1" | "h2" | "h3"; text: string }
    | { blockType: "paragraph"; text: string }
    | { blockType: "bulletList"; items: string[] }
    | { blockType: "numberedList"; items: string[] }
    | { blockType: "codeBlock"; language: string; lines: string[] }
    | { blockType: "hr" }
  >;
};

type ImageCell = {
  cellType: "image";
  imageUrl: string;
  caption: string;
  placement: "featured" | "inline" | "end";
};
```

**Generation**:
```typescript
// Claude Sonnet 4.5 generates structured cells
const schema = z.object({
  title: z.string(),
  cells: z.array(BlogCellSchema),  // Validated at generation time!
  socialPost: SocialPostSchema
});

const structuredModel = model.withStructuredOutput(schema);
const result = await structuredModel.invoke(prompt);  // Always valid!
```

**Rendering**:
```typescript
// Render to HTML (frontend)
function renderBlogCell(cell: BlogCell): JSX.Element {
  if (cell.cellType === 'markdown') {
    return cell.blocks.map(renderBlock);
  } else {
    return <img src={cell.imageUrl} alt={cell.caption} />;
  }
}

// Render to markdown (export, email, etc.)
function renderBlogToMarkdown(cells: BlogCell[]): string {
  return cells.map(cell => {
    if (cell.cellType === 'markdown') {
      return cell.blocks.map(blockToMarkdown).join('\n');
    } else {
      return `![${cell.caption}](${cell.imageUrl})`;
    }
  }).join('\n\n');
}
```

### Benefits of Cell-Based Approach

| Benefit | Description |
|---------|-------------|
| **Type-safe** | Zod validates at generation; TypeScript types in code |
| **Multi-platform** | Render same cells as HTML, markdown, JSON, PDF, etc. |
| **Atomic edits** | Modify `cells[3].blocks[1].text` without string parsing |
| **Validated** | Invalid structures rejected by schema during generation |
| **Inspectable** | Analyze structure programmatically (word count, images, etc.) |

### Social Media Integration

Blogs automatically include a social media post:

```typescript
type SocialPost = {
  content: string;        // Tweet text ending with [BLOG_URL]
  hashtags: string[];     // 2-3 relevant tags
  platform: "twitter";    // Currently Twitter/X only
  includeImage: boolean;  // Should we include an image?
  imageUrl?: string;      // URL if includeImage=true
  imageCaption?: string;  // Alt text for image
};
```

**Frontend rendering**:
```tsx
<div className="social-share-card">
  <h3>Share on Twitter/X</h3>
  <p>{socialPost.content.replace('[BLOG_URL]', window.location.href)}</p>
  <p className="hashtags">{socialPost.hashtags.map(tag => `#${tag}`).join(' ')}</p>

  {socialPost.imageUrl && (
    <img src={socialPost.imageUrl} alt={socialPost.imageCaption} />
  )}

  <button onClick={() => copyToClipboard(socialPost)}>
    📋 Copy Tweet
  </button>
</div>
```

---

## Code Generation Pipeline

### Multi-Stage Architecture

```
Stage 1: Planning (GPT-4o-mini, ~1200 tokens)
│
│ Input: idea.title + idea.description
│ Output: {
│   outputType: "cli-app" | "web-app" | "library" | "notebook",
│   language: "python" | "typescript" | "javascript",
│   framework?: "react" | "next" | "flask" | "fastapi",
│   architecture: { files: [...], structure: "..." },
│   qualityRubric: { correctness, security, quality, completeness }
│ }
│
▼
Stage 2: Generation (Claude Sonnet 4.5, ~5000 tokens)
│
│ Input: Plan from Stage 1
│ Output: {
│   files: [
│     { path: "main.py", content: "..." },
│     { path: "README.md", content: "..." },
│     { path: "requirements.txt", content: "..." }
│   ],
│   dependencies: ["requests", "click"],
│   instructions: "Run `pip install -r requirements.txt`..."
│ }
│
▼
Stage 3: Review (GPT-4o-mini, ~4000 tokens)
│
│ Input: Generated code + quality rubric
│ Output: {
│   scores: {
│     correctness: 85,
│     security: 90,
│     codeQuality: 80,
│     completeness: 95
│   },
│   overallScore: 87.5,
│   issues: [
│     { file: "main.py", line: 23, severity: "warning", message: "..." }
│   ],
│   recommendation: "approve" | "fix" | "regenerate"
│ }
│
▼
Stage 4: Quality Gate
│
│ If score >= 75 → APPROVE → Go to Stage 5
│ If score < 60  → REGENERATE → Go to Stage 2 (full regen)
│ If score 60-74 → FIX → Fixer Agent (targeted fixes) → Go to Stage 3
│
│ Max 3 iterations to prevent infinite loops
│
▼
Stage 5: GitHub Publish (Octokit)
│
│ 1. Create repository (private by default)
│ 2. Upload files via GitHub API
│ 3. Create initial commit
│ 4. Return { repoUrl, publishedAt }
│
▼
Output: {
  format: "github_repo",
  repoUrl: "https://github.com/username/repo",
  files: [...],
  reviewScore: 87.5,
  iterationCount: 0
}
```

### Iteration Strategy

**Problem**: Initial generation isn't always perfect (score < 75)

**Solution**: Iterative refinement with smart decisions

**Decision Tree**:
```
Score < 60?
  → Full regeneration (throw away everything, start over)

Score 60-74?
  → Targeted fixes:
    - Identify problematic files (from review.issues)
    - Regenerate only those 1-3 files
    - Preserve working files
    - Re-review updated code

Score >= 75?
  → Approve and publish!
```

**Why this works:**
- **Cost-effective**: Fix 2 files, not 10
- **Preserves good work**: Don't throw away what's working
- **Prevents loops**: Max 3 iterations, then force approve

**Cost comparison:**
- Full regen: $0.015 (5000 tokens)
- Targeted fix: $0.004 (1300 tokens)
- **Savings**: ~73% per iteration

---

## Database Schema

**See [DATABASE.md](./DATABASE.md) for the complete database setup and management guide.**

This section provides a high-level overview. For detailed information about:
- Initial database setup
- Table and column definitions
- Row-Level Security (RLS) policies
- Usage tracking & credit system
- Management scripts and operations
- Backup & recovery procedures

Please refer to [DATABASE.md](./DATABASE.md).

### Entity Relationship Diagram

```
┌──────────────┐
│    users     │
├──────────────┤
│ id (PK)      │──┐
│ email        │  │
│ name         │  │
│ timezone     │  │
│ created_at   │  │
└──────────────┘  │
                  │
         ┌────────┴────────┐
         │                 │
         ▼                 ▼
┌──────────────┐   ┌──────────────┐
│    ideas     │   │   outputs    │
├──────────────┤   ├──────────────┤
│ id (PK)      │   │ id (PK)      │
│ user_id (FK) │   │ user_id (FK) │
│ title        │   │ idea_id (FK) │───┐
│ description  │   │ format       │   │
│ status       │   │ content_json │   │
│ created_at   │   │ preview_text │   │
│ updated_at   │   │ status       │   │
└──────┬───────┘   │ created_at   │   │
       │           └──────────────┘   │
       │                              │
       └──────────────────┬───────────┘
                          │
                          ▼
                  ┌──────────────┐
                  │  executions  │
                  ├──────────────┤
                  │ id (PK)      │
                  │ user_id (FK) │
                  │ idea_id (FK) │
                  │ status       │
                  │ format       │
                  │ started_at   │
                  │ completed_at │
                  │ error_message│
                  │ metadata     │
                  └──────────────┘
```

### Table Schemas

#### `users`
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
```

#### `ideas`
```sql
CREATE TABLE ideas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'expanded', 'archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ideas_user_id ON ideas(user_id);
CREATE INDEX idx_ideas_status ON ideas(status);
```

#### `outputs`
```sql
CREATE TABLE outputs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  format TEXT NOT NULL CHECK (format IN ('blog_post', 'github_repo')),
  content_json JSONB NOT NULL,
  preview_text TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_outputs_user_id ON outputs(user_id);
CREATE INDEX idx_outputs_idea_id ON outputs(idea_id);
CREATE INDEX idx_outputs_format ON outputs(format);
```

**`content_json` structure**:

For `blog_post`:
```json
{
  "title": "Blog Title",
  "cells": [...],
  "markdown": "# Title\n\nParagraph...",
  "wordCount": 1847,
  "readingTimeMinutes": 8,
  "images": [
    { "imageUrl": "https://...", "caption": "..." }
  ],
  "socialPost": {
    "content": "Tweet text [BLOG_URL]",
    "hashtags": ["AI", "MachineLearning"],
    "imageUrl": "https://..."
  },
  "_reviewScore": 88,
  "_sections": ["Introduction", "Main Content", "Conclusion"]
}
```

For `github_repo`:
```json
{
  "repoUrl": "https://github.com/user/repo",
  "files": [
    { "path": "main.py", "content": "..." }
  ],
  "dependencies": ["requests", "click"],
  "instructions": "Setup instructions",
  "metadata": {
    "language": "python",
    "outputType": "cli-app",
    "reviewScore": 87,
    "iterationCount": 1
  }
}
```

#### `executions`
```sql
CREATE TABLE executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  format TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX idx_executions_user_id ON executions(user_id);
CREATE INDEX idx_executions_status ON executions(status);
```

### Row-Level Security (RLS)

All tables have RLS enabled:

```sql
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own ideas"
  ON ideas FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own ideas"
  ON ideas FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Similar policies for all operations on all tables
```

**Note**: RLS enforced via NextAuth session management. Server-side API validates user context before database operations.

---

## API Design

### RESTful Endpoints

#### POST /api/expand

**Purpose**: Trigger idea expansion pipeline

**Request**:
```typescript
{
  ideaId: string;  // UUID of idea to expand (REQUIRED)
}
```

**Response (Success - 200)**:
```typescript
{
  success: true,
  execution: {
    id: string;
    status: "completed";
    selectedIdea: { id: string; title: string };
    format: "blog_post" | "github_repo";
    durationSeconds: number;
    errors: string[];
  },
  content: {
    format: string;
    preview: string;
  },
  outputId: string;  // Use to view at /outputs/[id]
}
```

**Error Responses**:
```typescript
// 400 - Missing ideaId
{ success: false, error: "ideaId is required" }

// 404 - Invalid ideaId
{ success: false, error: "Idea not found: uuid-string" }

// 500 - Pipeline failure
{ success: false, error: "Failed to expand idea", details: "..." }
```

**Implementation**:
```typescript
// src/app/api/expand/route.ts

export async function POST(request: Request) {
  const { ideaId } = await request.json();

  if (!ideaId) {
    return NextResponse.json(
      { success: false, error: 'ideaId is required' },
      { status: 400 }
    );
  }

  // Fetch idea
  const idea = await getIdea(ideaId);
  if (!idea) {
    return NextResponse.json(
      { success: false, error: `Idea not found: ${ideaId}` },
      { status: 404 }
    );
  }

  // Create execution record
  const execution = await createExecution(TEST_USER_ID, ideaId);

  // Run pipeline
  const result = await graph.invoke({
    userId: TEST_USER_ID,
    selectedIdea: idea,
    chosenFormat: null,
    generatedContent: null,
    errors: []
  });

  // Save output
  const output = await saveOutput({
    userId: TEST_USER_ID,
    ideaId,
    format: result.chosenFormat,
    content: result.generatedContent
  });

  // Update execution & idea
  await updateExecution(execution.id, {
    status: 'completed',
    completedAt: new Date()
  });
  await updateIdea(ideaId, { status: 'expanded' });

  return NextResponse.json({
    success: true,
    execution,
    outputId: output.id,
    content: {
      format: output.format,
      preview: extractPreview(output)
    }
  });
}
```

---

## Model Selection Rationale

### The Cost-Quality-Speed Triangle

Every model choice balances three factors:

1. **Cost**: $/1M tokens
2. **Quality**: Output accuracy and capabilities
3. **Speed**: Latency per request

### Current Model Assignments

| Task | Model | Cost/1M Input | Speed | Quality | Why? |
|------|-------|---------------|-------|---------|------|
| **Router** | GPT-4o-mini | $0.15 | Fast (~500ms) | Good | Simple decision, no creativity needed |
| **Blog Planning** | GPT-4o-mini | $0.15 | Fast (<500ms) | Good | Fast structured reasoning |
| **Blog Generation** | Claude Sonnet 4.5 | $3.00 | Moderate (~3s) | Best | Superior writing, handles schemas |
| **Code Planning** | GPT-4o-mini | $0.15 | Fast | Good | Quick architectural decisions |
| **Code Generation** | Claude Sonnet 4.5 | $3.00 | Moderate | Best | Top-rated code quality (LMSYS) |
| **Review** | GPT-4o-mini | $0.15 | Fast | Good | Consistent evaluation, no creativity |
| **Image** | FLUX Schnell | $0.001/img | Fast (~2s) | High | Photorealistic, reliable |

### Why Claude Sonnet 4.5 for Generation?

**Benchmarks** (LMSYS Chatbot Arena, Dec 2025):
- Code generation: #1 across major models
- Creative writing: #2 (excellent quality)
- Following instructions: #1
- Structured output: Excellent (Zod schemas work reliably)

**Cost-effectiveness**:
- $3/1M input vs $15/1M for Opus
- 5000 tokens/request → $0.015/expansion
- Quality difference minimal for blog/code generation

### Temperature Settings Explained

| Task | Temperature | Rationale |
|------|-------------|-----------|
| Router | 0.5 | Consistent decisions, slight creativity |
| Planning | 0.7 | Fast structured reasoning |
| Blog Generation | 0.8 | Creative writing, varied expression |
| Code Generation | 0.7 | Balance between creativity & correctness |
| Review | 0.5 | Consistent evaluations |

**Why not T=0?**
- T=0 is deterministic but can be repetitive
- T=0.5-0.8 allows variety while maintaining quality
- T=1.0+ introduces too much randomness

---

## Security Architecture

### Current State (Development)

**Authentication**: None (using `TEST_USER_ID`)

**API Keys**: Stored in `.env.local` (not committed to git)

**Database**: Supabase with Row-Level Security (bypassed via service role key)

**CORS**: Disabled (all requests from same origin)

### Production Security Plan (Phase 2)

#### Authentication Flow

```
User visits /login
      │
      ▼
NextAuth GitHub OAuth
      │
      ▼
GitHub returns access_token
      │
      ▼
Store encrypted token in credentials table
      │
      ▼
Create session (JWT)
      │
      ▼
All API requests require valid session
      │
      ▼
Extract userId from session.user.id
```

#### Two-Tier Credential System

**Tier 1: Backend Credentials** (Vercel Environment Variables)
- Our API keys (OpenAI, Anthropic, fal.ai)
- Same for all users
- Power the AI generation services

**Tier 2: User Credentials** (Database, Encrypted)
- User's GitHub token (for publishing to their repos)
- Optional: Twitter, LinkedIn, Mastodon tokens
- Encrypted with AES-256-GCM before storage

#### Encryption Implementation

```typescript
// src/lib/crypto/encryption.ts

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encryptToJSON(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    ciphertext,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  });
}

export function decryptFromJSON(encryptedJSON: string): string {
  const { ciphertext, iv, authTag } = JSON.parse(encryptedJSON);

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
```

**Key generation**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Usage Tracking Schema

```sql
CREATE TABLE usage_tracking (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  free_expansions_remaining INT DEFAULT 5,
  expansion_count INT DEFAULT 0,
  total_paid_expansions INT DEFAULT 0
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  amount_cents INT NOT NULL,
  expansions_purchased INT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded'))
);

CREATE TABLE expansion_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  payment_id UUID REFERENCES payments(id),
  credits INT NOT NULL,
  credits_remaining INT NOT NULL
);
```

---

## Performance Optimization

### Current Performance Metrics

| Operation | Duration | Bottleneck |
|-----------|----------|------------|
| Blog expansion (total) | 10-30s | Image generation (6-15s) |
| Code expansion (0 iters) | 8-15s | Code generation (5-8s) |
| Code expansion (2 iters) | 25-45s | Multiple generation + review cycles |

### Optimization Strategies

#### 1. Parallel Image Generation

**Before**:
```typescript
for (const cell of cells) {
  if (cell.cellType === 'image') {
    cell.imageUrl = await generateImage(cell.caption);  // Sequential!
  }
}
```

**After**:
```typescript
const imagePromises = cells
  .filter(c => c.cellType === 'image')
  .map(cell => generateImage(cell.caption));

const images = await Promise.all(imagePromises);  // Parallel!

cells.forEach((cell, i) => {
  if (cell.cellType === 'image') {
    cell.imageUrl = images[imageIndex++];
  }
});
```

**Improvement**: 3 images: 15s → 5s (67% faster)

#### 2. Streaming Responses (Future)

Currently, user waits for entire pipeline to complete. With streaming:

```typescript
// Server-Sent Events (SSE)
async function* streamExpansion(ideaId: string) {
  yield { stage: 'router', status: 'complete', data: { format: 'blog_post' } };
  yield { stage: 'planning', status: 'complete', data: { sections: 5 } };
  yield { stage: 'generation', status: 'running', progress: 30 };
  yield { stage: 'generation', status: 'complete', data: { wordCount: 1847 } };
  yield { stage: 'images', status: 'running', progress: 66 };
  yield { stage: 'images', status: 'complete', data: { count: 3 } };
  yield { stage: 'review', status: 'complete', data: { score: 88 } };
}
```

**Benefit**: User sees progress in real-time, perceived speed improvement

#### 3. Caching Strategies

**Model response caching** (future):
```typescript
const cacheKey = `plan:${hashIdea(idea)}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);  // Instant!
}

const plan = await planningAgent(idea);
await redis.setex(cacheKey, 3600, JSON.stringify(plan));  // Cache 1 hour
return plan;
```

**Image caching**:
- Store generated images in Supabase Storage
- Reuse similar images across blog posts
- User-facing "image library"

---

## Future Production Architecture

### Scalability Roadmap

#### Phase 2: Production Deployment (Weeks 1-4)

```
Current: Localhost with TEST_USER_ID
   │
   ▼
Phase 2.1: NextAuth + GitHub OAuth
   - Real user authentication
   - Session management
   - User-specific data isolation
   │
   ▼
Phase 2.2: Encryption Module
   - Secure credential storage
   - GitHub token encryption
   - Key rotation support
   │
   ▼
Phase 2.3: Usage Tracking + Stripe
   - 5 free expansions per user
   - $1/expansion after that
   - Bundle discounts (10 for $8, 25 for $18.75, 50 for $35)
   - Stripe checkout integration
   │
   ▼
Phase 2.4: Vercel Production Deployment
   - Environment variable management
   - Database migrations
   - Monitoring setup
```

#### Phase 3: Advanced Features (Months 2-3)

```
- Real-time streaming (SSE)
- Image library + reuse
- Blog editing interface (cell-level edits)
- Multi-platform social posts (LinkedIn, Mastodon)
- Code testing pipeline (E2B sandboxing)
- Version control for iterations
```

#### Phase 4: Scale Optimization (Month 4+)

```
- Redis caching layer
- Background job queue (BullMQ)
- Rate limiting (per-user quotas)
- CDN for generated images
- Horizontal scaling (Vercel Edge Functions)
```

### Infrastructure Stack (Production)

| Component | Service | Cost |
|-----------|---------|------|
| **Hosting** | Vercel Pro | $20/month |
| **Database** | Supabase Pro | $25/month |
| **Authentication** | NextAuth (self-hosted) | Free |
| **Payments** | Stripe | 3.5% + $0.30/transaction |
| **Image Storage** | Supabase Storage | $25/month (included) |
| **Monitoring** | Vercel Analytics | $10/month |
| **Email** | Resend | $20/month (10k emails) |
| **Total Fixed** | | $75/month |

**Variable Costs** (per expansion):
- AI APIs: $0.02-0.04
- Stripe fee: $0.30-0.53 (if paid)
- Infrastructure: ~$0.01
- **Total**: $0.03-0.06

**Profit Margin**:
- Single expansion ($1): ~$0.40-0.67 profit (40-67%)
- Bundle 10 ($8): ~$2.50-3.50 profit (31-44%)
- Bundle 50 ($35): ~$13-17 profit (37-49%)

**Break-even**: ~150 paid expansions/month

---

## Appendix: File Reference

### Core Files

| File | Purpose | Lines of Code |
|------|---------|---------------|
| `src/lib/agents/graph.ts` | LangGraph orchestrator | ~80 |
| `src/lib/agents/router-agent.ts` | Format routing | ~100 |
| `src/lib/agents/creator-agent.ts` | Creator routing | ~50 |
| `src/lib/agents/creators/blog/blog-creator.ts` | Blog pipeline | ~350 |
| `src/lib/agents/creators/blog/blog-schemas.ts` | Zod schemas | ~200 |
| `src/lib/agents/creators/code/code-creator.ts` | Code pipeline | ~500 |
| `src/app/api/expand/route.ts` | Expansion API | ~150 |

### Configuration Files

| File | Purpose |
|------|---------|
| `.env.local` | API keys, database credentials |
| `tsconfig.json` | TypeScript configuration |
| `next.config.js` | Next.js configuration |
| `scripts/setup-db.sql` | Database schema |

---

**Last Updated**: January 22, 2026
**Version**: V3 (Cell-Based Architecture)
**Status**: Development (localhost) → Production deployment planned

---

## See Also

- **[DATABASE.md](./DATABASE.md)** - Complete database setup and management guide
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment to Vercel
- **[ADMIN_TOOLS.md](./ADMIN_TOOLS.md)** - Admin tools and user management
- **[ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md)** - Environment configuration reference
- **[README.md](../README.md)** - Project overview and getting started guide

For questions or contributions, see [README.md](./README.md)
