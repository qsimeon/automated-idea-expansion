import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { AgentStateType } from './types';
import type { Idea } from '../db/types';

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
  const { allIdeas, specificIdeaId } = state;

  // If specific idea requested, use that
  if (specificIdeaId) {
    const specificIdea = allIdeas.find((idea) => idea.id === specificIdeaId);
    if (specificIdea) {
      return {
        selectedIdea: specificIdea,
        judgeReasoning: 'Manually selected by user',
        judgeScore: 100,
        tokensUsed: 0, // No LLM call needed
      };
    }
  }

  // No ideas to evaluate
  if (!allIdeas || allIdeas.length === 0) {
    return {
      selectedIdea: null,
      judgeReasoning: 'No pending ideas available',
      judgeScore: 0,
      errors: ['No ideas to evaluate'],
    };
  }

  // If only one idea, select it automatically
  if (allIdeas.length === 1) {
    return {
      selectedIdea: allIdeas[0],
      judgeReasoning: 'Only one idea available',
      judgeScore: 80,
      tokensUsed: 0,
    };
  }

  // Multiple ideas - use LLM to judge
  try {
    return await evaluateWithLLM(allIdeas);
  } catch (error) {
    console.error('Judge agent failed:', error);
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
  ideas: Idea[]
): Promise<Partial<AgentStateType>> {
  // Build evaluation prompt
  const prompt = buildEvaluationPrompt(ideas);

  // Try OpenAI first (cheaper, faster)
  try {
    const result = await callOpenAI(prompt);
    return parseJudgeResponse(result, ideas);
  } catch (openaiError) {
    console.warn('OpenAI failed, falling back to Anthropic:', openaiError);

    // Fallback to Anthropic
    try {
      const result = await callAnthropic(prompt);
      return parseJudgeResponse(result, ideas);
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
External Links: ${JSON.stringify(idea.external_links) || 'None'}
Times Previously Evaluated: ${idea.times_evaluated}
Last Evaluated: ${idea.last_evaluated_at || 'Never'}
Current Priority Score: ${idea.priority_score}
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
- If ideas are similar quality, prefer ones evaluated less often
- Be honest and critical in your evaluation
- The reasoning should be specific to the selected idea`;
}

/**
 * Call OpenAI GPT-4o-mini
 */
async function callOpenAI(prompt: string): Promise<{ content: string; tokens: number }> {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.7, // Some creativity but mostly consistent
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
    temperature: 0.7,
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const response = await model.invoke(prompt);

  return {
    content: response.content.toString(),
    tokens: response.usage_metadata?.total_tokens || 0,
  };
}

/**
 * Parse the LLM response and extract the selected idea
 */
function parseJudgeResponse(
  response: { content: string; tokens: number },
  ideas: Idea[]
): Partial<AgentStateType> {
  const { content, tokens } = response;

  // Extract JSON from response (handles markdown code blocks)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in LLM response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Validate response
  if (
    typeof parsed.selectedIndex !== 'number' ||
    parsed.selectedIndex < 0 ||
    parsed.selectedIndex >= ideas.length
  ) {
    throw new Error('Invalid selectedIndex in response');
  }

  if (typeof parsed.score !== 'number' || parsed.score < 0 || parsed.score > 100) {
    throw new Error('Invalid score in response');
  }

  if (typeof parsed.reasoning !== 'string' || parsed.reasoning.length === 0) {
    throw new Error('Invalid reasoning in response');
  }

  const selectedIdea = ideas[parsed.selectedIndex];

  return {
    selectedIdea,
    judgeReasoning: parsed.reasoning,
    judgeScore: parsed.score,
    tokensUsed: tokens,
  };
}
