import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { CodePlan, GeneratedCode, CodeFile } from './types';
import { generateNotebookV3 } from './notebook-generator-v3'; // V3: Atomic schemas
import { z } from 'zod';

/**
 * GENERATION AGENT (V2 - Structured Outputs)
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
 *
 * V2 Improvements:
 * - Uses Zod schemas with structured outputs (guaranteed valid JSON)
 * - No manual JSON parsing or cleaning needed
 * - Type-safe generation
 *
 * Model choice: Claude Sonnet 4.5
 * - BEST at code generation (tops all coding benchmarks)
 * - Superior at creating working, executable code
 * - Excellent understanding of best practices and patterns
 * - Cost: ~$0.015 per code project (worth it for quality)
 */

// Schemas for code generation
const CLIAppSchema = z.object({
  code: z.string().describe('Complete, working CLI application code'),
  requiredPackages: z.array(z.string()).describe('Required packages/dependencies'),
  usage: z.string().describe('Usage example (e.g., "python main.py --help")'),
});

const DemoScriptSchema = z.object({
  code: z.string().describe('Complete, working demo script code'),
  requiredPackages: z.array(z.string()).describe('Required packages/dependencies'),
});

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
        throw new Error(
          `Modular architecture requires at least 2 code files. Found ${codeFileCount}. ` +
          `Files: ${files.map(f => f.path).join(', ')}. ` +
          `Please refactor into separate modules with clear separation of concerns.`
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
      return await generateNotebookV3(plan, idea); // V3: Atomic schemas (h1, paragraph, code lines as primitives)
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
 * Note: All notebook generation now uses generateNotebookV3() which employs atomic schemas.
 * V3 breaks down every element to primitives (h1, paragraph, code line objects) for clean Jupyter output.
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
    const readme = await generateReadme({
      title: idea.title,
      description: idea.description || '',
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
    const readme = await generateReadme({
      title: idea.title,
      description: idea.description || '',
      language: plan.language,
      plan,
      files: codeFiles, // Pass the generated code files for context
      setupInstructions: result.requiredPackages?.length > 0
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
    if (result.requiredPackages?.length > 0) {
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
        setupInstructions: result.requiredPackages?.length > 0
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
 * UTILITY: Generate comprehensive README using AI
 *
 * CRITICAL FIX: Previous version used simple string templates, resulting in poor READMEs.
 * Now uses Claude Sonnet 4.5 to generate professional, detailed documentation.
 */
async function generateReadme(context: {
  title: string;
  description: string;
  language: string;
  plan: CodePlan;
  files: CodeFile[];
  setupInstructions: string;
  runInstructions: string;
}): Promise<string> {
  // Use Claude Sonnet 4.5 for best documentation quality
  const model = new ChatAnthropic({
    modelName: 'claude-sonnet-4-5-20250929',
    temperature: 0.4, // Slightly higher for more engaging writing
  });

  const filesList = context.files
    .map(f => `- ${f.path} (${f.content.split('\n').length} lines)`)
    .join('\n');

  const prompt = `Generate a comprehensive, professional README.md for this project.

## Project Context
**Title**: ${context.title}
**Description**: ${context.description}
**Language**: ${context.language}
**Architecture**: ${context.plan.architecture}
**Output Type**: ${context.plan.outputType}

## Implementation Details
**Implementation Steps**:
${context.plan.implementationSteps?.map((step, i) => `${i + 1}. ${step}`).join('\n') || 'Not specified'}

**Generated Files**:
${filesList}

**Setup**: ${context.setupInstructions}
**Run**: ${context.runInstructions}

## README Requirements
Your README must be comprehensive and include ALL of the following sections:

1. **Project Title & Description**
   - Engaging overview of what this project does
   - Key value proposition in 1-2 sentences

2. **Features**
   - Bullet list of key capabilities (3-6 features)
   - Focus on what users can do with this

3. **Architecture Overview**
   - Explain the file structure and design decisions
   - Why was this architecture chosen?
   - How do the components work together?

4. **Installation**
   - Step-by-step setup instructions
   - Prerequisites (Python/Node version, etc.)
   - Include: ${context.setupInstructions}

5. **Usage**
   - Clear usage examples with code snippets
   - Include: ${context.runInstructions}
   - Show at least 2-3 different usage scenarios

6. **File Structure**
   - Tree diagram or list showing project organization
   - Brief description of each file's purpose

7. **Technical Details**
   - Dependencies and their purposes
   - Key algorithms or patterns used
   - Any important technical decisions

8. **Examples**
   - At least 2 concrete usage examples
   - Show input and expected output
   - Cover different features or use cases

9. **Troubleshooting**
   - Common issues and solutions (2-3 items)
   - How to debug or get help

10. **Footer**
    - Mention this was AI-generated
    - Optionally: contributing guidelines, license

## Style Guidelines
- Use clear, concise language
- Include code blocks with proper syntax highlighting
- Use emojis sparingly (only for section headers if desired)
- Be professional but approachable
- Make it easy for someone unfamiliar with the project to understand and use it

Generate a complete, well-structured README that would make this project easy to understand and use:`;

  try {
    const response = await model.invoke(prompt);
    const readme = response.content.toString();
    console.log(`  📝 Generated AI README (${readme.length} characters)`);
    return readme;
  } catch (error) {
    console.warn('⚠️  AI README generation failed, using fallback template');
    // Fallback to simple template if AI generation fails
    return `# ${context.title}

${context.description}

## Language

${context.language.charAt(0).toUpperCase() + context.language.slice(1)}

## Setup

${context.setupInstructions}

## Usage

${context.runInstructions}

## Files

${filesList}

## Generated by AI

This project was automatically generated by an AI agent pipeline.
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
