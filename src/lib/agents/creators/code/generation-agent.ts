import { ChatOpenAI } from '@langchain/openai';
import type { CodePlan, GeneratedCode, CodeFile } from './types';

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
 * - Notebook → Generate .ipynb with markdown + code cells
 * - CLI App → Generate executable script + README
 * - Web App → Generate full project structure with framework
 * - Library → Generate module with exports and documentation
 * - Demo Script → Generate single standalone file
 *
 * Model choice: GPT-4o-mini
 * - Good at code generation
 * - Understands various frameworks and patterns
 * - Cost-effective for longer outputs
 */

export async function generateCode(
  plan: CodePlan,
  idea: { id: string; title: string; description: string | null }
): Promise<{ code: GeneratedCode; tokensUsed: number }> {
  console.log(`🛠️  Generating ${plan.outputType} in ${plan.language}...`);

  // Route to specialized generator based on output type
  switch (plan.outputType) {
    case 'notebook':
      return await generateNotebook(plan, idea);
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
async function generateNotebook(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode; tokensUsed: number }> {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.7,
  });

  const prompt = `Create a Jupyter notebook that implements: ${idea.title}

Description: ${idea.description || 'No additional description'}

Requirements:
- Language: ${plan.language}
- Architecture: ${plan.architecture}
${plan.framework ? `- Framework: ${plan.framework}` : ''}
- Make it interactive and educational
- Include markdown cells explaining each step
- Add visualizations where appropriate
- Include example usage

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

Respond with JSON:
{
  "cells": [
    {
      "type": "markdown" | "code",
      "content": "cell content here"
    },
    ...
  ],
  "requiredPackages": ["package1", "package2"]
}`;

  const response = await model.invoke(prompt);
  const tokensUsed = (response.response_metadata as any)?.tokenUsage?.totalTokens || 0;
  const content = response.content as string;

  try {
    const parsed = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```\n?/g, ''));

    // Convert to .ipynb format
    const notebookContent = {
      cells: parsed.cells.map((cell: any) => ({
        cell_type: cell.type === 'markdown' ? 'markdown' : 'code',
        metadata: {},
        source: cell.content.split('\n'),
        ...(cell.type === 'code' ? { outputs: [], execution_count: null } : {}),
      })),
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

    const repoName = toKebabCase(idea.title);
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
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.7,
  });

  const mainFile = plan.language === 'python' ? 'main.py' : plan.language === 'typescript' ? 'index.ts' : 'index.js';

  const prompt = `Create a CLI application that implements: ${idea.title}

Description: ${idea.description || 'No additional description'}

Requirements:
- Language: ${plan.language}
- Architecture: ${plan.architecture}
- Create a working command-line tool
- Include argument parsing (argparse for Python, commander for JS)
- Add help text and usage examples
- Handle errors gracefully
- Make it user-friendly

The CLI should:
1. Parse command-line arguments
2. Validate inputs
3. Perform the main functionality
4. Output results clearly
5. Handle errors with helpful messages

Provide the complete code for ${mainFile} that:
- Is executable (#!/usr/bin/env python3 or node)
- Has clear documentation
- Follows best practices
- Is ready to use

Also list any required packages.

Respond with JSON:
{
  "code": "full code content here",
  "requiredPackages": ["package1", "package2"],
  "usage": "example usage command"
}`;

  const response = await model.invoke(prompt);
  const tokensUsed = (response.response_metadata as any)?.tokenUsage?.totalTokens || 0;
  const content = response.content as string;

  try {
    const parsed = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```\n?/g, ''));

    const repoName = toKebabCase(idea.title);
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
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.7,
  });

  const fileName = plan.language === 'python' ? 'demo.py' : 'demo.js';

  const prompt = `Create a simple demo script that implements: ${idea.title}

Description: ${idea.description || 'No additional description'}

Requirements:
- Language: ${plan.language}
- Keep it simple and focused (< 100 lines)
- Include comments explaining the code
- Make it runnable as-is
- Include example usage in comments or at the bottom

The script should:
- Be clear and well-documented
- Follow ${plan.language} best practices
- Include at least one working example
- Be educational and easy to understand

Provide complete, runnable code for ${fileName}.

Respond with JSON:
{
  "code": "full code content",
  "requiredPackages": ["package1", "package2"]
}`;

  const response = await model.invoke(prompt);
  const tokensUsed = (response.response_metadata as any)?.tokenUsage?.totalTokens || 0;
  const content = response.content as string;

  try {
    const parsed = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```\n?/g, ''));

    const repoName = toKebabCase(idea.title);
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
 * UTILITY: Convert title to kebab-case for repo names
 */
function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
