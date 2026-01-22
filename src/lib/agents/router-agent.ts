import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { AgentStateType } from './types';
import type { Logger } from '../logging/logger';
import { z } from 'zod';

/**
 * Zod schema for router response (structured output)
 */
const RouterResponseSchema = z.object({
  format: z.enum(['blog_post', 'twitter_thread', 'github_repo']),
  reasoning: z.string().min(1),
});

/**
 * ROUTER AGENT
 *
 * Purpose: Decide the best output format for the selected idea
 *
 * How it works:
 * 1. Receives the selected idea from Judge Agent
 * 2. Analyzes the idea's content and characteristics
 * 3. Decides which format would work best:
 *    - Blog: Deep explanations, tutorials, analyses (can include images)
 *    - Mastodon: Quick insights, hot takes, announcements (can include hero image)
 *    - Code: Technical demos, implementations, tools
 * 4. Returns format choice with reasoning
 *
 * Note: Images are now COMPONENTS of blogs/threads, not a standalone format.
 * The router only chooses between: blog_post, twitter_thread, github_repo
 *
 * Models used: GPT-4o-mini (primary) or Claude Haiku (fallback)
 */
export async function routerAgent(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { selectedIdea, logger } = state;

  // Create child logger for router agent
  const routerLogger = logger?.child({ stage: 'router-agent' });

  routerLogger?.info('🎯 Analyzing idea for format', {
    ideaId: selectedIdea?.id || 'None',
    title: selectedIdea?.title || 'No idea selected',
  });

  // No idea selected
  if (!selectedIdea) {
    routerLogger?.warn('⚠️ No idea to route');

    return {
      chosenFormat: null,
      formatReasoning: 'No idea was selected by Judge',
      errors: ['Cannot route: no idea selected'],
    };
  }

  try {
    routerLogger?.info('🤖 Calling LLM to determine format', {
      ideaId: selectedIdea.id,
      model: 'gpt-4o-mini (primary), claude-haiku (fallback)',
    });

    const result = await routeWithLLM(selectedIdea, routerLogger);

    routerLogger?.info('✅ Format selected', {
      format: result.chosenFormat,
      reasoning: result.formatReasoning,
      tokensUsed: result.tokensUsed,
    });

    return result;
  } catch (error) {
    routerLogger?.error('❌ Router agent failed', error instanceof Error ? error : { message: String(error) });

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
async function routeWithLLM(idea: any, logger?: Logger): Promise<Partial<AgentStateType>> {
  const prompt = buildRoutingPrompt(idea);

  // Try OpenAI first
  try {
    logger?.debug('Calling OpenAI (primary)', { model: 'gpt-4o-mini' });

    const { result, tokens } = await callOpenAI(prompt);

    logger?.debug('OpenAI routing complete', {
      format: result.format,
      tokensUsed: tokens,
    });

    return {
      chosenFormat: result.format,
      formatReasoning: result.reasoning,
      tokensUsed: tokens,
    };
  } catch (openaiError) {
    logger?.warn('⚠️ OpenAI failed, falling back to Anthropic', {
      error: openaiError instanceof Error ? openaiError.message : String(openaiError),
    });

    // Fallback to Anthropic
    try {
      logger?.debug('Calling Anthropic (fallback)', { model: 'claude-haiku' });

      const { result, tokens } = await callAnthropic(prompt);

      logger?.debug('Anthropic routing complete', {
        format: result.format,
        tokensUsed: tokens,
      });

      return {
        chosenFormat: result.format,
        formatReasoning: result.reasoning,
        tokensUsed: tokens,
      };
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
  return `You are a content format strategist. Determine the BEST format for this idea.

Available formats:

1. **blog_post**: Deep explanations, conceptual understanding, how things work
   - Best for: Tutorials, thought pieces, understanding complex topics
   - Examples: "Understanding depth perception", "How async/await works", "The philosophy of functional programming"
   - Length: 1000-2000 words with optional images

2. **twitter_thread**: Quick insights, tips, concise explanations
   - Best for: Step-by-step guides, quick takes, lists, announcements
   - Examples: "5 Python tips", "Thread on X concept", "Quick thoughts on Y"
   - Length: 5-10 posts (500 chars each) with optional hero image

3. **github_repo**: Code demonstrations, technical experiments, interactive examples
   - Best for: Implementations, algorithms, working demos, tools
   - Examples: "Fibonacci visualizer", "Neural network from scratch", "CLI tool for X"
   - Output: Jupyter notebook, CLI app, or demo script

Idea:
Title: ${idea.title}
Description: ${idea.description || 'No description'}

Choose the format that provides MAXIMUM VALUE for this specific idea.

Decision criteria:
- Would this idea benefit most from **explanation** (blog), **quick tips** (thread), or **hands-on code** (repo)?
- What would an audience find most valuable?
- Is the core insight conceptual (blog), actionable (thread), or technical (code)?

Respond with your format choice and clear reasoning.`;
}

/**
 * Call OpenAI GPT-4o-mini with structured output
 */
async function callOpenAI(prompt: string): Promise<{ result: z.infer<typeof RouterResponseSchema>; tokens: number }> {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.5, // Lower temp for more consistent routing
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Use structured output with Zod schema
  const structuredModel = model.withStructuredOutput(RouterResponseSchema);
  const result = await structuredModel.invoke(prompt);

  // Note: withStructuredOutput doesn't include usage metadata, estimate tokens
  const tokens = 0; // Will be tracked separately if needed

  return {
    result: result as z.infer<typeof RouterResponseSchema>,
    tokens,
  };
}

/**
 * Call Anthropic Claude Haiku (fallback) with structured output
 */
async function callAnthropic(prompt: string): Promise<{ result: z.infer<typeof RouterResponseSchema>; tokens: number }> {
  const model = new ChatAnthropic({
    modelName: 'claude-3-5-haiku-20241022',
    temperature: 0.5,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Use structured output with Zod schema
  const structuredModel = model.withStructuredOutput(RouterResponseSchema);
  const result = await structuredModel.invoke(prompt);

  // Note: withStructuredOutput doesn't include usage metadata, estimate tokens
  const tokens = 0; // Will be tracked separately if needed

  return {
    result: result as z.infer<typeof RouterResponseSchema>,
    tokens,
  };
}
