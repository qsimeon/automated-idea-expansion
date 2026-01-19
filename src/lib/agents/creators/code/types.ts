/**
 * Shared Types for Multi-Stage Code Creator
 *
 * This file defines the interfaces used across planning, generation,
 * critic, and fixer agents.
 */

/**
 * CODE PLAN - Output from Planning Agent
 *
 * The planning agent analyzes the idea and decides:
 * - What type of code output to create
 * - Which programming language to use
 * - How complex the implementation should be
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

  // Explanation of decisions
  reasoning: string;

  // Estimated complexity (for cost/time planning)
  estimatedComplexity: 'low' | 'medium' | 'high';
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
  line?: number; // Line number (if applicable)
  message: string; // Description of the issue
  suggestion?: string; // How to fix it (optional)
}

/**
 * CODE REVIEW - Output from Critic Agent
 *
 * Reviews generated code for quality, security, and correctness
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
