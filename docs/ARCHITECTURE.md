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
- Planning (Gemini Flash) → decides title, sections, tone, image needs
- Generation (Claude Haiku) → creates markdown + up to 3 images with captions
- Review (Gemini Flash) → scores clarity, accuracy, engagement, image relevance

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
| Planning | Gemini Flash | Fast, cheap, good at structure (50% cost savings) |
| Text Generation | Claude Haiku | Excellent writing quality |
| Image Prompts | GPT-4o-mini | Creative prompt engineering |
| Review | Gemini Flash | Fast, consistent evaluation |
| Coding | Claude Sonnet 4.5 | Best at code generation |

**Cost Impact:**
- Planning/Review: $0.075/1M tokens (Gemini) vs $0.15/1M tokens (GPT) = **50% savings**
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
  | 'gpt-5-nano'      // Ultra-cheap planning/review
  | 'gpt-4o-mini'     // Balanced cost/quality
  | 'claude-haiku'    // Fast, excellent writing
  | 'claude-sonnet'   // Best coding/writing
  | 'gemini-flash'    // Fast, cheap, good at structure
  | 'gemini-pro';     // More capable Gemini
```

**Usage:**
```typescript
import { createModel, ModelRecommendations } from './model-factory';

// Recommended way:
const model = createModel(ModelRecommendations.planning, 0.7);

// Explicit way:
const model = createModel('gemini-flash', 0.7);
```

**Automatic Fallbacks:**
- If `GOOGLE_API_KEY` not set → falls back to `gpt-4o-mini`
- Graceful degradation for reliability

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

const model = createModel('gemini-flash');
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
| Planning | Gemini Flash | ~500 | $0.0001 | 2s |
| Text Generation | Claude Haiku | ~2000 | $0.003 | 5s |
| Image Generation (×3) | GPT-4o-mini + fal.ai | ~600 | $0.015 | 15s |
| Review | Gemini Flash | ~800 | $0.0002 | 2s |
| **Total** | | ~3900 | **$0.018** | **24s** |

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
GOOGLE_API_KEY=AIza...             # Gemini models (optional, falls back to GPT)

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

## File Structure

```
src/lib/agents/
├── types.ts                          # Shared types (AgentState, BlogPlan, etc.)
├── model-factory.ts                  # Model selection (Gemini integration)
├── router-agent.ts                   # Format routing
├── creator-agent.ts                  # Creator orchestrator
│
├── creators/
│   ├── blog-creator-v2.ts            # ✨ Multi-stage blog pipeline
│   ├── blog-creator.ts.deprecated    # Old version (kept for reference)
│   ├── mastodon-creator.ts           # Thread creation
│   ├── image-creator.ts              # ✨ Image subagent (refactored)
│   │
│   └── code/
│       ├── types.ts                  # Code-specific types (QualityRubric, etc.)
│       ├── code-creator-v2.ts        # ✨ Code orchestrator with iteration
│       ├── planning-agent.ts         # ✨ Enhanced with rubrics
│       ├── generation-agent.ts       # Code generation
│       ├── critic-agent.ts           # ✨ Review with actionable feedback
│       └── fixer-agent.ts            # ✨ Targeted file fixes
│
└── publishers/
    ├── github-publisher.ts           # Publish code to GitHub
    └── mastodon-publisher.ts         # Publish threads to Mastodon
```

**Legend:**
- ✨ = New or significantly enhanced
- .deprecated = Old version (kept for reference)

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
- **Gemini API:** https://ai.google.dev/tutorials/rest_quickstart
- **Zod Schemas:** https://zod.dev/
- **Structured Outputs:** https://js.langchain.com/docs/integrations/chat/structured_output

---

**Last Updated:** January 21, 2026
**Version:** 2.0 (Multi-Stage Pipeline Architecture)
