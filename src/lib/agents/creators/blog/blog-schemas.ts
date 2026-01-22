import { z } from 'zod';

/**
 * BLOG CELL-BASED SCHEMAS
 *
 * Philosophy: "Schemas all the way down"
 *
 * Instead of generating markdown as strings, we generate structured cells
 * that can be:
 * 1. Validated at generation time
 * 2. Rendered differently for different platforms
 * 3. Manipulated/edited atomically
 * 4. Analyzed programmatically
 *
 * Inspired by Jupyter notebook cell structure but adapted for blog content.
 */

// ===== ATOMIC MARKDOWN BLOCKS =====

/**
 * Markdown Block Types (discriminated union for type safety)
 *
 * Each block represents a single semantic unit of content.
 * The LLM generates these as structured objects, not strings.
 */
export const MarkdownBlockSchema = z.discriminatedUnion('blockType', [
  // Headers (most common blog levels)
  z.object({ blockType: z.literal('h1'), text: z.string().min(1) }),
  z.object({ blockType: z.literal('h2'), text: z.string().min(1) }),
  z.object({ blockType: z.literal('h3'), text: z.string().min(1) }),

  // Body content
  z.object({
    blockType: z.literal('paragraph'),
    text: z.string().min(1),
  }),

  // Lists
  z.object({
    blockType: z.literal('bulletList'),
    items: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    blockType: z.literal('numberedList'),
    items: z.array(z.string().min(1)).min(1),
  }),

  // Code blocks (for technical content)
  z.object({
    blockType: z.literal('codeBlock'),
    language: z.string(),
    lines: z.array(z.string()).min(1),
  }),

  // Horizontal rule (section separator)
  z.object({ blockType: z.literal('hr') }),
]);

export type MarkdownBlock = z.infer<typeof MarkdownBlockSchema>;

// ===== CELL TYPES =====

/**
 * Image Cell - First-class content type
 *
 * Images are not embedded in markdown strings but are separate cells
 * with explicit placement and metadata.
 *
 * Note: imageUrl accepts placeholders like "[PLACEHOLDER-1]" during generation,
 * which get replaced with actual URLs after image generation.
 */
export const ImageCellSchema = z.object({
  cellType: z.literal('image'),
  imageUrl: z.string(), // Accept any string (including placeholders)
  caption: z.string(),
  placement: z.enum(['featured', 'inline', 'end']).describe(
    'featured = hero image, inline = between sections, end = conclusion'
  ),
});

export type ImageCell = z.infer<typeof ImageCellSchema>;

/**
 * Markdown Cell - Contains structured blocks
 *
 * Instead of raw markdown, this contains an array of typed blocks.
 * Each block is validated and type-safe.
 */
export const MarkdownCellSchema = z.object({
  cellType: z.literal('markdown'),
  blocks: z.array(MarkdownBlockSchema).min(1),
});

export type MarkdownCell = z.infer<typeof MarkdownCellSchema>;

/**
 * Blog Cell Union - All possible cell types
 *
 * Using discriminated union for type safety and exhaustive matching.
 */
export const BlogCellSchema = z.discriminatedUnion('cellType', [
  MarkdownCellSchema,
  ImageCellSchema,
]);

export type BlogCell = z.infer<typeof BlogCellSchema>;

// ===== SOCIAL POST SCHEMA =====

/**
 * Social Media Post Schema (embedded in blog generation)
 */
export const SocialPostSchema = z.object({
  content: z.string().max(280).describe('Tweet text (max 280 chars)'),
  hashtags: z.array(z.string()).min(2).max(3).describe('2-3 hashtags without # prefix'),
  includeImage: z.boolean().describe('Whether to generate a social media image'),
});

export type SocialPost = z.infer<typeof SocialPostSchema>;

// ===== COMPLETE BLOG SCHEMA =====

/**
 * Blog Generation Schema - Complete structured output
 *
 * This is what the LLM generates directly using structured output.
 * No parsing, no string manipulation - just validated structured data.
 */
export const BlogGenerationSchema = z.object({
  title: z.string().min(1).describe('Blog post title'),
  cells: z.array(BlogCellSchema).min(3).describe('Blog content as structured cells'),
  socialPost: SocialPostSchema.describe('Auto-generated social media post'),
});

export type BlogGeneration = z.infer<typeof BlogGenerationSchema>;

// ===== UTILITY FUNCTIONS =====

/**
 * Convert markdown blocks to markdown string (for backward compatibility)
 */
export function renderMarkdownBlocks(blocks: MarkdownBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.blockType) {
        case 'h1':
          return `# ${block.text}`;
        case 'h2':
          return `## ${block.text}`;
        case 'h3':
          return `### ${block.text}`;
        case 'paragraph':
          return block.text;
        case 'bulletList':
          return block.items.map((item) => `- ${item}`).join('\n');
        case 'numberedList':
          return block.items.map((item, i) => `${i + 1}. ${item}`).join('\n');
        case 'codeBlock':
          return `\`\`\`${block.language}\n${block.lines.join('\n')}\n\`\`\``;
        case 'hr':
          return '---';
      }
    })
    .join('\n\n');
}

/**
 * Convert blog cells to markdown string (for backward compatibility)
 */
export function renderBlogToMarkdown(cells: BlogCell[]): string {
  return cells
    .map((cell) => {
      if (cell.cellType === 'markdown') {
        return renderMarkdownBlocks(cell.blocks);
      } else if (cell.cellType === 'image') {
        return `![${cell.caption}](${cell.imageUrl})\n*${cell.caption}*`;
      }
    })
    .join('\n\n');
}

/**
 * Calculate word count from cells
 */
export function calculateWordCount(cells: BlogCell[]): number {
  let wordCount = 0;

  for (const cell of cells) {
    if (cell.cellType === 'markdown') {
      for (const block of cell.blocks) {
        if (block.blockType === 'paragraph' || block.blockType === 'h1' || block.blockType === 'h2' || block.blockType === 'h3') {
          wordCount += block.text.split(/\s+/).length;
        } else if (block.blockType === 'bulletList' || block.blockType === 'numberedList') {
          wordCount += block.items.join(' ').split(/\s+/).length;
        } else if (block.blockType === 'codeBlock') {
          // Code blocks count as fewer words (comments matter more)
          wordCount += block.lines.join(' ').split(/\s+/).length * 0.5;
        }
      }
    }
  }

  return Math.round(wordCount);
}
