# Architecture Documentation

## Overview

The Automated Idea Expansion system uses a multi-agent AI pipeline to transform half-formed ideas into polished content. This document explains the architecture, design decisions, and implementation details.

---

## Core Architecture: Multi-Stage Pipelines

All content types follow a consistent 3-stage pattern:

```
STAGE 1: Planning
  ├─ Analyzes idea
  ├─ Decides structure, tone, sections
  ├─ Determines if images needed
  └─ Creates quality rubric

STAGE 2: Generation
  ├─ Text Generation (main content)
  └─ Image Generation (if needed, as subcomponents)

STAGE 3: Review
  ├─ Evaluates against quality rubric
  ├─ Provides scores by category
  └─ Recommends: approve / revise / regenerate

OPTIONAL STAGE 4: Iteration
  └─ Fix specific issues or regenerate (code only, for now)
```

---

## Content Types

### 1. Blog Posts (`blog_post`)

**Purpose:** Long-form articles (1000-2000 words) with optional images

**Pipeline:**
- Planning (GPT-4o-mini) → decides title, sections, tone, image needs
- Generation (Claude Haiku) → creates markdown + up to 3 images with captions
- Review (GPT-4o-mini) → scores clarity, accuracy, engagement, image relevance

**Features:**
- Context-aware image generation (images understand blog content)
- Smart placement (intro, sections, conclusion)
- Automatic captions and alt text
- Cost-optimized model selection

**Files:**
- `src/lib/agents/creators/blog-creator-v2.ts` - Main orchestrator
- `src/lib/agents/creators/image-creator.ts` - Image subagent
- `src/lib/agents/model-factory.ts` - Model selection

### 2. Mastodon Threads (`twitter_thread`)

**Purpose:** Social media threads (5-10 posts, 500 chars each) with optional hero image

**Pipeline:**
- Planning → decides hook, length, key points, hero image
- Generation → creates posts + optional hero image
- Review → scores hook strength, flow, engagement

**Features:**
- Character count validation (≤500 per post)
- Hook optimization (first post is most important)
- Optional hero image for post #1
- Publishing to Mastodon (when configured)

**Files:**
- `src/lib/agents/creators/mastodon-creator.ts`

### 3. Code Projects (`github_repo`)

**Purpose:** Interactive code (Python/JS/TS notebooks, CLI tools, web apps)

**Pipeline (Advanced):**
- Planning (GPT-5 Nano) → decides language, framework, architecture + quality rubric
- Generation (Claude Sonnet 4.5) → creates all files
- Review (GPT-5 Nano) → evaluates correctness, security, quality, completeness
- **Iteration Loop** (unique to code):
  - If score < 75: Fix specific files (Fixer Agent) OR regenerate all
  - Re-review after fixes
  - Maximum 5 iterations
  - Early stopping if quality acceptable

**Features:**
- Targeted fixes (only fix 1-3 files, not entire project)
- Quality rubrics with 4 dimensions
- Automatic GitHub publishing
- Cost-optimized (fixes save 60-80% vs full regeneration)

**Files:**
- `src/lib/agents/creators/code/code-creator-v2.ts` - Orchestrator
- `src/lib/agents/creators/code/planning-agent.ts` - Enhanced planning
- `src/lib/agents/creators/code/generation-agent.ts` - Code generation
- `src/lib/agents/creators/code/critic-agent.ts` - Review with actionable feedback
- `src/lib/agents/creators/code/fixer-agent.ts` - Targeted file fixes

---

## Key Design Decisions

### Decision 1: Images as Components, Not Formats

**Old Architecture:**
```
Router → blog | thread | code | IMAGE ❌
```

**New Architecture:**
```
Router → blog (can include images) | thread (can include hero image) | code
```

**Why?**
- Images aren't a final deliverable format
- They're **visual enhancements** that support other formats
- Allows blogs/threads to be more expressive
- Reduces format fragmentation

### Decision 2: Multi-Stage Pipelines for All Content

**Why separate planning from generation?**
- **Better quality**: Planning forces structured thinking
- **Consistency**: Same evaluation criteria every time
- **Transparency**: User can see reasoning
- **Extensibility**: Easy to add human-in-the-loop approval

**Why add a review stage?**
- **LLMs make mistakes**: Catch bugs/errors before publishing
- **Quality gates**: Ensure minimum standards
- **Feedback loops**: Review informs fixes/regeneration

### Decision 3: Model Diversity (Not One-Size-Fits-All)

**Model Selection by Task:**
| Task | Model | Why? |
|------|-------|------|
| Planning | GPT-4o-mini | Fast, cost-effective, good at structure |
| Text Generation | Claude Haiku | Excellent writing quality |
| Image Prompts | GPT-4o-mini | Creative prompt engineering |
| Review | GPT-4o-mini | Fast, consistent evaluation |
| Coding | Claude Sonnet 4.5 | Best at code generation |

**Cost Impact:**
- Planning/Review: GPT-4o-mini is fast and cost-effective ($0.15/1M input)
- Writing: Claude Haiku quality >> GPT-4o-mini at similar cost
- Coding: Claude Sonnet worth the premium ($3/1M input)

### Decision 4: Iteration Loops (Code Only, For Now)

**Why only for code?**
- Code quality is **measurable** (syntax errors, security issues)
- Code has clear **correctness criteria**
- Blogs/threads are more subjective (human judgment needed)

**Future:** Could add iteration to blogs/threads if quality issues persist.

---

## Agent System Architecture

### Router Agent

**Responsibility:** Choose the best format for an idea

**Decision Logic:**
1. If ML/AI keywords → `github_repo` (code exploration)
2. If "build X" or "implement Y" → `github_repo` (tool/demo)
3. If hands-on/experimental → `github_repo` (interactive value)
4. If conceptual/explanatory → `blog_post`
5. If quick tips/insights → `twitter_thread`
6. When uncertain → prefer code (more valuable for technical ideas)

**Files:** `src/lib/agents/router-agent.ts`

### Creator Agent (Orchestrator)

**Responsibility:** Route to format-specific creator

**Flow:**
```
Creator Agent receives:
  ├─ Idea (from Judge)
  └─ Format (from Router)

Routes to:
  ├─ createBlogV2() for blog_post
  ├─ createMastodonThread() for twitter_thread
  └─ createCodeProjectV2() for github_repo
```

**Files:** `src/lib/agents/creator-agent.ts`

### Image Generation Subagent

**Responsibility:** Generate images as components (NOT standalone creator)

**Functions:**
- `createImagePrompt(spec, context)` - Create detailed prompt from concept + content context
- `generateImage(prompt, aspectRatio)` - Generate actual image via API
- `generateImageCaption(prompt, concept)` - Create alt text
- `generateImageForContent(spec, context)` - Complete pipeline

**API Priority:**
1. fal.ai (FLUX Schnell) - fast, generous free tier
2. Hugging Face (SDXL) - free tier
3. Replicate (FLUX) - paid but cheap

**Files:** `src/lib/agents/creators/image-creator.ts`

---

## Model Factory

**Purpose:** Centralized model selection for consistent, cost-optimized AI usage

**Supported Models:**
```typescript
type ModelType =
  | 'gpt-4o-mini'     // Fast, cost-effective ($0.15/1M input)
  | 'claude-haiku'    // Fast, excellent writing ($0.25/1M input)
  | 'claude-sonnet';  // Best coding/writing ($3/1M input)
```

**Usage:**
```typescript
import { createModel, IMAGE_PROMPT_MODEL } from './model-factory';

// Use the recommended constant for image prompts:
const model = createModel(IMAGE_PROMPT_MODEL, 0.9);

// Or be explicit:
const model = createModel('gpt-4o-mini', 0.7);
```

**Files:** `src/lib/agents/model-factory.ts`

---

## Structured Outputs with Zod

**Problem:** LLMs sometimes return invalid JSON, requiring complex parsing/validation

**Solution:** Use LangChain's `withStructuredOutput()` + Zod schemas

**Example:**
```typescript
import { z } from 'zod';

const BlogPlanSchema = z.object({
  title: z.string(),
  sections: z.array(z.string()),
  tone: z.string(),
  targetWordCount: z.number(),
  includeImages: z.boolean(),
  imageSpecs: z.array(ImageSpecSchema),
});

const model = createModel('gpt-4o-mini');
const structuredModel = model.withStructuredOutput(BlogPlanSchema);

const plan = await structuredModel.invoke(prompt);
// ✅ Guaranteed valid BlogPlan, no parsing needed!
```

**Benefits:**
- ✅ **Zero JSON parsing errors** (schema guarantees validity)
- ✅ **Type safety** (TypeScript knows the structure)
- ✅ **~340 lines of error handling removed** (compared to manual parsing)
- ✅ **Cleaner code** (no try/catch blocks for parsing)

**Used in:**
- Blog planning, draft, review
- Code planning, review
- Thread planning, draft, review

---

## Quality Rubrics

**Purpose:** Consistent, measurable evaluation criteria

**Structure:**
```typescript
interface QualityRubric {
  correctness: {
    weight: 0.4,                    // 40% of total score
    criteria: [
      "Code runs without errors",
      "All functions handle edge cases",
      "Input validation implemented"
    ]
  },
  security: { weight: 0.3, criteria: [...] },
  codeQuality: { weight: 0.2, criteria: [...] },
  completeness: { weight: 0.1, criteria: [...] }
}
```

**Scoring Method:**
1. Evaluate each criterion (0-100)
2. Calculate category score = average of criteria in that category
3. Overall score = weighted sum of category scores

**Example:**
- Correctness: 90 (3 criteria: 95, 85, 90)
- Security: 85 (2 criteria: 80, 90)
- Code Quality: 80 (4 criteria: 75, 80, 85, 80)
- Completeness: 70 (2 criteria: 65, 75)

**Overall = (90 × 0.4) + (85 × 0.3) + (80 × 0.2) + (70 × 0.1) = 84/100**

---

## Cost Analysis

### Blog Post Creation

| Stage | Model | Tokens | Cost | Duration |
|-------|-------|--------|------|----------|
| Planning | GPT-4o-mini | ~500 | $0.0002 | 2s |
| Text Generation | Claude Haiku | ~2000 | $0.003 | 5s |
| Image Generation (×3) | GPT-4o-mini + fal.ai | ~600 | $0.015 | 15s |
| Review | GPT-4o-mini | ~800 | $0.0003 | 2s |
| **Total** | | ~3900 | **$0.019** | **24s** |

### Code Project Creation (with iteration)

| Scenario | Iterations | Cost | Duration |
|----------|-----------|------|----------|
| Best case (no fixes) | 0 | $0.027 | 30s |
| Average case (2 fixes) | 2 | $0.061 | 60s |
| Worst case (5 iterations) | 5 | $0.110 | 120s |

**Cost Savings from Targeted Fixes:**
- Full regeneration: $0.035 per attempt
- Targeted fix (2 files): $0.015 per attempt
- **Savings: 60-70%**

---

## Environment Variables

```bash
# AI Models
OPENAI_API_KEY=sk-...              # GPT models
ANTHROPIC_API_KEY=sk-ant-...       # Claude models

# Image Generation
FAL_KEY=...                        # fal.ai (primary)
HUGGINGFACE_API_KEY=hf_...         # Hugging Face (fallback)
REPLICATE_API_TOKEN=r8_...         # Replicate (fallback)

# Publishing
GITHUB_TOKEN=ghp_...               # For code publishing
GITHUB_USERNAME=your_username      # For GitHub repos
MASTODON_ACCESS_TOKEN=...          # For thread publishing
MASTODON_INSTANCE_URL=https://...  # Mastodon instance

# Database
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## File Structure → Implementation Map

**How the architecture maps to actual code:**

```
src/
├── app/                              # Next.js frontend
│   ├── api/
│   │   ├── ideas/route.ts            # Create/list ideas (starts here 📥)
│   │   └── expand/route.ts           # Trigger pipeline (🚀 entry point)
│   ├── page.tsx                      # Idea input UI
│   └── outputs/page.tsx              # View generated content
│
├── lib/
│   ├── db/
│   │   ├── schemas.ts                # ✅ Cleaned! IdeaSchema only
│   │   ├── types.ts                  # DB interfaces (Idea, Output)
│   │   ├── queries.ts                # Supabase CRUD operations
│   │   └── supabase.ts               # DB client
│   │
│   ├── agents/                       # 🧠 The AI pipeline
│   │   ├── types.ts                  # Agent state, plans, rubrics
│   │   ├── model-factory.ts          # ✅ Cleaned! Model selection
│   │   ├── judge-agent.ts            # 📊 Pick best idea
│   │   ├── router-agent.ts           # 🎯 Choose format
│   │   ├── creator-agent.ts          # Orchestrates format creators
│   │   │
│   │   ├── creators/
│   │   │   ├── blog-creator-v2.ts    # 📝 3-stage blog pipeline
│   │   │   ├── mastodon-creator-v2.ts# 🦣 3-stage thread pipeline
│   │   │   ├── image-creator.ts      # 🎨 Image generation subagent
│   │   │   │
│   │   │   └── code/                 # 💻 Code creation (advanced)
│   │   │       ├── types.ts          # Code-specific types
│   │   │       ├── code-creator-v2.ts# 5-stage orchestrator
│   │   │       ├── planning-agent.ts # Plan with quality rubrics
│   │   │       ├── generation-agent.ts# Generate all files
│   │   │       ├── critic-agent.ts   # Review with scoring
│   │   │       └── fixer-agent.ts    # Fix specific files
│   │   │
│   │   └── publishers/
│   │       ├── github-publisher.ts   # Publish to GitHub
│   │       └── mastodon-publisher.ts # Publish threads
│   │
│   └── logging/
│       └── logger.ts                 # Centralized logger with context
│
└── docs/
    ├── ARCHITECTURE.md               # 👈 This file (complete guide)
    └── README.md                     # Quick start

```

**The Pipeline Flow Through Files:**

```
1. User creates idea
   └─ app/page.tsx → api/ideas/route.ts → db/queries.ts

2. User clicks "Expand"
   └─ api/expand/route.ts (📥) creates logger, starts pipeline

3. Judge selects best idea
   └─ agents/judge-agent.ts (📊) evaluates all pending ideas

4. Router chooses format
   └─ agents/router-agent.ts (🎯) decides blog/thread/code

5. Creator orchestrates format-specific pipeline
   └─ agents/creator-agent.ts routes to:
      ├─ creators/blog-creator-v2.ts (📝)
      ├─ creators/mastodon-creator-v2.ts (🦣)
      └─ creators/code/code-creator-v2.ts (💻)

6. Save output
   └─ db/queries.ts stores generated content

7. User views result
   └─ app/outputs/page.tsx displays notebook
```

---

## Logging Architecture

### Logger Utility

The system uses a centralized `Logger` class for consistent, traceable logging across all agents.

**Location:** `src/lib/logging/logger.ts`

**Features:**
- Execution ID generation and tracking
- ISO timestamps on all logs
- Context propagation (userId, ideaId, stage, subStage)
- Token usage tracking
- Stage duration measurement
- Child logger creation for sub-stages

**Usage Example:**
```typescript
import { createLogger } from '@/lib/logging/logger';

const logger = createLogger({
  executionId: 'exec-abc123',
  userId: 'user-456',
  ideaId: 'idea-789',
  stage: 'blog-creator',
});

logger.info('📋 STAGE 1: Planning', { model: 'gpt-4o-mini' });
logger.trackTokens({ input: 500, output: 1200, model: 'gpt-4o-mini' });

const planLogger = logger.child({ subStage: 'planning' });
planLogger.info('Plan created', { sections: 5 });
```

### Log Format

**Human-Readable (Current):**
```
[2026-01-21T15:30:45.123Z] INFO  [exec-abc123] [stage/substage] Message
   key: value
   key2: value2
```

**Future: Structured JSON:**
```json
{
  "timestamp": "2026-01-21T15:30:45.123Z",
  "level": "INFO",
  "executionId": "exec-abc123",
  "userId": "user-456",
  "ideaId": "idea-789",
  "stage": "stage",
  "subStage": "substage",
  "message": "Message",
  "data": { "key": "value" }
}
```

### Log Levels

- **DEBUG:** Detailed internal state (model parameters, prompt details, schema validation)
- **INFO:** Key events (stage start/end, decisions made, metrics)
- **WARN:** Recoverable issues (API key missing, using fallback, quality score low)
- **ERROR:** Failures (exceptions, invalid state, API errors)

### Tracing Executions

Each pipeline run gets a unique execution ID (e.g., `exec-abc123`). To trace a specific run:

1. Find the execution ID from the first log line
2. Filter/search logs for that ID
3. Follow the progression:
   ```
   [api-endpoint] → [judge-agent] → [router-agent] → [creator] → [api-endpoint]
   ```

### Context Propagation

The logger is passed through the LangGraph state, making it available to all agents:

**Flow:**
```
API Endpoint creates logger
    ↓
Graph receives logger in initial state
    ↓
Judge Agent: logger.child({ stage: 'judge-agent' })
    ↓
Router Agent: logger.child({ stage: 'router-agent' })
    ↓
Creator Agent: logger.child({ stage: 'creator-agent' })
    ↓
Format-specific creator: createLogger({ ideaId, stage: 'blog-creator' })
```

### Token Tracking

Each stage tracks LLM token usage:

```typescript
// After LLM call
logger.trackTokens({
  input: 500,
  output: 1200,
  model: 'gpt-4o-mini',
  cost: 0.00025  // optional
});

// At pipeline end
const totalTokens = logger.getTotalTokens();
// Returns: { input: 2500, output: 5600, total: 8100 }
```

### Performance Metrics

Each logger tracks execution duration:

```typescript
const logger = createLogger({ stage: 'blog-creator' });
// ... work happens ...
const duration = logger.getDuration();  // milliseconds since creation
```

### Emoji Quick Reference

Logs use emojis for quick visual scanning. Here are the key ones:

**Pipeline Flow:**
- 📥 Request received (API) → 🚀 Pipeline starting → 📊 Judging ideas → 🎯 Routing format
- 📝 Blog creation | 🦣 Thread creation | 💻 Code creation

**Creator Stages:**
- 📋 Planning → 🛠️ Generation → 🔍 Review → 🔄 Iteration (code only)
- 🎨 Image generation (within blogs/threads)

**Status:**
- ✅ Success | ❌ Error | ⚠️ Warning | 💾 Saved
- 💰 Token usage | 🐛 Issues found

**Pro tip:** Search logs by emoji to jump to specific stages (e.g., search "🔍" to see all reviews).

---

## Output Structure

All generated content follows a **cell-based notebook format**, inspired by Jupyter notebooks. This makes outputs:
- **Structured**: Clear separation of content types
- **Portable**: Easy to transform to different formats
- **Traceable**: Each cell has metadata

**Cell Types:**
```typescript
// Markdown cells: Headers, paragraphs, lists, quotes
{ cellType: 'markdown', blocks: [...] }

// Code cells: Executable code lines
{ cellType: 'code', language: 'python', lines: [...] }

// Image cells: Generated images with captions
{ cellType: 'image', url: '...', caption: '...', alt: '...' }
```

**Philosophy: "Atoms, not strings"**
Instead of dumping raw markdown, the LLM must structure content into atomic blocks (h1, h2, paragraph, bulletList, etc.). This forces better structure and makes validation easy.

**Files:** `src/lib/db/types.ts` (output interfaces), `src/lib/agents/types.ts` (creator schemas)

---

## Testing

### Manual Testing

1. **Test Blog Creation:**
```bash
# Create idea
curl -X POST http://localhost:3000/api/ideas \
  -H 'Content-Type: application/json' \
  -d '{"content": "The Psychology of Color in UI Design"}'

# Trigger expansion
curl -X POST http://localhost:3000/api/expand \
  -H 'Content-Type: application/json' \
  -d '{"ideaId": "..."}'
```

2. **Test Code Creation:**
```bash
# Create code-oriented idea
curl -X POST http://localhost:3000/api/ideas \
  -H 'Content-Type: application/json' \
  -d '{"content": "Build a sentiment analysis tool using transformers"}'

# Trigger expansion (should route to github_repo)
curl -X POST http://localhost:3000/api/expand \
  -H 'Content-Type: application/json' \
  -d '{"ideaId": "..."}'
```

3. **Check Output:**
- Navigate to `http://localhost:3000/outputs`
- Click on generated output
- Verify format, quality, images (for blogs)

### Automated Testing (Future)

Suggested test cases:
- Router decision accuracy (blog vs code vs thread)
- Planning agent schema validation
- Review scoring consistency
- Image generation reliability
- Iteration loop termination

---

## Future Enhancements

### Short-term (Next 2 Weeks)
1. ✅ Add iteration loop to blog/thread creators (similar to code)
2. ✅ Create mastodon-creator-v2.ts with multi-stage pipeline
3. ✅ Add metrics dashboard (iteration counts, scores, costs)
4. ✅ Fine-tune quality rubrics based on real data

### Medium-term (Next Month)
1. Human-in-the-loop approval for plans (before generation)
2. A/B testing for different prompts/models
3. Caching for expensive operations (image generation)
4. Batch processing for multiple ideas

### Long-term (Next Quarter)
1. Custom rubrics per user/project
2. Learning from user feedback (preference learning)
3. Multi-modal outputs (video, audio, interactive demos)
4. Integration with more platforms (LinkedIn, Medium, Dev.to)

---

## Troubleshooting

### Common Issues

**Issue: "Module not found: @langchain/google-genai"**
```bash
# Fix:
npm install @langchain/google-genai --legacy-peer-deps
```

**Issue: Blog creation taking > 2 minutes**
- Expected for blogs with 3 images (image generation is slow)
- Check fal.ai API key is valid
- Consider reducing image count in planning stage

**Issue: Router always chooses github_repo**
- Check idea wording - avoid ML/AI keywords if you want blog
- Add explicit "blog post" or "article" to idea description
- Router prefers code for technical topics (by design)

**Issue: Code review scores always low**
- Check quality rubric criteria (may be too strict)
- Adjust thresholds in code-creator-v2.ts
- Review critic-agent.ts prompts

---

## Additional Resources

- **LangChain Docs:** https://js.langchain.com/docs
- **Anthropic API:** https://docs.anthropic.com/en/api/getting-started
- **Zod Schemas:** https://zod.dev/
- **Structured Outputs:** https://js.langchain.com/docs/integrations/chat/structured_output

---

**Last Updated:** January 22, 2026
**Version:** 2.1 (Consolidated Documentation + Codebase Cleanup)
