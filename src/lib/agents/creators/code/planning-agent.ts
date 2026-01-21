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
}): Promise<{ plan: CodePlan; tokensUsed: number }> {
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
    const tokensUsed = 0; // We'll estimate this for structured outputs

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
      tokensUsed,
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
   - **simple**: Single file or minimal structure (< 100 lines)
   - **modular**: Multiple files with clear separation (100-500 lines)
   - **full-stack**: Complete application with frontend, backend, database (> 500 lines)

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
- Keep it simple unless complexity is clearly needed

6. **IMPLEMENTATION PLANNING** - Create a detailed roadmap:
   - List 3-7 specific implementation steps in order
   - Identify 2-4 critical files that must work correctly
   - Define test criteria to validate the implementation

7. **QUALITY RUBRIC** - Define evaluation criteria across four dimensions:

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
- architecture: "simple" (<100 lines), "modular" (100-500 lines), "full-stack" (>500 lines)
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
