import { ChatOpenAI } from '@langchain/openai';
import type { CodePlan } from './types';
import { buildCodePlanningPrompt } from '../../prompts/code-planning-prompt';
import { z } from 'zod';

/**
 * PLANNING AGENT (Structured Outputs)
 *
 * Purpose: Analyze an idea and create an implementation plan
 *
 * This agent acts like a software architect, making high-level decisions:
 * - What type of output? (notebook, CLI app, web app, library, demo script)
 * - Which language? (Python for data/ML, JS/TS for web, etc.)
 * - How complex? (simple script vs full application)
 * - Which framework? (if applicable)
 * - What model tier for generation? (Sonnet for simple/modular, O1 for complex)
 *
 * Why separate planning from generation?
 * - Planning requires different thinking than coding
 * - Makes the generation agent more focused
 * - Allows us to validate the plan before generating
 * - Enables intelligent model routing based on complexity
 *
 * Architecture:
 * - Uses Zod schemas with structured outputs (guaranteed valid JSON)
 * - No manual JSON parsing or error handling needed
 * - Type-safe: schema directly matches CodePlan interface
 * - Calculates complexity score (1-10) to determine model tier
 * - Defines 5-dimensional quality rubric (correctness, security, code quality, completeness, documentation)
 *
 * Model choice: GPT-5 Nano
 * - Cheap and fast (best cost/speed for planning)
 * - Good at structured reasoning and decision-making
 * - Note: Only supports default temperature (1)
 */

// Define the schema for quality rubrics
const QualityDimensionSchema = z.object({
  weight: z.number().describe('Weight of this dimension (0-1, should sum to 1 across all dimensions)'),
  criteria: z.array(z.string()).describe('List of specific, measurable criteria'),
});

const QualityRubricSchema = z.object({
  correctness: QualityDimensionSchema.describe('Functional correctness criteria (typically 35% weight)'),
  security: QualityDimensionSchema.describe('Security criteria (typically 25% weight)'),
  codeQuality: QualityDimensionSchema.describe('Code quality criteria (typically 20% weight)'),
  completeness: QualityDimensionSchema.describe('Completeness criteria (typically 10% weight)'),
  documentation: QualityDimensionSchema.describe('Documentation quality criteria including README (typically 10% weight)'),
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

  const prompt = buildCodePlanningPrompt(idea);

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
 * Note: With structured outputs, we no longer need parseCodePlan()!
 * The LLM guarantees valid output matching our Zod schema, so:
 * - No JSON parsing errors
 * - No validation needed
 * - No manual error handling
 * - Type safety built-in
 */
