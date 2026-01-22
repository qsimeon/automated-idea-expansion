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
): Promise<{ code: GeneratedCode; tokensUsed: number }> {
  console.log('📓 Generating notebook with atomic schemas (V3)...');

  // Use Claude Sonnet 4.5 with structured outputs
  const model = new ChatAnthropic({
    modelName: 'claude-sonnet-4-5-20250929',
    temperature: 0.3,
  });

  // Use structured output with atomic schema
  const structuredModel = model.withStructuredOutput(NotebookGenerationSchema);

  const prompt = buildAtomicNotebookPrompt(idea, plan);

  try {
    const result = await structuredModel.invoke(prompt);
    const tokensUsed = 0; // Estimate if needed

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
      tokensUsed,
    };
  } catch (error) {
    console.error('❌ Notebook generation failed:', error);
    throw error;
  }
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
  return `Create a WORKING Jupyter notebook for: "${idea.title}"

${idea.description ? `Description: ${idea.description}` : ''}

CRITICAL: You MUST respond using ATOMIC, STRUCTURED FORMAT.

## Notebook Structure

You will create cells alternating between markdown explanations and executable code.

### Cell Type 1: Markdown Cells

Markdown cells contain STRUCTURED BLOCKS. You must break down markdown content into atomic blocks:

**Block Types**:
1. **Headers**: h1, h2, h3, h4, h5, h6 (each is a single text string)
   Example: { "blockType": "h1", "text": "Understanding Depth Perception" }

2. **Paragraphs**: Body text (single coherent paragraph)
   Example: { "blockType": "paragraph", "text": "This notebook explores..." }

3. **Bullet Lists**: Array of items (each item is a string)
   Example: { "blockType": "bulletList", "items": ["First point", "Second point"] }

4. **Numbered Lists**: Array of items
   Example: { "blockType": "numberedList", "items": ["Step 1", "Step 2"] }

5. **Code Blocks** (in markdown, not executable): Lines of code for display
   Example: { "blockType": "codeBlock", "language": "python", "lines": ["x = 5", "print(x)"] }

6. **Horizontal Rule**: Section separator
   Example: { "blockType": "hr" }

**Example Markdown Cell**:
\`\`\`json
{
  "cellType": "markdown",
  "blocks": [
    { "blockType": "h1", "text": "Introduction to Depth Perception" },
    { "blockType": "paragraph", "text": "Human vision uses multiple cues to perceive depth." },
    { "blockType": "h2", "text": "Key Concepts" },
    { "blockType": "bulletList", "items": [
      "Binocular disparity",
      "Accommodation",
      "Motion parallax"
    ]}
  ]
}
\`\`\`

### Cell Type 2: Code Cells

Code cells contain ATOMIC LINES. Each line is a separate object:

**Line Structure**:
- Each line has a "code" field (string)
- Blank lines are explicit: { "code": "" }
- Comment lines are explicit: { "code": "# This is a comment" }
- Code with inline comments: { "code": "x = 5  # Initialize" }

**Example Code Cell**:
\`\`\`json
{
  "cellType": "code",
  "lines": [
    { "code": "import numpy as np" },
    { "code": "import matplotlib.pyplot as plt" },
    { "code": "" },
    { "code": "# Setup constants" },
    { "code": "FOCAL_LENGTH = 14.0  # mm" },
    { "code": "IPD = 65  # mm, interpupillary distance" },
    { "code": "" },
    { "code": "def calculate_depth(disparity):" },
    { "code": "    return (FOCAL_LENGTH * IPD) / disparity" }
  ]
}
\`\`\`

## Requirements

1. **Completeness**: Create a FULL, WORKING notebook (5-15 cells)
2. **Structure**:
   - Start with markdown cell (title + overview)
   - Second cell: code cell with ALL imports
   - Alternate markdown explanations with code demonstrations
   - End with markdown conclusion
3. **Executability**: All code cells must run without errors
4. **Educational**: Markdown should explain concepts clearly
5. **Working Examples**: Include real, executable demonstrations

## Response Format

You MUST respond with this exact JSON structure:

\`\`\`json
{
  "cells": [
    {
      "cellType": "markdown",
      "blocks": [
        { "blockType": "h1", "text": "Title here" },
        { "blockType": "paragraph", "text": "Overview here" }
      ]
    },
    {
      "cellType": "code",
      "lines": [
        { "code": "import numpy as np" },
        { "code": "import matplotlib.pyplot as plt" }
      ]
    }
    // ... more cells ...
  ],
  "requiredPackages": ["numpy", "matplotlib", "pandas"]
}
\`\`\`

## Important Rules

- ✅ **DO**: Use structured blocks for markdown (h1, h2, paragraph, lists)
- ✅ **DO**: Use line-by-line structure for code
- ✅ **DO**: Make blank lines explicit: { "code": "" }
- ✅ **DO**: Include all imports in first code cell
- ✅ **DO**: Create working, executable code

- ❌ **DON'T**: Mix different block types in markdown
- ❌ **DON'T**: Put entire code blocks as single strings
- ❌ **DON'T**: Use placeholder code that won't run
- ❌ **DON'T**: Forget to specify all required packages

## Example of CORRECT Structure

\`\`\`json
{
  "cells": [
    {
      "cellType": "markdown",
      "blocks": [
        { "blockType": "h1", "text": "${idea.title}" },
        { "blockType": "paragraph", "text": "In this notebook, we'll explore..." },
        { "blockType": "h2", "text": "What You'll Learn" },
        { "blockType": "bulletList", "items": ["Concept 1", "Concept 2", "Concept 3"] }
      ]
    },
    {
      "cellType": "code",
      "lines": [
        { "code": "import numpy as np" },
        { "code": "import matplotlib.pyplot as plt" },
        { "code": "import seaborn as sns" }
      ]
    },
    {
      "cellType": "markdown",
      "blocks": [
        { "blockType": "h2", "text": "1. Setup and Constants" },
        { "blockType": "paragraph", "text": "First, let's define the key parameters..." }
      ]
    },
    {
      "cellType": "code",
      "lines": [
        { "code": "# Constants for human eye" },
        { "code": "FOCAL_LENGTH = 14.0  # mm" },
        { "code": "IPD = 65.0  # mm" },
        { "code": "" },
        { "code": "print(f'Focal length: {FOCAL_LENGTH}mm')" },
        { "code": "print(f'Interpupillary distance: {IPD}mm')" }
      ]
    }
  ],
  "requiredPackages": ["numpy", "matplotlib", "seaborn"]
}
\`\`\`

Now create the notebook for: "${idea.title}"

Remember: ATOMIC STRUCTURE ONLY. Break everything into primitives.`;
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
          source: renderMarkdownBlocks(cell.blocks),
        };
      } else {
        // Code cell
        return {
          cell_type: 'code',
          id: generateCellId(index),
          metadata: {},
          source: cell.lines.map((line) => line.code),
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
