# Atomic Notebook Schema Design

## Philosophy: Schemas All The Way Down

**Core Principle**: Every content unit must be a **primitive** (simple string) wrapped in a **structured object** that describes its type.

**Why**:
- LLMs can't "cheat" by dumping mixed content
- Each unit is self-documenting
- Easy to validate and transform
- Forces LLM to think structurally

---

## Markdown Cell Schema (Atomic Blocks)

### Current (BROKEN):
```typescript
{
  type: 'markdown',
  content: z.array(z.string())  // ❌ Can contain anything!
}
```

**Problem**: LLM mixes headers, paragraphs, code, etc. in arbitrary strings

### New (ATOMIC):
```typescript
{
  type: 'markdown',
  blocks: [
    // Headers (6 levels)
    { blockType: 'h1', text: "Main Title" },
    { blockType: 'h2', text: "Section Title" },
    { blockType: 'h3', text: "Subsection" },

    // Paragraphs (body text)
    { blockType: 'paragraph', text: "This is a complete paragraph. It can span multiple sentences." },

    // Lists
    { blockType: 'bulletList', items: ["First item", "Second item", "Third item"] },
    { blockType: 'numberedList', items: ["Step 1", "Step 2", "Step 3"] },

    // Code snippets (inline code blocks in markdown)
    { blockType: 'codeBlock', language: 'python', lines: ["print('hello')", "x = 5"] },

    // Emphasis
    { blockType: 'bold', text: "Important text" },
    { blockType: 'italic', text: "Emphasized text" },

    // Quotes
    { blockType: 'blockquote', text: "This is a quote" },

    // Horizontal rule
    { blockType: 'hr' },
  ]
}
```

### Zod Schema:
```typescript
const MarkdownBlockSchema = z.discriminatedUnion('blockType', [
  // Headers
  z.object({ blockType: z.literal('h1'), text: z.string() }),
  z.object({ blockType: z.literal('h2'), text: z.string() }),
  z.object({ blockType: z.literal('h3'), text: z.string() }),
  z.object({ blockType: z.literal('h4'), text: z.string() }),
  z.object({ blockType: z.literal('h5'), text: z.string() }),
  z.object({ blockType: z.literal('h6'), text: z.string() }),

  // Body content
  z.object({ blockType: z.literal('paragraph'), text: z.string() }),

  // Lists (items are primitives - strings)
  z.object({
    blockType: z.literal('bulletList'),
    items: z.array(z.string()).min(1)
  }),
  z.object({
    blockType: z.literal('numberedList'),
    items: z.array(z.string()).min(1)
  }),

  // Code blocks within markdown
  z.object({
    blockType: z.literal('codeBlock'),
    language: z.string(),
    lines: z.array(z.string()).min(1)
  }),

  // Emphasis
  z.object({ blockType: z.literal('bold'), text: z.string() }),
  z.object({ blockType: z.literal('italic'), text: z.string() }),

  // Quotes
  z.object({ blockType: z.literal('blockquote'), text: z.string() }),

  // Horizontal rule
  z.object({ blockType: z.literal('hr') }),
]);

const MarkdownCellSchema = z.object({
  cellType: z.literal('markdown'),
  blocks: z.array(MarkdownBlockSchema).min(1),
});
```

**Key Points**:
- Every block has explicit `blockType`
- Text content is always a primitive `string`
- Lists have `items` array where each item is a primitive `string`
- Code blocks have `lines` array where each line is a primitive `string`
- No ambiguity possible

---

## Code Cell Schema (Atomic Lines)

### Current (BROKEN):
```typescript
{
  type: 'code',
  content: z.array(z.string())  // ❌ Can contain anything!
}
```

**Problem**: LLM mixes code, comments, blank lines without structure

### New (ATOMIC):
```typescript
{
  type: 'code',
  lines: [
    { code: "import numpy as np" },
    { code: "import matplotlib.pyplot as plt" },
    { code: "" },  // Explicit blank line
    { code: "# Setup constants" },  // Comment line
    { code: "FOCAL_LENGTH = 14.0  # mm" },  // Code with inline comment
    { code: "INTERPUPILLARY_DISTANCE = 65  # mm" },
    { code: "" },
    { code: "def calculate_depth(disparity):" },
    { code: "    return FOCAL_LENGTH * INTERPUPILLARY_DISTANCE / disparity" },
  ]
}
```

### Zod Schema:
```typescript
const CodeLineSchema = z.object({
  code: z.string(),  // A single line of code (can be empty string for blank lines)
});

const CodeCellSchema = z.object({
  cellType: z.literal('code'),
  lines: z.array(CodeLineSchema).min(1),
});
```

**Key Points**:
- Each line is atomic: one string
- Blank lines are explicit: `{ code: "" }`
- Comments are just lines: `{ code: "# Comment" }`
- Inline comments are part of the line: `{ code: "x = 5  # comment" }`
- LLM must think line-by-line
- Natural Python indentation preserved in strings

---

## Complete Notebook Schema

### Full Structure:
```typescript
const NotebookSchema = z.object({
  cells: z.array(
    z.discriminatedUnion('cellType', [
      MarkdownCellSchema,
      CodeCellSchema,
    ])
  ).min(1),
  requiredPackages: z.array(z.string()),
});
```

### Example:
```json
{
  "cells": [
    {
      "cellType": "markdown",
      "blocks": [
        { "blockType": "h1", "text": "Understanding Human Depth Perception" },
        { "blockType": "paragraph", "text": "This notebook explores the physics and biology of how humans perceive depth." },
        { "blockType": "h2", "text": "1. Introduction" },
        { "blockType": "paragraph", "text": "The human visual system uses multiple cues to perceive depth." }
      ]
    },
    {
      "cellType": "code",
      "lines": [
        { "code": "import numpy as np" },
        { "code": "import matplotlib.pyplot as plt" },
        { "code": "" },
        { "code": "# Constants for human eye" },
        { "code": "FOCAL_LENGTH = 14.0  # mm" }
      ]
    },
    {
      "cellType": "markdown",
      "blocks": [
        { "blockType": "h2", "text": "2. Binocular Disparity Formula" },
        { "blockType": "paragraph", "text": "The fundamental equation relates disparity to depth:" },
        { "blockType": "codeBlock", "language": "python", "lines": ["depth = (f * b) / disparity"] }
      ]
    }
  ],
  "requiredPackages": ["numpy", "matplotlib"]
}
```

---

## Benefits of Atomic Schema

### ✅ **Eliminates Ambiguity**
- LLM cannot dump mixed content
- Each unit has explicit type
- No parsing/guessing needed

### ✅ **Self-Documenting**
- Schema IS the spec
- Anyone reading code knows exact structure
- TypeScript types match runtime reality

### ✅ **Easy to Validate**
- Zod validates every field
- Discriminated unions enforce correctness
- No manual string parsing

### ✅ **Easy to Transform**
- Markdown rendering: map blocks to HTML
- Notebook rendering: map to .ipynb format
- Different viewers: same data, different presentation

### ✅ **Forces Better LLM Thinking**
- Must think structurally
- Can't take shortcuts
- Produces cleaner output

---

## Rendering Strategy

### Markdown Cell → Jupyter Markdown
```typescript
function renderMarkdownCell(cell: MarkdownCell): string {
  return cell.blocks.map(block => {
    switch (block.blockType) {
      case 'h1': return `# ${block.text}`;
      case 'h2': return `## ${block.text}`;
      case 'h3': return `### ${block.text}`;
      case 'paragraph': return block.text;
      case 'bulletList': return block.items.map(item => `- ${item}`).join('\n');
      case 'numberedList': return block.items.map((item, i) => `${i + 1}. ${item}`).join('\n');
      case 'codeBlock': return `\`\`\`${block.language}\n${block.lines.join('\n')}\n\`\`\``;
      case 'bold': return `**${block.text}**`;
      case 'italic': return `*${block.text}*`;
      case 'blockquote': return `> ${block.text}`;
      case 'hr': return '---';
    }
  }).join('\n\n');
}
```

### Code Cell → Jupyter Code
```typescript
function renderCodeCell(cell: CodeCell): string[] {
  return cell.lines.map(line => line.code);
}
```

---

## Migration Path

### Step 1: Define atomic schemas (this doc)
### Step 2: Update notebook-generator-v2.ts to use new schemas
### Step 3: Update buildNotebookFromCells() to handle new structure
### Step 4: Update prompts to guide LLM to use structured format
### Step 5: Test with real ideas

---

## Philosophy Recap

> "You really need to break things down to the most primitive level which can be represented as a simple string."

**This schema achieves that**:
- Every terminal node is a primitive string
- Every non-terminal node has explicit structure
- No ambiguity, no mixed content, no parsing hacks
- **Schemas all the way down**

