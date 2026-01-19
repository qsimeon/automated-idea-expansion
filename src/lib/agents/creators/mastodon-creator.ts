import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { MastodonThread } from '../types';

/**
 * MASTODON CREATOR
 *
 * Purpose: Generate an engaging social media thread
 *
 * Output: 5-10 posts, each max 500 characters:
 * - Opening hook
 * - Key insights/steps
 * - Call to action or conclusion
 *
 * Note: Mastodon has 500 char limit (vs Twitter's 280)
 */
export async function createMastodonThread(idea: any): Promise<{
  content: MastodonThread;
  tokensUsed: number;
}> {
  const prompt = buildThreadPrompt(idea);

  // Try OpenAI first
  try {
    return await generateWithOpenAI(prompt);
  } catch (openaiError) {
    console.warn('OpenAI failed for thread creation, falling back to Anthropic:', openaiError);

    // Fallback to Anthropic
    try {
      return await generateWithAnthropic(prompt);
    } catch (anthropicError) {
      throw new Error(
        `Thread creation failed. OpenAI: ${openaiError}. Anthropic: ${anthropicError}`
      );
    }
  }
}

/**
 * Build the thread generation prompt
 */
function buildThreadPrompt(idea: any): string {
  return `You are a social media expert. Create an engaging Mastodon thread based on this idea.

Idea Details:
Title: ${idea.title}
Description: ${idea.description || 'No description'}
Key Points: ${JSON.stringify(idea.bullets) || 'None'}
Reference Links: ${JSON.stringify(idea.external_links) || 'None'}

Requirements:
- Create 5-10 posts
- Each post MAX 500 characters (strict limit!)
- First post: Hook + "🧵 Thread" indicator
- Middle posts: Key insights, tips, or explanations
- Last post: Strong conclusion or call to action
- Use emojis strategically (not every post)
- Line breaks for readability
- Conversational, engaging tone
- Make each post standalone (can be read independently)

Thread structure guidelines:
1. Hook (grab attention) + thread indicator
2-N. Value (insights, tips, examples)
N+1. Conclusion (takeaway or CTA)

Respond with ONLY valid JSON in this exact format:
{
  "posts": [
    {"order": 1, "text": "First post with hook 🧵"},
    {"order": 2, "text": "Second post with insight"},
    ...
  ]
}

CRITICAL: Every post.text MUST be ≤500 characters!`;
}

/**
 * Generate thread with OpenAI
 */
async function generateWithOpenAI(prompt: string): Promise<{
  content: MastodonThread;
  tokensUsed: number;
}> {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.9, // High creativity for social media
    maxTokens: 2000,
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await model.invoke(prompt);
  const content = response.content.toString();

  return {
    content: parseThread(content),
    tokensUsed: response.usage_metadata?.total_tokens || 0,
  };
}

/**
 * Generate thread with Anthropic
 */
async function generateWithAnthropic(prompt: string): Promise<{
  content: MastodonThread;
  tokensUsed: number;
}> {
  const model = new ChatAnthropic({
    modelName: 'claude-3-5-haiku-20241022',
    temperature: 0.9,
    maxTokens: 2000,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await model.invoke(prompt);
  const content = response.content.toString();

  return {
    content: parseThread(content),
    tokensUsed: response.usage_metadata?.total_tokens || 0,
  };
}

/**
 * Parse the JSON response into a MastodonThread
 */
function parseThread(content: string): MastodonThread {
  // Extract JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in thread response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!Array.isArray(parsed.posts) || parsed.posts.length === 0) {
    throw new Error('Invalid posts array in response');
  }

  // Validate and truncate if needed
  const posts = parsed.posts.map((post: any, index: number) => {
    let text = post.text || '';

    // Truncate if too long (should not happen but safety check)
    if (text.length > 500) {
      console.warn(`Post ${index + 1} too long (${text.length} chars), truncating`);
      text = text.substring(0, 497) + '...';
    }

    return {
      order: post.order || index + 1,
      text,
    };
  });

  return {
    posts,
    totalPosts: posts.length,
  };
}
