import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { CodePlan, GeneratedCode, CodeFile } from './types';
import { z } from 'zod';
import { ReadmeSchema, type Readme } from './readme-schema';
import { renderReadmeToMarkdown } from './readme-renderer';

// Schema for generating multiple Python files
const ModuleFileSchema = z.object({
  path: z.string().describe('File path (e.g., "rnn_energy/core.py")'),
  content: z.string().describe('Complete, working Python code for this file'),
});

const MultipleFilesSchema = z.object({
  files: z.array(ModuleFileSchema).describe('List of Python files to create'),
});

/**
 * NOTEBOOK GENERATOR (Atomic Schema Implementation)
 *
 * Uses deeply nested, atomic schemas following the "schemas all the way down" philosophy.
 *
 * Architecture:
 * 1. **Atomic Markdown Blocks**: Headers, paragraphs, lists as structured objects
 * 2. **Atomic Code Lines**: Each line is a structured object
 * 3. **No Ambiguity**: LLM cannot dump mixed content
 * 4. **Self-Documenting**: Schema IS the specification
 *
 * References:
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
 * SELECT GENERATION MODEL - Route to appropriate model based on complexity
 *
 * Strategy:
 * - Simple/Modular → Claude Sonnet 4.5 (best code quality, fast)
 * - Complex → O1 with extended thinking (deep reasoning for hard problems)
 */
function selectGenerationModel(plan: CodePlan): ChatAnthropic | ChatOpenAI {
  switch (plan.modelTier) {
    case 'simple':
    case 'modular':
      console.log(`  📊 Using Claude Sonnet 4.5 for ${plan.modelTier} notebook (complexity: ${plan.codeComplexityScore}/10)`);
      return new ChatAnthropic({
        modelName: 'claude-sonnet-4-5-20250929',
        temperature: 0.3,
      });

    case 'complex':
      console.log(`  🧠 Using O1 extended thinking for complex notebook (complexity: ${plan.codeComplexityScore}/10)`);
      return new ChatOpenAI({
        modelName: 'o1-2024-12-17',
        temperature: 1, // O1 only supports temperature 1
      });

    default:
      console.warn(`  ⚠️  Unknown modelTier: ${plan.modelTier}, defaulting to Sonnet`);
      return new ChatAnthropic({
        modelName: 'claude-sonnet-4-5-20250929',
        temperature: 0.3,
      });
  }
}

/**
 * Generate a Jupyter notebook using atomic structured outputs
 */
export async function generateNotebook(
  plan: CodePlan,
  idea: { title: string; description: string | null }
): Promise<{ code: GeneratedCode }> {
  console.log('📓 Generating notebook with atomic schemas...');

  // Use model selection based on complexity
  const model = selectGenerationModel(plan);

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

      // Generate AI-powered README with schema-driven approach
      const readmeContent = await generateReadme({
        idea,
        plan,
        packages: result.requiredPackages,
        notebookCellCount: result.cells.length,
      });

      const files: CodeFile[] = [
        {
          path: 'notebook.ipynb',
          content: JSON.stringify(notebookContent, null, 2),
          language: 'json',
        },
        {
          path: 'README.md',
          content: readmeContent,
        },
      ];

      // Add requirements.txt
      if (result.requiredPackages.length > 0) {
        files.push({
          path: 'requirements.txt',
          content: result.requiredPackages.join('\n'),
        });
      }

      // Generate critical Python module files from the plan
      if (plan.criticalFiles && plan.criticalFiles.length > 0) {
        const pythonModuleFiles = plan.criticalFiles.filter(f =>
          f.endsWith('.py') && !f.endsWith('.ipynb')
        );

        if (pythonModuleFiles.length > 0) {
          console.log(`   📁 Generating ${pythonModuleFiles.length} critical Python module(s)...`);
          const generatedModules = await generateCriticalModules(
            idea,
            plan,
            pythonModuleFiles,
            result.requiredPackages,
            result.cells
          );
          files.push(...generatedModules);
          console.log(`   ✅ Generated ${generatedModules.length} module file(s)`);
        }
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
/**
 * GENERATE CRITICAL PYTHON MODULES
 *
 * Task 2.2: Multi-File Architecture Enforcement
 *
 * The plan specifies critical Python module files that should be generated.
 * This function generates them using schema-driven structured output.
 *
 * Ensures that planned file structure is actually created.
 */
async function generateCriticalModules(
  idea: { title: string; description: string | null },
  plan: CodePlan,
  filePathsToCreate: string[],
  requiredPackages: string[],
  notebookCells: any[]
): Promise<CodeFile[]> {
  try {
    const model = new ChatAnthropic({
      modelName: 'claude-sonnet-4-5-20250929',
      temperature: 0.3,
    });

    const structuredModel = model.withStructuredOutput(MultipleFilesSchema);

    const cellSummary = notebookCells
      .filter((c: any) => c.cellType === 'code')
      .slice(0, 3)
      .map((c: any) => c.lines.map((l: any) => l.code).join('\n').substring(0, 100))
      .join('\n');

    const prompt = `Generate the following Python module files for this project:
Project: "${idea.title}"
${idea.description ? `Description: ${idea.description}` : ''}

Files to create:
${filePathsToCreate.map(f => `- ${f}`).join('\n')}

These modules should:
1. Work together as a cohesive system
2. Be importable from each other
3. Implement the algorithms shown in the notebook cells:

${cellSummary}

Generate COMPLETE, working code for each file. Each file should:
- Have proper imports
- Include docstrings
- Be production-ready
- Work with these dependencies: ${requiredPackages.join(', ') || 'numpy, scipy'}

Return the files as JSON with this structure:
{
  "files": [
    { "path": "rnn_energy/core.py", "content": "..." },
    { "path": "rnn_energy/solver.py", "content": "..." },
    ...
  ]
}`;

    const result = await structuredModel.invoke(prompt);

    // Convert to CodeFile format
    const codeFiles: CodeFile[] = result.files.map(f => ({
      path: f.path,
      content: f.content,
      language: 'python',
    }));

    return codeFiles;
  } catch (error) {
    console.error('⚠️  Failed to generate critical modules:', error instanceof Error ? error.message : error);
    return []; // Return empty array - the notebook is still valid without modules
  }
}

/**
 * SCHEMA-DRIVEN README GENERATION FOR NOTEBOOKS
 *
 * Instead of using a template string, generate a structured README object
 * that is validated by Zod and rendered deterministically.
 *
 * This ensures:
 * - All sections are present
 * - Quality is consistent
 * - Format is professional
 * - Can be extended easily
 */
async function generateReadme(context: {
  idea: { title: string; description: string | null };
  plan: CodePlan;
  packages: string[];
  notebookCellCount: number;
}): Promise<string> {
  // Use Claude Sonnet 4.5 for README generation
  const model = new ChatAnthropic({
    modelName: 'claude-sonnet-4-5-20250929',
    temperature: 0.3,
  });

  // Use structured output with README schema
  const structuredModel = model.withStructuredOutput(ReadmeSchema);

  // Build context for the prompt
  const setupInstructions = context.packages.length > 0
    ? `pip install ${context.packages.join(' ')}`
    : 'No setup required';

  const runInstructions = 'jupyter lab notebook.ipynb (or upload to Google Colab)';

  const prompt = `Generate a comprehensive README.md for this Jupyter notebook project.

PROJECT DETAILS:
Title: ${context.idea.title}
Description: ${context.idea.description || 'N/A'}
Language: Python
Type: Jupyter Notebook
Cells: ${context.notebookCellCount}
Dependencies: ${context.packages.length > 0 ? context.packages.join(', ') : 'None'}

SETUP INSTRUCTIONS:
${setupInstructions}

RUN INSTRUCTIONS:
${runInstructions}

YOUR TASK:
Generate a professional README that includes:
1. A compelling title and one-liner tagline
2. A clear description explaining what the notebook does
3. 2-4 key features/capabilities the notebook demonstrates
4. Setup prerequisites if any
5. Clear installation steps (${setupInstructions})
6. 2-3 usage examples showing how to run the notebook
7. Architecture/structure overview explaining the notebook flow
8. Technical details about dependencies and key concepts
9. Troubleshooting section for common issues
10. Optional notes about how it was generated

Make the README engaging and educational - this is a learning tool!
Focus on making the project understandable to someone new to the topic.`;

  try {
    const readme = await structuredModel.invoke(prompt);

    // Validate the structure (Zod will throw if invalid)
    console.log(`  📖 README schema validated`);
    console.log(`     - Features: ${readme.features.length}`);
    console.log(`     - Installation steps: ${readme.installationSteps.length}`);
    console.log(`     - Usage examples: ${readme.usageExamples.length}`);
    console.log(`     - Troubleshooting items: ${readme.troubleshooting.length}`);

    // Render to markdown
    return renderReadmeToMarkdown(readme);
  } catch (error) {
    // Log detailed error for debugging
    console.error('⚠️  README schema validation failed');
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      if (error.message.includes('OUTPUT_PARSING_FAILURE')) {
        console.error('   Reason: Claude returned incomplete or malformed JSON');
        console.error('   Falling back to template-based README');
      }
    }
    // Fallback to simple template if schema generation fails
    return generateReadmeFallback(context.idea, context.packages);
  }
}

/**
 * FALLBACK: Simple template-based README if AI generation fails
 * This ensures we always have a README, even if the advanced generation breaks
 */
function generateReadmeFallback(
  idea: { title: string; description: string | null },
  packages: string[]
): string {
  return `# ${idea.title}

${idea.description || 'A Jupyter notebook for data analysis and experimentation.'}

## Setup

\`\`\`bash
pip install ${packages.length > 0 ? packages.join(' ') : 'jupyter'}
\`\`\`

## Usage

Open the notebook in Jupyter Lab:

\`\`\`bash
jupyter lab notebook.ipynb
\`\`\`

Or upload to [Google Colab](https://colab.research.google.com/).

## Requirements

${packages.length > 0 ? packages.map((pkg) => `- ${pkg}`).join('\n') : '- jupyter'}

## Notes

This notebook was automatically generated using Claude Sonnet 4.5 with atomic structured outputs.
`;
}
