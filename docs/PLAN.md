# Automated Idea Expansion - System Documentation

## 🎯 Overview

An AI-powered system that transforms quick ideas into polished content:
- **Blog Posts**: Cell-based articles with images and social media posts
- **Code Projects**: Working GitHub repositories with tests and documentation

**Last Updated:** January 22, 2026
**Current Version:** Cell-Based Architecture

---

## 📊 Current System Architecture

### High-Level Pipeline Flow

```
┌──────────────────────────────────────────────────────────┐
│                   USER SUBMITS IDEA                      │
│                  (via Web UI /ideas page)                │
│                  Title + Optional Description            │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│              USER SELECTS IDEA TO EXPAND                 │
│                  (Click "Expand" button)                 │
│                                                          │
│  Sends POST /api/expand with:                            │
│  { "ideaId": "..." }                                     │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│              API ENDPOINT: /api/expand                   │
│            (src/app/api/expand/route.ts)                 │
│                                                          │
│  1. Validates ideaId (required)                          │
│  2. Fetches idea from Supabase                           │
│  3. Creates execution record                             │
│  4. Invokes LangGraph pipeline with selectedIdea         │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│             LANGGRAPH ORCHESTRATOR                       │
│              (src/lib/agents/graph.ts)                   │
│                                                          │
│  Stateful graph with 2 sequential nodes:                 │
│  START → Router → Creator → END                          │
│                                                          │
│  State contains:                                         │
│  - userId                                                │
│  - selectedIdea (passed from API)                        │
│  - chosenFormat (from router)                            │
│  - generatedContent (from creator)                       │
│  - errors[]                                              │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│                  ROUTER AGENT                            │
│              (src/lib/agents/router-agent.ts)            │
│                                                          │
│  Purpose: Decide best output format for idea             │
│                                                          │
│  Input: selectedIdea                                     │
│  Output: chosenFormat ('blog_post' | 'github_repo')      │
│                                                          │
│  Decision Criteria:                                      │
│  - Written explanation → blog_post                       │
│  - Hands-on code demo → github_repo                      │
│  - Educational content → blog_post                       │
│  - Technical implementation → github_repo                │
│                                                          │
│  Model: GPT-4o-mini (fast routing, T=0.5)                │
│  Uses: Structured output with Zod schema                 │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│                  CREATOR AGENT                           │
│            (src/lib/agents/creator-agent.ts)             │
│                                                          │
│  Routes to appropriate creator based on format:          │
│  - blog_post   → Blog Creator (cell-based)               │
│  - github_repo → Code Creator (multi-stage)              │
└───────────────────────┬──────────────────────────────────┘
                        │
           ┌────────────┴────────────┐
           ▼                         ▼
  ┌─────────────────┐       ┌─────────────────┐
  │  BLOG CREATOR   │       │  CODE CREATOR   │               
  └─────────────────┘       └─────────────────┘
           │                         │
           ▼                         ▼
    Blog Post Output          GitHub Repo Output
```

---

## 📝 Blog Creator V3 - Cell-Based Architecture

### Philosophy: "Schemas All The Way Down"

Instead of generating markdown strings, we generate **structured cells** that are:
- ✅ Validated at generation time
- ✅ Rendered differently for different platforms
- ✅ Manipulated/edited atomically
- ✅ Analyzed programmatically

### Pipeline Stages

```
                    BLOG CREATOR V3
              (blog-creator.ts + blog-schemas.ts)

┌──────────────────────────────────────────────────────────┐
│  STAGE 1: PLANNING                                       │
│  Model: GPT-5 Nano (T=1.0, only supported temp)          │
│                                                          │
│  Decisions:                                              │
│  - Title (can refine original)                           │
│  - 3-5 main sections                                     │
│  - Tone (educational/casual/technical)                   │
│  - Target word count (1000-2000)                         │
│  - Images (0-3 with placement/concept/style)             │
│                                                          │
│  Output: BlogPlan (validated with Zod)                   │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 2: CELL-BASED GENERATION                          │
│  Model: Claude Sonnet 4.5 (T=0.8, best writing)          │
│                                                          │
│  Generates Array<BlogCell> where each cell is:           │
│                                                          │
│  1. MarkdownCell:                                        │
│     {                                                    │
│       cellType: "markdown",                              │
│       blocks: [                                          │
│         { blockType: "h2", text: "..." },                │
│         { blockType: "paragraph", text: "..." },         │
│         { blockType: "bulletList", items: [...] },       │
│         { blockType: "codeBlock", language, lines }      │
│       ]                                                  │
│     }                                                    │
│                                                          │
│  2. ImageCell:                                           │
│     {                                                    │
│       cellType: "image",                                 │
│       imageUrl: "[PLACEHOLDER-1]",                       │
│       caption: "Detailed description",                   │
│       placement: "featured" | "inline" | "end"           │
│     }                                                    │
│                                                          │
│  Also generates: SocialPost                              │
│     {                                                    │
│       content: "Tweet ending with [BLOG_URL]",           │
│       hashtags: ["tag1", "tag2"],                        │
│       includeImage: true/false                           │
│     }                                                    │
│                                                          │
│  Output: BlogGeneration (title + cells + socialPost)     │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 3: IMAGE GENERATION                               │
│  Service: fal.ai FLUX Schnell (fast, high quality)       │
│                                                          │
│  For each ImageCell with [PLACEHOLDER-N]:                │
│  1. Generate image using caption + imageSpec             │
│  2. Replace placeholder with actual URL                  │
│  3. If generation fails, mark as empty (skip in UI)      │
│                                                          │
│  Features:                                               │
│  - Parallel generation (where possible)                  │
│  - Fallback to Hugging Face/Replicate if fal.ai fails    │
│  - Caption optimization with GPT-4o-mini                 │
│                                                          │
│  Output: Updated cells with real image URLs              │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 3.5: SOCIAL MEDIA IMAGE (Optional)                │
│  Triggered if: socialPost.includeImage === true          │
│                                                          │
│  Strategy:                                               │
│  1. If blog has images → Reuse first blog image          │
│  2. Otherwise → Generate dedicated social image          │
│     - Concept: blog title                                │
│     - Style: "eye-catching, social media optimized"      │
│     - Aspect ratio: 16:9 (Twitter/X optimized)           │
│                                                          │
│  Output: socialImage { imageUrl, caption }               │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 4: REVIEW                                         │
│  Model: GPT-4o-mini (T=0.5, fast evaluation)             │
│                                                          │
│  Evaluates:                                              │
│  - Clarity (0-100): Clear structure and writing?         │
│  - Accuracy (0-100): Technically correct?                │
│  - Engagement (0-100): Engaging and well-written?        │
│  - Structure (0-100): Good use of cells and blocks?      │
│                                                          │
│  Overall Score = Average of category scores              │
│                                                          │
│  Recommendation:                                         │
│  - "approve"     if score ≥ 75                           │
│  - "revise"      if score 60-74                          │
│  - "regenerate"  if score < 60                           │
│                                                          │
│  Output: BlogReview (scores + recommendation)            │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  FINAL OUTPUT                                            │
│                                                          │
│  {                                                       │
│    title: string,                                        │
│    cells: Array<MarkdownCell | ImageCell>,               │
│    markdown: string,  // For backward compatibility      │
│    wordCount: number,                                    │
│    readingTimeMinutes: number,                           │
│    images: GeneratedImage[],                             │
│    socialPost: {                                         │
│      content: string,     // Contains [BLOG_URL]         │
│      hashtags: string[],                                 │
│      platform: "twitter",                                │
│      imageUrl?: string,   // If includeImage=true        │
│      imageCaption?: string                               │
│    },                                                    │
│    _reviewScore: number,                                 │
│    _sections: string[]                                   │
│  }                                                       │
└──────────────────────────────────────────────────────────┘
```

### Cell Types Explained

**MarkdownCell** contains structured blocks (NOT raw markdown):
- `h1`, `h2`, `h3` - Headers with text
- `paragraph` - Body text
- `bulletList`, `numberedList` - Lists with items array
- `codeBlock` - Code with language and lines array
- `hr` - Horizontal rule (section separator)

**ImageCell** is a first-class content type:
- `imageUrl` - URL or `[PLACEHOLDER-N]` during generation
- `caption` - Image description (also used for generation)
- `placement` - `featured` (hero), `inline` (between sections), `end` (conclusion)

### Why Cell-Based?

**Before (String Manipulation):**
```typescript
// Generate markdown string
const markdown = "## Section\n\nParagraph...\n\n![image](url)";

// Parse markdown (error-prone)
const sections = markdown.split('\n##');

// Modify content (brittle)
markdown = markdown.replace('![image](url)', '<img src="url" />');
```

**After (Structured Cells):**
```typescript
// Generate structured cells (validated)
const cells = [
  { cellType: "markdown", blocks: [
    { blockType: "h2", text: "Section" },
    { blockType: "paragraph", text: "Paragraph..." }
  ]},
  { cellType: "image", imageUrl: "url", caption: "..." }
];

// Render for different targets
const html = renderBlogToHTML(cells);
const markdown = renderBlogToMarkdown(cells);
const json = JSON.stringify(cells); // Already structured!

// Atomic manipulation
cells[2].blocks[0].text = "Updated heading";
```

---

## 💻 Code Creator V2 - Multi-Stage Pipeline

```
                    CODE CREATOR
                  (code-creator.ts)

┌──────────────────────────────────────────────────────────┐
│  STAGE 1: PLANNING                                       │
│  Model: GPT-4o-mini (T=0.7)                              │
│                                                          │
│  Decisions:                                              │
│  - Output type (notebook/CLI/webapp/library)             │
│  - Language (Python/Node.js/TypeScript)                  │
│  - Architecture (file structure)                         │
│  - Dependencies                                          │
│  - Quality rubric                                        │
│                                                          │
│  Output: CodePlan                                        │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 2: GENERATION                                     │
│  Model: Claude Sonnet 4.5 (T=0.7, best code quality)     │
│                                                          │
│  Generates:                                              │
│  - All code files (based on plan)                        │
│  - README with setup instructions                        │
│  - package.json / requirements.txt                       │
│  - Tests (if applicable)                                 │
│                                                          │
│  Output: CodeDraft (files, dependencies, instructions)   │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 3: REVIEW                                         │
│  Model: GPT-4o-mini (T=0.5)                              │
│                                                          │
│  Evaluates:                                              │
│  - Correctness (40%): Logic, syntax, completeness        │
│  - Security (30%): No vulnerabilities, safe patterns     │
│  - Code Quality (20%): Style, naming, structure          │
│  - Completeness (10%): README, tests, docs               │
│                                                          │
│  Overall Score = Weighted average                        │
│                                                          │
│  Recommendation:                                         │
│  - "approve"     if score ≥ 75                           │
│  - "fix"         if score 60-74 (targeted fixes)         │
│  - "regenerate"  if score < 60 (start over)              │
│                                                          │
│  Output: CodeReview                                      │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
                   Score ≥ 75?
                    │        │
                   YES       NO
                    │        │
                    │        ▼
                    │  ┌──────────────────────────┐
                    │  │  STAGE 4: ITERATION      │
                    │  │  Max 3 attempts          │
                    │  │                          │
                    │  │  If score < 60:          │
                    │  │    → Full regenerate     │
                    │  │    → Go to Stage 2       │
                    │  │                          │
                    │  │  If score 60-74:         │
                    │  │    → Targeted fixes      │
                    │  │    → Go to Stage 3       │
                    │  └────────────┬─────────────┘
                    │               │
                    └───────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  STAGE 5: GITHUB PUBLISH                                 │
│  Service: GitHub API via octokit                         │
│                                                          │
│  Steps:                                                  │
│  1. Create repository (private by default)               │
│  2. Upload all files via GitHub API                      │
│  3. Create initial commit                                │
│  4. Return repository URL                                │
│                                                          │
│  Modes:                                                  │
│  - LIVE: Publish to github.com/username/repo             │
│  - DRY_RUN: Simulate (no actual creation)                │
│                                                          │
│  Output: { repoUrl, publishedAt, metadata }              │
└──────────────────────────────────────────────────────────┘
```

---

## 🔧 Model Selection Strategy

### Current Models in Use

| Task | Model | Temperature | Rationale |
|------|-------|-------------|-----------|
| **Router** | GPT-4o-mini | 0.5 | Fast, consistent format routing |
| **Blog Planning** | GPT-5 Nano | 1.0 | Only supported temp; excellent structured reasoning |
| **Blog Generation** | Claude Sonnet 4.5 | 0.8 | Best writing quality, handles complex schemas |
| **Code Planning** | GPT-4o-mini | 0.7 | Fast, good architectural decisions |
| **Code Generation** | Claude Sonnet 4.5 | 0.7 | Top-rated for code (LMSYS benchmarks) |
| **Review (All)** | GPT-4o-mini | 0.5 | Fast, consistent evaluation |
| **Image Captions** | GPT-4o-mini | 0.7 | Creative prompt engineering |
| **Image Generation** | FLUX Schnell | N/A | Fast, high-quality images (fal.ai) |

### Why These Choices?

**GPT-5 Nano** (Planning):
- Specialized for fast, structured reasoning
- Cost-effective for repeated planning calls
- Only supports temperature=1.0 (no choice)

**Claude Sonnet 4.5** (Content & Code):
- Superior writing quality vs GPT models
- Excellent at following complex schemas
- Best code generation benchmarks (LMSYS)
- Handles `withStructuredOutput` reliably

**GPT-4o-mini** (Review & Routing):
- Fast API responses (<1s typical)
- Low cost for high-volume tasks
- Consistent evaluation criteria

**FLUX Schnell** (Images):
- Sub-2s generation time
- High quality photorealistic output
- Reliable via fal.ai (best uptime)

---

## 📂 File Structure

```
src/
├── app/
│   ├── api/
│   │   └── expand/
│   │       └── route.ts              # Main expansion endpoint
│   ├── ideas/
│   │   └── page.tsx                  # Ideas list page
│   └── outputs/
│       ├── page.tsx                  # Outputs list page
│       └── [id]/
│           └── page.tsx              # Output viewer (blogs & code)
│
├── lib/
│   ├── agents/
│   │   ├── graph.ts                  # LangGraph orchestrator
│   │   ├── router-agent.ts           # Format routing
│   │   ├── creator-agent.ts          # Routes to specific creator
│   │   ├── types.ts                  # Agent state types
│   │   └── creators/
│   │       ├── blog/
│   │       │   ├── blog-creator.ts   # Cell-based creator
│   │       │   └── blog-schemas.ts   # Zod schemas for cells
│   │       ├── code/
│   │       │   └── code-creator.ts # Multi-stage code creator
│   │       └── image-creator.ts      # Image generation service
│   │
│   ├── db/
│   │   ├── supabase.ts               # Supabase client
│   │   ├── queries.ts                # Database queries
│   │   ├── schemas.ts                # Zod schemas for DB
│   │   └── types.ts                  # TypeScript types
│   │
│   └── logging/
│       └── logger.ts                 # Structured logging utility
│
└── docs/
    ├── PLAN.md                       # This file
    └── ARCHITECTURE.md               # Detailed system design
```

### Key Files Explained

**graph.ts**: LangGraph orchestrator
- Defines agent pipeline: Router → Creator
- Manages state flow between agents
- Entry point for expansion pipeline

**router-agent.ts**: Format decision maker
- Analyzes idea content
- Chooses blog_post or github_repo
- Uses GPT-4o-mini with structured output

**blog-creator.ts**: Cell-based blog generator
- 4-stage pipeline: Plan → Generate → Images → Review
- Uses cell-based architecture (no markdown strings)
- Generates social media posts automatically

**blog-schemas.ts**: Type definitions for cells
- MarkdownCell, ImageCell, BlogCell union
- SocialPost schema
- Utility functions (renderBlogToMarkdown, calculateWordCount)

**code-creator.ts**: Multi-stage code generator
- 5-stage pipeline with iteration
- Generates complete GitHub repositories
- Quality-driven refinement loop

---

## 🚀 API Usage

### POST /api/expand

Expands a user-selected idea into content.

**Request:**
```json
{
  "ideaId": "uuid-string"  // Required
}
```

**Response (Success):**
```json
{
  "success": true,
  "execution": {
    "id": "execution-uuid",
    "status": "completed",
    "selectedIdea": {
      "id": "idea-uuid",
      "title": "Idea Title"
    },
    "format": "blog_post",
    "durationSeconds": 42,
    "errors": []
  },
  "content": {
    "format": "blog_post",
    "preview": "Blog Post Title"
  },
  "outputId": "output-uuid"  // Use to view at /outputs/[id]
}
```

**Error Cases:**

400 Bad Request (missing ideaId):
```json
{
  "success": false,
  "error": "ideaId is required"
}
```

404 Not Found (invalid ideaId):
```json
{
  "success": false,
  "error": "Idea not found: uuid-string"
}
```

500 Internal Server Error (pipeline failure):
```json
{
  "success": false,
  "error": "Failed to expand idea",
  "details": "Stack trace..."
}
```

---

## 🔍 Troubleshooting

### Common Issues

**1. `withStructuredOutput` returns undefined**

**Symptom:** `TypeError: Cannot read properties of undefined (reading '_zod')`

**Cause:** Model instantiation issue or schema definition problem

**Fix:**
- Ensure direct model instantiation (not factory pattern)
- Verify schema is valid Zod object
- Check model supports structured output (Haiku 4.5+ does NOT)

**2. Image generation fails**

**Symptom:** Blog displays with empty image placeholders

**Cause:** fal.ai API error, invalid prompt, or rate limit

**Fix:**
- Check fal.ai API key in `.env`
- Review image-creator.ts logs for specific error
- Fallback services (Hugging Face/Replicate) may also fail

**3. Blog cells not rendering**

**Symptom:** Blog page shows raw JSON or broken layout

**Cause:** Mismatch between cell structure and rendering logic

**Fix:**
- Verify cells follow BlogCellSchema (blog-schemas.ts)
- Check renderBlogCell function in page.tsx
- Ensure cellType discriminator is correct

**4. Execution stuck in "running" status**

**Symptom:** Execution never completes, no output generated

**Cause:** Uncaught exception in agent pipeline

**Fix:**
- Check server logs for errors
- Verify all required env vars are set
- Review execution record in database for error_message

---

## 🎯 Future Improvements

### Planned Features

1. **Adaptive Image Placement**
   - LLM decides optimal image positions based on content flow
   - Currently fixed at featured/inline/end

2. **Multi-Platform Social Posts**
   - Generate platform-specific posts (Twitter, LinkedIn, Mastodon)
   - Currently only Twitter/X format

3. **Interactive Blog Elements**
   - Embed interactive code snippets (CodeSandbox, RunKit)
   - Add polls, quizzes, embedded videos

4. **Code Testing Pipeline**
   - Stage 3.5: Run generated code in sandbox
   - Verify correctness before review
   - Catch runtime errors early

5. **Version Control for Iterations**
   - Save each iteration attempt
   - Allow user to choose between versions
   - Compare quality scores

6. **Real-Time Streaming**
   - Stream generation progress to frontend (SSE)
   - Show stage completions as they happen
   - Better UX for long-running operations

### Known Limitations

1. **No conditional routing after router**
   - Pipeline is strictly linear after format decision
   - Could add conditional branches (e.g., iteration thresholds)

2. **Social post URL replacement client-side**
   - `[BLOG_URL]` replaced in browser with `window.location.href`
   - Should use actual published URL from backend

3. **Image generation can be slow**
   - FLUX Schnell is fast but still ~2-5s per image
   - Consider pre-generating common image types

4. **No user authentication**
   - Currently uses hard-coded TEST_USER_ID
   - Need proper auth (Supabase Auth, Clerk, etc.)

5. **Limited error recovery**
   - If stage fails, whole pipeline fails
   - Should implement retry logic per stage

---

## 📚 References

### External Documentation

- [LangGraph Docs](https://langchain-ai.github.io/langgraph/)
- [Zod Schema Validation](https://zod.dev/)
- [fal.ai Image Generation](https://fal.ai/models/fal-ai/flux/schnell)
- [Claude Sonnet 4.5 Release Notes](https://www.anthropic.com/news/claude-sonnet-4-5)
- [GPT-5 Nano Overview](https://openai.com/blog/gpt-5-nano)

### Internal Documentation

- **ARCHITECTURE.md** - Detailed system design, component diagrams
- **README.md** - User-facing setup and usage guide
- **Inline comments** - Most files have detailed explanations

### Version History

**V3 (Current)** - Cell-based blog architecture, social posts, Judge removal
**V2** - Multi-stage pipelines, quality reviews, iterative refinement
**V1** - Simple prompt → LLM → output (no structure, no validation)

---

## 🤝 Contributing

### Development Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in:
# - OPENAI_API_KEY
# - ANTHROPIC_API_KEY
# - FAL_KEY
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY

# Run development server
npm run dev

# Type check
npx tsc --noEmit --skipLibCheck

# Lint
npx eslint .
```

### Code Style Guidelines

1. **Use Zod schemas for ALL LLM outputs**
   - Ensures type safety and validation
   - Makes debugging easier

2. **Prefer structured cells over string manipulation**
   - Cell-based > markdown parsing
   - Atomic operations > regex replacements

3. **Log extensively with structured logger**
   - Use logger.info/error/debug with context objects
   - Include execution IDs, stage names, durations

4. **Comment non-obvious logic**
   - Explain "why" not "what"
   - Document model choices and temperature settings

5. **Keep functions focused**
   - Single responsibility principle
   - Extract complex logic into named functions

---

**Last Updated:** January 22, 2026
**Maintained By:** Automated Idea Expansion Team
