import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { AgentStateType } from './types';

/**
 * ROUTER AGENT
 *
 * Purpose: Decide the best output format for the selected idea
 *
 * How it works:
 * 1. Receives the selected idea from Judge Agent
 * 2. Analyzes the idea's content and characteristics
 * 3. Decides which format would work best:
 *    - Blog: Deep explanations, tutorials, analyses
 *    - Mastodon: Quick insights, hot takes, announcements
 *    - Code: Technical demos, implementations, tools
 *    - Image: Visual concepts, artistic ideas, descriptive scenes
 * 4. Returns format choice with reasoning
 *
 * Models used: GPT-4o-mini (primary) or Claude Haiku (fallback)
 */
export async function routerAgent(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { selectedIdea } = state;

  // No idea selected
  if (!selectedIdea) {
    return {
      chosenFormat: null,
      formatReasoning: 'No idea was selected by Judge',
      errors: ['Cannot route: no idea selected'],
    };
  }

  try {
    return await routeWithLLM(selectedIdea);
  } catch (error) {
    console.error('Router agent failed:', error);
    return {
      chosenFormat: null,
      formatReasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      errors: [`Router agent failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Use LLM to decide the best format
 */
async function routeWithLLM(idea: any): Promise<Partial<AgentStateType>> {
  const prompt = buildRoutingPrompt(idea);

  // Try OpenAI first
  try {
    const result = await callOpenAI(prompt);
    return parseRouterResponse(result);
  } catch (openaiError) {
    console.warn('OpenAI failed, falling back to Anthropic:', openaiError);

    // Fallback to Anthropic
    try {
      const result = await callAnthropic(prompt);
      return parseRouterResponse(result);
    } catch (anthropicError) {
      throw new Error(
        `Both LLMs failed. OpenAI: ${openaiError}. Anthropic: ${anthropicError}`
      );
    }
  }
}

/**
 * Build the routing prompt
 */
function buildRoutingPrompt(idea: any): string {
  return `You are a content format strategist. Your job is to determine the BEST format to expand this idea into content.

Available formats:

1. **blog_post** - Long-form article (1000-2000 words)
   Best for: Deep explanations, tutorials, guides, analyses, thought pieces
   Examples: "How X works", "Guide to Y", "Understanding Z"

2. **twitter_thread** - Social media thread (5-10 posts, 500 chars each)
   Best for: Quick insights, hot takes, step-by-step tips, announcements, concise ideas
   Examples: "5 tips for X", "Thread on Y", "Quick thoughts on Z"

3. **github_repo** - Interactive code project (Node.js app or notebook)
   Best for: Technical demonstrations, tools, implementations, algorithms
   Examples: "Build X", "Implement Y algorithm", "Tool for Z"

4. **image** - AI-generated image
   Best for: Visual concepts, artistic ideas, descriptive scenes, metaphors
   Examples: "Visualize X", "Artistic representation of Y", "Imagining Z"

Analyze this idea:

Title: ${idea.title}
Description: ${idea.description || 'No description'}
Bullets: ${JSON.stringify(idea.bullets) || 'None'}
External Links: ${JSON.stringify(idea.external_links) || 'None'}

Respond with ONLY valid JSON in this exact format:
{
  "format": "<blog_post|twitter_thread|github_repo|image>",
  "reasoning": "<2-3 sentences explaining why this format is best>"
}

Important:
- Choose the format that would create the MOST value for this specific idea
- Be creative but realistic about what can be generated
- Consider the idea's complexity, technical nature, and visual potential
- Default to 'blog_post' if uncertain`;
}

/**
 * Call OpenAI GPT-4o-mini
 */
async function callOpenAI(prompt: string): Promise<{ content: string; tokens: number }> {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.5, // Lower temp for more consistent routing
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await model.invoke(prompt);

  return {
    content: response.content.toString(),
    tokens: response.usage_metadata?.total_tokens || 0,
  };
}

/**
 * Call Anthropic Claude Haiku (fallback)
 */
async function callAnthropic(prompt: string): Promise<{ content: string; tokens: number }> {
  const model = new ChatAnthropic({
    modelName: 'claude-3-5-haiku-20241022',
    temperature: 0.5,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await model.invoke(prompt);

  return {
    content: response.content.toString(),
    tokens: response.usage_metadata?.total_tokens || 0,
  };
}

/**
 * Parse the LLM response and extract the format choice
 */
function parseRouterResponse(response: {
  content: string;
  tokens: number;
}): Partial<AgentStateType> {
  const { content, tokens } = response;

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in LLM response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate format
  const validFormats = ['blog_post', 'twitter_thread', 'github_repo', 'image'];
  if (!validFormats.includes(parsed.format)) {
    throw new Error(`Invalid format: ${parsed.format}. Must be one of: ${validFormats.join(', ')}`);
  }

  if (typeof parsed.reasoning !== 'string' || parsed.reasoning.length === 0) {
    throw new Error('Invalid reasoning in response');
  }

  return {
    chosenFormat: parsed.format as 'blog_post' | 'twitter_thread' | 'github_repo' | 'image',
    formatReasoning: parsed.reasoning,
    tokensUsed: tokens,
  };
}
