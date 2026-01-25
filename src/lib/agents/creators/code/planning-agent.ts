import { ChatOpenAI } from '@langchain/openai';
import type { CodePlan } from './types';
import { z } from 'zod';

/**
 * PLANNING AGENT (V2 - Structured Outputs)
 *
 * Purpose: Analyze an idea and create an implementation plan
 *
 * This agent acts like a software architect, making high-level decisions:
 * - What type of output? (notebook, CLI app, web app, library, demo script)
 * - Which language? (Python for data/ML, JS/TS for web, etc.)
 * - How complex? (simple script vs full application)
 * - Which framework? (if applicable)
 *
 * Why separate planning from generation?
 * - Planning requires different thinking than coding
 * - Makes the generation agent more focused
 * - Allows us to validate the plan before generating
 * - Easier to add human-in-the-loop approval later
 *
 * V2 Improvements:
 * - Uses Zod schemas with structured outputs (guaranteed valid JSON)
 * - No manual JSON parsing or error handling needed
 * - Type-safe: schema directly matches CodePlan interface
 *
 * Model choice: GPT-5 Nano
 * - Cheap and fast
 * - Good at structured reasoning and decision-making
 * - Note: Only supports default temperature (1)
 */

// Define the schema for quality rubrics
const QualityDimensionSchema = z.object({
  weight: z.number().describe('Weight of this dimension (0-1, should sum to 1 across all dimensions)'),
  criteria: z.array(z.string()).describe('List of specific, measurable criteria'),
});

const QualityRubricSchema = z.object({
  correctness: QualityDimensionSchema.describe('Functional correctness criteria (typically 40% weight)'),
  security: QualityDimensionSchema.describe('Security criteria (typically 30% weight)'),
  codeQuality: QualityDimensionSchema.describe('Code quality criteria (typically 20% weight)'),
  completeness: QualityDimensionSchema.describe('Completeness criteria (typically 10% weight)'),
});

// Define the main planning schema
const CodePlanSchema = z.object({
  outputType: z.enum(['notebook', 'cli-app', 'web-app', 'library', 'demo-script'])
    .describe('Type of code artifact to generate'),
  language: z.enum(['python', 'javascript', 'typescript', 'rust'])
    .describe('Programming language to use'),
  framework: z.string().nullable()
    .describe('Framework to use (e.g., "flask", "react", "next.js") or null'),
  architecture: z.enum(['simple', 'modular', 'full-stack'])
    .describe('Architectural complexity level'),
  modelTier: z.enum(['simple', 'modular', 'complex'])
    .describe('Determines which model to use for generation: simple/modular use Sonnet 4.5, complex uses O1/O3 extended thinking'),
  codeComplexityScore: z.number().min(1).max(10)
    .describe('1-10 score of code complexity (1-3: simple, 4-7: modular, 8-10: complex)'),
  reasoning: z.string()
    .describe('2-3 sentences explaining the decisions made'),
  estimatedComplexity: z.enum(['low', 'medium', 'high'])
    .describe('Overall implementation difficulty'),
  implementationSteps: z.array(z.string())
    .describe('3-7 specific implementation steps in order'),
  qualityRubric: QualityRubricSchema
    .describe('Evaluation criteria across four dimensions'),
  criticalFiles: z.array(z.string())
    .describe('2-4 critical files that must work correctly'),
  testCriteria: z.array(z.string())
    .describe('Criteria to validate the implementation works'),
});

type CodePlanOutput = z.infer<typeof CodePlanSchema>;

export async function planCodeProject(idea: {
  id: string;
  title: string;
  description: string | null;
}): Promise<{ plan: CodePlan }> {
  console.log(`🎯 Planning code project for: "${idea.title}"`);

  const model = new ChatOpenAI({
    modelName: 'gpt-5-nano-2025-08-07',
    // Note: GPT-5 nano only supports default temperature (1)
  });

  // Use structured output (guarantees valid JSON matching our schema)
  const structuredModel = model.withStructuredOutput(CodePlanSchema);

  const prompt = buildPlanningPrompt(idea);

  try {
    const result = await structuredModel.invoke(prompt);

    console.log(`  ✅ Plan: ${result.outputType} using ${result.language}`);
    console.log(`  📊 Complexity: ${result.estimatedComplexity}`);
    console.log(`  💡 Reasoning: ${result.reasoning.substring(0, 100)}...`);
    console.log(`  📋 Steps: ${result.implementationSteps.length} implementation steps`);
    console.log(`  📁 Critical files: ${result.criticalFiles.join(', ')}`);

    // Convert to CodePlan (handle nullable framework)
    const plan: CodePlan = {
      ...result,
      framework: result.framework || undefined,
    };

    return {
      plan,
    };
  } catch (error) {
    console.error('❌ Planning agent failed:', error);
    throw new Error(`Planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Build the planning prompt
 *
 * This prompt guides the LLM to think like a software architect.
 * Note: We don't need to specify JSON format - structured outputs handle that automatically.
 */
function buildPlanningPrompt(idea: {
  title: string;
  description: string | null;
}): string {
  return `You are a software architect planning a code implementation.

IDEA TO IMPLEMENT:
Title: ${idea.title}
Description: ${idea.description || 'No additional description provided'}

Your task is to create a detailed implementation plan. Think carefully about:

1. **OUTPUT TYPE** - What's the best format for this idea?
   - **notebook**: Interactive Jupyter notebook (best for data exploration, tutorials, experiments)
   - **cli-app**: Command-line tool (best for utilities, automation scripts, tools)
   - **web-app**: Web application (best for interactive demos, dashboards, user-facing tools)
   - **library**: Reusable code library (best for algorithms, utilities meant to be imported)
   - **demo-script**: Simple standalone script (best for quick demos, examples)

2. **LANGUAGE** - Which programming language fits best?
   - **python**: Data science, ML, scripting, scientific computing, automation
   - **javascript**: Web apps, front-end, simple demos
   - **typescript**: Complex web apps, type-safe applications, full-stack projects
   - **rust**: Performance-critical, systems programming, CLI tools

3. **FRAMEWORK** (if applicable):
   - Python: flask, fastapi, streamlit, or None
   - JavaScript/TypeScript: react, next.js, express, or vanilla
   - Examples: "next.js" for a TypeScript web app, "flask" for a Python API

4. **ARCHITECTURE** - How complex should it be?
   - **simple**: Single file for truly trivial demos (< 50 lines, basic examples only)
   - **modular**: Multiple files with clear separation (2-10 files, 100-1000 lines) [PREFERRED DEFAULT]
   - **full-stack**: Complete application with frontend, backend, database (10+ files, 1000+ lines)

5. **COMPLEXITY** - Estimate implementation difficulty:
   - **low**: Basic concepts, straightforward implementation
   - **medium**: Some complexity, multiple components
   - **high**: Advanced concepts, significant implementation work

DECISION GUIDELINES:
- If the idea mentions "analyze", "explore", "visualize" → Consider notebook
- If it's a tool, utility, or automation → Consider cli-app
- If it needs user interaction or UI → Consider web-app
- If it's an algorithm or reusable code → Consider library
- If it's a quick proof-of-concept → Consider demo-script

- Python is usually best for data, ML, scientific computing
- JavaScript/TypeScript for anything web-related
- Create well-structured, professional code with proper separation of concerns
- Use multiple files for modular architecture (2+ files minimum for 'modular')
- Include comprehensive documentation and examples

6. **MODEL TIER SELECTION** - Assess code complexity and choose the right model:

   Assess complexity based on:
   - Number of files needed (1 file = simple, 2-10 = modular, 10+ = complex)
   - Architectural patterns (single script = simple, MVC = modular, microservices = complex)
   - Integration requirements (none = simple, 1-2 APIs = modular, multiple systems = complex)
   - State management needs (no state = simple, local state = modular, distributed state = complex)

   **codeComplexityScore** (1-10):
   - 1-3: Simple single-file scripts, basic examples
   - 4-7: Multi-file projects with moderate architecture
   - 8-10: Complex systems with advanced patterns

   **modelTier** - Set to 'complex' if ANY of:
   - Full-stack application with frontend + backend + database
   - Distributed system or microservices architecture
   - Real-time features (websockets, streaming, pub/sub)
   - Complex state management or caching layers
   - 10+ files required
   - Advanced algorithms requiring deep reasoning

   Otherwise use 'modular' for multi-file projects or 'simple' for single scripts.

   Examples:
   - Simple calculator script → modelTier: 'simple', score: 2
   - REST API with 3-4 routes → modelTier: 'modular', score: 5
   - Full-stack e-commerce app → modelTier: 'complex', score: 9

7. **IMPLEMENTATION PLANNING** - Create a detailed roadmap:
   - List 3-7 specific implementation steps in order
   - Identify 2-4 critical files that must work correctly
   - Define test criteria to validate the implementation

8. **QUALITY RUBRIC** - Define evaluation criteria across four dimensions:

   **Correctness (40%)**: What makes the code functionally correct?
   Examples: "All functions handle edge cases", "Input validation implemented"

   **Security (30%)**: What security measures must be in place?
   Examples: "No hardcoded secrets", "Input sanitization for user data"

   **Code Quality (20%)**: What quality standards apply?
   Examples: "Consistent naming conventions", "Functions under 50 lines", "Adequate comments"

   **Completeness (10%)**: What features/documentation must be included?
   Examples: "README with setup instructions", "Example usage included", "Error messages are clear"

   For each dimension, list 2-4 specific, measurable criteria.

EXAMPLE OUTPUT STRUCTURE:
- outputType: "notebook" for interactive exploration, "cli-app" for command-line tools, etc.
- language: "python" for data/ML, "typescript" for web apps, etc.
- framework: "flask", "next.js", or null
- architecture: "simple" (<50 lines, single file), "modular" (2-10 files, 100-1000 lines), "full-stack" (10+ files, 1000+ lines)
- modelTier: "simple" | "modular" | "complex" (determines which AI model to use for code generation)
- codeComplexityScore: 1-10 (quantifies implementation complexity)
- reasoning: 2-3 sentences explaining your architectural decisions
- estimatedComplexity: "low" (straightforward), "medium" (some complexity), "high" (advanced)
- implementationSteps: 3-7 ordered steps like:
  * "Set up project structure with main file and dependencies"
  * "Implement core functionality with input validation"
  * "Add error handling and edge case coverage"
  * "Create comprehensive README with examples"
- qualityRubric: Four dimensions with weights summing to 1.0:
  * correctness (weight 0.4): ["Code runs without syntax errors", "All functions handle edge cases"]
  * security (weight 0.3): ["No hardcoded secrets", "Input sanitization"]
  * codeQuality (weight 0.2): ["Consistent naming", "Adequate comments"]
  * completeness (weight 0.1): ["README with setup instructions", "Example usage"]
- criticalFiles: ["main.py", "README.md"] - 2-4 most important files
- testCriteria: ["Run code without errors", "Test with sample inputs"] - validation steps`;
}

/**
 * Note: With structured outputs, we no longer need parseCodePlan()!
 * The LLM guarantees valid output matching our Zod schema, so:
 * - No JSON parsing errors
 * - No validation needed
 * - No manual error handling
 * - Type safety built-in
 */
