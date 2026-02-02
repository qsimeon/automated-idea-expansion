/**
 * Shared Types for Multi-Stage Code Creator
 *
 * This file defines Zod schemas (NOT interfaces) for runtime validation.
 * Types are derived from schemas using z.infer<typeof Schema>.
 *
 * Benefits:
 * - Runtime type checking catches errors early
 * - Self-documenting via descriptions
 * - Can be used with LLM structured output
 * - Single source of truth (schema = validation = documentation)
 */

import { z } from 'zod';

/**
 * QUALITY RUBRIC SCHEMA - Evaluation criteria for code quality
 *
 * Defines specific, measurable criteria across five dimensions.
 * Used by critic agent for consistent evaluation.
 */
export const QualityRubricSchema = z.object({
  correctness: z.object({
    weight: z.number().describe('e.g., 0.35 (35% of total score)'),
    criteria: z.array(z.string()).describe(
      'e.g., ["All functions have error handling", "Input validation implemented"]'
    ),
  }),
  security: z.object({
    weight: z.number().describe('e.g., 0.25 (25% of total score)'),
    criteria: z.array(z.string()).describe(
      'e.g., ["No hardcoded secrets", "Input sanitization for user data"]'
    ),
  }),
  codeQuality: z.object({
    weight: z.number().describe('e.g., 0.2 (20% of total score)'),
    criteria: z.array(z.string()).describe(
      'e.g., ["Consistent naming conventions", "Functions under 50 lines"]'
    ),
  }),
  completeness: z.object({
    weight: z.number().describe('e.g., 0.1 (10% of total score)'),
    criteria: z.array(z.string()).describe(
      'e.g., ["All planned features implemented", "No TODO comments"]'
    ),
  }),
  documentation: z.object({
    weight: z.number().describe('e.g., 0.1 (10% of total score)'),
    criteria: z.array(z.string()).describe(
      'e.g., ["README includes architecture", "Multiple usage examples", "File structure explained"]'
    ),
  }),
});

export type QualityRubric = z.infer<typeof QualityRubricSchema>;

/**
 * CODE PLAN SCHEMA - Output from Planning Agent
 *
 * The planning agent analyzes the idea and decides:
 * - What type of code output to create
 * - Which programming language to use
 * - How complex the implementation should be
 * - What quality criteria to enforce
 */
export const CodePlanSchema = z.object({
  // Primary output format
  outputType: z.enum(['notebook', 'cli-app', 'web-app', 'library', 'demo-script']).describe(
    'Type of code artifact to generate'
  ),

  // Programming language choice
  language: z.enum(['python', 'javascript', 'typescript', 'rust']).describe(
    'Programming language for the generated code'
  ),

  // Framework (if applicable)
  framework: z.string().optional().describe('e.g., "react", "next.js", "flask", "fastapi"'),

  // Complexity level
  architecture: z.enum(['simple', 'modular', 'full-stack']).describe(
    'Architectural pattern for the code'
  ),

  // Model selection for code generation
  modelTier: z.enum(['simple', 'modular', 'complex']).describe(
    'Which AI model to use for generation'
  ),
  codeComplexityScore: z.number().min(1).max(10).describe(
    '1-3: simple, 4-7: modular, 8-10: complex'
  ),

  // Explanation of decisions
  reasoning: z.string().describe('Explanation of architectural decisions'),

  // Estimated complexity (for cost/time planning)
  estimatedComplexity: z.enum(['low', 'medium', 'high']).describe(
    'Estimated implementation complexity'
  ),

  // Step-by-step implementation plan
  implementationSteps: z.array(z.string()).optional().describe(
    'e.g., ["Set up project structure", "Implement core algorithm"]'
  ),

  // Quality evaluation criteria (used by critic)
  qualityRubric: QualityRubricSchema.optional(),

  // Critical files that must work correctly
  criticalFiles: z.array(z.string()).optional().describe(
    'e.g., ["main.py", "utils.py"]'
  ),

  // Test criteria for validation
  testCriteria: z.array(z.string()).optional().describe(
    'e.g., ["Run without errors", "Handle edge cases"]'
  ),
});

export type CodePlan = z.infer<typeof CodePlanSchema>;

/**
 * FILE DEFINITION SCHEMA - Individual code file
 */
export const CodeFileSchema = z.object({
  path: z.string().describe('e.g., "src/main.py", "README.md", "package.json"'),
  content: z.string().describe('Full file content'),
  language: z.string().optional().describe('For syntax highlighting'),
});

export type CodeFile = z.infer<typeof CodeFileSchema>;

/**
 * GENERATED CODE SCHEMA - Output from Generation Agent
 *
 * Contains all files, dependencies, and metadata for a code project
 */
export const GeneratedCodeSchema = z.object({
  repoName: z.string().describe('e.g., "sentiment-analyzer"'),
  description: z.string(),
  files: z.array(CodeFileSchema),

  // Dependencies/setup info
  dependencies: z.object({
    runtime: z.array(z.string()).describe('e.g., ["python", "node", "rust"]'),
    packages: z.array(z.string()).describe('e.g., ["numpy", "pandas"] or ["react", "next"]'),
  }).optional(),

  // Installation/run instructions
  setupInstructions: z.string(),
  runInstructions: z.string(),

  // Metadata from plan
  type: z.string().describe('e.g., "python" or "nodejs"'),
  outputType: z.enum(['notebook', 'cli-app', 'web-app', 'library', 'demo-script']),
});

export type GeneratedCode = z.infer<typeof GeneratedCodeSchema>;

/**
 * CODE ISSUE SCHEMA - Individual problem found by Critic
 */
export const CodeIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'suggestion']),
  file: z.string().describe('Which file has the issue'),
  line: z.number().nullable().describe('Line number (if applicable, or null)'),
  message: z.string().describe('Description of the issue'),
  suggestion: z.string().nullable().describe('How to fix it (or null)'),
});

export type CodeIssue = z.infer<typeof CodeIssueSchema>;

/**
 * CODE REVIEW SCHEMA - Output from Critic Agent
 *
 * Reviews generated code for quality, security, and correctness
 * Includes actionable feedback for the fixer agent
 */
export const CodeReviewSchema = z.object({
  hasErrors: z.boolean().describe('Are there blocking errors?'),
  issues: z.array(CodeIssueSchema).describe('All found issues'),
  overallScore: z.number().min(0).max(100).describe('Quality score 0-100'),
  recommendation: z.enum(['approve', 'revise', 'regenerate']),

  // Detailed feedback - always required
  strengths: z.array(z.string()).describe("What's good about the code"),
  weaknesses: z.array(z.string()).describe('What needs improvement'),
  securityConcerns: z.array(z.string()).describe('Any security issues'),

  // Scores by rubric category - always required
  categoryScores: z.object({
    correctness: z.number().min(0).max(100).describe('Code correctness: 0-100'),
    security: z.number().min(0).max(100).describe('Security practices: 0-100'),
    codeQuality: z.number().min(0).max(100).describe('Code quality & readability: 0-100'),
    completeness: z.number().min(0).max(100).describe('Completeness vs plan: 0-100'),
    documentation: z.number().min(0).max(100).describe('README and code documentation: 0-100'),
  }).describe('Quality scores across 5 dimensions'),

  // Files prioritized for fixing - always present (empty array if none)
  filePriority: z.array(z.object({
    file: z.string().describe('File path'),
    priority: z.enum(['high', 'medium', 'low']).describe('Fix priority'),
    reason: z.string().describe('Why this file needs fixing'),
  })).describe('Files prioritized for fixing (empty if none needed)').default([]),

  // Specific, actionable fix suggestions - always present (empty array if none)
  fixSuggestions: z.array(z.object({
    file: z.string().describe('File path'),
    issue: z.string().describe('What the issue is'),
    suggestedFix: z.string().describe('Detailed, implementable fix instruction'),
    priority: z.enum(['critical', 'important', 'minor']).describe('Fix priority'),
  })).describe('Fix suggestions (empty if no fixes needed)').default([]),
});

export type CodeReview = z.infer<typeof CodeReviewSchema>;

/**
 * CODE SUB-GRAPH STATE SCHEMA
 *
 * Shared state object passed between agents in the code creation sub-graph
 */
export const CodeCreationStateSchema = z.object({
  // Input (from main pipeline)
  idea: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
  }),

  // Planning stage
  plan: CodePlanSchema.nullable(),

  // Generation stage
  code: GeneratedCodeSchema.nullable(),

  // Review stage
  review: CodeReviewSchema.nullable(),

  // Iteration tracking
  attempts: z.number().describe('How many times we\'ve tried to fix issues'),
  maxAttempts: z.number().describe('Maximum fix attempts before giving up'),

  // Errors
  errors: z.array(z.string()),
});

export type CodeCreationState = z.infer<typeof CodeCreationStateSchema>;
