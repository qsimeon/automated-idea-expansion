import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { generateImageForContent } from '../image-creator';
import type { GeneratedImage, BlogPlan, BlogReview } from '../../types';
import {
  BlogGenerationSchema,
  renderBlogToMarkdown,
  calculateWordCount,
  type BlogGeneration,
  type BlogCell,
  type ImageCell,
} from './blog-schemas';
import { z } from 'zod';
import { createLogger } from '@/lib/logging/logger';
import { IdeaCreatorSchema, type IdeaForCreator } from '@/lib/db/schemas';
import type { Idea } from '@/lib/db/types';
import { MODEL_USE_CASES } from '@/lib/config/models';

/**
 * BLOG CREATOR - Cell-Based Architecture
 *
 * Philosophy: "Schemas all the way down"
 *
 * Pipeline:
 * 1. Planning Agent → Decides structure, sections, image placements
 * 2. Generation Agent → Creates BlogCell[] (markdown cells + image cells) using structured output
 * 3. Image Generation → Generates images for ImageCell placeholders
 * 4. Review Agent → Quality check
 *
 * Key features:
 * - Atomic cell structure (no markdown parsing needed)
 * - Images as first-class cells, not embedded strings
 * - Social post integrated into generation (not separate stage)
 * - Type-safe at every layer
 *
 * Models:
 * - GPT-5 Nano: Planning (fast, cheap, excellent at structured reasoning)
 * - Claude Haiku 4.5: Content generation (best writing quality)
 * - GPT-4o-mini: Review (fast, cost-effective validation)
 */

const BlogPlanSchema = z.object({
  title: z.string(),
  sections: z.array(z.string()),
  tone: z.string(),
  targetWordCount: z.number(),
  includeImages: z.boolean(),
  imageSpecs: z.array(
    z.object({
      placement: z.string(),
      concept: z.string(),
      style: z.string().default('photorealistic'),
    })
  ),
});

// Review schema (same as V2)
const BlogReviewSchema = z.object({
  overallScore: z.number(),
  categoryScores: z.object({
    clarity: z.number(),
    accuracy: z.number(),
    engagement: z.number(),
    structure: z.number(),
  }),
  recommendation: z.enum(['approve', 'revise', 'regenerate']),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});

/**
 * Main entry point for cell-based blog creation
 */
export async function createBlog(ideaData: Idea): Promise<{
  content: any;
}> {
  // Validate idea with schema (runtime validation for safety)
  const idea = IdeaCreatorSchema.parse(ideaData);

  const logger = createLogger({
    ideaId: idea.id,
    stage: 'blog-creator',
  });

  logger.info('=== BLOG CREATOR STARTED ===', {
    ideaTitle: idea.title,
  });

  // STAGE 1: Planning
  logger.info('STAGE 1: Planning started');
  const plan = await planBlog(idea, logger);
  logger.info('STAGE 1: Planning complete', {
    title: plan.title,
    sectionsCount: plan.sections.length,
    targetWordCount: plan.targetWordCount,
    includeImages: plan.includeImages,
    imagesCount: plan.imageSpecs.length,
  });

  // STAGE 2: Cell-Based Generation (including social post)
  logger.info('STAGE 2: Cell-based generation started');
  const generation = await generateBlogCells(plan, idea, logger);
  logger.info('STAGE 2: Cell-based generation complete', {
    cellsCount: generation.cells.length,
    markdownCells: generation.cells.filter((c) => c.cellType === 'markdown').length,
    imageCells: generation.cells.filter((c) => c.cellType === 'image').length,
    socialPostLength: generation.socialPost.content.length,
    hashtags: generation.socialPost.hashtags,
  });

  // STAGE 3: Image Generation (for ImageCell placeholders)
  logger.info('STAGE 3: Image generation started');
  const { cells: cellsWithImages, images } = await generateImagesForCells(
    generation.cells,
    plan.imageSpecs,
    logger
  );
  logger.info('STAGE 3: Image generation complete', {
    imagesGenerated: images.length,
  });

  // STAGE 3.5: Social Media Image (if requested)
  let socialImage: GeneratedImage | undefined;
  if (generation.socialPost.includeImage) {
    logger.info('STAGE 3.5: Social media image generation started');
    try {
      // Use first blog image or generate a new one for social media
      if (images.length > 0) {
        // Reuse the first blog image for social media
        socialImage = images[0];
        logger.info('STAGE 3.5: Using first blog image for social post');
      } else {
        // Generate a dedicated social media image
        const socialImageSpec = {
          placement: 'social',
          concept: generation.title,
          style: 'eye-catching, social media optimized',
          aspectRatio: '16:9' as const,
        };
        socialImage = await generateImageForContent(socialImageSpec, generation.title);
        logger.info('STAGE 3.5: Social media image generated');
      }
    } catch (error) {
      logger.error('STAGE 3.5: Social media image generation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue without social image
    }
  }

  // STAGE 4: Review
  logger.info('STAGE 4: Review started');
  const review = await reviewBlogCells(cellsWithImages, plan, logger);
  logger.info('STAGE 4: Review complete', {
    overallScore: review.overallScore,
    recommendation: review.recommendation,
  });

  // Calculate metadata
  const wordCount = calculateWordCount(cellsWithImages);
  const readingTimeMinutes = Math.ceil(wordCount / 200);
  const markdown = renderBlogToMarkdown(cellsWithImages);

  const duration = logger.getDuration();
  logger.info('=== BLOG CREATOR COMPLETE ===', {
    durationMs: duration,
    durationSeconds: (duration / 1000).toFixed(2),
    finalScore: review.overallScore,
    wordCount,
    cellsCount: cellsWithImages.length,
    imagesCount: images.length,
  });

  // Return format compatible with V2 + new cell structure
  return {
    content: {
      title: generation.title,
      markdown, // Backward compatibility
      cells: cellsWithImages, // NEW: Cell-based structure
      wordCount,
      readingTimeMinutes,
      images, // Generated images array
      socialPost: {
        content: generation.socialPost.content, // Contains [BLOG_URL] placeholder
        hashtags: generation.socialPost.hashtags,
        platform: 'twitter',
        imageUrl: socialImage?.imageUrl,
        imageCaption: socialImage?.caption,
      },
      _reviewScore: review.overallScore,
      _sections: plan.sections,
    },
  };
}

/**
 * STAGE 1: Planning
 */
async function planBlog(
  idea: IdeaForCreator,
  logger: ReturnType<typeof createLogger>
): Promise<z.infer<typeof BlogPlanSchema>> {
  const model = new ChatOpenAI({
    modelName: MODEL_USE_CASES.blogPlanning,
    // Note: GPT-5 Nano only supports default temperature (1)
    apiKey: process.env.OPENAI_API_KEY,
  });

  const structuredModel = model.withStructuredOutput(BlogPlanSchema);

  const prompt = `Plan a blog post for: "${idea.title}"

Create a plan including:
1. Engaging title (can refine original)
2. 3-5 main sections
3. Tone (educational/casual/technical)
4. Target word count (1000-2000)
5. Whether to include images (0-3 images for visual concepts, examples, diagrams)
6. Image specs: placement, concept, style

Return detailed plan.`;

  try {
    const plan = await structuredModel.invoke(prompt);
    return plan as z.infer<typeof BlogPlanSchema>;
  } catch (error) {
    logger.error('Planning failed, using fallback', error instanceof Error ? error : { error });
    return {
      title: idea.title,
      sections: ['Introduction', 'Main Content', 'Conclusion'],
      tone: 'professional',
      targetWordCount: 1200,
      includeImages: false,
      imageSpecs: [],
    };
  }
}

/**
 * STAGE 2: Cell-Based Generation
 */
async function generateBlogCells(
  plan: z.infer<typeof BlogPlanSchema>,
  idea: IdeaForCreator,
  logger: ReturnType<typeof createLogger>
): Promise<BlogGeneration> {
  // Use Sonnet for complex structured output generation (Haiku doesn't handle complex schemas well)
  const model = new ChatAnthropic({
    modelName: MODEL_USE_CASES.blogGeneration,
    temperature: 0.8,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const structuredModel = model.withStructuredOutput(BlogGenerationSchema);

  const prompt = `Create a blog post using STRUCTURED CELLS (not markdown strings).

PLAN:
Title: ${plan.title}
Sections: ${plan.sections.join(', ')}
Tone: ${plan.tone}
Target Word Count: ${plan.targetWordCount}

CELL STRUCTURE:

You must create an array of cells. Each cell is EITHER:

1. **Markdown Cell** - Contains structured blocks:
   {
     "cellType": "markdown",
     "blocks": [
       { "blockType": "h2", "text": "Section Title" },
       { "blockType": "paragraph", "text": "Content..." },
       { "blockType": "bulletList", "items": ["Point 1", "Point 2"] },
       { "blockType": "codeBlock", "language": "python", "lines": ["code line 1", "code line 2"] }
     ]
   }

2. **Image Cell** - Placeholder for image generation:
   {
     "cellType": "image",
     "imageUrl": "[PLACEHOLDER-1]",
     "caption": "Detailed description of what to visualize",
     "placement": "inline"
   }

REQUIREMENTS:
- Start with markdown cell (title as h1 + intro)
- ${plan.includeImages ? `Include ${plan.imageSpecs.length} image cell(s) at strategic points` : 'No image cells'}
- Each section = new markdown cell
- Use appropriate block types (h2 for sections, paragraphs, lists, code blocks if technical)
- Target ${plan.targetWordCount} words total
- Tone: ${plan.tone}

⭐ CRITICAL: FIRST SECTION HEADER MUST DIFFER FROM BLOG TITLE
- Blog title: "${plan.title}"
- First h2 section header MUST be DIFFERENT from this title
- NEVER repeat the blog title as a section header
- Vary section headers based on content context
- Use active voice and engaging language

CONCRETE EXAMPLES:
❌ BAD (if title is "Machine Learning Basics"):
  First h2: "Machine Learning Basics" (exact repeat - FORBIDDEN)
  First h2: "Introduction to Machine Learning Basics" (still too similar)

✅ GOOD (if title is "Machine Learning Basics"):
  First h2: "Understanding the Fundamentals"
  First h2: "Why Machine Learning Matters"
  First h2: "Getting Started with ML"
  First h2: "The Core Concepts"
  First h2: "Breaking Down the Algorithm"

Your first h2 MUST be contextually relevant but textually different from "${plan.title}"

SOCIAL POST:
Generate a compelling tweet that will link to the full blog post:
- Max 280 characters INCLUDING the link placeholder
- End with " [BLOG_URL]" (this will be replaced with actual URL)
- Include 2-3 relevant hashtags (without # prefix)
- Decide if an image would help (visual concepts work best with images)
- Make it engaging - create curiosity to click through

Example: "Ever wondered how X works? The answer might surprise you 🤯 [BLOG_URL]"

OUTPUT FORMAT:
{
  "title": "...",
  "cells": [ ...array of cells... ],
  "socialPost": {
    "content": "Hook text ending with [BLOG_URL]",
    "hashtags": ["tag1", "tag2", "tag3"],
    "includeImage": true/false
  }
}

Generate the complete structured blog.`;

  const generation = await structuredModel.invoke(prompt);
  return generation as BlogGeneration;
}

/**
 * STAGE 3: Image Generation
 */
async function generateImagesForCells(
  cells: BlogCell[],
  imageSpecs: any[],
  logger: ReturnType<typeof createLogger>
): Promise<{ cells: BlogCell[]; images: GeneratedImage[] }> {
  const images: GeneratedImage[] = [];
  const updatedCells: BlogCell[] = [];

  let imageIndex = 0;

  for (const cell of cells) {
    if (cell.cellType === 'image' && cell.imageUrl.includes('PLACEHOLDER')) {
      // Generate image for this placeholder
      if (imageIndex < imageSpecs.length) {
        const spec = imageSpecs[imageIndex];
        try {
          logger.info(`Generating image ${imageIndex + 1}`, { concept: spec.concept });
          const image = await generateImageForContent(spec, cell.caption);
          images.push(image);

          // Replace placeholder with actual URL
          updatedCells.push({
            ...cell,
            imageUrl: image.imageUrl,
          });

          logger.info(`Image ${imageIndex + 1} generated`, { url: image.imageUrl });
          imageIndex++;
        } catch (error) {
          logger.error(`Failed to generate image ${imageIndex + 1}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          // Keep cell but mark as failed
          updatedCells.push({
            ...cell,
            imageUrl: '',
            caption: `[Image generation failed: ${cell.caption}]`,
          });
        }
      } else {
        // No spec for this image, skip it
        logger.warn('Image cell without spec, skipping');
        continue;
      }
    } else {
      updatedCells.push(cell);
    }
  }

  return { cells: updatedCells, images };
}

/**
 * STAGE 4: Review
 */
async function reviewBlogCells(
  cells: BlogCell[],
  plan: z.infer<typeof BlogPlanSchema>,
  logger: ReturnType<typeof createLogger>
): Promise<z.infer<typeof BlogReviewSchema>> {
  const model = new ChatOpenAI({
    modelName: MODEL_USE_CASES.blogReview,
    temperature: 0.5,
    apiKey: process.env.OPENAI_API_KEY,
  });

  const structuredModel = model.withStructuredOutput(BlogReviewSchema);

  // Convert cells to preview for review
  const wordCount = calculateWordCount(cells);
  const preview = renderBlogToMarkdown(cells).substring(0, 1500);

  const prompt = `Review this blog post (cell-based structure):

PLAN:
- Target word count: ${plan.targetWordCount}
- Actual word count: ${wordCount}
- Sections: ${plan.sections.length}
- Images: ${cells.filter((c) => c.cellType === 'image').length}

CONTENT PREVIEW:
${preview}...

Evaluate:
1. Clarity (0-100): Clear structure and writing?
2. Accuracy (0-100): Technically correct?
3. Engagement (0-100): Engaging and well-written?
4. Structure (0-100): Good use of cells and blocks?

Overall score = average
Recommendation: "approve" (≥75), "revise" (60-74), "regenerate" (<60)

Return structured review.`;

  try {
    const review = await structuredModel.invoke(prompt);
    return review as z.infer<typeof BlogReviewSchema>;
  } catch (error) {
    logger.error('Review failed, using fallback', error instanceof Error ? error : { error });
    return {
      overallScore: 75,
      categoryScores: { clarity: 75, accuracy: 75, engagement: 75, structure: 75 },
      recommendation: 'approve',
      strengths: ['Blog created successfully'],
      improvements: ['Review failed - manual check recommended'],
    };
  }
}
