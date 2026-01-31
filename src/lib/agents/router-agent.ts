import type { AgentStateType } from './types';
import type { Logger } from '../logging/logger';
import { z } from 'zod';
import { callLLMStructured } from '../llm/llm-service';

const RouterResponseSchema = z.object({
  format: z.enum(['blog_post', 'github_repo']),
  reasoning: z.string().min(1),
});

/**
 * ROUTER AGENT
 *
 * Purpose: Decide the best output format for the user-selected idea
 *
 * How it works:
 * 1. Receives the idea selected by the user
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

  const routerLogger = logger?.child({ stage: 'router-agent' });

  routerLogger?.info('🎯 Analyzing idea for format', {
    ideaId: selectedIdea?.id,
    title: selectedIdea?.title,
  });

  if (!selectedIdea) {
    return {
      chosenFormat: null,
      formatReasoning: 'No idea provided for routing',
      errors: ['Cannot route: no idea selected'],
    };
  }

  try {
    const result = await callLLMStructured(
      buildRoutingPrompt(selectedIdea),
      RouterResponseSchema,
      {
        primary: {
          provider: 'openai',
          model: 'gpt-4o-mini-2024-07-18',
          options: { temperature: 0.5 },
        },
        fallback: {
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          options: { temperature: 0.5 },
        },
      },
      routerLogger
    );

    routerLogger?.info('✅ Format selected', {
      format: result.format,
      reasoning: result.reasoning,
    });

    return {
      chosenFormat: result.format,
      formatReasoning: result.reasoning,
    };
  } catch (error) {
    routerLogger?.error('Router failed', error instanceof Error ? error : { message: String(error) });

    return {
      chosenFormat: null,
      formatReasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      errors: [`Router failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

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
