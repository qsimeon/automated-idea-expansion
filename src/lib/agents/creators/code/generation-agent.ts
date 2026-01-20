import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { CodePlan, GeneratedCode, CodeFile } from './types';
import { generateNotebookV2 } from './notebook-generator-v2';

/**
 * GENERATION AGENT
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
 * Model choice: Claude Sonnet 3.5/4
 * - BEST at code generation (tops all coding benchmarks)
 * - Superior at creating working, executable code
 * - Excellent understanding of best practices and patterns
 * - Stronger at complex logic than GPT-4o
 * - Cost: ~$0.015 per code project (worth it for quality)
 */

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
 * NOTEBOOK GENERATOR
 *
 * Creates a Jupyter notebook (.ipynb file) with:
 * - Markdown cells explaining the concept
 * - Code cells with implementation
 * - Example usage
 * - Visualizations (if applicable)
 */
/**
 * Schema for notebook generation response
 */
interface NotebookCell {
  type: 'markdown' | 'code';
  content: string[] | string; // Support both arrays and strings for backward compatibility
}

interface NotebookGenerationResponse {
  cells: NotebookCell[];
  requiredPackages: string[];
}

async function generateNotebook(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode; tokensUsed: number }> {
  // Use Claude Sonnet 4.5 for BEST code generation
  const model = new ChatAnthropic({
    modelName: 'claude-sonnet-4-5-20250929',
    temperature: 0.3, // Lower temp for more reliable, executable code
  });

  const prompt = `Create a WORKING Jupyter notebook that implements: ${idea.title}

Description: ${idea.description || 'No additional description'}

Requirements:
- Language: ${plan.language}
- Architecture: ${plan.architecture}
${plan.framework ? `- Framework: ${plan.framework}` : ''}
- Make it interactive, educational, and FULLY EXECUTABLE
- Each code cell must be RUNNABLE in order (1→2→3)
- Include all necessary imports in the first code cell
- Include markdown cells explaining each step
- Add visualizations where appropriate
- Include working example usage with real data

CRITICAL: The notebook MUST:
1. Have ALL cells executable without errors
2. Run sequentially from top to bottom
3. Include ALL necessary imports upfront
4. Use real, working examples (not placeholder/stub code)
5. Handle errors gracefully
6. Be production-quality, not a sketch

Structure the notebook with these cells:

1. **Title and Introduction** (markdown)
   - Explain what this notebook does
   - List prerequisites

2. **Setup and Imports** (code)
   - Import necessary libraries
   - Define any configuration

3. **Implementation** (alternating markdown + code)
   - Implement the main functionality
   - Add markdown cells explaining the logic
   - Break complex sections into multiple cells

4. **Examples and Usage** (code)
   - Show practical examples
   - Include test cases if applicable

5. **Conclusion** (markdown)
   - Summarize what was built
   - Suggest next steps or extensions

CRITICAL FORMATTING INSTRUCTIONS:
- Return ONLY valid JSON, no markdown code blocks
- Use arrays of strings (lines) for cell content - NO ESCAPING NEEDED
- Format: {"cells": [...], "requiredPackages": [...]}
- Each cell: {"type": "markdown"|"code", "content": ["line1", "line2", ...]}
- Each line in the array is a separate string (no \\n needed)
- This avoids escaping issues and makes parsing reliable

Example valid response:
{
  "cells": [
    {
      "type": "markdown",
      "content": [
        "# Title",
        "Description here"
      ]
    },
    {
      "type": "code",
      "content": [
        "import numpy as np",
        "print('Hello')"
      ]
    }
  ],
  "requiredPackages": ["numpy", "torch"]
}`;

  const response = await model.invoke(prompt);
  const rawContent = response.content.toString();

  console.log('📥 Raw response length:', rawContent.length);
  console.log('📥 First 200 chars:', rawContent.substring(0, 200));

  // Try to extract JSON (handle code blocks or plain JSON)
  let jsonContent = rawContent;

  // Remove markdown code blocks if present (multiple strategies)
  if (rawContent.includes('```')) {
    // Strategy 1: Match full code block
    const codeBlockMatch = rawContent.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1];
      console.log('✂️  Extracted from code block (strategy 1)');
    } else {
      // Strategy 2: Simple replace
      jsonContent = rawContent
        .replace(/^```(?:json)?\s*\n?/m, '')  // Remove opening ```json
        .replace(/\n?```\s*$/m, '');          // Remove closing ```
      console.log('✂️  Extracted from code block (strategy 2 - replace)');
    }
  }

  // Trim whitespace
  jsonContent = jsonContent.trim();

  console.log('🔍 Parsing JSON...');
  console.log('📏 JSON content length:', jsonContent.length);
  console.log('📏 First 100 chars of JSON:', jsonContent.substring(0, 100));

  let parsed: NotebookGenerationResponse;
  try {
    parsed = JSON.parse(jsonContent);
    console.log('✅ JSON parsed successfully');
    console.log(`📊 Generated ${parsed.cells?.length || 0} cells`);
  } catch (parseError) {
    console.error('❌ JSON parse failed!');
    console.error('   Error:', (parseError as any).message);
    console.error('   Content to parse (first 500 chars):', jsonContent.substring(0, 500));
    console.error('   Last 100 chars:', jsonContent.substring(jsonContent.length - 100));
    throw new Error(`Failed to parse notebook JSON: ${(parseError as any).message}`);
  }

  try {
    // Get actual token usage from OpenAI
    const tokensUsed = (response.response_metadata as any)?.tokenUsage?.totalTokens
      || Math.ceil(prompt.length / 4) + Math.ceil(JSON.stringify(parsed).length / 4);

    // Convert to .ipynb format
    const notebookContent = {
      cells: parsed.cells.map((cell: any) => {
        // Handle both array and string formats for backward compatibility
        const sourceLines = Array.isArray(cell.content)
          ? cell.content  // Already an array
          : cell.content.split('\n');  // String, need to split

        return {
          cell_type: cell.type === 'markdown' ? 'markdown' : 'code',
          metadata: {},
          source: sourceLines,
          ...(cell.type === 'code' ? { outputs: [], execution_count: null } : {}),
        };
      }),
      metadata: {
        kernelspec: {
          display_name: plan.language === 'python' ? 'Python 3' : 'JavaScript (Node.js)',
          language: plan.language,
          name: plan.language === 'python' ? 'python3' : 'javascript',
        },
        language_info: {
          name: plan.language,
        },
      },
      nbformat: 4,
      nbformat_minor: 4,
    };

    // Generate SHORT repo name
    const repoName = await generateRepoName(idea, plan);

    const files: CodeFile[] = [
      {
        path: 'notebook.ipynb',
        content: JSON.stringify(notebookContent, null, 2),
        language: 'json',
      },
      {
        path: 'README.md',
        content: generateReadme({
          title: idea.title,
          description: idea.description || '',
          language: plan.language,
          setupInstructions: plan.language === 'python'
            ? 'pip install ' + (parsed.requiredPackages || []).join(' ')
            : 'npm install ' + (parsed.requiredPackages || []).join(' '),
          runInstructions: 'Open notebook.ipynb in Jupyter Lab or upload to Google Colab',
        }),
      },
    ];

    // Add requirements/package file
    if (plan.language === 'python' && parsed.requiredPackages?.length > 0) {
      files.push({
        path: 'requirements.txt',
        content: parsed.requiredPackages.join('\n'),
      });
    }

    return {
      code: {
        repoName,
        description: idea.description || idea.title,
        files,
        dependencies: {
          runtime: [plan.language === 'python' ? 'python' : 'node'],
          packages: parsed.requiredPackages || [],
        },
        setupInstructions: plan.language === 'python'
          ? 'pip install -r requirements.txt'
          : 'npm install',
        runInstructions: 'jupyter lab notebook.ipynb',
        type: plan.language,
        outputType: 'notebook',
      },
      tokensUsed,
    };
  } catch (error) {
    console.error('Failed to parse notebook generation:', error);
    throw error;
  }
}

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

Respond with ONLY valid JSON (no markdown blocks):
{
  "code": "complete working code here",
  "requiredPackages": ["package1", "package2"],
  "usage": "python main.py --example or node index.js --example"
}`;

  const response = await model.invoke(prompt);
  const tokensUsed = (response.response_metadata as any)?.tokenUsage?.totalTokens || 0;
  const content = response.content as string;

  try {
    // Parse JSON response (Claude is good at following instructions)
    let cleaned = content.trim();
    if (cleaned.includes('```')) {
      cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
    }
    const parsed = JSON.parse(cleaned);

    // Generate SHORT, descriptive repo name
    const repoName = await generateRepoName(idea, plan);

    const files: CodeFile[] = [
      {
        path: mainFile,
        content: parsed.code,
        language: plan.language,
      },
      {
        path: 'README.md',
        content: generateReadme({
          title: idea.title,
          description: idea.description || '',
          language: plan.language,
          setupInstructions: plan.language === 'python'
            ? '```bash\npip install ' + (parsed.requiredPackages || []).join(' ') + '\n```'
            : '```bash\nnpm install ' + (parsed.requiredPackages || []).join(' ') + '\n```',
          runInstructions: '```bash\n' + (parsed.usage || `${plan.language === 'python' ? 'python' : 'node'} ${mainFile}`) + '\n```',
        }),
      },
    ];

    // Add requirements/package file
    if (plan.language === 'python' && parsed.requiredPackages?.length > 0) {
      files.push({
        path: 'requirements.txt',
        content: parsed.requiredPackages.join('\n'),
      });
    } else if ((plan.language === 'javascript' || plan.language === 'typescript') && parsed.requiredPackages?.length > 0) {
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
            dependencies: parsed.requiredPackages.reduce((acc: any, pkg: string) => {
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
          packages: parsed.requiredPackages || [],
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

Respond with ONLY valid JSON (no markdown blocks):
{
  "code": "complete working code here",
  "requiredPackages": ["package1", "package2"]
}`;

  const response = await model.invoke(prompt);
  const tokensUsed = (response.response_metadata as any)?.tokenUsage?.totalTokens || 0;
  const content = response.content as string;

  try {
    // Parse JSON response
    let cleaned = content.trim();
    if (cleaned.includes('```')) {
      cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
    }
    const parsed = JSON.parse(cleaned);

    // Generate SHORT repo name
    const repoName = await generateRepoName(idea, plan);

    const files: CodeFile[] = [
      {
        path: fileName,
        content: parsed.code,
        language: plan.language,
      },
      {
        path: 'README.md',
        content: generateReadme({
          title: idea.title,
          description: idea.description || '',
          language: plan.language,
          setupInstructions: parsed.requiredPackages?.length > 0
            ? plan.language === 'python'
              ? '```bash\npip install ' + parsed.requiredPackages.join(' ') + '\n```'
              : '```bash\nnpm install ' + parsed.requiredPackages.join(' ') + '\n```'
            : 'No dependencies required',
          runInstructions: '```bash\n' + (plan.language === 'python' ? `python ${fileName}` : `node ${fileName}`) + '\n```',
        }),
      },
    ];

    // Add dependencies file if needed
    if (parsed.requiredPackages?.length > 0) {
      if (plan.language === 'python') {
        files.push({
          path: 'requirements.txt',
          content: parsed.requiredPackages.join('\n'),
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
          packages: parsed.requiredPackages || [],
        },
        setupInstructions: parsed.requiredPackages?.length > 0
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
