import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { BlogPost } from '../types';

/**
 * BLOG CREATOR
 *
 * Purpose: Generate a comprehensive blog post from an idea
 *
 * Output: 1000-2000 word markdown article with:
 * - Engaging introduction
 * - 3-5 main sections with headers
 * - Code examples if relevant
 * - Practical takeaways
 * - Conclusion
 */
export async function createBlogPost(idea: any): Promise<{
  content: BlogPost;
  tokensUsed: number;
}> {
  const prompt = buildBlogPrompt(idea);

  // Try OpenAI first
  try {
    return await generateWithOpenAI(prompt);
  } catch (openaiError) {
    console.warn('OpenAI failed for blog creation, falling back to Anthropic:', openaiError);

    // Fallback to Anthropic (Claude is excellent at writing!)
    try {
      return await generateWithAnthropic(prompt);
    } catch (anthropicError) {
      throw new Error(
        `Blog creation failed. OpenAI: ${openaiError}. Anthropic: ${anthropicError}`
      );
    }
  }
}

/**
 * Build the blog generation prompt
 */
function buildBlogPrompt(idea: any): string {
  return `You are an expert technical writer. Write a comprehensive, engaging blog post based on this idea.

Idea Details:
Title: ${idea.title}
Description: ${idea.description || 'No description'}
Key Points: ${JSON.stringify(idea.bullets) || 'None'}
Reference Links: ${JSON.stringify(idea.external_links) || 'None'}

Requirements:
- Write in **markdown** format
- Length: 1000-2000 words
- Structure:
  * Engaging introduction (hook the reader!)
  * 3-5 main sections with ## headers
  * Use ### for subsections if needed
  * Include code blocks if relevant (\`\`\`language\`\`\`)
  * Bullet points for lists
  * Bold for emphasis
- Tone: Professional but conversational, accessible to technical audience
- Include practical examples and takeaways
- End with a strong conclusion

Style guidelines:
- Use "you" to address the reader
- Start with a hook (interesting fact, question, or statement)
- Explain complex concepts simply
- Add code examples where relevant
- Break up long paragraphs
- Use analogies to clarify difficult ideas

Respond with ONLY the markdown content (no JSON wrapper, no code fences around it).`;
}

/**
 * Generate blog post with OpenAI
 */
async function generateWithOpenAI(prompt: string): Promise<{
  content: BlogPost;
  tokensUsed: number;
}> {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.8, // Higher creativity for writing
    maxTokens: 4000, // Allow longer outputs
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await model.invoke(prompt);
  const markdown = response.content.toString();

  return {
    content: parseBlogPost(markdown),
    tokensUsed: response.usage_metadata?.total_tokens || 0,
  };
}

/**
 * Generate blog post with Anthropic
 */
async function generateWithAnthropic(prompt: string): Promise<{
  content: BlogPost;
  tokensUsed: number;
}> {
  const model = new ChatAnthropic({
    modelName: 'claude-3-5-haiku-20241022',
    temperature: 0.8,
    maxTokens: 4000,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await model.invoke(prompt);
  const markdown = response.content.toString();

  return {
    content: parseBlogPost(markdown),
    tokensUsed: response.usage_metadata?.total_tokens || 0,
  };
}

/**
 * Parse the generated markdown into a BlogPost structure
 */
function parseBlogPost(markdown: string): BlogPost {
  // Extract title (first # header)
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : 'Untitled';

  // Remove title from markdown (we'll store it separately)
  const contentWithoutTitle = markdown.replace(/^#\s+.+$/m, '').trim();

  // Calculate word count
  const wordCount = contentWithoutTitle.split(/\s+/).length;

  // Calculate reading time (average 200 words per minute)
  const readingTimeMinutes = Math.ceil(wordCount / 200);

  return {
    title,
    markdown: contentWithoutTitle,
    wordCount,
    readingTimeMinutes,
  };
}
