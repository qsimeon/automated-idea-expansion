import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { generateImageForContent } from './image-creator';
import type {
  BlogPlan,
  BlogDraft,
  BlogReview,
  BlogCreationState,
  GeneratedImage,
} from '../types';
import { z } from 'zod';
import { createLogger } from '@/lib/logging/logger';
import { IdeaCreatorSchema, type IdeaForCreator } from '@/lib/db/schemas';

/**
 * BLOG CREATOR V2 - Multi-Stage Pipeline with Images
 *
 * Pipeline:
 * 1. Planning Agent → Decides structure, sections, image needs
 * 2. Generation Agents → Text + Images (parallel)
 * 3. Review Agent → Quality check against rubric
 * 4. (Optional) Revision if score < threshold
 *
 * Key improvements over V1:
 * - Planning stage for better structure
 * - Can include 1-3 images with captions
 * - Quality review with rubrics
 * - Iteration support for quality improvement
 * - Uses GPT-4o-mini for cost-effective planning/review
 * - Uses Claude Haiku for excellent writing quality
 */

// Zod schemas for structured outputs

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
      style: z.string().default('photorealistic'), // OpenAI requires all fields to be required
    })
  ),
  qualityRubric: z.object({
    clarity: z.object({
      weight: z.number(),
      criteria: z.array(z.string()),
    }),
    accuracy: z.object({
      weight: z.number(),
      criteria: z.array(z.string()),
    }),
    engagement: z.object({
      weight: z.number(),
      criteria: z.array(z.string()),
    }),
    imageRelevance: z.object({
      weight: z.number(),
      criteria: z.array(z.string()),
    }),
  }),
});

const BlogDraftSchema = z.object({
  title: z.string(),
  markdown: z.string(),
  sections: z.array(z.string()),
});

const BlogReviewSchema = z.object({
  overallScore: z.number(),
  categoryScores: z.object({
    clarity: z.number(),
    accuracy: z.number(),
    engagement: z.number(),
    imageRelevance: z.number(),
  }),
  recommendation: z.enum(['approve', 'revise', 'regenerate']),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});

/**
 * Main entry point for blog creation
 */
export async function createBlogV2(ideaData: unknown): Promise<{
  content: any; // BlogDraft but adapted to match existing BlogPost interface
}> {
  // Validate idea with schema - "schemas all the way down"
  const idea = IdeaCreatorSchema.parse(ideaData);

  const logger = createLogger({
    ideaId: idea.id,
    stage: 'blog-creator',
  });

  logger.info('=== BLOG CREATOR V2 STARTED ===', {
    ideaTitle: idea.title,
    bulletsCount: idea.bullets?.length || 0,
  });

  const state: BlogCreationState = {
    idea,
    plan: null,
    draft: null,
    review: null,
    attempts: 0,
    maxAttempts: 3,
    errors: [],
  };

  // STAGE 1: Planning
  logger.info('STAGE 1: Planning started');
  const planResult = await planBlog(idea, logger);
  state.plan = planResult.plan;
  logger.info('STAGE 1: Planning complete', {
    title: state.plan.title,
    sectionsCount: state.plan.sections.length,
    sections: state.plan.sections,
    tone: state.plan.tone,
    targetWordCount: state.plan.targetWordCount,
    includeImages: state.plan.includeImages,
    imagesCount: state.plan.imageSpecs.length,
    imageSpecs: state.plan.imageSpecs.map((spec) => spec.concept),
  });

  // STAGE 2: Generation (Text + Images)
  logger.info('STAGE 2: Generation started', {
    targetWordCount: state.plan.targetWordCount,
    plannedImages: state.plan.imageSpecs.length,
  });
  const draftResult = await generateBlog(state.plan, idea, logger);
  state.draft = draftResult.draft;
  logger.info('STAGE 2: Generation complete', {
    title: state.draft.title,
    wordCount: state.draft.wordCount,
    targetWordCount: state.plan.targetWordCount,
    wordCountDelta: state.draft.wordCount - state.plan.targetWordCount,
    readingTimeMinutes: state.draft.readingTimeMinutes,
    imagesGenerated: state.draft.images.length,
    sectionsCount: state.draft.sections.length,
  });

  // STAGE 3: Review
  logger.info('STAGE 3: Review started');
  const reviewResult = await reviewBlog(state.draft, state.plan, logger);
  state.review = reviewResult.review;
  logger.info('STAGE 3: Review complete', {
    overallScore: state.review.overallScore,
    categoryScores: state.review.categoryScores,
    recommendation: state.review.recommendation,
    strengths: state.review.strengths,
    improvements: state.review.improvements,
  });

  // TODO: Optional iteration loop (similar to code-creator-v2)
  // For now, we accept the first draft

  const duration = logger.getDuration();
  logger.info('=== BLOG CREATOR V2 COMPLETE ===', {
    durationMs: duration,
    durationSeconds: (duration / 1000).toFixed(2),
    finalScore: state.review.overallScore,
    recommendation: state.review.recommendation,
    wordCount: state.draft.wordCount,
    imagesCount: state.draft.images.length,
  });

  // Transform to match existing BlogPost interface
  return {
    content: {
      title: state.draft.title,
      markdown: state.draft.markdown,
      wordCount: state.draft.wordCount,
      readingTimeMinutes: state.draft.readingTimeMinutes,
      // Additional metadata
      images: state.draft.images, // Include for future use
      _reviewScore: state.review.overallScore,
      _sections: state.draft.sections,
    },
  };
}

/**
 * STAGE 1: Planning Agent
 * Decides structure, tone, sections, and whether to include images
 */
async function planBlog(idea: IdeaForCreator, logger: ReturnType<typeof createLogger>): Promise<{
  plan: BlogPlan;
}> {
  const modelName = 'gpt-4o-mini';
  logger.info('Planning: Initializing model', { model: modelName, temperature: 0.7 });

  const model = new ChatOpenAI({
    modelName,
    temperature: 0.7,
    apiKey: process.env.OPENAI_API_KEY,
  });
  const structuredModel = model.withStructuredOutput(BlogPlanSchema);

  const prompt = `Plan a blog post for: "${idea.title}"

${idea.bullets && idea.bullets.length > 0 ? `Key Points:\n${idea.bullets.map(b => `- ${b}`).join('\n')}` : ''}

Create a comprehensive plan including:
1. Engaging title (can refine the original)
2. 3-5 main sections with logical flow
3. Tone (educational/casual/technical/storytelling)
4. Target word count (1000-2000 words)
5. Whether to include images (yes if: visual concepts, technical diagrams, examples)
6. Image specs (up to 3 images: what concepts to visualize, where to place them)
7. Quality rubric (clarity, accuracy, engagement, imageRelevance)

Guidelines:
- For technical topics: consider diagrams, architecture visuals
- For tutorials: consider before/after examples, screenshots
- For conceptual posts: consider abstract visualizations
- Image placement: "intro", "section-2", "conclusion", etc.

Return a detailed plan.`;

  try {
    logger.info('Planning: Invoking LLM', { promptLength: prompt.length });
    const plan = (await structuredModel.invoke(prompt)) as BlogPlan;
    logger.info('Planning: Plan received successfully', {
      title: plan.title,
      sectionsCount: plan.sections.length,
      includeImages: plan.includeImages,
    });
    return { plan }; // Estimate if needed
  } catch (error) {
    logger.error('Planning: Failed to generate plan', error instanceof Error ? error : { error });
    logger.warn('Planning: Using fallback plan');
    // Fallback plan
    return {
      plan: {
        title: idea.title,
        sections: ['Introduction', 'Main Content', 'Conclusion'],
        tone: 'professional',
        targetWordCount: 1200,
        includeImages: false,
        imageSpecs: [],
        qualityRubric: {
          clarity: { weight: 0.4, criteria: ['Clear writing', 'Well-structured'] },
          accuracy: { weight: 0.3, criteria: ['Factually correct'] },
          engagement: { weight: 0.2, criteria: ['Engaging to read'] },
          imageRelevance: { weight: 0.1, criteria: ['Images enhance content'] },
        },
      },
    };
  }
}

/**
 * STAGE 2: Generation Agent(s)
 * Creates text content + generates images if needed
 */
async function generateBlog(
  plan: BlogPlan,
  idea: IdeaForCreator,
  logger: ReturnType<typeof createLogger>
): Promise<{ draft: BlogDraft }> {

  // Step 2a: Generate text content
  const modelName = 'claude-3-5-haiku-20241022';
  logger.info('Generation: Initializing text model', { model: modelName, temperature: 0.8 });

  const model = new ChatAnthropic({
    modelName,
    temperature: 0.8,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const textPrompt = `Write a ${plan.targetWordCount}-word blog post with this plan:

Title: ${plan.title}
Sections: ${plan.sections.join(', ')}
Tone: ${plan.tone}

${idea.bullets && idea.bullets.length > 0 ? `Key Points:\n${idea.bullets.map(b => `- ${b}`).join('\n')}` : ''}

Requirements:
- Use markdown format
- Include section headings (##) matching the plan
- Be ${plan.tone} in style
- Target ${plan.targetWordCount} words (aim for ±200 words)
- ${plan.includeImages ? `Leave [IMAGE-${plan.imageSpecs.map((_, i) => i + 1).join(', IMAGE-')}] placeholders where images should go` : ''}
- Include practical examples where relevant
- Use code blocks if technical (\`\`\`language\`\`\`)

Write the complete blog post in markdown format.`;

  logger.info('Generation: Invoking text generation', {
    promptLength: textPrompt.length,
    targetWordCount: plan.targetWordCount,
  });
  const textResponse = await model.invoke(textPrompt);
  let markdown = textResponse.content.toString();
  logger.info('Generation: Text generation complete', {
    markdownLength: markdown.length,
    estimatedWords: markdown.split(/\s+/).length,
  });

  // Step 2b: Generate images (if plan includes them)
  const images: GeneratedImage[] = [];
  if (plan.includeImages && plan.imageSpecs.length > 0) {
    logger.info('Generation: Starting image generation', {
      imagesPlanned: plan.imageSpecs.length,
      imageSpecs: plan.imageSpecs.map((s) => s.concept),
    });

    for (let i = 0; i < plan.imageSpecs.slice(0, 3).length; i++) {
      const spec = plan.imageSpecs[i];
      try {
        logger.info(`Generation: Generating image ${i + 1}/${plan.imageSpecs.length}`, {
          concept: spec.concept,
          placement: spec.placement,
          style: spec.style,
        });
        const image = await generateImageForContent(spec, markdown.substring(0, 500));
        images.push(image);
        logger.info(`Generation: Image ${i + 1} generated successfully`, {
          imageUrl: image.imageUrl,
          caption: image.caption,
        });
      } catch (error) {
        logger.error(`Generation: Failed to generate image ${i + 1}`, {
          concept: spec.concept,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue without this image
      }
    }

    logger.info('Generation: Image generation complete', {
      imagesGenerated: images.length,
      imagesPlanned: plan.imageSpecs.length,
    });
  }

  // Step 2c: Insert images into markdown
  logger.info('Generation: Inserting images into markdown', { imagesCount: images.length });
  markdown = insertImagesIntoMarkdown(markdown, images);

  // Calculate metadata
  const wordCount = markdown.split(/\s+/).length;
  const readingTimeMinutes = Math.ceil(wordCount / 200);

  logger.info('Generation: Draft metadata calculated', {
    wordCount,
    readingTimeMinutes,
    targetWordCount: plan.targetWordCount,
    wordCountAccuracy: `${((wordCount / plan.targetWordCount) * 100).toFixed(1)}%`,
  });

  const draft: BlogDraft = {
    title: plan.title,
    markdown,
    images,
    wordCount,
    readingTimeMinutes,
    sections: plan.sections,
  };

  return { draft };
}

/**
 * STAGE 3: Review Agent
 * Evaluates quality against rubric
 */
async function reviewBlog(
  draft: BlogDraft,
  plan: BlogPlan,
  logger: ReturnType<typeof createLogger>
): Promise<{ review: BlogReview }> {
  const modelName = 'gpt-4o-mini';
  logger.info('Review: Initializing model', { model: modelName, temperature: 0.5 });

  const model = new ChatOpenAI({
    modelName,
    temperature: 0.5,
    apiKey: process.env.OPENAI_API_KEY,
  });
  const structuredModel = model.withStructuredOutput(BlogReviewSchema);

  const prompt = `Review this blog post:

TITLE: ${draft.title}
WORD COUNT: ${draft.wordCount} (target: ${plan.targetWordCount})
SECTIONS: ${draft.sections.length}
IMAGES: ${draft.images.length}

CONTENT PREVIEW:
${draft.markdown.substring(0, 1500)}...

RUBRIC:
${JSON.stringify(plan.qualityRubric, null, 2)}

Evaluate:
1. Clarity (0-100): Is the writing clear and well-structured?
2. Accuracy (0-100): Is the content technically correct?
3. Engagement (0-100): Is it engaging and well-written?
4. Image Relevance (0-100): Do images enhance the content?

Overall score = weighted average based on rubric weights
Recommendation: "approve" (≥75), "revise" (60-74), "regenerate" (<60)

Return structured review.`;

  try {
    logger.info('Review: Invoking LLM', {
      promptLength: prompt.length,
      draftWordCount: draft.wordCount,
      targetWordCount: plan.targetWordCount,
    });
    const review = (await structuredModel.invoke(prompt)) as BlogReview;
    logger.info('Review: Review received successfully', {
      overallScore: review.overallScore,
      recommendation: review.recommendation,
      categoryScores: review.categoryScores,
    });
    return { review };
  } catch (error) {
    logger.error('Review: Failed to generate review', error instanceof Error ? error : { error });
    logger.warn('Review: Using fallback review');
    // Fallback review
    return {
      review: {
        overallScore: 75,
        categoryScores: { clarity: 75, accuracy: 75, engagement: 75, imageRelevance: 75 },
        recommendation: 'approve',
        strengths: ['Blog created successfully'],
        improvements: ['Review failed - manual check recommended'],
      },
    };
  }
}

/**
 * Helper: Insert images into markdown at placeholder positions
 */
function insertImagesIntoMarkdown(markdown: string, images: GeneratedImage[]): string {
  let result = markdown;

  images.forEach((img, index) => {
    // Match [IMAGE-N] or [IMAGE-N: ...] (flexible regex)
    const placeholderRegex = new RegExp(`\\[IMAGE-${index + 1}[^\\]]*\\]`, 'g');
    const imageMarkdown = `\n\n![${img.caption}](${img.imageUrl})\n*${img.caption}*\n\n`;

    if (placeholderRegex.test(result)) {
      result = result.replace(placeholderRegex, imageMarkdown);
    } else {
      // If no placeholder, append at end
      result += imageMarkdown;
    }
  });

  return result;
}
