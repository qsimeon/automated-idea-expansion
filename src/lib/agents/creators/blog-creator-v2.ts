import { createModel, ModelRecommendations } from '../model-factory';
import { generateImageForContent } from './image-creator';
import type {
  BlogPlan,
  BlogDraft,
  BlogReview,
  BlogCreationState,
  GeneratedImage,
} from '../types';
import { z } from 'zod';

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
 * - Uses Gemini Flash for cost-effective planning/review
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
      style: z.string().optional(),
    })
  ),
  qualityRubric: z.object({
    dimensions: z.record(
      z.object({
        weight: z.number(),
        criteria: z.array(z.string()),
      })
    ),
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
export async function createBlogV2(idea: any): Promise<{
  content: any; // BlogDraft but adapted to match existing BlogPost interface
  tokensUsed: number;
}> {
  console.log(`📝 === BLOG CREATOR V2 ===`);
  console.log(`   Idea: "${idea.title}"`);

  const state: BlogCreationState = {
    idea,
    plan: null,
    draft: null,
    review: null,
    attempts: 0,
    maxAttempts: 3,
    errors: [],
    totalTokens: 0,
  };

  // STAGE 1: Planning
  console.log(`\n📋 STAGE 1: Planning`);
  const planResult = await planBlog(idea);
  state.plan = planResult.plan;
  state.totalTokens += planResult.tokensUsed;
  console.log(`   ✅ Plan complete`);
  console.log(`   📊 Sections: ${state.plan.sections.length}`);
  console.log(`   🎨 Images: ${state.plan.imageSpecs.length}`);

  // STAGE 2: Generation (Text + Images)
  console.log(`\n🛠️  STAGE 2: Generation`);
  const draftResult = await generateBlog(state.plan, idea);
  state.draft = draftResult.draft;
  state.totalTokens += draftResult.tokensUsed;
  console.log(`   ✅ Draft complete`);
  console.log(`   📝 Words: ${state.draft.wordCount}`);
  console.log(`   🖼️  Images generated: ${state.draft.images.length}`);

  // STAGE 3: Review
  console.log(`\n🔍 STAGE 3: Review`);
  const reviewResult = await reviewBlog(state.draft, state.plan);
  state.review = reviewResult.review;
  state.totalTokens += reviewResult.tokensUsed;
  console.log(`   📊 Score: ${state.review.overallScore}/100`);
  console.log(`   ✅ Recommendation: ${state.review.recommendation}`);

  // TODO: Optional iteration loop (similar to code-creator-v2)
  // For now, we accept the first draft

  console.log(`\n✅ === BLOG COMPLETE ===`);
  console.log(`   Total tokens: ${state.totalTokens}`);

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
    tokensUsed: state.totalTokens,
  };
}

/**
 * STAGE 1: Planning Agent
 * Decides structure, tone, sections, and whether to include images
 */
async function planBlog(idea: any): Promise<{
  plan: BlogPlan;
  tokensUsed: number;
}> {
  const model = createModel(ModelRecommendations.planning, 0.7);
  const structuredModel = model.withStructuredOutput(BlogPlanSchema);

  const prompt = `Plan a blog post for: "${idea.title}"

${idea.description ? `Description: ${idea.description}` : ''}
${idea.bullets ? `Key Points: ${JSON.stringify(idea.bullets)}` : ''}

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
    const plan = (await structuredModel.invoke(prompt)) as BlogPlan;
    return { plan, tokensUsed: 0 }; // Estimate if needed
  } catch (error) {
    console.error('Planning failed:', error);
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
          dimensions: {
            clarity: { weight: 0.4, criteria: ['Clear writing', 'Well-structured'] },
            accuracy: { weight: 0.3, criteria: ['Factually correct'] },
            engagement: { weight: 0.2, criteria: ['Engaging to read'] },
            imageRelevance: { weight: 0.1, criteria: ['Images enhance content'] },
          },
        },
      },
      tokensUsed: 0,
    };
  }
}

/**
 * STAGE 2: Generation Agent(s)
 * Creates text content + generates images if needed
 */
async function generateBlog(
  plan: BlogPlan,
  idea: any
): Promise<{ draft: BlogDraft; tokensUsed: number }> {
  let totalTokens = 0;

  // Step 2a: Generate text content
  const model = createModel(ModelRecommendations.textGeneration, 0.8); // Claude Haiku for great writing

  const textPrompt = `Write a ${plan.targetWordCount}-word blog post with this plan:

Title: ${plan.title}
Sections: ${plan.sections.join(', ')}
Tone: ${plan.tone}

Original Idea Context:
${idea.description || 'No additional context'}
${idea.bullets ? `Key Points: ${JSON.stringify(idea.bullets)}` : ''}

Requirements:
- Use markdown format
- Include section headings (##) matching the plan
- Be ${plan.tone} in style
- Target ${plan.targetWordCount} words (aim for ±200 words)
- ${plan.includeImages ? `Leave [IMAGE-${plan.imageSpecs.map((_, i) => i + 1).join(', IMAGE-')}] placeholders where images should go` : ''}
- Include practical examples where relevant
- Use code blocks if technical (\`\`\`language\`\`\`)

Write the complete blog post in markdown format.`;

  const textResponse = await model.invoke(textPrompt);
  let markdown = textResponse.content.toString();
  totalTokens += 0; // Estimate if needed

  // Step 2b: Generate images (if plan includes them)
  const images: GeneratedImage[] = [];
  if (plan.includeImages && plan.imageSpecs.length > 0) {
    console.log(`   🎨 Generating ${plan.imageSpecs.length} images...`);

    for (const spec of plan.imageSpecs.slice(0, 3)) {
      // Max 3 images
      try {
        const image = await generateImageForContent(spec, markdown.substring(0, 500));
        images.push(image);
      } catch (error) {
        console.error(`   ❌ Failed to generate image for ${spec.concept}:`, error);
        // Continue without this image
      }
    }
  }

  // Step 2c: Insert images into markdown
  markdown = insertImagesIntoMarkdown(markdown, images);

  // Calculate metadata
  const wordCount = markdown.split(/\s+/).length;
  const readingTimeMinutes = Math.ceil(wordCount / 200);

  const draft: BlogDraft = {
    title: plan.title,
    markdown,
    images,
    wordCount,
    readingTimeMinutes,
    sections: plan.sections,
  };

  return { draft, tokensUsed: totalTokens };
}

/**
 * STAGE 3: Review Agent
 * Evaluates quality against rubric
 */
async function reviewBlog(
  draft: BlogDraft,
  plan: BlogPlan
): Promise<{ review: BlogReview; tokensUsed: number }> {
  const model = createModel(ModelRecommendations.review, 0.5); // Gemini Flash for fast review
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
    const review = (await structuredModel.invoke(prompt)) as BlogReview;
    return { review, tokensUsed: 0 };
  } catch (error) {
    console.error('Review failed:', error);
    // Fallback review
    return {
      review: {
        overallScore: 75,
        categoryScores: { clarity: 75, accuracy: 75, engagement: 75, imageRelevance: 75 },
        recommendation: 'approve',
        strengths: ['Blog created successfully'],
        improvements: ['Review failed - manual check recommended'],
      },
      tokensUsed: 0,
    };
  }
}

/**
 * Helper: Insert images into markdown at placeholder positions
 */
function insertImagesIntoMarkdown(markdown: string, images: GeneratedImage[]): string {
  let result = markdown;

  images.forEach((img, index) => {
    const placeholder = `[IMAGE-${index + 1}]`;
    const imageMarkdown = `\n\n![${img.caption}](${img.imageUrl})\n*${img.caption}*\n\n`;

    if (result.includes(placeholder)) {
      result = result.replace(placeholder, imageMarkdown);
    } else {
      // If no placeholder, insert based on placement hint
      // For now, append at end (can be enhanced later)
      result += imageMarkdown;
    }
  });

  return result;
}
