import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { Logger } from '../logging/logger';
import { z } from 'zod';

/**
 * Zod schema for summarizer response (structured output)
 *
 * Philosophy: Schemas all the way down
 * - 5-150 char constraint ensures short, snappy titles
 * - Perfect for card display while preserving full idea in description
 */
export const IdeaSummarySchema = z.object({
  summary: z.string()
    .min(5, "Summary must be at least 5 characters")
    .max(150, "Summary must be under 150 characters")
    .describe("1-sentence summary of the idea, suitable as a card title. Concise and punchy."),
});

export type IdeaSummary = z.infer<typeof IdeaSummarySchema>;

/**
 * IDEA SUMMARIZER AGENT
 *
 * Purpose: Generate a short 1-sentence summary for an idea
 *
 * How it works:
 * 1. Receives a full idea (can be long paragraph)
 * 2. Analyzes the core concept
 * 3. Generates a concise 1-sentence summary (max 150 chars)
 * 4. Returns summary with guaranteed length constraints
 *
 * Use case:
 * - When user saves an idea, auto-generate a short title summary
 * - This becomes the bold card title
 * - Full idea becomes the card body
 *
 * Models used: Claude Haiku (fast, cheap), fallback to GPT-4o-mini
 */
export async function ideaSummarizer(
  ideaContent: string,
  logger?: Logger
): Promise<IdeaSummary> {
  // Create child logger for summarizer
  const summarizerLogger = logger?.child({ stage: 'idea-summarizer' });

  if (!ideaContent || ideaContent.trim().length === 0) {
    throw new Error('Idea content is required for summarization');
  }

  summarizerLogger?.info('📝 Summarizing idea', {
    contentLength: ideaContent.length,
  });

  try {
    summarizerLogger?.info('🤖 Calling LLM to generate summary', {
      model: 'claude-haiku (primary), gpt-4o-mini (fallback)',
    });

    const result = await summarizeWithLLM(ideaContent, summarizerLogger);

    summarizerLogger?.info('✅ Summary generated', {
      summary: result.summary,
      length: result.summary.length,
    });

    return result;
  } catch (error) {
    summarizerLogger?.error('❌ Summarizer failed', error instanceof Error ? error : { message: String(error) });
    throw error;
  }
}

/**
 * Use LLM to generate a summary
 */
async function summarizeWithLLM(ideaContent: string, logger?: Logger): Promise<IdeaSummary> {
  const prompt = buildSummaryPrompt(ideaContent);

  // Try Anthropic first (faster, cheaper)
  try {
    logger?.debug('Calling Anthropic (primary)', { model: 'claude-haiku' });

    const result = await callAnthropic(prompt);

    logger?.debug('Anthropic summarization complete', {
      summary: result.summary,
    });

    return result;
  } catch (anthropicError) {
    logger?.warn('⚠️ Anthropic failed, falling back to OpenAI', {
      error: anthropicError instanceof Error ? anthropicError.message : String(anthropicError),
    });

    // Fallback to OpenAI
    try {
      logger?.debug('Calling OpenAI (fallback)', { model: 'gpt-4o-mini' });

      const result = await callOpenAI(prompt);

      logger?.debug('OpenAI summarization complete', {
        summary: result.summary,
      });

      return result;
    } catch (openaiError) {
      throw new Error(
        `Both LLMs failed. Anthropic: ${anthropicError}. OpenAI: ${openaiError}`
      );
    }
  }
}

/**
 * Build the summarization prompt
 *
 * Key instruction: Keep summary VERY SHORT (max 150 chars)
 * This prevents the "summary" from being almost as long as the original idea
 */
function buildSummaryPrompt(ideaContent: string): string {
  return `You are a master at creating short, punchy titles. Your job is to distill a user's idea into a single sentence title suitable for a card.

USER'S IDEA:
"""
${ideaContent}
"""

TASK:
Create a 1-sentence summary (max 150 characters) that captures the essence of this idea.
- Be concise and punchy
- Make it interesting enough to catch attention
- Avoid generic phrases like "A discussion about..." or "An exploration of..."
- Start with a strong verb or clear concept
- This will be used as a card title, so it should stand alone

EXAMPLES:
- Bad: "A discussion about how to improve productivity" (too long, generic)
- Good: "5-minute morning routine that doubles productivity" (specific, actionable)

- Bad: "An exploration of different types of art" (too vague)
- Good: "AI art tools: From text prompts to masterpieces" (specific, interesting)

Respond with ONLY the summary, nothing else.`;
}

/**
 * Call Anthropic Claude Haiku (primary) with structured output
 */
async function callAnthropic(prompt: string): Promise<IdeaSummary> {
  const model = new ChatAnthropic({
    modelName: 'claude-haiku-4-5-20251001',
    temperature: 0.7, // Slightly higher for more creative summaries
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Use structured output with Zod schema
  const structuredModel = model.withStructuredOutput(IdeaSummarySchema);
  const result = await structuredModel.invoke(prompt);

  return result as IdeaSummary;
}

/**
 * Call OpenAI GPT-4o-mini (fallback) with structured output
 */
async function callOpenAI(prompt: string): Promise<IdeaSummary> {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini-2024-07-18',
    temperature: 0.7, // Slightly higher for more creative summaries
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Use structured output with Zod schema
  const structuredModel = model.withStructuredOutput(IdeaSummarySchema);
  const result = await structuredModel.invoke(prompt);

  return result as IdeaSummary;
}
