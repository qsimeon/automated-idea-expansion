import { ChatAnthropic } from '@langchain/anthropic';
import type { CodePlan, GeneratedCode, CodeFile } from './types';
import { z } from 'zod';

/**
 * NOTEBOOK GENERATOR V2 (Clean Implementation)
 *
 * This is a complete rewrite that fixes the JSON parsing issues.
 *
 * Key improvements:
 * 1. **Structured Outputs**: Uses Claude's native structured output feature (guaranteed JSON)
 * 2. **Simple Cell Format**: LLM returns simple arrays, not complex nested JSON
 * 3. **Template-Based**: Notebook structure built from template, not LLM
 * 4. **Proper IDs**: Generates unique cell IDs as required by nbformat 4.5+
 *
 * References:
 * - Jupyter nbformat: https://nbformat.readthedocs.io/en/latest/format_description.html
 * - Claude structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 */

// Define the schema for LLM output (simple and clean)
const NotebookCellSchema = z.object({
  type: z.enum(['markdown', 'code']).describe('Cell type'),
  content: z.array(z.string()).describe('Lines of content (one string per line)'),
});

const NotebookGenerationSchema = z.object({
  cells: z.array(NotebookCellSchema).describe('List of notebook cells'),
  requiredPackages: z.array(z.string()).describe('Python packages needed (e.g., ["numpy", "matplotlib"])'),
});

type NotebookGeneration = z.infer<typeof NotebookGenerationSchema>;

/**
 * Generate a Jupyter notebook using structured outputs
 */
export async function generateNotebookV2(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode; tokensUsed: number }> {
  console.log('📓 Generating notebook with structured outputs...');

  // Use Claude Sonnet 4.5 with structured outputs
  const model = new ChatAnthropic({
    modelName: 'claude-sonnet-4-5-20250929',
    temperature: 0.3,
  });

  // Use structured output (guarantees valid JSON)
  const structuredModel = model.withStructuredOutput(NotebookGenerationSchema);

  const prompt = buildNotebookPrompt(idea, plan);

  try {
    const result = await structuredModel.invoke(prompt);
    const tokensUsed = 0; // We'll estimate this

    console.log(`   ✅ Generated ${result.cells.length} cells`);

    // Build the actual .ipynb file using template
    const notebookContent = buildNotebookFromCells(result.cells, plan);

    // Generate short repo name
    const repoName = await generateRepoName(idea);

    const files: CodeFile[] = [
      {
        path: 'notebook.ipynb',
        content: JSON.stringify(notebookContent, null, 2),
        language: 'json',
      },
      {
        path: 'README.md',
        content: generateReadme(idea, result.requiredPackages),
      },
    ];

    // Add requirements.txt
    if (result.requiredPackages.length > 0) {
      files.push({
        path: 'requirements.txt',
        content: result.requiredPackages.join('\n'),
      });
    }

    return {
      code: {
        repoName,
        description: idea.description || idea.title,
        files,
        dependencies: {
          runtime: ['python'],
          packages: result.requiredPackages,
        },
        setupInstructions: 'pip install -r requirements.txt',
        runInstructions: 'jupyter lab notebook.ipynb',
        type: 'python',
        outputType: 'notebook',
      },
      tokensUsed,
    };
  } catch (error) {
    console.error('❌ Notebook generation failed:', error);
    throw error;
  }
}

/**
 * Build the prompt for notebook generation
 */
function buildNotebookPrompt(
  idea: { title: string; description: string | null },
  plan: CodePlan
): string {
  return `Create a WORKING Jupyter notebook for: ${idea.title}

${idea.description ? `Description: ${idea.description}` : ''}

Requirements:
- Language: Python
- Make it FULLY EXECUTABLE (all cells run in order without errors)
- Include ALL necessary imports in the first code cell
- Create cells that alternate between markdown explanations and code
- Add visualizations using matplotlib/seaborn where appropriate
- Include working examples with real data (not placeholders)

Structure:
1. **Title cell** (markdown): Title, overview, what you'll learn
2. **Imports cell** (code): All necessary imports
3. **Implementation cells** (alternating markdown + code): Build the functionality step by step
4. **Examples cell** (code): Demonstrate with real working examples
5. **Conclusion cell** (markdown): Summary and next steps

CRITICAL:
- Each code cell MUST be executable
- Code cells should be short (5-20 lines each)
- Include comments in code cells
- Make markdown cells educational and clear

You must respond with valid JSON matching this exact structure:
{
  "cells": [
    {
      "type": "markdown",
      "content": ["# Title", "Overview text here"]
    },
    {
      "type": "code",
      "content": ["import numpy as np", "import matplotlib.pyplot as plt"]
    }
  ],
  "requiredPackages": ["numpy", "matplotlib", "pandas"]
}

IMPORTANT:
- cells: array of cell objects
- Each cell has "type" (either "markdown" or "code") and "content" (array of strings)
- requiredPackages: array of package names needed (use pip package names)
- Create at least 5-10 cells total
- First cell should always be markdown with title
- Second cell should always be code with imports`;
}

/**
 * Build a proper Jupyter notebook from cells
 *
 * This creates the correct .ipynb structure according to nbformat 4.5
 * Reference: https://nbformat.readthedocs.io/en/latest/format_description.html
 */
function buildNotebookFromCells(
  cells: NotebookGeneration['cells'],
  plan: CodePlan
): any {
  return {
    cells: cells.map((cell, index) => ({
      cell_type: cell.type,
      id: generateCellId(index), // Required by nbformat 4.5+
      metadata: {},
      source: cell.content, // Array of strings (one per line)
      // Code cells need outputs and execution_count
      ...(cell.type === 'code'
        ? {
            outputs: [],
            execution_count: null,
          }
        : {}),
    })),
    metadata: {
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      language_info: {
        name: 'python',
        version: '3.9',
        mimetype: 'text/x-python',
        codemirror_mode: {
          name: 'ipython',
          version: 3,
        },
        pygments_lexer: 'ipython3',
        nbconvert_exporter: 'python',
        file_extension: '.py',
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

/**
 * Generate a unique cell ID
 *
 * nbformat 4.5+ requires all cells to have unique IDs
 * Format: alphanumeric, -, and _ (1-64 chars)
 */
function generateCellId(index: number): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `cell-${index}-${timestamp}-${random}`;
}

/**
 * Generate a short, descriptive repo name
 */
async function generateRepoName(idea: { title: string; description: string | null }): Promise<string> {
  // Simple kebab-case conversion for now
  // Could enhance with GPT-5 nano later
  const name = idea.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 30);

  console.log(`   📛 Repo name: "${name}"`);
  return name;
}

/**
 * Generate README for notebook
 */
function generateReadme(
  idea: { title: string; description: string | null },
  packages: string[]
): string {
  return `# ${idea.title}

${idea.description || ''}

## Setup

\`\`\`bash
pip install ${packages.join(' ')}
\`\`\`

## Usage

Open the notebook in Jupyter Lab:

\`\`\`bash
jupyter lab notebook.ipynb
\`\`\`

Or upload to [Google Colab](https://colab.research.google.com/).

## Requirements

${packages.map((pkg) => `- ${pkg}`).join('\n')}

## Generated by AI

This notebook was automatically generated using Claude Sonnet 4.5.
`;
}
