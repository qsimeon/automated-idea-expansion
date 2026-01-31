import type { Logger } from '../logging/logger';
import { z } from 'zod';
import { callLLMStructured } from '../llm/llm-service';

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
 */
export async function ideaSummarizer(
  ideaContent: string,
  logger?: Logger
): Promise<IdeaSummary> {
  const summarizerLogger = logger?.child({ stage: 'idea-summarizer' });

  if (!ideaContent || ideaContent.trim().length === 0) {
    throw new Error('Idea content is required for summarization');
  }

  summarizerLogger?.info('📝 Summarizing idea', {
    contentLength: ideaContent.length,
  });

  try {
    const result = await callLLMStructured(
      buildSummaryPrompt(ideaContent),
      IdeaSummarySchema,
      {
        primary: {
          provider: 'anthropic',
          model: 'claude-haiku-4-5-20251001',
          options: { temperature: 0.7 },
        },
        fallback: {
          provider: 'openai',
          model: 'gpt-4o-mini-2024-07-18',
          options: { temperature: 0.7 },
        },
      },
      summarizerLogger
    );

    summarizerLogger?.info('✅ Summary generated', {
      summary: result.summary,
      length: result.summary.length,
    });

    return result;
  } catch (error) {
    summarizerLogger?.error('Summarizer failed', error instanceof Error ? error : { message: String(error) });
    throw error;
  }
}

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
