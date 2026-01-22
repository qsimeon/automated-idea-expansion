import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { generateImageForContent } from './image-creator';
import type { ThreadPlan, ThreadDraft, ThreadReview, ThreadCreationState } from '../types';
import { z } from 'zod';
import { createLogger } from '@/lib/logging/logger';
import { IdeaCreatorSchema, type IdeaForCreator } from '@/lib/db/schemas';

/**
 * MASTODON/THREAD CREATOR V2
 *
 * Multi-stage pipeline:
 * 1. Planning → Decides hook, length, hero image needs
 * 2. Generation → Text posts + optional hero image
 * 3. Review → Hook strength, flow, char count validation
 *
 * Philosophy: "Schemas all the way down" - no manual JSON parsing
 */

// ===== ZOD SCHEMAS FOR STRUCTURED OUTPUTS =====

const ThreadPlanSchema = z.object({
  hook: z.string(),
  threadLength: z.number().min(3).max(10),
  includeHeroImage: z.boolean(),
  imageSpec: z.object({
    placement: z.string(),
    concept: z.string(),
    style: z.string().default('photorealistic'),
    aspectRatio: z.enum(['16:9', '1:1', '4:3']).default('16:9'),
  }).nullable(), // Use nullable instead of optional for OpenAI compatibility
  keyPoints: z.array(z.string()),
  tone: z.string(),
  qualityRubric: z.object({
    hookStrength: z.object({
      weight: z.number(),
      criteria: z.array(z.string()),
    }),
    flow: z.object({
      weight: z.number(),
      criteria: z.array(z.string()),
    }),
    engagement: z.object({
      weight: z.number(),
      criteria: z.array(z.string()),
    }),
    charCountCompliance: z.object({
      weight: z.number(),
      criteria: z.array(z.string()),
    }),
  }),
});

const ThreadDraftSchema = z.object({
  posts: z.array(z.object({
    order: z.number(),
    text: z.string().max(500),
  })),
});

const ThreadReviewSchema = z.object({
  overallScore: z.number(),
  categoryScores: z.object({
    hookStrength: z.number(),
    flow: z.number(),
    engagement: z.number(),
    charCountCompliance: z.number(),
  }),
  recommendation: z.enum(['approve', 'revise', 'regenerate']),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});

// ===== MAIN CREATOR FUNCTION =====

export async function createMastodonThreadV2(
  ideaData: unknown
): Promise<{ content: any }> {
  // Validate idea with schema - "schemas all the way down"
  const idea = IdeaCreatorSchema.parse(ideaData);

  const logger = createLogger({
    ideaId: idea.id,
    stage: 'mastodon-creator',
  });

  logger.info('=== MASTODON THREAD CREATOR V2 STARTED ===', {
    ideaTitle: idea.title,
    bulletsCount: idea.bullets?.length || 0,
  });

  const state: ThreadCreationState = {
    idea,
    plan: null,
    draft: null,
    review: null,
    attempts: 0,
    maxAttempts: 3,
    errors: [],
  };

  try {
    // STAGE 1: Planning
    logger.info('STAGE 1: Planning started');
    const planResult = await planThread(idea, logger);
    state.plan = planResult.plan;
    logger.info('STAGE 1: Planning complete', {
      hook: state.plan.hook.substring(0, 100),
      threadLength: state.plan.threadLength,
      includeHeroImage: state.plan.includeHeroImage,
      keyPoints: state.plan.keyPoints,
      tone: state.plan.tone,
    });

    // STAGE 2: Generation
    logger.info('STAGE 2: Generation started', {
      threadLength: state.plan.threadLength,
      includeHeroImage: state.plan.includeHeroImage,
    });
    const draftResult = await generateThread(state.plan, idea, logger);
    state.draft = draftResult.draft;
    logger.info('STAGE 2: Generation complete', {
      postsGenerated: state.draft.posts.length,
      plannedPosts: state.plan.threadLength,
      heroImageGenerated: !!state.draft.heroImage,
      characterCounts: state.draft.posts.map((p, i) => ({ post: i + 1, chars: p.characterCount })),
      allPostsValid: state.draft.posts.every(p => p.characterCount <= 500),
    });

    // STAGE 3: Review
    logger.info('STAGE 3: Review started');
    const reviewResult = await reviewThread(state.draft, state.plan, logger);
    state.review = reviewResult.review;
    logger.info('STAGE 3: Review complete', {
      overallScore: state.review.overallScore,
      categoryScores: state.review.categoryScores,
      recommendation: state.review.recommendation,
      strengths: state.review.strengths,
      improvements: state.review.improvements,
    });

    const duration = logger.getDuration();

    logger.info('=== MASTODON THREAD CREATOR V2 COMPLETE ===', {
      durationMs: duration,
      durationSeconds: (duration / 1000).toFixed(2),
      finalScore: state.review.overallScore,
      recommendation: state.review.recommendation,
      totalPosts: state.draft.posts.length,
      hasHeroImage: !!state.draft.heroImage,
    });

    return {
      content: {
        posts: state.draft.posts,
        totalPosts: state.draft.totalPosts,
        heroImage: state.draft.heroImage,
        _reviewScore: state.review.overallScore,
        _plan: state.plan,
        _review: state.review,
      },
    };
  } catch (error) {
    logger.error('Thread creation failed', error instanceof Error ? error : { error });
    state.errors.push(error instanceof Error ? error.message : 'Unknown error');

    // Return partial result with error
    return {
      content: {
        posts: state.draft?.posts || [],
        totalPosts: state.draft?.totalPosts || 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

// ===== STAGE 1: PLANNING AGENT =====

async function planThread(idea: IdeaForCreator, logger: ReturnType<typeof createLogger>): Promise<{ plan: ThreadPlan }> {
  const modelName = 'gpt-4o-mini';
  logger.info('Planning: Initializing model', { model: modelName, temperature: 0.7 });

  const model = new ChatOpenAI({
    modelName,
    temperature: 0.7,
    apiKey: process.env.OPENAI_API_KEY,
  });
  const structuredModel = model.withStructuredOutput(ThreadPlanSchema);

  const prompt = `Plan a Mastodon thread for: "${idea.title}"

${idea.bullets && idea.bullets.length > 0 ? `Key Points:\n${idea.bullets.map(b => `- ${b}`).join('\n')}` : ''}

Create a comprehensive plan:

1. **Hook** (opening post - most important!)
   - Must grab attention immediately
   - Set the tone for the thread
   - Make people want to read more

2. **Thread Length** (3-10 posts)
   - Each post ≤500 characters
   - Consider complexity of topic
   - More posts = deeper coverage

3. **Hero Image** (optional, for first post)
   - Include if topic is visual or needs illustration
   - Specify concept and style
   - Will be generated automatically

4. **Key Points** (one per post)
   - What are the main takeaways?
   - Order them logically
   - Build narrative flow

5. **Tone** (match the idea)
   - informative, entertaining, conversational, provocative, etc.
   - Consider audience expectations

6. **Quality Rubric**
   - hookStrength (40%): First post quality
   - flow (25%): Logical progression between posts
   - engagement (25%): Interesting and valuable content
   - charCountCompliance (10%): All posts ≤500 chars

Return a detailed plan.`;

  try {
    logger.info('Planning: Invoking LLM', { promptLength: prompt.length });
    const plan = await structuredModel.invoke(prompt);
    logger.info('Planning: Plan received successfully', {
      hook: (plan as ThreadPlan).hook.substring(0, 100),
      threadLength: (plan as ThreadPlan).threadLength,
      includeHeroImage: (plan as ThreadPlan).includeHeroImage,
    });

    return {
      plan: plan as ThreadPlan,
       // Estimate if needed
    };
  } catch (error) {
    logger.error('Planning: Failed to generate plan', error instanceof Error ? error : { error });
    logger.warn('Planning: Using fallback plan');
    // Fallback plan
    return {
      plan: {
        hook: `Interesting thoughts on ${idea.title}`,
        threadLength: 5,
        includeHeroImage: false,
        keyPoints: idea.bullets || ['Introduction', 'Main point', 'Key insight', 'Application', 'Conclusion'],
        tone: 'informative',
        qualityRubric: {
          hookStrength: { weight: 0.4, criteria: ['Grabs attention', 'Sets clear expectations'] },
          flow: { weight: 0.25, criteria: ['Logical progression', 'Smooth transitions'] },
          engagement: { weight: 0.25, criteria: ['Valuable insights', 'Clear explanations'] },
          charCountCompliance: { weight: 0.1, criteria: ['All posts ≤500 chars'] },
        },
      },
      
    };
  }
}

// ===== STAGE 2: GENERATION AGENT =====

async function generateThread(
  plan: ThreadPlan,
  idea: IdeaForCreator,
  logger: ReturnType<typeof createLogger>
): Promise<{ draft: ThreadDraft }> {

  // Step 2a: Generate thread posts
  const modelName = 'claude-3-5-haiku-20241022';
  logger.info('Generation: Initializing text model', { model: modelName, temperature: 0.8 });

  const model = new ChatAnthropic({
    modelName,
    temperature: 0.8,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  const structuredModel = model.withStructuredOutput(ThreadDraftSchema);

  const textPrompt = `Write a ${plan.threadLength}-post Mastodon thread:

Hook: ${plan.hook}
Key Points: ${plan.keyPoints.join(', ')}
Tone: ${plan.tone}

Requirements:
- Each post MUST be ≤500 characters (STRICT limit)
- First post uses the hook and includes 🧵 emoji
- Each subsequent post covers one key point
- Posts flow logically with clear connections
- Tone should be ${plan.tone}
- Use line breaks for readability
- Add relevant emojis sparingly (1-2 per post max)

Important format rules:
- Post 1: Hook + 🧵 (under 500 chars)
- Posts 2-N: One key point each (under 500 chars)
- Final post: Conclusion or CTA (under 500 chars)

Return complete thread with exactly ${plan.threadLength} posts.`;

  try {
    logger.info('Generation: Invoking text generation', {
      promptLength: textPrompt.length,
      threadLength: plan.threadLength,
    });
    const draftData = await structuredModel.invoke(textPrompt);
    logger.info('Generation: Text generation complete', {
      postsGenerated: (draftData as any).posts.length,
      plannedPosts: plan.threadLength,
    });

    // Step 2b: Generate hero image (optional)
    let heroImage;
    if (plan.includeHeroImage && plan.imageSpec) {
      logger.info('Generation: Starting hero image generation', {
        concept: plan.imageSpec.concept,
        style: plan.imageSpec.style,
        aspectRatio: plan.imageSpec.aspectRatio,
      });
      try {
        const firstPostText = (draftData as any).posts[0]?.text || '';
        heroImage = await generateImageForContent(plan.imageSpec, firstPostText);
        logger.info('Generation: Hero image generated successfully', {
          imageUrl: heroImage.imageUrl,
          caption: heroImage.caption,
        });
      } catch (imageError) {
        logger.error('Generation: Hero image generation failed', {
          concept: plan.imageSpec.concept,
          error: imageError instanceof Error ? imageError.message : String(imageError),
        });
        // Continue without image - not critical
      }
    }

    // Step 2c: Validate and format posts
    logger.info('Generation: Validating and formatting posts');
    const posts = (draftData as any).posts.map((p: any, i: number) => {
      let text = p.text || '';

      // Enforce 500 char limit (safety check)
      if (text.length > 500) {
        logger.warn(`Generation: Post ${i + 1} too long, truncating`, {
          originalLength: text.length,
          truncatedLength: 497,
        });
        text = text.substring(0, 497) + '...';
      }

      return {
        order: i + 1,
        text,
        characterCount: text.length,
      };
    });

    logger.info('Generation: Posts validated', {
      totalPosts: posts.length,
      allPostsValid: posts.every((p: any) => p.characterCount <= 500),
      characterCounts: posts.map((p: any) => p.characterCount),
    });

    const draft: ThreadDraft = {
      posts,
      heroImage,
      totalPosts: posts.length,
    };

    return {
      draft,
    };
  } catch (error) {
    logger.error('Generation: Thread generation failed', error instanceof Error ? error : { error });
    throw new Error(`Thread generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ===== STAGE 3: REVIEW AGENT =====

async function reviewThread(
  draft: ThreadDraft,
  plan: ThreadPlan,
  logger: ReturnType<typeof createLogger>
): Promise<{ review: ThreadReview }> {
  const modelName = 'gpt-4o-mini';
  logger.info('Review: Initializing model', { model: modelName, temperature: 0.5 });

  const model = new ChatOpenAI({
    modelName,
    temperature: 0.5,
    apiKey: process.env.OPENAI_API_KEY,
  });
  const structuredModel = model.withStructuredOutput(ThreadReviewSchema);

  const charCounts = draft.posts.map((p, i) => `Post ${i + 1}: ${p.characterCount} chars`).join(', ');
  const allPostsValid = draft.posts.every(p => p.characterCount <= 500);

  const prompt = `Review this Mastodon thread:

POSTS: ${draft.posts.length}
FIRST POST (Hook): "${draft.posts[0].text}"
LAST POST: "${draft.posts[draft.posts.length - 1].text}"
CHARACTER COUNTS: ${charCounts}
ALL VALID (≤500): ${allPostsValid ? 'YES ✅' : 'NO ❌'}

FULL THREAD:
${draft.posts.map((p, i) => `${i + 1}. ${p.text}`).join('\n\n')}

RUBRIC:
${JSON.stringify(plan.qualityRubric, null, 2)}

Evaluate:
1. Hook Strength (40%): Does the first post grab attention? Is it compelling?
2. Flow (25%): Do posts connect logically? Smooth transitions?
3. Engagement (25%): Is the content valuable? Clear? Interesting?
4. Char Count Compliance (10%): Are ALL posts ≤500 characters?

Score 0-100 for each dimension and provide overall recommendation.`;

  try {
    logger.info('Review: Invoking LLM', {
      promptLength: prompt.length,
      draftPosts: draft.posts.length,
      allPostsValid,
    });
    const review = await structuredModel.invoke(prompt);
    logger.info('Review: Review received successfully', {
      overallScore: (review as ThreadReview).overallScore,
      recommendation: (review as ThreadReview).recommendation,
      categoryScores: (review as ThreadReview).categoryScores,
    });

    return {
      review: review as ThreadReview,
      
    };
  } catch (error) {
    logger.error('Review: Failed to generate review', error instanceof Error ? error : { error });
    logger.warn('Review: Using fallback review');
    // Fallback review
    return {
      review: {
        overallScore: 70,
        categoryScores: {
          hookStrength: 70,
          flow: 70,
          engagement: 70,
          charCountCompliance: allPostsValid ? 100 : 50,
        },
        recommendation: 'approve',
        strengths: ['Thread completed successfully'],
        improvements: ['Could not generate detailed review'],
      },
      
    };
  }
}
