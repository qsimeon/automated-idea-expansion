import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { AgentStateType } from './types';
import type { Idea } from '../db/types';
import type { Logger } from '../logging/logger';
import { z } from 'zod';

/**
 * Zod schema for judge response (structured output)
 */
const JudgeResponseSchema = z.object({
  selectedIndex: z.number().int().min(0),
  score: z.number().min(0).max(100),
  reasoning: z.string().min(1),
});

/**
 * JUDGE AGENT
 *
 * Purpose: Evaluate all pending ideas and select the best one to expand
 *
 * How it works:
 * 1. Receives all pending ideas (or a specific idea if manually triggered)
 * 2. Asks an LLM to evaluate them based on:
 *    - Impact: How valuable would this be?
 *    - Originality: Is this a unique perspective?
 *    - Feasibility: Can this be executed well?
 *    - Timeliness: Is this relevant right now?
 * 3. Returns the best idea with reasoning and score
 *
 * Models used: GPT-4o-mini (primary) or Claude Haiku (fallback)
 */
export async function judgeAgent(
  state: AgentStateType
): Promise<Partial<AgentStateType>> {
  const { allIdeas, specificIdeaId, logger } = state;

  // Create child logger for judge agent
  const judgeLogger = logger?.child({ stage: 'judge-agent' });

  judgeLogger?.info('📊 Evaluating ideas', {
    candidateCount: allIdeas?.length || 0,
    specificIdeaId: specificIdeaId || 'None (will judge all)',
    candidates: allIdeas?.map(i => ({
      id: i.id,
      title: i.title,
    })),
  });

  // If specific idea requested, use that
  if (specificIdeaId) {
    const specificIdea = allIdeas.find((idea) => idea.id === specificIdeaId);
    if (specificIdea) {
      judgeLogger?.info('✅ Idea selected (manual)', {
        ideaId: specificIdea.id,
        title: specificIdea.title,
        reasoning: 'Manually selected by user',
      });

      return {
        selectedIdea: specificIdea,
        judgeReasoning: 'Manually selected by user',
        judgeScore: 100,
      };
    }
  }

  // No ideas to evaluate
  if (!allIdeas || allIdeas.length === 0) {
    judgeLogger?.warn('⚠️  No ideas to evaluate');

    return {
      selectedIdea: null,
      judgeReasoning: 'No pending ideas available',
      judgeScore: 0,
      errors: ['No ideas to evaluate'],
    };
  }

  // If only one idea, select it automatically
  if (allIdeas.length === 1) {
    judgeLogger?.info('✅ Idea selected (only one available)', {
      ideaId: allIdeas[0].id,
      title: allIdeas[0].title,
    });

    return {
      selectedIdea: allIdeas[0],
      judgeReasoning: 'Only one idea available',
      judgeScore: 80,
    };
  }

  // Multiple ideas - use LLM to judge
  try {
    judgeLogger?.info('🤖 Calling LLM to evaluate', {
      ideaCount: allIdeas.length,
      model: 'gpt-4o-mini (primary), claude-haiku (fallback)',
    });

    const result = await evaluateWithLLM(allIdeas, judgeLogger);

    judgeLogger?.info('✅ Idea selected (LLM evaluation)', {
      ideaId: result.selectedIdea?.id,
      title: result.selectedIdea?.title,
      score: result.judgeScore,
      reasoning: result.judgeReasoning,
    });

    return result;
  } catch (error) {
    judgeLogger?.error('❌ Judge agent failed', error instanceof Error ? error : { message: String(error) });

    return {
      selectedIdea: null,
      judgeReasoning: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      judgeScore: 0,
      errors: [`Judge agent failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
    };
  }
}

/**
 * Use LLM to evaluate and select the best idea
 */
async function evaluateWithLLM(
  ideas: Idea[],
  logger?: Logger
): Promise<Partial<AgentStateType>> {
  // Build evaluation prompt
  const prompt = buildEvaluationPrompt(ideas);

  // Try OpenAI first (cheaper, faster)
  try {
    logger?.debug('Calling OpenAI (primary)', { model: 'gpt-4o-mini', ideaCount: ideas.length });

    const { result, tokens } = await callOpenAI(prompt, ideas);

    // Validate selectedIndex is within bounds
    if (result.selectedIndex >= ideas.length) {
      throw new Error(`selectedIndex ${result.selectedIndex} out of bounds (max: ${ideas.length - 1})`);
    }

    const selectedIdea = ideas[result.selectedIndex];

    logger?.debug('OpenAI evaluation complete', {
      selectedIndex: result.selectedIndex,
      score: result.score,
    });

    return {
      selectedIdea,
      judgeReasoning: result.reasoning,
      judgeScore: result.score,
    };
  } catch (openaiError) {
    logger?.warn('⚠️  OpenAI failed, falling back to Anthropic', {
      error: openaiError instanceof Error ? openaiError.message : String(openaiError),
    });

    // Fallback to Anthropic
    try {
      logger?.debug('Calling Anthropic (fallback)', { model: 'claude-haiku', ideaCount: ideas.length });

      const { result, tokens } = await callAnthropic(prompt, ideas);

      // Validate selectedIndex is within bounds
      if (result.selectedIndex >= ideas.length) {
        throw new Error(`selectedIndex ${result.selectedIndex} out of bounds (max: ${ideas.length - 1})`);
      }

      const selectedIdea = ideas[result.selectedIndex];

      logger?.debug('Anthropic evaluation complete', {
        selectedIndex: result.selectedIndex,
        score: result.score,
      });

      return {
        selectedIdea,
        judgeReasoning: result.reasoning,
        judgeScore: result.score,
      };
    } catch (anthropicError) {
      throw new Error(
        `Both LLMs failed. OpenAI: ${openaiError}. Anthropic: ${anthropicError}`
      );
    }
  }
}

/**
 * Build the evaluation prompt
 */
function buildEvaluationPrompt(ideas: Idea[]): string {
  return `You are an expert content strategist evaluating ideas for expansion.

Your task: Analyze these ideas and select the BEST one to expand into content.

Evaluation criteria:
1. **Impact** (1-10): How valuable would this be to an audience?
2. **Originality** (1-10): How unique is this perspective or approach?
3. **Feasibility** (1-10): Can this be executed well as content?
4. **Timeliness** (1-10): Is this relevant and timely right now?
5. **Clarity** (1-10): Is the idea clear and well-defined?

Here are the ideas to evaluate:

${ideas
  .map(
    (idea, idx) => `
--- IDEA ${idx + 1} ---
ID: ${idea.id}
Title: ${idea.title}
Description: ${idea.description || 'No description'}
Bullets: ${JSON.stringify(idea.bullets) || 'None'}
`
  )
  .join('\n')}

Respond with ONLY valid JSON in this exact format:
{
  "selectedIndex": <0 to ${ideas.length - 1}>,
  "score": <0 to 100>,
  "reasoning": "<2-3 sentences explaining why this idea is best>"
}

Important:
- Select the idea with highest overall potential
- Be honest and critical in your evaluation
- The reasoning should be specific to the selected idea`;
}

/**
 * Call OpenAI GPT-4o-mini with structured output
 */
async function callOpenAI(prompt: string, ideas: Idea[]): Promise<{ result: z.infer<typeof JudgeResponseSchema>; tokens: number }> {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini-2024-07-18',
    temperature: 0.7, // Some creativity but mostly consistent
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Use structured output with Zod schema
  const structuredModel = model.withStructuredOutput(JudgeResponseSchema);
  const result = await structuredModel.invoke(prompt);

  // Note: withStructuredOutput doesn't include usage metadata, estimate tokens
  const tokens = 0; // Will be tracked separately if needed

  return {
    result: result as z.infer<typeof JudgeResponseSchema>,
    tokens,
  };
}

/**
 * Call Anthropic Claude Haiku (fallback) with structured output
 */
async function callAnthropic(prompt: string, ideas: Idea[]): Promise<{ result: z.infer<typeof JudgeResponseSchema>; tokens: number }> {
  const model = new ChatAnthropic({
    modelName: 'claude-haiku-4-5-20251001',
    temperature: 0.7,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Use structured output with Zod schema
  const structuredModel = model.withStructuredOutput(JudgeResponseSchema);
  const result = await structuredModel.invoke(prompt);

  // Note: withStructuredOutput doesn't include usage metadata, estimate tokens
  const tokens = 0; // Will be tracked separately if needed

  return {
    result: result as z.infer<typeof JudgeResponseSchema>,
    tokens,
  };
}
