# Automated Idea Expansion - Visual Guide

**Visual diagrams and workflows to understand the system at a glance**

---

## 1. SYSTEM ARCHITECTURE LAYERS

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PRESENTATION LAYER                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  /ideas          │  │  /outputs        │  │  /auth           │  │
│  │  Create Idea     │  │  View Results    │  │  GitHub Sign-in  │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────────────┘  │
│           │                    │                                   │
└───────────┼────────────────────┼───────────────────────────────────┘
            │                    │
            ↓                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        API ORCHESTRATION LAYER                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  POST /api/expand                                           │  │
│  │  • Check authentication (NextAuth)                         │  │
│  │  • Validate credit balance                                │  │
│  │  • Initialize execution tracking                          │  │
│  │  • Call runAgentPipeline()                               │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │                                     │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    AGENT ORCHESTRATION LAYER                        │
│               (LangGraph StateGraph with routers)                    │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ROUTER AGENT (GPT-4o-mini)                                │  │
│  │ Input: selectedIdea                                        │  │
│  │ Output: chosenFormat ('blog_post' | 'github_repo')        │  │
│  └──────────────────┬──────────────────────────────────────────┘  │
│                    │                                              │
│        ┌───────────┴───────────┐                                 │
│        ↓                       ↓                                  │
│  ┌──────────────┐        ┌──────────────┐                       │
│  │  BLOG PATH   │        │  CODE PATH   │                       │
│  └──────┬───────┘        └──────┬───────┘                       │
│         │                       │                                │
│    (4 stages)              (5 stages)                            │
│         │                       │                                │
└─────────┼───────────────────────┼────────────────────────────────┘
          │                       │
          ↓                       ↓
  [Blog Pipeline]        [Code Pipeline]

┌─────────────────────────────────────────────────────────────────────┐
│                    MODEL EXECUTION LAYER                            │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ OpenAI      │  │ Anthropic    │  │ Image Generation         │  │
│  │ GPT-4o-mini │  │ Claude       │  │ FAL.ai / HuggingFace     │  │
│  │ (routing,   │  │ Sonnet 4.5   │  │ FLUX Schnell             │  │
│  │  planning,  │  │ (generation, │  │                          │  │
│  │  review)    │  │  code, blog) │  │                          │  │
│  └─────────────┘  └──────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    DATA & INTEGRATION LAYER                         │
│  ┌──────────────────────────┐  ┌────────────────────────────────┐  │
│  │  Supabase PostgreSQL     │  │  GitHub API (Octokit)          │  │
│  │  • users                 │  │  • Create repositories         │  │
│  │  • ideas                 │  │  • Push files                  │  │
│  │  • outputs               │  │  • Create commits             │  │
│  │  • executions            │  │                                │  │
│  │  • credentials (encrypted)│  │                                │  │
│  └──────────────────────────┘  └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. REQUEST FLOW: Blog Generation

```
USER SUBMITS IDEA
  "Explain transformers in ML"
           │
           ↓
     /ideas POST
    Save idea to DB
           │
           ↓
USER CLICKS "EXPAND"
           │
           ↓
   /api/expand POST
    ├─ Check auth ✓
    ├─ Check credits ✓
    └─ Start pipeline
           │
           ↓
   ROUTER AGENT (GPT-4o-mini)
    Input: "Explain transformers in ML"
    Output: chosenFormat = 'blog_post'
           │
           ↓
   BLOG CREATOR ORCHESTRATOR
           │
           ├─ STAGE 1: PLAN (GPT-4o-mini)
           │  Output: {title, sections[], imageSpecs[]}
           │  Time: 2-3 seconds
           │
           ├─ STAGE 2: GENERATE (Claude Sonnet 4.5)
           │  Output: BlogCell[] (MarkdownCell + ImageCell)
           │  Time: 5-8 seconds
           │
           ├─ STAGE 3: GENERATE IMAGES (FAL.ai + parallel)
           │  Output: Generated images with URLs
           │  Time: 3-5 seconds
           │
           └─ STAGE 4: REVIEW (GPT-4o-mini)
              Output: {overallScore, recommendation}
              Time: 2-3 seconds
           │
           ↓
    Save to outputs table
    Store in database:
      {
        id: uuid,
        format: 'blog_post',
        content: {
          title: '...',
          cells: [...],
          socialPost: {...},
          images: [...]
        },
        created_at: timestamp
      }
           │
           ↓
    Consume 1 credit
    Update idea.status = 'expanded'
           │
           ↓
   /outputs/[id] VIEW
    User sees:
      ✅ Blog post with embedded images
      ✅ Social media share button
      ✅ Copy/edit buttons

TOTAL TIME: 15-25 seconds
TOTAL COST: ~$0.019
```

---

## 3. REQUEST FLOW: Code Generation

```
USER SUBMITS IDEA
  "Build Python CLI for sentiment analysis"
           │
           ↓
     /ideas POST
    Save idea to DB
           │
           ↓
USER CLICKS "EXPAND"
           │
           ↓
   /api/expand POST
    ├─ Check auth ✓
    ├─ Check credits ✓
    └─ Start pipeline
           │
           ↓
   ROUTER AGENT (GPT-4o-mini)
    Input: "Build Python CLI..."
    Output: chosenFormat = 'github_repo'
           │
           ↓
   CODE CREATOR ORCHESTRATOR
           │
           ├─ STAGE 1: PLAN (GPT-4o-mini)
           │  Output: {
           │    outputType: 'cli_app',
           │    language: 'python',
           │    architecture: 'modular',
           │    criticalFiles: ['sentiment_analyzer.py'],
           │    qualityRubric: {...}
           │  }
           │  Time: 2-3 seconds
           │
           ├─ STAGE 2: GENERATE (Claude Sonnet 4.5)
           │  PHASE 2A: Generate modules FIRST
           │    └─ sentiment_analyzer.py (core functions)
           │  PHASE 2B: Extract module signatures
           │    └─ {analyze(), validate_input(), ...}
           │  PHASE 2C: Generate main artifact WITH context
           │    └─ main.py (imports from sentiment_analyzer)
           │  Output: {
           │    files: [
           │      {path: 'sentiment_analyzer.py', content: '...'},
           │      {path: 'main.py', content: 'from sentiment_analyzer import...'},
           │      {path: 'requirements.txt', content: 'textblob==0.17'},
           │      {path: 'README.md', content: '...'}
           │    ]
           │  }
           │  Time: 8-12 seconds
           │
           ├─ STAGE 3: REVIEW (GPT-4o-mini)
           │  Input: All generated files + plan
           │  Output: {
           │    overallScore: 78,
           │    categoryScores: {
           │      correctness: 85,
           │      security: 72,
           │      codeQuality: 80,
           │      completeness: 75,
           │      documentation: 75
           │    },
           │    issues: [{file, severity, message}],
           │    recommendation: 'revise'
           │  }
           │  Time: 3-4 seconds
           │
           ├─ STAGE 4: ITERATION LOOP (if score < 75)
           │  Decision: 60 < score < 75 → Targeted fixes
           │
           │  FIXER AGENT (Claude Sonnet 4.5)
           │  Re-generates only problematic files based on issues
           │  Time: 4-6 seconds
           │
           │  RE-REVIEW (GPT-4o-mini)
           │  New score: 82 ✅ APPROVED
           │  Time: 2-3 seconds
           │
           └─ STAGE 5: PUBLISH (GitHub)
              If score >= 75:
                ├─ Create GitHub repo
                ├─ Push files
                ├─ Create commit
                └─ Return repo URL
              Time: 3-5 seconds
           │
           ↓
    Save to outputs table
    Store in database:
      {
        id: uuid,
        format: 'github_repo',
        content: {
          files: [...],
          repositoryUrl: 'https://github.com/.../sentiment-analyzer-xyz',
          language: 'python',
          framework: 'click'
        },
        published: true,
        publication_url: 'https://github.com/.../sentiment-analyzer-xyz'
      }
           │
           ↓
    Consume 1 credit
    Update idea.status = 'expanded'
           │
           ↓
   /outputs/[id] VIEW
    User sees:
      ✅ Repository link
      ✅ Files list
      ✅ Code preview
      ✅ Quality score & rubric
      ✅ GitHub button

TOTAL TIME: 45-90 seconds (includes iteration)
TOTAL COST: ~$0.025 (0-2 iterations)
```

---

## 4. BLOG PIPELINE DETAIL

```
BLOG CREATOR (4-STAGE PIPELINE)

INPUT: IdeaForCreator

          │
          ↓
    ┌─────────────────────────────────────┐
    │  STAGE 1: PLANNING                  │
    │  Model: GPT-4o-mini                │
    ├─────────────────────────────────────┤
    │ Input:  selectedIdea               │
    │         (title, description)       │
    │                                    │
    │ Processing:                        │
    │ • Analyze idea content             │
    │ • Decide: 3-5 sections             │
    │ • Choose: tone (educational,       │
    │   casual, technical)               │
    │ • Plan: 1-3 images + placement     │
    │ • Estimate: word count             │
    │                                    │
    │ Output: BlogPlanSchema {           │
    │   title: string,                   │
    │   sections: string[],              │
    │   tone: string,                    │
    │   targetWordCount: number,         │
    │   imageSpecs: {                    │
    │     placement: 'hero'|'inline',    │
    │     concept: string,               │
    │     style: string                  │
    │   }[]                              │
    │ }                                  │
    │                                    │
    │ Tokens: ~1,500                     │
    │ Cost: ~$0.0002                     │
    │ Time: 2-3 sec                      │
    └────────────┬────────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────────┐
    │  STAGE 2: GENERATION                │
    │  Model: Claude Sonnet 4.5           │
    ├─────────────────────────────────────┤
    │ Input:  BlogPlan                   │
    │         selectedIdea                │
    │                                    │
    │ Processing:                        │
    │ • Structured output: BlogCell[]    │
    │ • Cell types: MarkdownCell,        │
    │   ImageCell (discriminated)        │
    │ • Generate markdown content        │
    │   for each section                 │
    │ • Generate social post (Twitter    │
    │   format: 280 chars, hashtags)     │
    │ • Return: cells[]{                 │
    │     cellType: 'markdown'|'image',  │
    │     content?: string,              │
    │     imageUrl?: string,             │
    │     caption?: string,              │
    │     sectionTitle?: string          │
    │   }                                │
    │                                    │
    │ Output: BlogGenerationSchema {     │
    │   cells: BlogCell[],               │
    │   socialPost: {                    │
    │     content: string,               │
    │     hashtags: string[]             │
    │   }                                │
    │ }                                  │
    │                                    │
    │ Tokens: ~5,000                     │
    │ Cost: ~$0.015                      │
    │ Time: 5-8 sec                      │
    └────────────┬────────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────────┐
    │  STAGE 3: IMAGE GENERATION          │
    │  (Parallel execution)               │
    ├─────────────────────────────────────┤
    │ Input:  ImageCell[] from Stage 2   │
    │         ImageSpec[]                │
    │                                    │
    │ Processing:                        │
    │ • For each ImageCell:              │
    │   ├─ Generate prompt from concept │
    │   └─ Call FAL.ai or HuggingFace   │
    │                                    │
    │ Parallel: 3 images at once         │
    │                                    │
    │ Output: {                          │
    │   cells: BlogCell[]  (updated with│
    │           image URLs)              │
    │   images: GeneratedImage[]         │
    │ }                                  │
    │                                    │
    │ Cost: ~$0.001 per image            │
    │ Time: 3-5 sec (parallel)           │
    └────────────┬────────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────────┐
    │  STAGE 4: REVIEW                    │
    │  Model: GPT-4o-mini                │
    ├─────────────────────────────────────┤
    │ Input:  Rendered blog (markdown +  │
    │         images)                    │
    │         Original plan              │
    │                                    │
    │ Processing:                        │
    │ • Score clarity (1-100)            │
    │ • Score accuracy (1-100)           │
    │ • Score engagement (1-100)         │
    │ • Score structure (1-100)          │
    │                                    │
    │ Output: BlogReviewSchema {         │
    │   overallScore: number,            │
    │   categoryScores: {                │
    │     clarity: number,               │
    │     accuracy: number,              │
    │     engagement: number,            │
    │     structure: number              │
    │   },                               │
    │   recommendation: 'approve'|...,   │
    │   strengths: string[],             │
    │   improvements: string[]           │
    │ }                                  │
    │                                    │
    │ Tokens: ~1,000                     │
    │ Cost: ~$0.0001                     │
    │ Time: 2-3 sec                      │
    └────────────┬────────────────────────┘
                 │
                 ↓
           COMPLETE
        Save to outputs
        Score >= 80? ✅
```

---

## 5. CODE PIPELINE DETAIL

```
CODE CREATOR (5-STAGE PIPELINE)

INPUT: IdeaForCreator

       │
       ↓
   ┌──────────────────────────────────────┐
   │  STAGE 1: PLANNING                   │
   │  Model: GPT-4o-mini                 │
   ├──────────────────────────────────────┤
   │ Output type options:                │
   │ • notebook (Jupyter .ipynb)         │
   │ • cli_app (CLI tool)                │
   │ • web_app (Flask/FastAPI)           │
   │ • library (Python package)          │
   │ • demo_script (standalone script)   │
   │                                     │
   │ Language options:                   │
   │ • Python, JavaScript, TypeScript,   │
   │   Rust                              │
   │                                     │
   │ Architecture:                       │
   │ • simple (single file)              │
   │ • modular (multiple files)          │
   │                                     │
   │ Output: CodePlanSchema              │
   │ Tokens: ~1,200, Time: 2-3 sec      │
   └────────┬─────────────────────────────┘
            │
            ↓
   ┌──────────────────────────────────────┐
   │  STAGE 2: GENERATION                 │
   │  Model: Claude Sonnet 4.5           │
   ├──────────────────────────────────────┤
   │                                     │
   │ PHASE 2A: Critical Modules (if      │
   │           architecture='modular')   │
   │                                     │
   │   For each criticalFile:            │
   │     Call Claude with prompt:        │
   │     "Generate Python module:"       │
   │     Output: CodeFile {              │
   │       path: string,                 │
   │       content: string,              │
   │       language: string              │
   │     }                               │
   │                                     │
   │ PHASE 2B: Extract Module Context    │
   │                                     │
   │   For each module:                  │
   │     Call GPT to extract exports:    │
   │     "Extract functions/classes"     │
   │     Output: ModuleContext {         │
   │       name: string,                 │
   │       exports: {name, sig}[],       │
   │       docstring: string             │
   │     }                               │
   │                                     │
   │   Format for prompt injection:      │
   │   "Available imports from           │
   │    sentiment_analyzer:"             │
   │    - analyze(text: str) -> float    │
   │    - validate(text: str) -> bool    │
   │                                     │
   │ PHASE 2C: Generate Main Artifact    │
   │                                     │
   │   Prompt includes module context    │
   │   "Given available imports from     │
   │    sentiment_analyzer, generate     │
   │    main CLI that USES THEM"         │
   │                                     │
   │   Output: CodeFile {                │
   │     path: 'main.py',                │
   │     content: 'from sentiment_...'   │
   │   }                                 │
   │                                     │
   │   Also generates:                   │
   │   - README.md                       │
   │   - requirements.txt / package.json │
   │   - .gitignore                      │
   │                                     │
   │ Output: GeneratedCodeSchema         │
   │ Files: CodeFile[]                   │
   │ Tokens: ~5,000                      │
   │ Time: 8-12 sec                      │
   └────────┬─────────────────────────────┘
            │
            ↓
   ┌──────────────────────────────────────┐
   │  STAGE 3: REVIEW                     │
   │  Model: GPT-4o-mini                 │
   ├──────────────────────────────────────┤
   │ 5-Dimensional Rubric:               │
   │                                     │
   │ 1. CORRECTNESS (25%)                │
   │    - Code runs without errors       │
   │    - Requirements met               │
   │    - Logic is sound                 │
   │    Score: 0-100                     │
   │                                     │
   │ 2. SECURITY (15%)                   │
   │    - No hardcoded secrets           │
   │    - Input validation               │
   │    - Safe dependencies              │
   │    Score: 0-100                     │
   │                                     │
   │ 3. CODE QUALITY (20%)               │
   │    - Follows conventions            │
   │    - DRY principle                  │
   │    - Proper naming                  │
   │    Score: 0-100                     │
   │                                     │
   │ 4. COMPLETENESS (20%)               │
   │    - All requirements covered       │
   │    - Edge cases handled             │
   │    - Testing examples               │
   │    Score: 0-100                     │
   │                                     │
   │ 5. DOCUMENTATION (20%)              │
   │    - README clarity                 │
   │    - Code comments                  │
   │    - Usage examples                 │
   │    Score: 0-100                     │
   │                                     │
   │ Overall = Average of 5 categories   │
   │                                     │
   │ Output: CodeReviewSchema            │
   │ Tokens: ~4,000                      │
   │ Time: 3-4 sec                       │
   └────────┬─────────────────────────────┘
            │
            ↓
            │
   ┌────────▼─────────────────────────────┐
   │  QUALITY GATE DECISION               │
   └────────┬──────────────────┬──────────┘
            │                  │
       ┌────▼────┐         ┌───▼────┐
       │ PASS     │         │ FAIL   │
       │score>=75 │         │<75     │
       │    ✅    │         │   ❌   │
       └────┬─────┘         └───┬────┘
            │                   │
            │              ┌────▼──────────────┐
            │              │  ITERATION LOOP   │
            │              │  (Max 3 cycles)   │
            │              ├───────────────────┤
            │              │ Check score trend │
            │              │                   │
            │              │ If score < 60:    │
            │              │   Regenerate ALL  │
            │              │   files (too bad) │
            │              │                   │
            │              │ If 60 <= score <  │
            │              │   75:             │
            │              │   Targeted FIX    │
            │              │   (specific files │
            │              │    mentioned in   │
            │              │    issues[])      │
            │              │                   │
            │              │ If score >        │
            │              │   previous:       │
            │              │   RE-REVIEW       │
            │              │                   │
            │              │ Else:             │
            │              │   Give up (loop)  │
            │              │                   │
            │              └────┬──────────────┘
            │                   │
            │               Re-review
            │                   │
            │           (back to review)
            │                   │
            └────────┬──────────┘
                     │
                     ↓
           ┌─────────────────────┐
           │  STAGE 5: PUBLISH   │
           │  Tool: GitHub API   │
           │  (Octokit)          │
           ├─────────────────────┤
           │ • Create repo       │
           │ • Push files        │
           │ • Create commit     │
           │ • Return URL        │
           │                     │
           │ Time: 3-5 sec       │
           └─────────┬───────────┘
                     │
                     ↓
               COMPLETE
            Save to outputs
            Quality validated ✅
```

---

## 6. STATE FLOW DIAGRAM

```
        ┌──────────────────────────────┐
        │   User Selects Idea          │
        │   {id, title, description}   │
        └────────────┬──────────────────┘
                     │
                     ↓
        ┌──────────────────────────────┐
        │  AgentState Created:         │
        │  {                           │
        │    userId: string,           │
        │    selectedIdea: Idea,       │
        │    executionId: uuid,        │
        │    errors: []                │
        │  }                           │
        └────────────┬──────────────────┘
                     │
                     ↓
        ┌──────────────────────────────┐
        │  Router Agent Updates:       │
        │  {                           │
        │    chosenFormat: 'blog'|     │
        │      'github_repo',          │
        │    formatReasoning: string   │
        │  }                           │
        └────────────┬──────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ↓                         ↓
   ┌─────────┐            ┌─────────────┐
   │BLOG PATH│            │ CODE PATH   │
   └────┬────┘            └────┬────────┘
        │                      │
   Blog Creator            Code Creator
   generates content       generates code
   ✅ cells                ✅ files
   ✅ images               ✅ review
   ✅ social post          ✅ iterate
        │                      │
        └──────────┬───────────┘
                   │
                   ↓
        ┌──────────────────────────────┐
        │  Creator Finishes Updates:   │
        │  {                           │
        │    generatedContent: {...},  │
        │    publishedUrl: string|null │
        │  }                           │
        └────────────┬──────────────────┘
                     │
                     ↓
        ┌──────────────────────────────┐
        │  Final State:                │
        │  {                           │
        │    userId: string,           │
        │    selectedIdea: Idea,       │
        │    chosenFormat: string,     │
        │    generatedContent: {...},  │
        │    publishedUrl: string|null,│
        │    executionId: uuid,        │
        │    errors: string[]          │
        │  }                           │
        └────────────┬──────────────────┘
                     │
                     ↓
        ┌──────────────────────────────┐
        │  Save to Database            │
        │  - outputs table             │
        │  - executions table          │
        │  - update ideas.status       │
        └────────────┬──────────────────┘
                     │
                     ↓
        ┌──────────────────────────────┐
        │  Return to User              │
        │  Redirect to /outputs/[id]   │
        └──────────────────────────────┘
```

---

## 7. COST BREAKDOWN VISUALIZATION

```
BLOG GENERATION COST

Planning (GPT-4o-mini)
  Tokens: 1,500
  Rate: $0.15/1M
  Cost: ▓░░░░░░░░░░░░░░░░░░░░░░░░░░ $0.0002

Blog Generation (Claude Sonnet 4.5)
  Tokens: 5,000
  Rate: $3/1M
  Cost: ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░ $0.015

Images (3x FAL.ai)
  Cost: ▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░ $0.003

Review (GPT-4o-mini)
  Tokens: 1,000
  Rate: $0.15/1M
  Cost: ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░ $0.0001

                    TOTAL: $0.019
                    ────────────────


CODE GENERATION COST (no iterations)

Planning (GPT-4o-mini)
  Cost: ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░ $0.0001

Module Generation (Claude Sonnet 4.5)
  Cost: ▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░ $0.008

Main Generation (Claude Sonnet 4.5)
  Cost: ▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░ $0.005

Review (GPT-4o-mini)
  Cost: ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░ $0.0004

                    TOTAL: $0.016


CODE GENERATION COST (2 iterations)

Planning + Generation: $0.013
First Review: $0.0004
First Fixer (Claude): $0.009
First Re-review: $0.0003
Second Fixer (Claude): $0.009
Second Re-review: $0.0003

                    TOTAL: $0.034
                    ────────────────


MONTHLY ESTIMATE (80 ideas/month)

50 blogs @ $0.019:     $0.95
30 code @ $0.025:      $0.75

TOTAL/MONTH:           ~$1.70
```

---

## 8. MODULE CONTEXT EXTRACTION FLOW

```
GENERATED PYTHON MODULE (sentiment_analyzer.py)
│
├─ def analyze(text: str) -> float:
│    """Analyze sentiment of text."""
│    return compute(text)
│
├─ def validate_input(text: str) -> bool:
│    """Check if input is valid."""
│    return len(text) > 0
│
└─ class SentimentCache:
     """Cache for results."""
     def __init__(self): ...

         │
         ↓

EXTRACTION (GPT-4o-mini with structured output)
│
Call LLM: "Extract all public functions, classes, and constants..."
│
Uses schema: ExportSignatureSchema {
  name: string,
  signature: string,
  docstring: string,
  type: 'function' | 'class' | 'constant'
}
│
         ↓

EXTRACTED CONTEXT
│
ModuleContext {
  moduleName: 'sentiment_analyzer',
  filePath: 'sentiment_analyzer.py',
  exports: [
    {
      name: 'analyze',
      signature: 'def analyze(text: str) -> float',
      docstring: 'Analyze sentiment of text.',
      type: 'function'
    },
    {
      name: 'validate_input',
      signature: 'def validate_input(text: str) -> bool',
      docstring: 'Check if input is valid.',
      type: 'function'
    },
    {
      name: 'SentimentCache',
      signature: 'class SentimentCache',
      docstring: 'Cache for results.',
      type: 'class'
    }
  ]
}
│
         ↓

FORMAT FOR PROMPT INJECTION
│
"Available imports from sentiment_analyzer module:

 - analyze(text: str) -> float
   Analyze sentiment of text.

 - validate_input(text: str) -> bool
   Check if input is valid.

 - SentimentCache
   Cache for results.

Use these imports in your main.py to avoid duplication."
│
         ↓

NOTEBOOK GENERATION (with context)
│
Prompt includes module context
Claude generates notebook that imports:
  "from sentiment_analyzer import analyze, validate_input"
│
Result: Notebook uses modules instead of reimplementing!
```

---

## 9. ERROR HANDLING & FALLBACK STRATEGY

```
                    START OPERATION
                           │
                           ↓
                ┌──────────────────────┐
                │ Try Primary Model    │
                │ (GPT-4o-mini)        │
                └────────┬─────────────┘
                         │
                ┌────────▼────────┐
                │ Success?        │
                └────┬────────┬───┘
                     │        │
                  YES│        │NO
                     │        │
                     │        ↓
                     │   ┌──────────────────────┐
                     │   │ Try Fallback Model   │
                     │   │ (Claude Haiku)       │
                     │   └────────┬─────────────┘
                     │            │
                     │    ┌───────▼────────┐
                     │    │ Success?       │
                     │    └────┬───────┬───┘
                     │         │       │
                     │      YES│       │NO
                     │         │       │
                     │         │       ↓
                     │         │   ┌──────────────────┐
                     │         │   │ Return Error     │
                     │         │   │ State:           │
                     │         │   │ {                │
                     │         │   │  chosenFormat:   │
                     │         │   │    null,         │
                     │         │   │  errors: [msg]   │
                     │         │   │ }                │
                     │         │   └────┬─────────────┘
                     │         │        │
                     └─────┬────┴────────┤
                           │            │
                           ↓            ↓
                    ┌──────────────────────┐
                    │ Continue Pipeline    │
                    │ OR Report Error      │
                    │ to User              │
                    └──────────────────────┘
```

---

## 10. USER JOURNEY MAP

```
                        AUTOMATED IDEA EXPANSION
                              User Journey

┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 1: DISCOVERY & LOGIN                                        │
│  ├─ User finds app                                                 │
│  ├─ Clicks "Sign in with GitHub"                                  │
│  ├─ GitHub OAuth flow                                             │
│  └─ Account created automatically                                 │
│     Feeling: Excited to try                                       │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 2: IDEA CREATION                                            │
│  ├─ Navigate to /ideas                                            │
│  ├─ See form: "What's your half-baked idea?"                      │
│  ├─ Type idea: "Build a sentiment analyzer CLI"                   │
│  ├─ Click "Save Idea"                                             │
│  └─ Idea saved, redirects to ideas list                           │
│     Feeling: Quick & easy                                         │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 3: EXPANSION DECISION                                        │
│  ├─ See idea in list with status "pending"                        │
│  ├─ Click "Expand" button                                         │
│  ├─ System checks:                                                │
│  │  ✓ Auth ok                                                    │
│  │  ✓ Credits available (5 free to start)                        │
│  └─ Pipeline starts                                              │
│     Feeling: Hopeful, waiting...                                 │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 4: PIPELINE EXECUTION (15-90 seconds)                        │
│  ├─ Terminal shows: "🚀 Starting pipeline"                         │
│  ├─ Router: "🎯 Analyzing idea..."                                 │
│  │         Decides: Blog vs Code                                  │
│  │                                                                │
│  ├─ Creator Path (depends on format):                             │
│  │                                                                │
│  │  If BLOG:                                                     │
│  │  ├─ 📋 Planning...    (2-3 sec)                              │
│  │  ├─ 🛠️  Generating... (5-8 sec)                              │
│  │  ├─ 🖼️  Images...    (3-5 sec)                              │
│  │  ├─ 🔍 Review...     (2-3 sec)                              │
│  │  └─ ✅ Complete (15-25 sec total)                            │
│  │                                                                │
│  │  If CODE:                                                     │
│  │  ├─ 📋 Planning...    (2-3 sec)                              │
│  │  ├─ 🛠️  Generating... (8-12 sec)                            │
│  │  ├─ 🔍 Review...     (3-4 sec)                              │
│  │  ├─ 🔄 Iterate?     (if needed, +4-10 sec)                  │
│  │  ├─ 🚀 Publishing... (3-5 sec)                              │
│  │  └─ ✅ Complete (45-90 sec total)                            │
│  │                                                                │
│  └─ ✅ Pipeline finish notification                              │
│     Feeling: Anticipation building...                            │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 5: OUTPUT REVIEW                                             │
│  ├─ Redirected to /outputs/[id]                                   │
│  ├─ View generated content:                                       │
│  │                                                                │
│  │  If BLOG:                                                     │
│  │  ├─ 📰 Full blog post with images                            │
│  │  ├─ 📊 Quality metrics (clarity, accuracy, etc.)            │
│  │  ├─ 🐦 Embedded Twitter/social share                        │
│  │  ├─ 📋 Copy button (copy markdown)                          │
│  │  └─ Edit button (future feature)                            │
│  │                                                                │
│  │  If CODE:                                                     │
│  │  ├─ 📦 GitHub repo link                                      │
│  │  ├─ 📁 File list preview                                     │
│  │  ├─ 📊 Quality rubric (correctness, security, etc.)         │
│  │  ├─ 🔄 Iteration history                                     │
│  │  ├─ ⭐ Clone/fork button                                     │
│  │  └─ View on GitHub button                                    │
│  │                                                                │
│  └─ Option to expand more ideas                                  │
│     Feeling: Amazed, accomplished!                               │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  PHASE 6: CREDIT MANAGEMENT (Optional)                              │
│  ├─ 5 free expansions used (dashboard shows: 0/5 remaining)       │
│  ├─ Option to buy credits                                         │
│  ├─ Stripe checkout (future)                                      │
│  └─ Continue expanding                                            │
│     Feeling: Satisfied with free tier OR ready to pay              │
└──────────────────────────────────────────────────────────────────────┘

                          REPEAT: More ideas? Go to Phase 2
```

---

**Visual Guide Complete!** Use these diagrams to understand:
1. How requests flow through the system
2. How each pipeline stage works
3. Where costs come from
4. How state changes through the pipeline
5. The user experience from start to finish

Last Updated: January 30, 2026
