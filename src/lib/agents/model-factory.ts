import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';

/**
 * MODEL FACTORY
 *
 * Centralized model selection for different tasks.
 * Uses the right model for each job to optimize cost and quality.
 *
 * Model Recommendations:
 * - Planning: GPT-4o-mini (fast, cheap, good at structure)
 * - Text Generation: Claude Haiku (excellent writing quality)
 * - Image Prompts: GPT-4o-mini (creative prompt engineering)
 * - Review: GPT-4o-mini (fast, cost-effective validation)
 * - Coding: Claude Sonnet (best at code generation)
 *
 * Cost Comparison (per 1M tokens):
 * - GPT-4o-mini: ~$0.15 input / $0.60 output
 * - Claude Haiku: ~$0.25 input / $1.25 output
 * - Claude Sonnet: ~$3.00 input / $15.00 output
 */

export type ModelType =
  | 'gpt-4o-mini' // Fast, cheap, good balance
  | 'claude-haiku' // Fast, good writing
  | 'claude-sonnet'; // Best coding/writing

export function createModel(type: ModelType, temperature: number = 0.7) {
  switch (type) {
    case 'gpt-4o-mini':
      return new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        temperature,
        apiKey: process.env.OPENAI_API_KEY,
      });

    case 'claude-haiku':
      return new ChatAnthropic({
        modelName: 'claude-3-5-haiku-20241022',
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
 * Model recommendations by task
 * Use these constants for consistency across the codebase
 */
export const ModelRecommendations = {
  planning: 'gpt-4o-mini' as ModelType, // Fast, cheap, good at structure
  textGeneration: 'claude-haiku' as ModelType, // Excellent writing
  imagePrompts: 'gpt-4o-mini' as ModelType, // Creative prompts
  review: 'gpt-4o-mini' as ModelType, // Fast validation
  coding: 'claude-sonnet' as ModelType, // Best at code
} as const;

/**
 * Get estimated cost per 1K tokens (rough averages)
 * Useful for cost tracking and optimization decisions
 */
export function getModelCost(type: ModelType): { input: number; output: number } {
  const costs = {
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'claude-haiku': { input: 0.00025, output: 0.00125 },
    'claude-sonnet': { input: 0.003, output: 0.015 },
  };

  return costs[type];
}
