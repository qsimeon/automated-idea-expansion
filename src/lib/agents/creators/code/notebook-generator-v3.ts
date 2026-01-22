import { ChatAnthropic } from '@langchain/anthropic';
import type { CodePlan, GeneratedCode, CodeFile } from './types';
import { z } from 'zod';

/**
 * NOTEBOOK GENERATOR V3 (Atomic Schema Implementation)
 *
 * Complete rewrite using deeply nested, atomic schemas following the
 * "schemas all the way down" philosophy.
 *
 * Key improvements over V2:
 * 1. **Atomic Markdown Blocks**: Headers, paragraphs, lists as structured objects
 * 2. **Atomic Code Lines**: Each line is a structured object
 * 3. **No Ambiguity**: LLM cannot dump mixed content
 * 4. **Self-Documenting**: Schema IS the specification
 *
 * References:
 * - Design doc: NOTEBOOK_SCHEMA_DESIGN.md
 * - Jupyter nbformat: https://nbformat.readthedocs.io/en/latest/format_description.html
 */

// ===== ATOMIC SCHEMAS =====

// Markdown Block Types (discriminated union for type safety)
const MarkdownBlockSchema = z.discriminatedUnion('blockType', [
  // Headers (6 levels)
  z.object({ blockType: z.literal('h1'), text: z.string().min(1) }),
  z.object({ blockType: z.literal('h2'), text: z.string().min(1) }),
  z.object({ blockType: z.literal('h3'), text: z.string().min(1) }),
  z.object({ blockType: z.literal('h4'), text: z.string().min(1) }),
  z.object({ blockType: z.literal('h5'), text: z.string().min(1) }),
  z.object({ blockType: z.literal('h6'), text: z.string().min(1) }),

  // Body content (paragraphs are primitives - single strings)
  z.object({
    blockType: z.literal('paragraph'),
    text: z.string().min(1),
  }),

  // Lists (items are primitives - array of strings)
  z.object({
    blockType: z.literal('bulletList'),
    items: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    blockType: z.literal('numberedList'),
    items: z.array(z.string().min(1)).min(1),
  }),

  // Code blocks within markdown (lines are primitives)
  z.object({
    blockType: z.literal('codeBlock'),
    language: z.string(),
    lines: z.array(z.string()).min(1),
  }),

  // Horizontal rule (no content)
  z.object({ blockType: z.literal('hr') }),
]);

// Code Line (atomic unit)
const CodeLineSchema = z.object({
  code: z.string(), // Can be empty string for blank lines
});

// Cell Types (discriminated union)
const MarkdownCellSchema = z.object({
  cellType: z.literal('markdown'),
  blocks: z.array(MarkdownBlockSchema).min(1),
});

const CodeCellSchema = z.object({
  cellType: z.literal('code'),
  lines: z.array(CodeLineSchema).min(1),
});

const NotebookCellUnion = z.discriminatedUnion('cellType', [
  MarkdownCellSchema,
  CodeCellSchema,
]);

// Complete Notebook Schema
const NotebookGenerationSchema = z.object({
  cells: z.array(NotebookCellUnion).min(3), // At least 3 cells
  requiredPackages: z.array(z.string()),
});

type NotebookGeneration = z.infer<typeof NotebookGenerationSchema>;
type MarkdownCell = z.infer<typeof MarkdownCellSchema>;
type CodeCell = z.infer<typeof CodeCellSchema>;
type MarkdownBlock = z.infer<typeof MarkdownBlockSchema>;

/**
 * Generate a Jupyter notebook using atomic structured outputs
 */
export async function generateNotebookV3(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode }> {
  console.log('📓 Generating notebook with atomic schemas (V3)...');

  // Use Claude Sonnet 4.5 with structured outputs
  const model = new ChatAnthropic({
    modelName: 'claude-sonnet-4-5-20250929',
    temperature: 0.3,
  });

  // Use structured output with atomic schema
  const structuredModel = model.withStructuredOutput(NotebookGenerationSchema);

  const prompt = buildAtomicNotebookPrompt(idea, plan);

  // Retry logic: Try up to 3 times
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`   📝 Generation attempt ${attempt}/${maxRetries}...`);
      const result = await structuredModel.invoke(prompt);

      console.log(`   ✅ Generated ${result.cells.length} cells`);
      console.log(
        `   📝 Markdown cells: ${result.cells.filter((c) => c.cellType === 'markdown').length}`
      );
      console.log(
        `   💻 Code cells: ${result.cells.filter((c) => c.cellType === 'code').length}`
      );

      // Build the actual .ipynb file from atomic structure
      const notebookContent = buildNotebookFromAtomicCells(result.cells);

      // Generate short repo name
      const repoName = generateRepoName(idea);

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
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`   ❌ Attempt ${attempt} failed:`, lastError.message);

      if (attempt < maxRetries) {
        console.log(`   🔄 Retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
      }
    }
  }

  // All retries failed
  console.error('❌ Notebook generation failed after', maxRetries, 'attempts');
  throw lastError || new Error('Notebook generation failed');
}

/**
 * Build the prompt for atomic notebook generation
 *
 * This prompt guides the LLM to think in atomic, structured units
 */
function buildAtomicNotebookPrompt(
  idea: { title: string; description: string | null },
  plan: CodePlan
): string {
  return `Create a working Jupyter notebook for: "${idea.title}"

${idea.description ? `Description: ${idea.description}` : ''}

Respond with structured JSON following this schema:

{
  "cells": [
    // Markdown cells have blocks (headers, paragraphs, lists, code blocks)
    {
      "cellType": "markdown",
      "blocks": [
        { "blockType": "h1", "text": "Title" },
        { "blockType": "paragraph", "text": "Explanation..." },
        { "blockType": "bulletList", "items": ["Point 1", "Point 2"] }
      ]
    },
    // Code cells have lines (each line is separate)
    {
      "cellType": "code",
      "lines": [
        { "code": "import numpy as np" },
        { "code": "" },  // Blank lines are explicit
        { "code": "# Comment" },
        { "code": "x = 5" }
      ]
    }
  ],
  "requiredPackages": ["numpy", "matplotlib"]
}

Block types for markdown:
- h1, h2, h3, h4, h5, h6: { "blockType": "h1", "text": "..." }
- paragraph: { "blockType": "paragraph", "text": "..." }
- bulletList: { "blockType": "bulletList", "items": ["...", "..."] }
- numberedList: { "blockType": "numberedList", "items": ["...", "..."] }
- codeBlock: { "blockType": "codeBlock", "language": "python", "lines": ["..."] }
- hr: { "blockType": "hr" }

Requirements:
- Create 5-15 cells total
- Start with markdown (title + overview)
- Second cell: ALL imports
- Alternate markdown and code
- End with markdown conclusion
- Code must be executable and working
- Include all required packages

Create the notebook now.`;
}

/**
 * Build a proper Jupyter notebook from atomic cells
 *
 * Transforms our atomic structure into nbformat 4.5 compliant JSON
 */
function buildNotebookFromAtomicCells(
  cells: NotebookGeneration['cells']
): any {
  return {
    cells: cells.map((cell, index) => {
      if (cell.cellType === 'markdown') {
        return {
          cell_type: 'markdown',
          id: generateCellId(index),
          metadata: {},
          source: renderMarkdownBlocks(cell.blocks).map((line) => line + '\n'),
        };
      } else {
        // Code cell
        return {
          cell_type: 'code',
          id: generateCellId(index),
          metadata: {},
          source: cell.lines.map((line) => line.code + '\n'),
          outputs: [],
          execution_count: null,
        };
      }
    }),
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
 * Render markdown blocks to array of strings (Jupyter format)
 *
 * Transforms atomic blocks into markdown syntax
 */
function renderMarkdownBlocks(blocks: MarkdownBlock[]): string[] {
  const lines: string[] = [];

  blocks.forEach((block, index) => {
    // Add blank line between blocks (except first)
    if (index > 0) {
      lines.push('');
    }

    switch (block.blockType) {
      case 'h1':
        lines.push(`# ${block.text}`);
        break;
      case 'h2':
        lines.push(`## ${block.text}`);
        break;
      case 'h3':
        lines.push(`### ${block.text}`);
        break;
      case 'h4':
        lines.push(`#### ${block.text}`);
        break;
      case 'h5':
        lines.push(`##### ${block.text}`);
        break;
      case 'h6':
        lines.push(`###### ${block.text}`);
        break;
      case 'paragraph':
        lines.push(block.text);
        break;
      case 'bulletList':
        block.items.forEach((item) => {
          lines.push(`- ${item}`);
        });
        break;
      case 'numberedList':
        block.items.forEach((item, i) => {
          lines.push(`${i + 1}. ${item}`);
        });
        break;
      case 'codeBlock':
        lines.push(`\`\`\`${block.language}`);
        block.lines.forEach((line) => lines.push(line));
        lines.push('```');
        break;
      case 'hr':
        lines.push('---');
        break;
    }
  });

  return lines;
}

/**
 * Generate a unique cell ID
 *
 * nbformat 4.5+ requires all cells to have unique IDs
 */
function generateCellId(index: number): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `cell-${index}-${timestamp}-${random}`;
}

/**
 * Generate a short, descriptive repo name
 */
function generateRepoName(idea: { title: string; description: string | null }): string {
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

This notebook was automatically generated using Claude Sonnet 4.5 with atomic structured outputs.
Follows the "schemas all the way down" philosophy for maximum quality and structure.
`;
}
