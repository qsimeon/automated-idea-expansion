import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { CodePlan, GeneratedCode, CodeFile } from './types';
import { generateNotebook } from './notebook-generator'; // Atomic schemas
import { ReadmeSchema, type Readme } from './readme-schema';
import { renderReadmeToMarkdown } from './readme-renderer';
import { z } from 'zod';

/**
 * GENERATION AGENT (Structured Outputs)
 *
 * Purpose: Generate actual code based on the plan
 *
 * This agent acts like a developer implementing the architect's design.
 * It creates:
 * - All necessary code files
 * - README with instructions
 * - Dependencies file (requirements.txt, package.json, etc.)
 * - Setup and run instructions
 *
 * The generator routes to specialized functions based on output type:
 * - CLI App → Generate executable script with argparse/CLI API
 * - Web App → Generate full project structure with framework
 * - Library → Generate module with exports and documentation
 * - Demo Script → Generate single standalone file
 * - Notebook → Generate Jupyter notebook with atomic schemas
 *
 * Architecture:
 * - Uses Zod schemas with structured outputs (guaranteed valid JSON)
 * - No manual JSON parsing or cleaning needed
 * - Type-safe generation
 * - Automatic model selection based on complexity (Sonnet for simple/modular, O1 for complex)
 *
 * Model routing:
 * - Simple/Modular: Claude Sonnet 4.5 (~$0.15-0.25 per project)
 * - Complex: O1 with extended thinking (~$1.50-3.00 per project)
 */

// Schemas for code generation
const CLIAppSchema = z.object({
  code: z.string().describe('Complete, working CLI application code'),
  requiredPackages: z.array(z.string()).describe('Required packages/dependencies'),
  usage: z.string().describe('Usage example (e.g., "python main.py --help")'),
});

const DemoScriptSchema = z.object({
  code: z.string().describe('Complete, working demo script code').optional(),
  requiredPackages: z.array(z.string()).describe('Required packages/dependencies').optional(),
}).passthrough();

type CLIAppOutput = z.infer<typeof CLIAppSchema>;
type DemoScriptOutput = z.infer<typeof DemoScriptSchema>;

/**
 * VALIDATE FILE COUNT - Ensure generated files match architectural requirements
 *
 * Enforces architectural integrity by checking that the number of code files
 * (excluding README, package.json, etc.) matches the declared architecture.
 */
function validateFileCount(files: CodeFile[], plan: CodePlan): void {
  // Count only actual code files (not README, config, or dependency files)
  const codeFiles = files.filter(
    f => !f.path.match(/README\.md|package\.json|requirements\.txt|\.gitignore|Cargo\.toml/i)
  );

  const codeFileCount = codeFiles.length;

  // Validation rules based on architecture
  switch (plan.architecture) {
    case 'modular':
      if (codeFileCount < 2) {
        console.warn(
          `  ⚠️  Modular architecture expected at least 2 code files, found ${codeFileCount}. ` +
          `Files: ${files.map(f => f.path).join(', ')}. ` +
          `Continuing with available files.`
        );
      }
      break;

    case 'full-stack':
      if (codeFileCount < 5) {
        throw new Error(
          `Full-stack architecture requires at least 5 code files (client, server, models, etc.). ` +
          `Found ${codeFileCount}. Files: ${files.map(f => f.path).join(', ')}. ` +
          `Please create a proper full-stack structure.`
        );
      }
      break;

    case 'simple':
      // Simple architecture can be 1 file, no validation needed
      break;
  }

  console.log(`  ✅ File count validation passed: ${codeFileCount} code files for ${plan.architecture} architecture`);
}

/**
 * SELECT GENERATION MODEL - Route to appropriate model based on complexity
 *
 * Strategy:
 * - Simple/Modular → Claude Sonnet 4.5 (best code quality, fast, $0.15-0.25 per generation)
 * - Complex → O1 with extended thinking (deep reasoning, $1.50-3.00 per generation)
 *
 * This ensures we use expensive O1/O3 models only when complexity truly requires it.
 */
function selectGenerationModel(plan: CodePlan): ChatAnthropic | ChatOpenAI {
  switch (plan.modelTier) {
    case 'simple':
    case 'modular':
      // Use Claude Sonnet 4.5 for most code generation (best quality/cost ratio)
      return new ChatAnthropic({
        modelName: 'claude-sonnet-4-5-20250929',
        temperature: 0.3,
      });

    case 'complex':
      // Use O1 for complex architectures requiring deep reasoning
      console.log(`🧠 Using O1 extended thinking for complex code (score: ${plan.codeComplexityScore}/10)`);
      return new ChatOpenAI({
        modelName: 'o1-2024-12-17', // O1 with extended thinking
        temperature: 1, // O1 only supports temperature 1
      });

    default:
      // Fallback to Sonnet if modelTier not recognized
      console.warn(`⚠️  Unknown modelTier: ${plan.modelTier}, defaulting to Sonnet`);
      return new ChatAnthropic({
        modelName: 'claude-sonnet-4-5-20250929',
        temperature: 0.3,
      });
  }
}

export async function generateCode(
  plan: CodePlan,
  idea: { id: string; title: string; description: string | null }
): Promise<{ code: GeneratedCode }> {
  console.log(`🛠️  Generating ${plan.outputType} in ${plan.language}...`);

  // Route to specialized generator based on output type
  switch (plan.outputType) {
    case 'notebook':
      return await generateNotebook(plan, idea); // Atomic schemas (h1, paragraph, code lines as primitives)
    case 'cli-app':
      return await generateCLIApp(plan, idea);
    case 'web-app':
      return await generateWebApp(plan, idea);
    case 'library':
      return await generateLibrary(plan, idea);
    case 'demo-script':
      return await generateDemoScript(plan, idea);
    default:
      throw new Error(`Unknown output type: ${plan.outputType}`);
  }
}

/**
 * Notebook generation uses atomic schemas that break down every element to primitives
 * (h1, paragraph, code line objects) for clean, deterministic Jupyter output.
 */


/**
 * CLI APP GENERATOR
 *
 * Creates a command-line application with:
 * - Main executable file
 * - Argument parsing
 * - Help text
 * - README with usage examples
 */
async function generateCLIApp(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode }> {
  // Automatically select model based on complexity tier
  const model = selectGenerationModel(plan);

  // Use structured output (guarantees valid JSON)
  const structuredModel = model.withStructuredOutput(CLIAppSchema);

  const mainFile = plan.language === 'python' ? 'main.py' : plan.language === 'typescript' ? 'index.ts' : 'index.js';

  const prompt = `Create a WORKING, EXECUTABLE CLI application that implements: ${idea.title}

Description: ${idea.description || 'No additional description'}

Requirements:
- Language: ${plan.language}
- Architecture: ${plan.architecture}
- Create a FULLY WORKING command-line tool
- ${plan.language === 'python' ? 'Use argparse for CLI arguments' : 'Use commander or yargs for CLI arguments'}
- Include --help flag with clear usage documentation
- Handle errors gracefully with meaningful error messages
- Make output clear and user-friendly
- Code must be EXECUTABLE and TESTED-QUALITY

CRITICAL: The code MUST:
1. Actually RUN without errors
2. Parse command-line arguments properly
3. Validate all inputs before processing
4. Provide clear error messages
5. Include example usage in --help
6. Follow ${plan.language} best practices
7. Be production-ready, not a sketch

Example CLI structure for Python:
- Use argparse with subparsers if multiple commands
- Add type hints (Python 3.9+)
- Include docstrings for all functions
- Handle exceptions properly (try/except)
- Add logging for debugging

Example CLI structure for JavaScript/TypeScript:
- Use commander or yargs for argument parsing
- Add JSDoc or TypeScript types
- Include proper error handling
- Use async/await for async operations

Provide the COMPLETE, RUNNABLE code for ${mainFile}.

OUTPUT STRUCTURE:
- code: Complete working code as a single string
- requiredPackages: Array of package names (e.g., ["numpy", "requests"])
- usage: Usage example string (e.g., "python main.py --help")`;

  try {
    const result = await structuredModel.invoke(prompt);

    // Generate SHORT, descriptive repo name
    const repoName = await generateRepoName(idea, plan);

    // First create the code files (without README)
    const codeFiles: CodeFile[] = [
      {
        path: mainFile,
        content: result.code,
        language: plan.language,
      },
    ];

    // Now generate AI-powered README with full context
    // Reconstruct the original idea string from title and description
    const ideaString = idea.description
      ? `${idea.title}: ${idea.description}`
      : idea.title;

    const readme = await generateReadme({
      ideaString,
      language: plan.language,
      plan,
      files: codeFiles, // Pass the generated code files for context
      setupInstructions: plan.language === 'python'
        ? 'pip install ' + (result.requiredPackages || []).join(' ')
        : 'npm install ' + (result.requiredPackages || []).join(' '),
      runInstructions: result.usage || `${plan.language === 'python' ? 'python' : 'node'} ${mainFile}`,
    });

    const files: CodeFile[] = [
      ...codeFiles,
      {
        path: 'README.md',
        content: readme,
      },
    ];

    // Add requirements/package file
    if (plan.language === 'python' && result.requiredPackages?.length > 0) {
      files.push({
        path: 'requirements.txt',
        content: result.requiredPackages.join('\n'),
      });
    } else if ((plan.language === 'javascript' || plan.language === 'typescript') && result.requiredPackages?.length > 0) {
      files.push({
        path: 'package.json',
        content: JSON.stringify(
          {
            name: repoName,
            version: '1.0.0',
            description: idea.description || idea.title,
            main: mainFile,
            scripts: {
              start: `node ${mainFile}`,
            },
            dependencies: result.requiredPackages.reduce((acc: any, pkg: string) => {
              acc[pkg] = '*';
              return acc;
            }, {}),
          },
          null,
          2
        ),
      });
    }

    // Validate file count matches architectural requirements
    validateFileCount(files, plan);

    return {
      code: {
        repoName,
        description: idea.description || idea.title,
        files,
        dependencies: {
          runtime: [plan.language === 'python' ? 'python' : 'node'],
          packages: result.requiredPackages || [],
        },
        setupInstructions: plan.language === 'python'
          ? 'pip install -r requirements.txt'
          : 'npm install',
        runInstructions: plan.language === 'python'
          ? `python ${mainFile} --help`
          : `node ${mainFile} --help`,
        type: plan.language === 'python' ? 'python' : 'nodejs',
        outputType: 'cli-app',
      },
    };
  } catch (error) {
    console.error('Failed to parse CLI app generation:', error);
    throw error;
  }
}

/**
 * WEB APP GENERATOR (Simplified - generates a basic demo)
 */
async function generateWebApp(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode }> {
  // For now, delegate to demo script with HTML
  return generateDemoScript(plan, idea);
}

/**
 * LIBRARY GENERATOR
 */
async function generateLibrary(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode }> {
  // For now, delegate to demo script
  return generateDemoScript(plan, idea);
}

/**
 * DEMO SCRIPT GENERATOR
 *
 * Creates a simple, standalone script demonstrating the idea
 */
async function generateDemoScript(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode }> {
  // Automatically select model based on complexity tier
  const model = selectGenerationModel(plan);

  const fileName = plan.language === 'python' ? 'demo.py' : 'demo.js';

  const prompt = `Create a WORKING demo script that implements: ${idea.title}

Description: ${idea.description || 'No additional description'}

Requirements:
- Language: ${plan.language}
- Create fully working code with appropriate complexity for the idea
- Separate concerns into multiple files when it improves maintainability
- Include comprehensive error handling and edge case coverage
- Include clear comments explaining the code
- Make it RUNNABLE as-is (no missing imports, no errors)
- Include example usage that demonstrates all features

CRITICAL: The code MUST:
1. Actually RUN without errors
2. Be complete and self-contained
3. Include all necessary imports
4. Have at least one concrete, working example
5. Follow ${plan.language} best practices
6. Be production-quality with proper error handling

Provide COMPLETE, TESTED-QUALITY code for ${fileName}.

OUTPUT STRUCTURE:
- code: Complete working code as a single string
- requiredPackages: Array of package names (e.g., ["numpy", "requests"])`;

  // Use structured output (guarantees valid JSON)
  const structuredModel = model.withStructuredOutput(DemoScriptSchema);

  try {
    const result = await structuredModel.invoke(prompt);

    // Fallback: if code is missing, skip this generation
    if (!result?.code || result.code.trim().length === 0) {
      console.warn(`  ⚠️  No code generated for demo script, skipping...`);
      return { code: { repoName: '', description: '', files: [], dependencies: { runtime: [], packages: [] }, setupInstructions: '', runInstructions: '', type: plan.language, outputType: 'demo-script' } };
    }

    // Generate SHORT repo name
    const repoName = await generateRepoName(idea, plan);

    // First create the code files (without README)
    const codeFiles: CodeFile[] = [
      {
        path: fileName,
        content: result.code,
        language: plan.language,
      },
    ];

    // Now generate AI-powered README with full context
    // Reconstruct the original idea string from title and description
    const ideaString = idea.description
      ? `${idea.title}: ${idea.description}`
      : idea.title;

    const readme = await generateReadme({
      ideaString,
      language: plan.language,
      plan,
      files: codeFiles, // Pass the generated code files for context
      setupInstructions: result?.requiredPackages && result.requiredPackages.length > 0
        ? plan.language === 'python'
          ? 'pip install ' + result.requiredPackages.join(' ')
          : 'npm install ' + result.requiredPackages.join(' ')
        : 'No dependencies required',
      runInstructions: plan.language === 'python' ? `python ${fileName}` : `node ${fileName}`,
    });

    const files: CodeFile[] = [
      ...codeFiles,
      {
        path: 'README.md',
        content: readme,
      },
    ];

    // Add dependencies file if needed
    if (result?.requiredPackages && result.requiredPackages.length > 0) {
      if (plan.language === 'python') {
        files.push({
          path: 'requirements.txt',
          content: result.requiredPackages.join('\n'),
        });
      }
    }

    // Validate file count matches architectural requirements
    validateFileCount(files, plan);

    return {
      code: {
        repoName,
        description: idea.description || idea.title,
        files,
        dependencies: {
          runtime: [plan.language === 'python' ? 'python' : 'node'],
          packages: result.requiredPackages || [],
        },
        setupInstructions: result?.requiredPackages && result.requiredPackages.length > 0
          ? plan.language === 'python'
            ? 'pip install -r requirements.txt'
            : 'npm install'
          : 'No setup required',
        runInstructions: plan.language === 'python' ? `python ${fileName}` : `node ${fileName}`,
        type: plan.language === 'python' ? 'python' : 'nodejs',
        outputType: 'demo-script',
      },
    };
  } catch (error) {
    console.error('Failed to parse demo script generation:', error);
    throw error;
  }
}

/**
 * UTILITY: Generate comprehensive README using AI with Structured Output
 *
 * SCHEMA-DRIVEN APPROACH:
 * 1. Claude generates structured Readme object (not markdown string)
 * 2. Zod validates the structure
 * 3. renderReadmeToMarkdown() converts to markdown deterministically
 *
 * Benefits:
 * - Guaranteed all sections are present
 * - Type-safe: cannot miss required fields
 * - Consistent formatting (renderer controls style)
 * - Easy to extend or change formatting later
 */
async function generateReadme(context: {
  ideaString: string; // Raw user input (e.g., "Build a weather app...")
  language: string;
  plan: CodePlan;
  files: CodeFile[];
  setupInstructions: string;
  runInstructions: string;
}): Promise<string> {
  // Use Claude Sonnet 4.5 for best documentation quality
  const model = new ChatAnthropic({
    modelName: 'claude-sonnet-4-5-20250929',
    temperature: 0.3, // Lower for consistency with schema
  });

  // Use structured output to get a Readme object instead of raw string
  const structuredModel = model.withStructuredOutput(ReadmeSchema);

  const filesList = context.files
    .map(f => `- ${f.path} (${f.content.split('\n').length} lines)`)
    .join('\n');

  const prompt = `You are a technical documentation expert. Generate structured README metadata for this project.

## User's Original Idea
${context.ideaString}

## Project Analysis
**Language**: ${context.language}
**Architecture**: ${context.plan.architecture}
**Output Type**: ${context.plan.outputType}

## Generated Code Files
${filesList}

## Setup & Usage
- Setup instructions: ${context.setupInstructions}
- Run instructions: ${context.runInstructions}
- Implementation approach: ${context.plan.implementationSteps?.join(', ') || 'Not specified'}

## Task: Generate Complete README Structure

Create a professional README with all sections filled in. Make sure:

1. **title** - The project name (based on user's idea)
2. **tagline** - One-line catchphrase (10-100 chars)
3. **description** - Longer overview explaining the problem it solves (50-500 chars)
4. **features** - 2-8 key capabilities (each with title and description)
5. **prerequisites** - Required software (0-5 items, e.g., "Python 3.10+")
6. **installationSteps** - Step-by-step setup (1-10 steps with explanations)
7. **usageExamples** - 2-5 concrete code examples showing different features
8. **architecture** - Overview, ASCII diagram, file descriptions, design decisions
9. **technicalDetails** - Dependencies, key algorithms/patterns, important notes
10. **troubleshooting** - 1-5 common issues with causes and solutions
11. **notes** - Optional footer (mention AI-generated if appropriate)

All code examples MUST be valid ${context.language}.
Usage examples MUST have expectedOutput showing what the user will see.
Installation steps MUST include proper prerequisites.

Generate now:`;

  try {
    // Get structured Readme object from Claude
    const readmeData = await structuredModel.invoke(prompt);

    console.log(`  ✅ Generated structured README`);
    console.log(`     - Features: ${readmeData.features.length}`);
    console.log(`     - Installation steps: ${readmeData.installationSteps.length}`);
    console.log(`     - Usage examples: ${readmeData.usageExamples.length}`);
    console.log(`     - Troubleshooting: ${readmeData.troubleshooting.length}`);

    // Render structured data to markdown deterministically
    const markdown = renderReadmeToMarkdown(readmeData);

    console.log(`  📝 Rendered to markdown (${markdown.length} characters)`);
    return markdown;
  } catch (error) {
    console.error('❌ README generation failed:', error);

    // Fallback: Create minimal README from available data
    console.warn('⚠️  Using minimal fallback README');

    // Extract title from ideaString (first line before colon)
    const titleFromIdea = context.ideaString.split(':')[0] || 'Project';

    return `# ${titleFromIdea}

${context.ideaString}

## Language

${context.language.charAt(0).toUpperCase() + context.language.slice(1)}

## Setup

${context.setupInstructions}

## Usage

${context.runInstructions}

## Files

${filesList}

## Generated by AI

This project was automatically generated from an AI agent pipeline.
`;
  }
}

/**
 * UTILITY: Generate short, descriptive repo name from idea
 *
 * Problem: toKebabCase("Using randomly initialized frozen...") → 120+ chars (too long!)
 * Solution: Extract key concepts and create a concise name (8-20 chars ideal)
 */
async function generateRepoName(
  idea: { title: string; description: string | null },
  plan: CodePlan
): Promise<string> {
  // Use GPT-5 nano - fastest and most affordable for simple tasks
  const model = new ChatOpenAI({
    modelName: 'gpt-5-nano-2025-08-07',
    // Note: GPT-5 nano only supports default temperature (1)
  });

  const prompt = `Create a SHORT, descriptive GitHub repository name for this project.

IDEA: ${idea.title}
${idea.description ? `Description: ${idea.description}` : ''}
Type: ${plan.outputType}
Language: ${plan.language}

REQUIREMENTS:
- Keep it SHORT (8-20 characters ideal, max 30)
- Use kebab-case (lowercase with hyphens)
- Be DESCRIPTIVE but CONCISE
- Focus on the main concept, not all details
- Make it memorable and clear

EXAMPLES:
✅ GOOD: "neural-views", "contrastive-ml", "frozen-layers"
❌ BAD: "using-randomly-initialized-frozen-neural-network-layers-as-different-views"

Respond with ONLY the repo name, nothing else:`;

  try {
    const response = await model.invoke(prompt);
    let repoName = response.content.toString().trim();

    // Clean up the response (remove quotes, extra text)
    repoName = repoName.replace(/^["'`]|["'`]$/g, ''); // Remove quotes
    repoName = repoName.split('\n')[0]; // Take first line only
    repoName = repoName.toLowerCase();
    repoName = repoName.replace(/[^a-z0-9-]/g, ''); // Only lowercase, numbers, hyphens

    // Fallback if still too long (truncate intelligently)
    if (repoName.length > 35) {
      const parts = repoName.split('-');
      repoName = parts.slice(0, 3).join('-'); // Take first 3 words
    }

    // Final fallback
    if (!repoName || repoName.length < 3) {
      repoName = toKebabCase(idea.title).substring(0, 30);
    }

    console.log(`📛 Generated repo name: "${repoName}"`);
    return repoName;
  } catch (error) {
    console.warn('⚠️  Repo name generation failed, using fallback');
    return toKebabCase(idea.title).substring(0, 30);
  }
}

/**
 * UTILITY: Convert title to kebab-case for repo names (FALLBACK ONLY)
 */
function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
