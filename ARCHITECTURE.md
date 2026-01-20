# Code Generation Architecture

## Overview

This system generates code projects using a multi-stage AI pipeline with quality iteration loops.

## Pipeline Flow

```
1. Planning Agent (GPT-5 Nano)
   ├─ Decides: outputType, language, architecture
   ├─ Creates: qualityRubric, implementationSteps, criticalFiles
   └─ Output: CodePlan
   ↓
2. Generation Agent (Claude Sonnet 4.5)
   ├─ Routes to specialized generators:
   │  ├─ Notebook → notebook-generator-v2.ts (NEW - structured outputs)
   │  ├─ CLI App → generateCLIApp()
   │  ├─ Library → generateDemoScript()
   │  └─ Demo → generateDemoScript()
   └─ Output: GeneratedCode (files, dependencies, instructions)
   ↓
3. Critic Agent (GPT-5 Nano)
   ├─ Evaluates against qualityRubric
   ├─ Scores: correctness, security, codeQuality, completeness
   └─ Output: CodeReview (score, issues, fixSuggestions)
   ↓
4. Quality Gate (score ≥ 75?)
   ├─ PASS → Publish to GitHub ✅
   └─ FAIL → Iterate (up to 5 times)
       ↓
5. Fixer Agent (Claude Sonnet 4.5)
   ├─ Decides: regenerate all vs fix specific files
   ├─ Uses: fixSuggestions from critic
   └─ Returns to step 3 (re-review)
```

## Models Used

| Agent | Model | Why |
|-------|-------|-----|
| **Planning** | `gpt-5-nano-2025-08-07` | Fast, cheap, good at structured reasoning |
| **Generation** | `claude-sonnet-4-5-20250929` | Best at coding (tops all benchmarks) |
| **Critic** | `gpt-5-nano-2025-08-07` | Cheap, good enough for reviews |
| **Fixer** | `claude-sonnet-4-5-20250929` | Consistency with generation |
| **Repo Names** | `gpt-5-nano-2025-08-07` | Simple task, fast |

## Notebook Generation (V2)

**Problem (Old Approach):**
- Asked LLM for massive JSON (25,000+ chars)
- Complex escaping required
- Frequent truncation/parsing errors
- Fragile regex extraction

**Solution (New Approach):**
```typescript
// 1. Use structured outputs (guaranteed valid JSON)
const model = new ChatAnthropic({...}).withStructuredOutput(schema);

// 2. Simple schema (just arrays of strings)
const schema = z.object({
  cells: z.array(z.object({
    type: z.enum(['markdown', 'code']),
    content: z.array(z.string()), // One line per string
  })),
  requiredPackages: z.array(z.string()),
});

// 3. Template function builds the .ipynb
function buildNotebookFromCells(cells) {
  return {
    cells: cells.map((cell, i) => ({
      cell_type: cell.type,
      id: generateCellId(i), // Required by nbformat 4.5+
      metadata: {},
      source: cell.content, // Already an array
      ...(cell.type === 'code' ? { outputs: [], execution_count: null } : {}),
    })),
    metadata: { kernelspec: {...}, language_info: {...} },
    nbformat: 4,
    nbformat_minor: 5,
  };
}
```

**Benefits:**
- ✅ No JSON parsing errors (structured outputs guarantee valid JSON)
- ✅ No escaping issues (arrays don't need escaping)
- ✅ Proper nbformat compliance (cell IDs, metadata)
- ✅ Separation of concerns (LLM generates content, template builds structure)

## Quality Iteration Loop

**Thresholds:**
- `QUALITY_THRESHOLD = 75` - Minimum acceptable score
- `POOR_QUALITY_THRESHOLD = 60` - Below this triggers full regeneration
- `MAX_ITERATIONS = 5` - Hard limit

**Decision Matrix:**

| Scenario | Action |
|----------|--------|
| Score ≥ 75 + approve | ✅ Publish immediately |
| Score < 60 (attempts < 2) | 🔄 Regenerate all files |
| Critic says "regenerate" | 🔄 Regenerate all files |
| Score 60-74 | 🔧 Fix specific files (targeted) |
| Score declines -10+ | ⚠️ Stop iterations (prevent degradation) |
| Reached 5 iterations | ⚠️ Accept with warning |

## Cost Analysis

**Average Project ($0.02-0.04):**
- Planning: ~$0.0005 (GPT-5 Nano)
- Generation: ~$0.015 (Claude Sonnet)
- Review: ~$0.001 (GPT-5 Nano)
- Iterations (0-2): ~$0.01-0.02

**Cost Optimizations:**
- ✅ Use GPT-5 Nano for cheap tasks
- ✅ Targeted file fixes (not full regeneration)
- ✅ Early stopping at score ≥75
- ✅ Short repo names (saves API calls)

## File Structure

```
src/lib/agents/creators/code/
├── code-creator-v2.ts          # Main orchestrator
├── planning-agent.ts            # GPT-5 Nano planning
├── generation-agent.ts          # Routes to generators
├── notebook-generator-v2.ts     # NEW: Clean notebook gen
├── critic-agent.ts              # GPT-5 Nano reviews
├── fixer-agent.ts               # Claude Sonnet fixes
└── types.ts                     # Shared interfaces
```

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| **Repo Name Length** | 120+ chars | 8-20 chars |
| **Average Score** | ~70 | ~80 |
| **First Success Rate** | 20% | 40% |
| **Notebook Parse Errors** | 80% | 0% (v2) |
| **Cost per Project** | $0.03 | $0.02-0.04 |

## References

- [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [LangChain ChatAnthropic Docs](https://docs.langchain.com/oss/python/integrations/chat/anthropic)
- [Jupyter nbformat Spec](https://nbformat.readthedocs.io/en/latest/format_description.html)
- [OpenAI GPT-5 Models](https://platform.openai.com/docs/models/gpt-5)
