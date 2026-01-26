import { z } from 'zod';

/**
 * README SCHEMA - STRUCTURED OUTPUT PHILOSOPHY
 *
 * Instead of asking Claude to generate a markdown string and hoping it's well-formatted,
 * we define a strict Zod schema that Claude must follow.
 *
 * Benefits:
 * - Guaranteed all sections are present
 * - Type-safe validation at generation time
 * - Deterministic markdown rendering (no variation in format)
 * - Easy to modify styling later (just change the renderer)
 * - Can validate constraints (min/max items, word counts, etc.)
 *
 * Flow:
 * 1. Claude generates structured data matching this schema
 * 2. We validate it with Zod
 * 3. We render it to markdown deterministically
 */

// ===== ATOMIC BUILDING BLOCKS =====

/**
 * Feature: One key capability of the project
 *
 * Example:
 * {
 *   title: "Real-time Updates",
 *   description: "Fetches weather data every minute and updates automatically"
 * }
 */
export const ReadmeFeatureSchema = z.object({
  title: z.string().min(2).max(50)
    .describe('Feature name (2-50 chars, e.g., "Real-time Updates", "Dark Mode")'),
  description: z.string().min(10).max(200)
    .describe('What does this feature do? (10-200 chars, clear and concise)'),
});

export type ReadmeFeature = z.infer<typeof ReadmeFeatureSchema>;

/**
 * Installation Step: One action in the setup process
 *
 * Example:
 * {
 *   stepNumber: 1,
 *   instruction: "npm install",
 *   explanation: "Install all dependencies from package.json"
 * }
 */
export const ReadmeInstallationStepSchema = z.object({
  stepNumber: z.number().int().min(1)
    .describe('Step number (1, 2, 3, etc.)'),
  instruction: z.string().min(5).max(200)
    .describe('What to do (shell command or step, e.g., "npm install" or "Create a .env file")'),
  explanation: z.string().max(150).optional()
    .describe('Why we do this / what it does (optional, 0-150 chars)'),
});

export type ReadmeInstallationStep = z.infer<typeof ReadmeInstallationStepSchema>;

/**
 * Usage Example: Concrete code demonstrating a feature
 *
 * Example:
 * {
 *   title: "Basic Usage",
 *   description: "Display weather for a city",
 *   code: "const weather = getWeather('New York');\nconsole.log(weather.temp);",
 *   expectedOutput: "{ temp: 72, condition: 'Sunny' }"
 * }
 */
export const ReadmeUsageExampleSchema = z.object({
  title: z.string().min(3).max(50)
    .describe('Example name (3-50 chars, e.g., "Basic Usage", "With Error Handling")'),
  description: z.string().min(10).max(200)
    .describe('What does this example show? (10-200 chars)'),
  code: z.string().min(10).max(1000)
    .describe('Valid code snippet in the project language (10-1000 chars, must be runnable)'),
  expectedOutput: z.string().max(500).optional()
    .describe('What the user should see when running the code (optional, 0-500 chars)'),
});

export type ReadmeUsageExample = z.infer<typeof ReadmeUsageExampleSchema>;

/**
 * File Description: What one file does in the project
 *
 * Example:
 * {
 *   path: "src/weather.py",
 *   purpose: "Fetches weather data from OpenWeatherMap API and formats it"
 * }
 */
export const ReadmeFileSchema = z.object({
  path: z.string().min(3).max(100)
    .describe('File path relative to project root (e.g., "src/weather.py", "index.js")'),
  purpose: z.string().min(10).max(200)
    .describe('What does this file do? (10-200 chars, one sentence)'),
});

export type ReadmeFile = z.infer<typeof ReadmeFileSchema>;

/**
 * Troubleshooting Entry: Problem, cause, and solution
 *
 * Example:
 * {
 *   problem: "ImportError: No module named 'requests'",
 *   cause: "The requests library is not installed",
 *   solution: "Run 'pip install requests' to install the missing dependency"
 * }
 */
export const ReadmeTroubleshootingSchema = z.object({
  problem: z.string().min(5).max(100)
    .describe('What error or issue does the user encounter? (5-100 chars)'),
  cause: z.string().min(10).max(200)
    .describe('Why does it happen? (10-200 chars, explain root cause)'),
  solution: z.string().min(10).max(300)
    .describe('How to fix it (10-300 chars, steps or commands to run)'),
});

export type ReadmeTroubleshooting = z.infer<typeof ReadmeTroubleshootingSchema>;

/**
 * Dependency: External library/package used
 *
 * Example:
 * {
 *   name: "requests",
 *   version: "2.28.0",
 *   purpose: "HTTP library for making API calls"
 * }
 */
export const ReadmeDependencySchema = z.object({
  name: z.string().min(1).max(100)
    .describe('Package/library name (e.g., "requests", "react", "express")'),
  version: z.string().max(20).optional()
    .describe('Version requirement (optional, e.g., "2.28.0", "^3.0.0")'),
  purpose: z.string().min(10).max(200)
    .describe('What is it used for? (10-200 chars, plain language)'),
});

export type ReadmeDependency = z.infer<typeof ReadmeDependencySchema>;

// ===== SECTION SCHEMAS =====

/**
 * Architecture Section: How the code is organized
 */
export const ReadmeArchitectureSchema = z.object({
  overview: z.string().min(20).max(500)
    .describe('High-level explanation of how it works (20-500 chars, 2-3 sentences)'),
  diagram: z.string().min(10).max(1000)
    .describe('ASCII file tree or architecture diagram (10-1000 chars)'),
  files: z.array(ReadmeFileSchema).min(1).max(20)
    .describe('Explanation of important files (1-20 files)'),
  designDecisions: z.array(z.string().min(10).max(200)).min(0).max(5)
    .describe('Why were these architectural choices made? (0-5 decisions, 10-200 chars each)'),
});

export type ReadmeArchitecture = z.infer<typeof ReadmeArchitectureSchema>;

/**
 * Technical Details Section: Implementation info
 */
export const ReadmeTechnicalDetailsSchema = z.object({
  dependencies: z.array(ReadmeDependencySchema).min(0).max(15)
    .describe('External dependencies and their purposes (0-15 items)'),
  keyAlgorithms: z.array(z.string().min(10).max(200)).min(0).max(5)
    .describe('Important algorithms or patterns used (0-5 items, 10-200 chars each)'),
  importantNotes: z.array(z.string().min(10).max(200)).min(0).max(5)
    .describe('Technical considerations or gotchas (0-5 items, 10-200 chars each)'),
});

export type ReadmeTechnicalDetails = z.infer<typeof ReadmeTechnicalDetailsSchema>;

// ===== MAIN README SCHEMA =====

/**
 * Complete README structure
 *
 * This is the top-level schema that Claude must generate.
 * All sections are required, but some arrays can be empty (0 items allowed).
 */
export const ReadmeSchema = z.object({
  // ===== HEADER SECTION =====
  title: z.string().min(3).max(100)
    .describe('Project title (3-100 chars, same as project name)'),
  tagline: z.string().min(10).max(100)
    .describe('One-line catchphrase (10-100 chars, what the project does in a nutshell)'),
  description: z.string().min(50).max(500)
    .describe('Longer overview (50-500 chars, 3-5 sentences explaining what problem it solves)'),

  // ===== FEATURES =====
  features: z.array(ReadmeFeatureSchema).min(2).max(8)
    .describe('Key capabilities of this project (2-8 features, must have at least 2)'),

  // ===== INSTALLATION =====
  prerequisites: z.array(z.string().min(5).max(100)).min(0).max(5)
    .describe('Required software (0-5 items, e.g., "Python 3.10+", "Node.js 16+")'),
  installationSteps: z.array(ReadmeInstallationStepSchema).min(1).max(10)
    .describe('Step-by-step setup instructions (1-10 steps, must have at least 1)'),

  // ===== USAGE =====
  usageExamples: z.array(ReadmeUsageExampleSchema).min(2).max(5)
    .describe('Concrete usage examples showing different features (2-5 examples)'),

  // ===== ARCHITECTURE =====
  architecture: ReadmeArchitectureSchema
    .describe('Architecture and design explanation'),

  // ===== TECHNICAL DETAILS =====
  technicalDetails: ReadmeTechnicalDetailsSchema
    .describe('Technical implementation details'),

  // ===== TROUBLESHOOTING =====
  troubleshooting: z.array(ReadmeTroubleshootingSchema).min(1).max(5)
    .describe('Common issues and how to solve them (1-5 items)'),

  // ===== FOOTER =====
  notes: z.string().max(300).optional()
    .describe('Additional notes about the project (optional, 0-300 chars, e.g., license, credits, AI-generated)'),
});

export type Readme = z.infer<typeof ReadmeSchema>;

// ===== VALIDATION HELPERS =====

/**
 * Parse and validate a README object
 * Throws Zod error if validation fails
 */
export function validateReadme(data: unknown): Readme {
  return ReadmeSchema.parse(data);
}

/**
 * Safe parsing - returns result with errors if invalid
 */
export function tryValidateReadme(data: unknown) {
  return ReadmeSchema.safeParse(data);
}
