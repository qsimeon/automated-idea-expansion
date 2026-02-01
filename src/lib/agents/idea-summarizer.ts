import type { Logger } from '../logging/logger';
import { z } from 'zod';
import { callLLMStructured } from '../llm/llm-service';
import { MODEL_USE_CASES, MODEL_REGISTRY } from '@/lib/config/models';

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
          model: MODEL_USE_CASES.ideaSummary,
          options: { temperature: 0.7 },
        },
        fallback: {
          provider: 'openai',
          model: MODEL_REGISTRY.openai.mini,
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
- Be PUNCHY and attention-grabbing (use active voice, strong verbs)
- Make it interesting enough to catch attention immediately
- Avoid generic phrases like "A discussion about...", "An exploration of...", "Build a..."
- Focus on WHAT IT DOES or WHY IT MATTERS, not HOW it works
- This will be used as a card title, so it should stand alone
- Complete sentence that could be a headline

CRITICAL EXAMPLES - BAD vs GOOD:

❌ BAD - Truncated text from the original idea:
"Build a fashion app that makes recommendations for what pieces to buy based on my pinterest board"
(too long, reads like instructions)

✅ GOOD - Punchy, engagement-focused:
"AI fashion stylist that curates outfits from your Pinterest aesthetic"
(specific, benefit-focused, engaging)

❌ BAD - Generic:
"A discussion about how to improve productivity"

✅ GOOD - Specific benefit:
"5-minute morning routine that doubles productivity"

❌ BAD - Vague:
"An exploration of different types of art"

✅ GOOD - Specific angle:
"AI art tools: From text prompts to masterpieces"

❌ BAD - Instructional:
"Create a CLI tool for managing docker containers"

✅ GOOD - Benefit-focused:
"Docker container manager with one-click cleanup magic"

Remember: This is a HEADLINE for a card, not a description. Make it compelling!

Respond with ONLY the summary, nothing else.`;
}
