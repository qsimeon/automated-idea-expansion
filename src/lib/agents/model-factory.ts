import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * MODEL FACTORY
 *
 * Centralized model selection for different tasks.
 * Uses the right model for each job to optimize cost and quality.
 *
 * Model Recommendations:
 * - Planning: GPT-5 Nano (fast, cheap, excellent at structured reasoning)
 * - Text Generation: Claude Haiku 4.5 (excellent writing quality)
 * - Image Prompts: GPT-4o-mini (creative prompt engineering)
 * - Review: GPT-4o-mini (fast, cost-effective validation)
 * - Coding: Claude Sonnet 4.5 (best at code generation)
 *
 * Cost Comparison (per 1M tokens):
 * - GPT-5 Nano: ~$0.10 input / $0.40 output (cheapest)
 * - GPT-4o-mini: ~$0.15 input / $0.60 output
 * - Claude Haiku 4.5: ~$0.25 input / $1.25 output
 * - Claude Sonnet 4.5: ~$3.00 input / $15.00 output
 */

export type ModelType =
  | 'gpt-4o-mini' // Fast, cheap, good balance
  | 'claude-haiku' // Fast, good writing
  | 'claude-sonnet'; // Best coding/writing

export function createModel(type: ModelType, temperature: number = 0.7) {
  switch (type) {
    case 'gpt-4o-mini':
      return new ChatOpenAI({
        modelName: 'gpt-4o-mini-2024-07-18',
        temperature,
        apiKey: process.env.OPENAI_API_KEY,
      });

    case 'claude-haiku':
      return new ChatAnthropic({
        modelName: 'claude-haiku-4-5-20251001',
        temperature,
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

    case 'claude-sonnet':
      return new ChatAnthropic({
        modelName: 'claude-sonnet-4-5-20250929',
        temperature,
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

    default:
      throw new Error(`Unknown model type: ${type}`);
  }
}

/**
 * Model recommendation for image prompt generation
 * GPT-4o-mini is fast, cheap, and good at creative prompt engineering
 */
export const IMAGE_PROMPT_MODEL: ModelType = 'gpt-4o-mini';
