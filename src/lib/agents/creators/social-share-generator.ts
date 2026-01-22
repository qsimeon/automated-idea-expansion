import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { generateImageForContent } from './image-creator';
import type { GeneratedImage } from '../types';

/**
 * SOCIAL SHARE GENERATOR
 *
 * Purpose: Generate social media posts for blog content
 *
 * Features:
 * - Creates engaging tweet text (max 280 chars)
 * - Extracts 2-3 relevant hashtags
 * - Optionally generates a social media image
 * - Optimized for Twitter/X, but works for other platforms
 *
 * Model: GPT-4o-mini (fast, cheap, good at concise writing)
 */

// Zod schema for structured output
const SocialMediaPostSchema = z.object({
  content: z.string().max(280).describe('Tweet text (max 280 chars for Twitter)'),
  hashtags: z.array(z.string()).min(2).max(3).describe('2-3 relevant hashtags (without # prefix)'),
  platform: z.enum(['twitter', 'mastodon', 'linkedin']).describe('Target platform'),
  includeImage: z.boolean().describe('Whether to generate an image for this post'),
  imagePrompt: z.string().default('').describe('Prompt for image generation (empty string if includeImage=false)'),
});

type SocialMediaPost = z.infer<typeof SocialMediaPostSchema>;

export interface GeneratedSocialPost {
  content: string;
  hashtags: string[];
  platform: string;
  imageUrl?: string;
  imageCaption?: string;
}

/**
 * Generate a social media post for a blog
 */
export async function generateSocialShare(
  blogContent: { title: string; markdown: string; wordCount: number },
  idea: { title: string; description: string | null }
): Promise<GeneratedSocialPost> {

  // Step 1: Generate social post structure with LLM
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini-2024-07-18',
    temperature: 0.8, // Higher temp for creative hook writing
    apiKey: process.env.OPENAI_API_KEY,
  });

  const structuredModel = model.withStructuredOutput(SocialMediaPostSchema);

  // Get excerpt from blog (first 200 chars of markdown, clean it up)
  const excerpt = blogContent.markdown
    .substring(0, 300)
    .replace(/[#*`]/g, '') // Remove markdown formatting
    .replace(/\n+/g, ' ') // Replace newlines with spaces
    .trim()
    .substring(0, 200);

  const prompt = `Create an engaging social media post for this blog:

BLOG TITLE: ${blogContent.title}
WORD COUNT: ${blogContent.wordCount} words
EXCERPT: ${excerpt}...

ORIGINAL IDEA:
${idea.title}
${idea.description ? idea.description : ''}

REQUIREMENTS:
1. Write a compelling hook (max 280 characters for Twitter)
2. Make it engaging - create curiosity, ask a question, or state a surprising fact
3. Extract 2-3 relevant hashtags (without # prefix)
4. Choose platform: twitter (default)
5. Decide if an image would help (visualizations, diagrams, or eye-catching graphics)
6. If includeImage=true, provide a detailed image prompt

STYLE:
- Conversational and engaging
- Front-load the value proposition
- Use emojis sparingly (1-2 max)
- Don't just summarize - create interest

Example good hooks:
- "Ever wondered why X happens? Here's the surprising answer 🧵"
- "3 things I learned about X that changed how I think about Y"
- "Most people get X wrong. Here's what actually happens:"

Generate the social post structure.`;

  const socialPost = await structuredModel.invoke(prompt) as SocialMediaPost;

  // Step 2: Generate image if requested
  let imageUrl: string | undefined;
  let imageCaption: string | undefined;

  if (socialPost.includeImage && socialPost.imagePrompt) {
    try {
      const imageSpec = {
        placement: 'social',
        concept: socialPost.imagePrompt,
        style: 'modern, clean, eye-catching',
      };

      const generatedImage = await generateImageForContent(imageSpec, excerpt);
      imageUrl = generatedImage.imageUrl;
      imageCaption = generatedImage.caption;
    } catch (error) {
      // If image generation fails, continue without image
      console.error('Failed to generate social image:', error);
    }
  }

  // Step 3: Return structured post
  return {
    content: socialPost.content,
    hashtags: socialPost.hashtags,
    platform: socialPost.platform,
    imageUrl,
    imageCaption,
  };
}
