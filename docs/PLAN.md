# Fix Pipeline Issues + Add Comprehensive Logging + Architecture Documentation

## 🎯 Overview

This plan addresses three critical improvements to the idea expansion pipeline:

1. **Fix `withStructuredOutput` Error** - Blog creator failing due to type system issue
2. **Add Comprehensive Logging** - Enhanced visibility throughout the entire pipeline
3. **Create Architecture Documentation** - System diagrams and clear explanations

---

## 🚨 Problem 1: `withStructuredOutput` Error in Blog Creator

### Root Cause

**Error Message:**
```
TypeError: Cannot read properties of undefined (reading '_zod')
    at planBlog (src/lib/agents/creators/blog-creator-v2.ts:152:33)
```

**Why It Happens:**

The `createModel()` function in `model-factory.ts` lacks an explicit return type annotation:

```typescript
// Current (broken)
export function createModel(type: ModelType, temperature: number = 0.7) {
  switch (type) {
    case 'gpt-4o-mini':
      return new ChatOpenAI({ ... });  // Returns ChatOpenAI
    case 'claude-haiku':
      return new ChatAnthropic({ ... });  // Returns ChatAnthropic
    case 'claude-sonnet':
      return new ChatAnthropic({ ... });  // Returns ChatAnthropic
  }
}
```

**The Problem:**
- TypeScript infers the return type as `ChatOpenAI | ChatAnthropic` (union type)
- When you call `model.withStructuredOutput(schema)`, TypeScript can't guarantee which class's method is being called
- At runtime, method resolution fails and returns `undefined`
- Accessing `._zod` on `undefined` causes the error

**Why Judge & Router Work:**

They directly instantiate models instead of using `createModel()`:

```typescript
// Judge & Router (working)
const model = new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0.5 });
const structuredModel = model.withStructuredOutput(Schema);
```

### Solution

**Option 1: Add Union Return Type (Preferred)**

Add explicit return type annotation to `createModel()`:

```typescript
export function createModel(
  type: ModelType,
  temperature: number = 0.7
): ChatOpenAI | ChatAnthropic {
  // ... implementation stays the same
}
```

Then use type narrowing in blog-creator-v2.ts:

```typescript
const model = createModel(ModelRecommendations.planning, 0.7);
if (!(model instanceof ChatOpenAI) && !(model instanceof ChatAnthropic)) {
  throw new Error('Invalid model type returned');
}
const structuredModel = model.withStructuredOutput(BlogPlanSchema);
```

**Option 2: Direct Instantiation (Simpler)**

Replace `createModel()` calls with direct instantiation (like judge/router do):

```typescript
// In blog-creator-v2.ts planBlog function
const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.7,
  apiKey: process.env.OPENAI_API_KEY,
});
const structuredModel = model.withStructuredOutput(BlogPlanSchema);
```

**Recommendation:** Use **Option 2** for consistency with judge/router and to avoid type system complexity.

---

## 📊 Current System Architecture

### High-Level Pipeline Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            USER SUBMITS IDEA                             │
│                          (via Web UI /ideas page)                        │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     API ENDPOINT: /api/expand                            │
│                     (src/app/api/expand/route.ts)                        │
│                                                                           │
│  • Receives expand request (specific idea or "judge all")                │
│  • Fetches pending ideas from Supabase                                   │
│  • Initializes agent state                                               │
│  • Invokes LangGraph pipeline                                            │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    LANGGRAPH ORCHESTRATOR                                │
│                      (src/lib/agents/graph.ts)                           │
│                                                                           │
│  Creates a stateful graph with 3 sequential nodes:                       │
│  1. judgeNode    → Select best idea                                      │
│  2. routerNode   → Choose output format                                  │
│  3. creatorNode  → Generate content                                      │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                 │
                ▼                                 ▼
┌─────────────────────────┐         ┌────────────────────────────┐
│    JUDGE AGENT          │         │    If specific idea        │
│  (judge-agent.ts)       │         │    provided: skip judge    │
│                         │         └────────────────────────────┘
│  • Evaluates all ideas  │
│  • Uses GPT-4o-mini     │
│  • Scores on:           │
│    - Impact             │
│    - Originality        │
│    - Feasibility        │
│    - Timeliness         │
│  • Returns best idea    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      ROUTER AGENT                                       │
│                    (router-agent.ts)                                    │
│                                                                          │
│  • Analyzes selected idea                                               │
│  • Uses GPT-4o-mini with structured output                              │
│  • Decides format based on value to audience:                           │
│    - blog_post      → Deep explanations, conceptual understanding       │
│    - twitter_thread → Quick insights, tips, concise explanations        │
│    - github_repo    → Code demonstrations, technical experiments        │
│  • Returns format + reasoning                                           │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
                ▼               ▼               ▼
    ┌───────────────┐  ┌──────────────┐  ┌─────────────────┐
    │  BLOG CREATOR │  │   MASTODON   │  │  CODE CREATOR   │
    │     (V2)      │  │   CREATOR    │  │      (V2)       │
    │               │  │     (V2)     │  │                 │
    └───────────────┘  └──────────────┘  └─────────────────┘
```

### Agent Detail: Blog Creator V2 (Multi-Stage Pipeline)

```
                          BLOG CREATOR V2
                    (blog-creator-v2.ts)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐     ┌──────────────┐
│   STAGE 1    │      │   STAGE 2    │     │   STAGE 3    │
│   PLANNING   │──────│  GENERATION  │─────│    REVIEW    │
└──────────────┘      └──────────────┘     └──────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
  Uses GPT-4o-mini      Uses Claude Haiku     Uses GPT-4o-mini
  Decides:              Creates:              Scores:
  • Title               • Markdown content    • Clarity
  • Sections            • 1-3 images          • Accuracy
  • Tone                  with captions       • Engagement
  • Word count          • Word count          • Image relevance
  • Image specs         • Reading time
  • Quality rubric                            Returns 0-100 score
                                              + recommendation
```

### Agent Detail: Mastodon Thread Creator V2

```
                      MASTODON THREAD CREATOR V2
                    (mastodon-creator-v2.ts)
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐     ┌──────────────┐
│   STAGE 1    │      │   STAGE 2    │     │   STAGE 3    │
│   PLANNING   │──────│  GENERATION  │─────│    REVIEW    │
└──────────────┘      └──────────────┘     └──────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
  Uses GPT-4o-mini      Uses Claude Haiku     Uses GPT-4o-mini
  Decides:              Creates:              Scores:
  • Hook (1st post)     • 3-10 posts          • Hook strength
  • Thread length       • Each ≤500 chars     • Flow
  • Hero image?         • Optional hero       • Engagement
  • Key points            image               • Char count
  • Tone                                        compliance
  • Quality rubric
                                              Returns 0-100 score
```

### Agent Detail: Code Creator V2 (Most Complex - 5 Stages)

```
                          CODE CREATOR V2
                    (code-creator-v2.ts)
                              │
        ┌─────────────────────┼─────────────────────────┐
        │                     │                         │
        ▼                     ▼                         ▼
┌──────────────┐      ┌──────────────┐     ┌─────────────────┐
│   STAGE 1    │      │   STAGE 2    │     │    STAGE 3      │
│   PLANNING   │──────│  GENERATION  │─────│     REVIEW      │
└──────────────┘      └──────────────┘     └─────────────────┘
        │                     │                         │
        │                     │                         ▼
        │                     │              ┌────────────────────┐
        │                     │              │ Quality Score < 75?│
        │                     │              └──────┬─────────┬───┘
        │                     │                     │ YES     │ NO
        │                     │                     ▼         ▼
        │                     │              ┌──────────┐   DONE
        │                     │              │ STAGE 4  │
        │                     │              │ ITERATE  │
        │                     │              └─────┬────┘
        │                     │                    │
        │                     │      ┌─────────────┴─────────────┐
        │                     │      │                           │
        │                     │      ▼                           ▼
        │                     │  Score < 60?              Score 60-74?
        │                     │  Full Regenerate          Targeted Fixes
        │                     │  (goto Stage 2)           (Fixer Agent)
        │                     │      │                           │
        │                     └──────┴───────────────────────────┘
        │                                                         │
        │                                        Re-review────────┘
        │                                        (goto Stage 3)
        │
        ▼
  Uses GPT-4o-mini          Uses Claude Sonnet 4.5    Uses GPT-4o-mini
  Decides:                  Creates:                   Scores:
  • Output type             • All code files           • Correctness (40%)
    (notebook/CLI/etc)      • README                   • Security (30%)
  • Language                • Dependencies             • Code quality (20%)
  • Architecture            • Instructions             • Completeness (10%)
  • Quality rubric
                            Then publishes to          Max 5 iterations
                            GitHub (or dry-run)        until score ≥ 75
```

### Model Usage Summary

```
┌─────────────────┬──────────────────┬─────────────────────────────┐
│ Task            │ Model            │ Why?                        │
├─────────────────┼──────────────────┼─────────────────────────────┤
│ Judge Agent     │ GPT-4o-mini      │ Fast, cheap, good reasoning │
│ Router Agent    │ GPT-4o-mini      │ Fast, cheap, good reasoning │
│ Planning        │ GPT-4o-mini      │ Fast, cheap, structure      │
│ Text Generation │ Claude Haiku     │ Superior writing quality    │
│ Image Prompts   │ GPT-4o-mini      │ Creative prompt engineering │
│ Review          │ GPT-4o-mini      │ Fast, consistent evaluation │
│ Code Generation │ Claude Sonnet    │ Best at code (benchmarks)   │
│ Code Review     │ GPT-4o-mini      │ Fast validation             │
└─────────────────┴──────────────────┴─────────────────────────────┘
```

---

## 🔍 Problem 2: Inadequate Logging

### Current State

**What Exists:**
- Emoji-prefixed `console.log()` statements scattered throughout
- No centralized logging utility
- No correlation IDs or execution tracking
- No timestamps (relies on terminal timestamps)
- No structured/JSON logging
- Inconsistent detail levels across agents

**Example Current Logs:**
```
📥 Expand request received
   Specific idea: 50aa361f-3eda-4586-958e-6b7708a0576d
🚀 Starting agent pipeline...
   User: 00000000-0000-0000-0000-000000000001
   Ideas to evaluate: 1
Creating blog post with multi-stage pipeline (V2)...
📝 === BLOG CREATOR V2 ===
   Idea: "The rise of capitalism and selling of pleasure for survival."

📋 STAGE 1: Planning
Creator agent failed for format blog_post: TypeError...
✅ Agent pipeline complete!
```

### Critical Gaps

| Stage | Current Logging | Missing |
|-------|----------------|---------|
| **Judge Agent** | Errors only | Decision reasoning, alternatives considered, scores |
| **Router Agent** | Errors only | Format decision reasoning, confidence level |
| **Blog Creator** | Stage headers + final metrics | Section details, image generation progress |
| **Mastodon Creator** | Stage headers + final metrics | Post-by-post generation, character counts |
| **Code Creator** | Detailed (best of all) | Model names per call, prompt details, file sizes |
| **All Agents** | No correlation IDs | Can't trace specific execution through logs |
| **All Agents** | No timestamps | Can't measure stage durations |
| **All Agents** | No structured output | Can't parse/analyze logs programmatically |

### Solution: Enhanced Logging System

#### Phase 1: Create Logger Utility

**File:** `src/lib/logging/logger.ts`

**Features:**
- Execution ID generation and tracking
- ISO timestamps
- Log levels (DEBUG, INFO, WARN, ERROR)
- Structured JSON output (optional)
- Context propagation (userId, ideaId, executionId)
- Stage tracking
- Token usage tracking

**API Design:**
```typescript
import { Logger } from '@/lib/logging/logger';

// Initialize with context
const logger = new Logger({
  executionId: 'exec-123',
  userId: 'user-456',
  ideaId: 'idea-789',
  stage: 'judge-agent',
});

// Log with different levels
logger.info('Evaluating ideas', { ideaCount: 5 });
logger.debug('Using model GPT-4o-mini', { temperature: 0.7 });
logger.warn('API key not found', { service: 'GitHub' });
logger.error('Failed to generate content', error);

// Track tokens
logger.trackTokens({ input: 500, output: 1200, model: 'gpt-4o-mini' });

// Create child logger for sub-stages
const planLogger = logger.child({ subStage: 'planning' });
```

**Output Format (Structured):**
```json
{
  "timestamp": "2026-01-21T15:30:45.123Z",
  "level": "INFO",
  "executionId": "exec-123",
  "userId": "user-456",
  "ideaId": "idea-789",
  "stage": "judge-agent",
  "message": "Evaluating ideas",
  "data": { "ideaCount": 5 }
}
```

**Output Format (Human-Readable):**
```
[2026-01-21T15:30:45.123Z] INFO  [exec-123] [judge-agent] Evaluating ideas
   ideaCount: 5
```

#### Phase 2: Add Logging Throughout Pipeline

**Files to Update:**

1. **`src/app/api/expand/route.ts`**
   - Add execution ID generation
   - Log request details
   - Track total pipeline duration
   - Log final outcome with metrics

2. **`src/lib/agents/graph.ts`**
   - Pass logger context through state
   - Log graph initialization
   - Log transitions between nodes
   - Log final state summary

3. **`src/lib/agents/judge-agent.ts`**
   - Log all ideas being evaluated
   - Log evaluation criteria
   - Log scores for each idea
   - Log selected idea + reasoning
   - Log fallback decisions

4. **`src/lib/agents/router-agent.ts`**
   - Log idea analysis
   - Log format alternatives considered
   - Log decision reasoning
   - Log confidence level
   - Log fallback decisions

5. **`src/lib/agents/creator-agent.ts`**
   - Log format being created
   - Log creator invocation
   - Log creator completion with metrics
   - Log errors with context

6. **`src/lib/agents/creators/blog-creator-v2.ts`**
   - Keep existing stage logs (good)
   - Add section-by-section details
   - Log image generation progress
   - Track model calls and tokens
   - Log quality review details

7. **`src/lib/agents/creators/mastodon-creator-v2.ts`**
   - Keep existing stage logs (good)
   - Add post-by-post generation logs
   - Log character counts per post
   - Track model calls and tokens
   - Log quality review details

8. **`src/lib/agents/creators/code/code-creator-v2.ts`**
   - Already has best logging
   - Add execution context
   - Add model names per stage
   - Track file generation progress

**Key Logging Points to Add:**

```typescript
// At pipeline start
logger.info('🚀 Starting agent pipeline', {
  userId: state.userId,
  ideaCount: state.allIdeas.length,
  specificIdeaId: state.specificIdeaId,
});

// Judge Agent
logger.info('📊 Evaluating ideas', {
  candidates: state.allIdeas.map(i => ({ id: i.id, title: i.title })),
});
logger.info('✅ Selected idea', {
  ideaId: selectedIdea.id,
  title: selectedIdea.title,
  score: judgeScore,
  reasoning: judgeReasoning,
});

// Router Agent
logger.info('🎯 Analyzing idea for format', {
  ideaId: selectedIdea.id,
  title: selectedIdea.title,
});
logger.info('✅ Format selected', {
  format: chosenFormat,
  reasoning: formatReasoning,
});

// Creator stages
logger.info('📋 STAGE 1: Planning', {
  creator: 'blog',
  model: 'gpt-4o-mini',
});
logger.info('✅ Planning complete', {
  sections: plan.sections.length,
  targetWordCount: plan.targetWordCount,
  imageCount: plan.imageSpecs.length,
});

logger.info('🛠️  STAGE 2: Generation', {
  creator: 'blog',
  model: 'claude-haiku',
});
logger.info('✅ Generation complete', {
  actualWordCount: draft.wordCount,
  imagesGenerated: draft.images.length,
  readingTime: draft.readingTimeMinutes,
});

logger.info('🔍 STAGE 3: Review', {
  creator: 'blog',
  model: 'gpt-4o-mini',
});
logger.info('✅ Review complete', {
  overallScore: review.overallScore,
  recommendation: review.recommendation,
  strengths: review.strengths,
  improvements: review.improvements,
});

// Pipeline complete
logger.info('✅ Agent pipeline complete', {
  executionId: logger.executionId,
  selectedIdea: state.selectedIdea?.title,
  chosenFormat: state.chosenFormat,
  contentGenerated: !!state.generatedContent,
  totalTokens: state.tokensUsed,
  errors: state.errors.length,
  durationMs: Date.now() - startTime,
});
```

---

## 📚 Problem 3: Documentation Updates

### Files to Update

#### 1. README.md

**Additions:**

1. **System Architecture Section** (after "What's Working"):
   - Add ASCII diagram of full pipeline
   - Explain each agent's role
   - Show model selection rationale

2. **Logging Guide** (new section):
   - How to interpret logs
   - What each emoji means
   - How to find errors in logs
   - Execution ID tracking explanation

3. **Troubleshooting Section** (new):
   - Common errors and solutions
   - How to debug pipeline failures
   - Where to look for specific issues

**Example Content:**
```markdown
## 🏗️ System Architecture

The idea expansion pipeline is a multi-stage LangGraph workflow with three main agents:

### Pipeline Flow

```
User Idea → Judge Agent → Router Agent → Creator Agent → Output
              ↓             ↓               ↓
           (selects)    (chooses)      (generates)
           best idea    format         content
```

### Agents Explained

1. **Judge Agent** - Evaluates all pending ideas and selects the best one based on:
   - Impact (how valuable?)
   - Originality (unique perspective?)
   - Feasibility (can it be executed well?)
   - Timeliness (relevant now?)

2. **Router Agent** - Decides the optimal output format:
   - `blog_post` - Deep explanations, tutorials (1000-2000 words)
   - `twitter_thread` - Quick insights, tips (5-10 posts × 500 chars)
   - `github_repo` - Code demonstrations, experiments (Jupyter notebooks/CLI tools)

3. **Creator Agent** - Routes to format-specific creator:
   - **Blog Creator V2** - 3-stage pipeline (plan → generate → review)
   - **Mastodon Creator V2** - 3-stage pipeline (plan → generate → review)
   - **Code Creator V2** - 5-stage pipeline with iteration loop
```

#### 2. docs/ARCHITECTURE.md

**Updates:**

1. **Replace Gemini references** (already done)

2. **Add Detailed Agent Flow Diagrams**:
   - One diagram per creator (blog, mastodon, code)
   - Show inputs, outputs, models used
   - Explain stage transitions

3. **Add Logging Architecture Section**:
   - Explain logger utility design
   - Show example logs at each stage
   - Document log levels and filtering

4. **Add Troubleshooting Guide**:
   - Common failure scenarios
   - How to diagnose issues from logs
   - Recovery strategies

**Example Content:**
```markdown
## Logging Architecture

The system uses a centralized Logger utility for consistent, traceable logging across all agents.

### Logger Features

- **Execution Tracking**: Each pipeline run gets a unique execution ID
- **Context Propagation**: User ID, idea ID, and stage automatically included
- **Structured Output**: Optional JSON format for machine parsing
- **Token Accounting**: Tracks LLM usage per stage
- **Stage Timing**: Measures duration of each pipeline stage

### Log Levels

- `DEBUG`: Detailed internal state (model params, prompts)
- `INFO`: Key events (stage start/end, decisions made)
- `WARN`: Recoverable issues (API key missing, fallback used)
- `ERROR`: Failures (exception details, stack traces)

### Reading the Logs

Example log output:
```
[2026-01-21T15:30:45.123Z] INFO  [exec-abc123] [judge-agent] 📊 Evaluating ideas
   candidates: 5
   criteria: [impact, originality, feasibility, timeliness]

[2026-01-21T15:30:47.456Z] INFO  [exec-abc123] [judge-agent] ✅ Selected idea
   ideaId: idea-789
   title: "Understanding depth perception"
   score: 85
   reasoning: "High impact, original perspective, feasible as blog"
```

**How to trace a specific execution:**
1. Find the execution ID from the first log line (e.g., `exec-abc123`)
2. Search/filter logs for that execution ID
3. Follow the progression: judge → router → creator → completion
```

#### 3. Create New File: docs/LOGGING.md

**Content:**
- Complete logging guide
- All emoji meanings
- Log level descriptions
- Example logs for each stage
- Troubleshooting with logs
- Searching and filtering techniques

---

## 🛠️ Implementation Plan

### Phase 1: Fix `withStructuredOutput` Error (15 minutes)

**File:** `src/lib/agents/creators/blog-creator-v2.ts`

**Changes:**

**In `planBlog()` function (line 151-152):**
```typescript
// Before (broken)
const model = createModel(ModelRecommendations.planning, 0.7);
const structuredModel = model.withStructuredOutput(BlogPlanSchema);

// After (fixed)
const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.7,
  apiKey: process.env.OPENAI_API_KEY,
});
const structuredModel = model.withStructuredOutput(BlogPlanSchema);
```

**In `generateBlog()` function (line 220-221):**
```typescript
// Before (uses createModel)
const model = createModel(ModelRecommendations.textGeneration, 0.8);

// After (direct instantiation)
const model = new ChatAnthropic({
  modelName: 'claude-3-5-haiku-20241022',
  temperature: 0.8,
  apiKey: process.env.ANTHROPIC_API_KEY,
});
```

**In `reviewBlog()` function (line 289-290):**
```typescript
// Before (uses createModel)
const model = createModel(ModelRecommendations.review, 0.5);

// After (direct instantiation)
const model = new ChatOpenAI({
  modelName: 'gpt-4o-mini',
  temperature: 0.5,
  apiKey: process.env.OPENAI_API_KEY,
});
```

**Same changes needed in:**
- `src/lib/agents/creators/mastodon-creator-v2.ts` (3 functions: planThread, generateThread, reviewThread)

**Verification:**
1. Restart dev server
2. Try expanding the "rise of capitalism" idea again
3. Should see "STAGE 1: Planning" complete successfully
4. Check that blog is generated without errors

---

### Phase 2: Create Logger Utility (30 minutes)

**Create:** `src/lib/logging/logger.ts`

```typescript
import { randomUUID } from 'crypto';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogContext {
  executionId?: string;
  userId?: string;
  ideaId?: string;
  stage?: string;
  subStage?: string;
}

export interface LogData {
  [key: string]: any;
}

export interface TokenUsage {
  input: number;
  output: number;
  model: string;
  cost?: number;
}

export class Logger {
  private context: LogContext;
  private tokenUsage: TokenUsage[] = [];
  private startTime: number;

  constructor(context: LogContext = {}) {
    this.context = {
      executionId: context.executionId || `exec-${randomUUID().slice(0, 8)}`,
      ...context,
    };
    this.startTime = Date.now();
  }

  // Create child logger with additional context
  child(additionalContext: Partial<LogContext>): Logger {
    return new Logger({
      ...this.context,
      ...additionalContext,
    });
  }

  // Log methods
  debug(message: string, data?: LogData): void {
    this.log('DEBUG', message, data);
  }

  info(message: string, data?: LogData): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: LogData): void {
    this.log('WARN', message, data);
  }

  error(message: string, errorOrData?: Error | LogData): void {
    const data = errorOrData instanceof Error
      ? { error: errorOrData.message, stack: errorOrData.stack }
      : errorOrData;
    this.log('ERROR', message, data);
  }

  // Track token usage
  trackTokens(usage: TokenUsage): void {
    this.tokenUsage.push(usage);
    this.debug('Token usage tracked', usage);
  }

  // Get total tokens
  getTotalTokens(): { input: number; output: number; total: number } {
    const input = this.tokenUsage.reduce((sum, u) => sum + u.input, 0);
    const output = this.tokenUsage.reduce((sum, u) => sum + u.output, 0);
    return { input, output, total: input + output };
  }

  // Get execution duration
  getDuration(): number {
    return Date.now() - this.startTime;
  }

  // Core logging method
  private log(level: LogLevel, message: string, data?: LogData): void {
    const timestamp = new Date().toISOString();
    const { executionId, userId, ideaId, stage, subStage } = this.context;

    // Human-readable format (current style with enhancements)
    const prefix = [
      `[${timestamp}]`,
      level.padEnd(5),
      executionId ? `[${executionId}]` : '',
      stage ? `[${stage}${subStage ? `/${subStage}` : ''}]` : '',
    ].filter(Boolean).join(' ');

    console.log(`${prefix} ${message}`);

    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        console.log(`   ${key}:`, value);
      });
    }

    // TODO: Also write to file or external logging service in production
  }

  // Get current context (useful for passing to child components)
  getContext(): LogContext {
    return { ...this.context };
  }
}

// Export singleton for convenience
export const createLogger = (context?: LogContext): Logger => {
  return new Logger(context);
};
```

---

### Phase 3: Add Logging to Pipeline (60 minutes)

**Update these files in order:**

#### 3.1: `src/app/api/expand/route.ts`

Add at top:
```typescript
import { createLogger } from '@/lib/logging/logger';
```

Add after line 20 (after getting ideas):
```typescript
const logger = createLogger({
  userId,
  ideaId: specificIdeaId || 'auto-judge',
  stage: 'api-endpoint',
});

logger.info('📥 Expand request received', {
  userId,
  ideaCount: pendingIdeas.length,
  specificIdeaId: specificIdeaId || 'auto-judge (will select best)',
});
```

Replace line 77 log with:
```typescript
logger.info('🤖 Starting agent pipeline', {
  allIdeasCount: state.allIdeas.length,
});
```

Add before line 127 (before invoking graph):
```typescript
const pipelineStartTime = Date.now();
```

Replace line 153 with:
```typescript
const pipelineDuration = Date.now() - pipelineStartTime;
logger.info('✅ Expansion complete', {
  status: 'success',
  selectedIdea: finalState.selectedIdea?.title,
  chosenFormat: finalState.chosenFormat,
  tokensUsed: finalState.tokensUsed,
  durationMs: pipelineDuration,
  outputId,
});
```

#### 3.2: `src/lib/agents/graph.ts`

Add logger to state type and pass through:
```typescript
import { createLogger, Logger } from '@/lib/logging/logger';

// In createAgentGraph function, initialize logger
const logger = createLogger({
  userId: initialState.userId,
  ideaId: initialState.specificIdeaId,
  stage: 'graph-orchestrator',
});

// Pass to state
const graphState = {
  ...initialState,
  logger,
};

// Log at start
logger.info('🚀 Starting agent pipeline', {
  ideaCount: initialState.allIdeas.length,
  specificIdeaId: initialState.specificIdeaId,
});

// Log at end
logger.info('✅ Agent pipeline complete', {
  selectedIdea: finalState.selectedIdea?.title,
  chosenFormat: finalState.chosenFormat,
  contentGenerated: !!finalState.generatedContent,
  tokensUsed: finalState.tokensUsed,
  errors: finalState.errors?.length || 0,
  durationMs: logger.getDuration(),
});
```

#### 3.3: `src/lib/agents/judge-agent.ts`

Add comprehensive logging:
```typescript
import { Logger } from '@/lib/logging/logger';

export async function judgeAgent(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const logger = state.logger?.child({ stage: 'judge-agent' });

  // Log candidates
  logger?.info('📊 Evaluating ideas', {
    candidateCount: allIdeas.length,
    candidates: allIdeas.map(i => ({
      id: i.id,
      title: i.title,
      timesEvaluated: i.times_evaluated,
    })),
  });

  // ... existing logic ...

  // Log decision
  logger?.info('✅ Idea selected', {
    ideaId: selectedIdea.id,
    title: selectedIdea.title,
    score: judgeScore,
    reasoning: judgeReasoning,
  });

  return {
    selectedIdea,
    judgeScore,
    judgeReasoning,
    tokensUsed: tokens,
  };
}
```

#### 3.4: `src/lib/agents/router-agent.ts`

```typescript
export async function routerAgent(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const logger = state.logger?.child({ stage: 'router-agent' });

  logger?.info('🎯 Analyzing idea for format', {
    ideaId: selectedIdea.id,
    title: selectedIdea.title,
  });

  // ... existing logic ...

  logger?.info('✅ Format selected', {
    format: result.format,
    reasoning: result.reasoning,
  });

  return {
    chosenFormat: result.format,
    formatReasoning: result.reasoning,
    tokensUsed: tokens,
  };
}
```

#### 3.5: `src/lib/agents/creators/blog-creator-v2.ts`

Enhance existing logs:
```typescript
export async function createBlogV2(idea: any): Promise<...> {
  const logger = createLogger({
    ideaId: idea.id,
    stage: 'blog-creator',
  });

  logger.info('📝 === BLOG CREATOR V2 ===', {
    ideaTitle: idea.title,
  });

  // STAGE 1
  logger.info('📋 STAGE 1: Planning', {
    model: 'gpt-4o-mini',
  });
  // ... planning logic ...
  logger.info('✅ Planning complete', {
    sections: state.plan.sections,
    targetWordCount: state.plan.targetWordCount,
    imageSpecs: state.plan.imageSpecs.length,
    tokensUsed: planResult.tokensUsed,
  });

  // STAGE 2
  logger.info('🛠️  STAGE 2: Generation', {
    model: 'claude-haiku',
  });
  // ... generation logic ...
  logger.info('✅ Generation complete', {
    wordCount: state.draft.wordCount,
    imagesGenerated: state.draft.images.length,
    readingTime: state.draft.readingTimeMinutes,
    tokensUsed: draftResult.tokensUsed,
  });

  // STAGE 3
  logger.info('🔍 STAGE 3: Review', {
    model: 'gpt-4o-mini',
  });
  // ... review logic ...
  logger.info('✅ Review complete', {
    overallScore: state.review.overallScore,
    categoryScores: state.review.categoryScores,
    recommendation: state.review.recommendation,
    tokensUsed: reviewResult.tokensUsed,
  });

  logger.info('✅ === BLOG COMPLETE ===', {
    totalTokens: state.totalTokens,
    durationMs: logger.getDuration(),
  });

  return { content, tokensUsed: state.totalTokens };
}
```

**Repeat similar pattern for:**
- `src/lib/agents/creators/mastodon-creator-v2.ts`
- `src/lib/agents/creators/code/code-creator-v2.ts` (already has good logs, just add logger utility)

---

### Phase 4: Update Documentation (45 minutes)

#### 4.1: Update README.md

Add after "What's Working" section:

```markdown
## 🏗️ System Architecture

The automated idea expansion pipeline uses LangGraph to orchestrate a multi-stage AI workflow:

### High-Level Flow

```
User Idea → Judge Agent → Router Agent → Creator Agent → Saved Output
              ↓             ↓               ↓
           Evaluates    Chooses         Generates
           & selects    format          content
           best idea    (blog/          (3-5 stages
                        thread/         depending on
                        code)           format)
```

### Agent Pipeline Details

**1. Judge Agent** (`judge-agent.ts`)
- **Model:** GPT-4o-mini
- **Task:** Evaluate all pending ideas and select the best one
- **Criteria:** Impact, Originality, Feasibility, Timeliness, Clarity
- **Output:** Selected idea + score (0-100) + reasoning

**2. Router Agent** (`router-agent.ts`)
- **Model:** GPT-4o-mini
- **Task:** Decide optimal output format based on value to audience
- **Options:**
  - `blog_post` - Deep explanations, tutorials (1000-2000 words)
  - `twitter_thread` - Quick insights, tips (5-10 posts × 500 chars)
  - `github_repo` - Code demonstrations, experiments
- **Output:** Format + reasoning

**3. Creator Agent** (`creator-agent.ts`)
- **Task:** Route to format-specific creator and orchestrate generation

#### Blog Creator V2 (3 stages)
```
Plan → Generate → Review
  ↓       ↓         ↓
GPT    Claude    GPT
mini   Haiku     mini
```
- **Stage 1 (Plan):** Decide title, sections, tone, image specs
- **Stage 2 (Generate):** Create markdown + 1-3 images with captions
- **Stage 3 (Review):** Score on clarity, accuracy, engagement, image relevance

#### Mastodon Thread Creator V2 (3 stages)
```
Plan → Generate → Review
  ↓       ↓         ↓
GPT    Claude    GPT
mini   Haiku     mini
```
- **Stage 1 (Plan):** Decide hook, thread length, key points, hero image
- **Stage 2 (Generate):** Create 3-10 posts (≤500 chars each) + optional hero image
- **Stage 3 (Review):** Score on hook strength, flow, engagement, char compliance

#### Code Creator V2 (5 stages with iteration)
```
Plan → Generate → Review → Iterate? → Publish
  ↓       ↓         ↓         ↓          ↓
GPT    Claude    GPT    Score<75?    GitHub
mini   Sonnet    mini   Fix/Regen    (or dry-run)
```
- **Stage 1 (Plan):** Decide output type, language, architecture, quality rubric
- **Stage 2 (Generate):** Create all files, README, dependencies
- **Stage 3 (Review):** Score on correctness, security, quality, completeness
- **Stage 4 (Iterate):** If score < 75, either regenerate (score < 60) or fix specific files
- **Stage 5 (Publish):** Create GitHub repo (real or dry-run)

### Model Selection Strategy

| Task | Model | Why? |
|------|-------|------|
| Judge/Router | GPT-4o-mini | Fast, cheap ($0.15/1M input), good reasoning |
| Planning | GPT-4o-mini | Fast, cost-effective, good at structure |
| Text Generation | Claude Haiku | Superior writing quality ($0.25/1M input) |
| Code Generation | Claude Sonnet | Best at code (benchmarks leader, $3/1M input) |
| Review | GPT-4o-mini | Fast, consistent evaluation |

### Typical Costs Per Expansion

- **Blog Post:** ~$0.019 (planning + writing + 3 images + review)
- **Mastodon Thread:** ~$0.010 (planning + 5-10 posts + review)
- **Code Project:** $0.016-0.034 (depends on iterations, GitHub publishing)

---

## 📋 Understanding the Logs

The system uses emoji-prefixed logging for easy visual parsing:

### Log Emoji Guide

| Emoji | Meaning | Appears In |
|-------|---------|------------|
| 📥 | Request received | API endpoint |
| 🚀 | Pipeline starting | Graph orchestrator |
| 📊 | Evaluating/analyzing | Judge agent |
| 🎯 | Routing/deciding | Router agent |
| 📝 | Blog creation | Blog creator |
| 🦣 | Thread creation | Mastodon creator |
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

### Reading a Full Log Sequence

Example of a successful blog expansion:

```
[2026-01-21T15:30:45.123Z] INFO  [exec-abc123] [api-endpoint] 📥 Expand request received
   ideaCount: 5
   specificIdeaId: auto-judge (will select best)

[2026-01-21T15:30:45.456Z] INFO  [exec-abc123] [graph-orchestrator] 🚀 Starting agent pipeline
   ideaCount: 5

[2026-01-21T15:30:46.789Z] INFO  [exec-abc123] [judge-agent] 📊 Evaluating ideas
   candidateCount: 5

[2026-01-21T15:30:48.123Z] INFO  [exec-abc123] [judge-agent] ✅ Idea selected
   title: "Understanding depth perception"
   score: 85
   reasoning: "High impact, original perspective..."

[2026-01-21T15:30:48.456Z] INFO  [exec-abc123] [router-agent] 🎯 Analyzing idea for format
   title: "Understanding depth perception"

[2026-01-21T15:30:49.789Z] INFO  [exec-abc123] [router-agent] ✅ Format selected
   format: blog_post
   reasoning: "Best explained through long-form article..."

[2026-01-21T15:30:50.123Z] INFO  [exec-abc123] [blog-creator] 📝 === BLOG CREATOR V2 ===

[2026-01-21T15:30:50.456Z] INFO  [exec-abc123] [blog-creator/planning] 📋 STAGE 1: Planning
   model: gpt-4o-mini

[2026-01-21T15:30:52.789Z] INFO  [exec-abc123] [blog-creator/planning] ✅ Planning complete
   sections: 5
   imageSpecs: 2

[2026-01-21T15:30:53.123Z] INFO  [exec-abc123] [blog-creator/generation] 🛠️  STAGE 2: Generation
   model: claude-haiku

[2026-01-21T15:31:05.456Z] INFO  [exec-abc123] [blog-creator/generation] ✅ Generation complete
   wordCount: 1847
   imagesGenerated: 2

[2026-01-21T15:31:05.789Z] INFO  [exec-abc123] [blog-creator/review] 🔍 STAGE 3: Review
   model: gpt-4o-mini

[2026-01-21T15:31:07.123Z] INFO  [exec-abc123] [blog-creator/review] ✅ Review complete
   overallScore: 88
   recommendation: approve

[2026-01-21T15:31:07.456Z] INFO  [exec-abc123] [blog-creator] ✅ === BLOG COMPLETE ===
   totalTokens: 15234
   durationMs: 17333

[2026-01-21T15:31:08.789Z] INFO  [exec-abc123] [api-endpoint] ✅ Expansion complete
   status: success
   chosenFormat: blog_post
   tokensUsed: 15234
   durationMs: 23666
```

### Troubleshooting with Logs

**Finding Errors:**
1. Look for `[ERROR]` or `❌` in logs
2. Find the execution ID (e.g., `[exec-abc123]`)
3. Search for that execution ID to see full context
4. Check which stage failed (judge/router/creator)
5. Look at the error details and stack trace

**Common Issues:**

| Error Pattern | Likely Cause | Solution |
|---------------|--------------|----------|
| `Cannot read properties of undefined (reading '_zod')` | Model instantiation issue | Check API keys, restart server |
| `Failed to generate content: 401` | API key invalid/missing | Check `.env.local` |
| `Quality score < 75 after 5 iterations` | Idea too complex/vague | Refine idea description |
| `No pending ideas available` | All ideas already expanded | Add new ideas |
| `GitHub credentials not found` | Missing GitHub token | Add to `.env.local` (optional) |
```

#### 4.2: Update docs/ARCHITECTURE.md

Add comprehensive logging section:

```markdown
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
```

#### 4.3: Create docs/LOGGING.md

Full logging guide with all emoji meanings, troubleshooting examples, etc. (comprehensive reference).

---

## ✅ Success Criteria

### Fix Verification
- [ ] Blog creator completes Stage 1 (Planning) without error
- [ ] Blog creator generates full content successfully
- [ ] Mastodon creator works without errors
- [ ] No `withStructuredOutput` errors in any creator

### Logging Verification
- [ ] Every log line has timestamp and execution ID
- [ ] Can trace a single execution through all stages
- [ ] Judge agent logs show decision reasoning
- [ ] Router agent logs show format selection reasoning
- [ ] All creator stages log start, progress, and completion
- [ ] Token usage tracked at each stage
- [ ] Pipeline duration measured end-to-end
- [ ] Errors include full context (stage, execution ID, stack trace)

### Documentation Verification
- [ ] README has system architecture diagram
- [ ] README explains each agent's role clearly
- [ ] README has emoji guide for logs
- [ ] README has troubleshooting section
- [ ] ARCHITECTURE.md has detailed logging section
- [ ] ARCHITECTURE.md has agent flow diagrams
- [ ] LOGGING.md exists with comprehensive guide
- [ ] All Gemini references removed

---

## 🔍 Testing Plan

### Test 1: Blog Creation with Logs
```bash
1. Restart dev server: npm run dev
2. Navigate to /ideas page
3. Add idea: "The philosophy of minimalism"
4. Click "Expand" on that idea
5. Verify logs show:
   - Execution ID (e.g., [exec-abc123])
   - Judge evaluation (if multiple ideas)
   - Router selection: blog_post
   - Blog creator stages 1-3 complete
   - Token usage tracked
   - Final completion with duration
6. Check /outputs page for generated blog
```

### Test 2: Thread Creation with Logs
```bash
1. Add idea: "5 tips for productivity"
2. Click "Expand"
3. Verify logs show:
   - Router selection: twitter_thread
   - Thread creator stages 1-3 complete
   - Post count and character compliance
```

### Test 3: Code Creation with Logs
```bash
1. Add idea: "Fibonacci sequence visualizer"
2. Click "Expand"
3. Verify logs show:
   - Router selection: github_repo
   - Code creator stages 1-3 complete
   - Quality score displayed
   - Iteration loop if score < 75
   - GitHub publish (dry-run or real)
```

### Test 4: Error Handling
```bash
1. Temporarily remove OPENAI_API_KEY from .env.local
2. Try expanding an idea
3. Verify error logs include:
   - Execution ID
   - Stage where error occurred
   - Full error message and stack trace
4. Restore API key
```

### Test 5: Log Tracing
```bash
1. Expand any idea
2. Note the execution ID from first log
3. Search terminal for that execution ID
4. Verify you can trace the full pipeline:
   - API request → Judge → Router → Creator → Completion
5. Verify all stages have the same execution ID
```

---

## 📁 Files to Modify

### Critical (Must Change)

1. **`src/lib/agents/creators/blog-creator-v2.ts`**
   - Fix: Replace `createModel()` with direct instantiation (3 functions)
   - Add: Enhanced logging with logger utility

2. **`src/lib/agents/creators/mastodon-creator-v2.ts`**
   - Fix: Replace `createModel()` with direct instantiation (3 functions)
   - Add: Enhanced logging with logger utility

3. **`src/lib/logging/logger.ts`** (NEW)
   - Create: Logger utility class with all features

4. **`src/app/api/expand/route.ts`**
   - Add: Logger initialization and comprehensive logging

5. **`src/lib/agents/graph.ts`**
   - Add: Logger to state, log transitions

6. **`src/lib/agents/judge-agent.ts`**
   - Add: Comprehensive logging with decision details

7. **`src/lib/agents/router-agent.ts`**
   - Add: Comprehensive logging with format selection details

8. **`src/lib/agents/creator-agent.ts`**
   - Add: Enhanced logging around format routing

### Documentation

9. **`README.md`**
   - Add: System architecture section with diagrams
   - Add: Logging guide section
   - Add: Troubleshooting section

10. **`docs/ARCHITECTURE.md`**
    - Add: Logging architecture section
    - Add: Detailed agent flow diagrams
    - Update: Remove remaining Gemini references

11. **`docs/LOGGING.md`** (NEW)
    - Create: Comprehensive logging guide

---

## 🎯 Implementation Order

1. **Fix `withStructuredOutput` error** (15 min)
   - blog-creator-v2.ts: 3 functions
   - mastodon-creator-v2.ts: 3 functions
   - **Test immediately** - verify blog creation works

2. **Create logger utility** (30 min)
   - src/lib/logging/logger.ts
   - Add tests if time permits

3. **Add logging to pipeline** (60 min)
   - Start with API endpoint and graph
   - Then judge and router agents
   - Finally creators (blog, mastodon, code)
   - **Test continuously** - verify logs appear correctly

4. **Update documentation** (45 min)
   - README.md architecture and logging sections
   - ARCHITECTURE.md enhancements
   - Create LOGGING.md

5. **End-to-end testing** (30 min)
   - Test all three content types with logging
   - Verify log tracing works
   - Test error scenarios
   - Verify documentation is clear

**Total Estimated Time:** 3 hours

---

## 💡 Key Design Decisions

### Why Direct Model Instantiation?

**Instead of fixing `createModel()` type annotation, we're using direct instantiation because:**
1. It's what judge-agent and router-agent already do (consistency)
2. Simpler - no type narrowing needed
3. Explicit - you see exactly which model is being used
4. Less fragile - no union type complexity

### Why Logger Utility Instead of Library?

**We're building our own logger instead of using Winston/Pino because:**
1. Lightweight - no heavy dependencies
2. Customized for our needs (execution IDs, token tracking, stage context)
3. Can evolve as needed
4. Human-readable format matches existing style (emoji-prefixed)
5. Can add structured JSON output later if needed

### Why Pass Logger Through State?

**LangGraph state is the perfect place for logger because:**
1. Automatically available in all nodes
2. Context propagates naturally (userId, ideaId flow through)
3. Child loggers can add stage-specific context
4. No global state needed

---

## 🚀 Future Enhancements (Not in This Plan)

- **Structured JSON logging mode** for production (machine-parseable)
- **Log aggregation service integration** (Datadog, Splunk, etc.)
- **Performance metrics dashboard** showing stage durations, token costs
- **Real-time log streaming** to frontend for user visibility
- **Log-based analytics** (success rates, popular formats, average costs)
- **Automated issue detection** from error patterns in logs
- **Cost optimization alerts** when token usage exceeds thresholds

---

This plan provides a comprehensive fix for the immediate error, dramatically improves system observability through enhanced logging, and creates clear documentation with architecture diagrams to help you understand and maintain the system.
