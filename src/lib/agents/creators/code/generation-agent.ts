import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { CodePlan, GeneratedCode, CodeFile } from './types';
import { generateNotebookV2 } from './notebook-generator-v2';
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

export async function generateCode(
  plan: CodePlan,
  idea: { id: string; title: string; description: string | null }
): Promise<{ code: GeneratedCode; tokensUsed: number }> {
  console.log(`🛠️  Generating ${plan.outputType} in ${plan.language}...`);

  // Route to specialized generator based on output type
  switch (plan.outputType) {
    case 'notebook':
      return await generateNotebookV2(plan, idea); // Use new clean implementation
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
 * Note: Old generateNotebook() function removed - we now use generateNotebookV2()
 * from ./notebook-generator-v2.ts which uses structured outputs with Zod schemas.
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
): Promise<{ code: GeneratedCode; tokensUsed: number }> {
  // Use Claude Sonnet 4.5 - BEST for code generation
  const model = new ChatAnthropic({
    modelName: 'claude-sonnet-4-5-20250929',
    temperature: 0.3, // Lower temp for more reliable code
  });

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
    const tokensUsed = 0; // We'll estimate this for structured outputs

    // Generate SHORT, descriptive repo name
    const repoName = await generateRepoName(idea, plan);

    const files: CodeFile[] = [
      {
        path: mainFile,
        content: result.code,
        language: plan.language,
      },
      {
        path: 'README.md',
        content: generateReadme({
          title: idea.title,
          description: idea.description || '',
          language: plan.language,
          setupInstructions: plan.language === 'python'
            ? '```bash\npip install ' + (result.requiredPackages || []).join(' ') + '\n```'
            : '```bash\nnpm install ' + (result.requiredPackages || []).join(' ') + '\n```',
          runInstructions: '```bash\n' + (result.usage || `${plan.language === 'python' ? 'python' : 'node'} ${mainFile}`) + '\n```',
        }),
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
      tokensUsed,
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
): Promise<{ code: GeneratedCode; tokensUsed: number }> {
  // For now, delegate to demo script with HTML
  return generateDemoScript(plan, idea);
}

/**
 * LIBRARY GENERATOR
 */
async function generateLibrary(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode; tokensUsed: number }> {
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
): Promise<{ code: GeneratedCode; tokensUsed: number }> {
  // Use Claude Sonnet 4.5 for best code quality
  const model = new ChatAnthropic({
    modelName: 'claude-sonnet-4-5-20250929',
    temperature: 0.3,
  });

  const fileName = plan.language === 'python' ? 'demo.py' : 'demo.js';

  const prompt = `Create a WORKING demo script that implements: ${idea.title}

Description: ${idea.description || 'No additional description'}

Requirements:
- Language: ${plan.language}
- Keep it focused but FULLY WORKING (50-150 lines)
- Include clear comments explaining the code
- Make it RUNNABLE as-is (no missing imports, no errors)
- Include example usage at the bottom that demonstrates all features
- Add proper error handling

CRITICAL: The code MUST:
1. Actually RUN without errors
2. Be complete and self-contained
3. Include all necessary imports
4. Have at least one concrete, working example
5. Follow ${plan.language} best practices
6. Be educational but production-quality

Provide COMPLETE, TESTED-QUALITY code for ${fileName}.

OUTPUT STRUCTURE:
- code: Complete working code as a single string
- requiredPackages: Array of package names (e.g., ["numpy", "requests"])`;

  // Use structured output (guarantees valid JSON)
  const structuredModel = model.withStructuredOutput(DemoScriptSchema);

  try {
    const result = await structuredModel.invoke(prompt);
    const tokensUsed = 0; // We'll estimate this for structured outputs

    // Generate SHORT repo name
    const repoName = await generateRepoName(idea, plan);

    const files: CodeFile[] = [
      {
        path: fileName,
        content: result.code,
        language: plan.language,
      },
      {
        path: 'README.md',
        content: generateReadme({
          title: idea.title,
          description: idea.description || '',
          language: plan.language,
          setupInstructions: result.requiredPackages?.length > 0
            ? plan.language === 'python'
              ? '```bash\npip install ' + result.requiredPackages.join(' ') + '\n```'
              : '```bash\nnpm install ' + result.requiredPackages.join(' ') + '\n```'
            : 'No dependencies required',
          runInstructions: '```bash\n' + (plan.language === 'python' ? `python ${fileName}` : `node ${fileName}`) + '\n```',
        }),
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
      tokensUsed,
    };
  } catch (error) {
    console.error('Failed to parse demo script generation:', error);
    throw error;
  }
}

/**
 * UTILITY: Generate README content
 */
function generateReadme(params: {
  title: string;
  description: string;
  language: string;
  setupInstructions: string;
  runInstructions: string;
}): string {
  return `# ${params.title}

${params.description}

## Language

${params.language.charAt(0).toUpperCase() + params.language.slice(1)}

## Setup

${params.setupInstructions}

## Usage

${params.runInstructions}

## Generated by AI

This project was automatically generated by an AI agent pipeline.
`;
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
