import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { AgentStateType } from './types';
import type { Logger } from '../logging/logger';
import { z } from 'zod';

/**
 * Zod schema for router response (structured output)
 */
const RouterResponseSchema = z.object({
  format: z.enum(['blog_post', 'github_repo']),
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
 *    - Blog: Written content (explanations, tutorials, tips) with optional images and social share
 *    - Code: Technical demos, implementations, tools
 * 4. Returns format choice with reasoning
 *
 * Note: Images and social media posts are COMPONENTS of blogs, not standalone formats.
 * The router only chooses between: blog_post, github_repo
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

1. **blog_post**: Deep explanations, tutorials, thought pieces, and analyses
   - Best for: Conceptual understanding, step-by-step guides, in-depth explorations
   - Examples: "Understanding depth perception", "How async/await works", "5 Python tips for beginners"
   - Features: 1000-2000 words, optional images, auto-generated social media post
   - Use for: Both long-form content AND bite-sized tips/insights

2. **github_repo**: Code demonstrations, technical experiments, interactive examples
   - Best for: Working implementations, algorithms, tools, hands-on demos
   - Examples: "Fibonacci visualizer", "Neural network from scratch", "CLI tool for X"
   - Output: Jupyter notebook, CLI app, or demo script with full code

Idea:
Title: ${idea.title}
Description: ${idea.description || 'No description'}

Choose the format that provides MAXIMUM VALUE for this specific idea.

Decision criteria:
- Would this idea benefit most from **written explanation** (blog) or **hands-on code** (repo)?
- What would an audience find most valuable?
- Is the core insight conceptual/educational (blog) or technical/implementation-focused (code)?

Note: Blog posts now include auto-generated social media posts for sharing, so they work well for both long and short content.

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
    modelName: 'claude-haiku-4-5-20251001',
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
