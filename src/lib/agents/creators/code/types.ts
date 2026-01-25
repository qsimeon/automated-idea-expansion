/**
 * Shared Types for Multi-Stage Code Creator
 *
 * This file defines the interfaces used across planning, generation,
 * critic, and fixer agents.
 */

/**
 * QUALITY RUBRIC - Evaluation criteria for code quality
 *
 * Defines specific, measurable criteria across four dimensions.
 * Used by critic agent for consistent evaluation.
 */
export interface QualityRubric {
  correctness: {
    weight: number; // e.g., 0.4 (40% of total score)
    criteria: string[]; // e.g., ["All functions have error handling", "Input validation implemented"]
  };
  security: {
    weight: number; // e.g., 0.3 (30% of total score)
    criteria: string[]; // e.g., ["No hardcoded secrets", "Input sanitization for user data"]
  };
  codeQuality: {
    weight: number; // e.g., 0.2 (20% of total score)
    criteria: string[]; // e.g., ["Consistent naming conventions", "Functions under 50 lines"]
  };
  completeness: {
    weight: number; // e.g., 0.1 (10% of total score)
    criteria: string[]; // e.g., ["README with setup instructions", "Example usage included"]
  };
}

/**
 * CODE PLAN - Output from Planning Agent
 *
 * The planning agent analyzes the idea and decides:
 * - What type of code output to create
 * - Which programming language to use
 * - How complex the implementation should be
 * - What quality criteria to enforce (NEW)
 */
export interface CodePlan {
  // Primary output format
  outputType: 'notebook' | 'cli-app' | 'web-app' | 'library' | 'demo-script';

  // Programming language choice
  language: 'python' | 'javascript' | 'typescript' | 'rust';

  // Framework (if applicable)
  framework?: string; // e.g., 'react', 'next.js', 'flask', 'fastapi'

  // Complexity level
  architecture: 'simple' | 'modular' | 'full-stack';

  // Model selection for code generation (NEW)
  modelTier: 'simple' | 'modular' | 'complex'; // Determines which AI model to use
  codeComplexityScore: number; // 1-10 score (1-3: simple, 4-7: modular, 8-10: complex)

  // Explanation of decisions
  reasoning: string;

  // Estimated complexity (for cost/time planning)
  estimatedComplexity: 'low' | 'medium' | 'high';

  // ===== NEW: Iteration Support Fields =====

  // Step-by-step implementation plan
  implementationSteps?: string[]; // e.g., ["Set up project structure", "Implement core algorithm"]

  // Quality evaluation criteria (used by critic)
  qualityRubric?: QualityRubric;

  // Critical files that must work correctly
  criticalFiles?: string[]; // e.g., ["main.py", "README.md"]

  // Test criteria for validation
  testCriteria?: string[]; // e.g., ["Run without errors", "Handle edge cases"]
}

/**
 * FILE DEFINITION - Individual code file
 */
export interface CodeFile {
  path: string; // e.g., 'src/main.py', 'README.md', 'package.json'
  content: string; // Full file content
  language?: string; // For syntax highlighting
}

/**
 * GENERATED CODE - Output from Generation Agent
 *
 * Contains all files, dependencies, and metadata for a code project
 */
export interface GeneratedCode {
  repoName: string; // e.g., 'sentiment-analyzer'
  description: string;
  files: CodeFile[];

  // Dependencies/setup info
  dependencies?: {
    runtime: string[]; // e.g., ['python', 'node', 'rust']
    packages: string[]; // e.g., ['numpy', 'pandas'] or ['react', 'next']
  };

  // Installation/run instructions
  setupInstructions: string;
  runInstructions: string;

  // Metadata from plan
  type: string; // e.g., 'python' or 'nodejs'
  outputType: CodePlan['outputType'];
}

/**
 * CODE ISSUE - Individual problem found by Critic
 */
export interface CodeIssue {
  severity: 'error' | 'warning' | 'suggestion';
  file: string; // Which file has the issue
  line: number | null; // Line number (if applicable, or null)
  message: string; // Description of the issue
  suggestion: string | null; // How to fix it (or null)
}

/**
 * CODE REVIEW - Output from Critic Agent
 *
 * Reviews generated code for quality, security, and correctness
 * Now includes actionable feedback for the fixer agent
 */
export interface CodeReview {
  hasErrors: boolean; // Are there blocking errors?
  issues: CodeIssue[]; // All found issues
  overallScore: number; // 0-100 quality score
  recommendation: 'approve' | 'revise' | 'regenerate';

  // Detailed feedback
  strengths: string[]; // What's good about the code
  weaknesses: string[]; // What needs improvement
  securityConcerns: string[]; // Any security issues

  // ===== NEW: Actionable Feedback for Fixer Agent =====

  // Scores by rubric category
  categoryScores?: {
    correctness: number; // 0-100
    security: number;
    codeQuality: number;
    completeness: number;
  };

  // Files prioritized for fixing
  filePriority?: {
    file: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
  }[];

  // Specific, actionable fix suggestions
  fixSuggestions?: {
    file: string;
    issue: string;
    suggestedFix: string; // Detailed, implementable fix instruction
    priority: 'critical' | 'important' | 'minor';
  }[];
}

/**
 * CODE SUB-GRAPH STATE
 *
 * Shared state object passed between agents in the code creation sub-graph
 */
export interface CodeCreationState {
  // Input (from main pipeline)
  idea: {
    id: string;
    title: string;
    description: string | null;
  };

  // Planning stage
  plan: CodePlan | null;

  // Generation stage
  code: GeneratedCode | null;

  // Review stage
  review: CodeReview | null;

  // Iteration tracking
  attempts: number; // How many times we've tried to fix issues
  maxAttempts: number; // Maximum fix attempts before giving up

  // Errors
  errors: string[];
}
