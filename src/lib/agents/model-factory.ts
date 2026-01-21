import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';

/**
 * MODEL FACTORY
 *
 * Centralized model selection for different tasks.
 * Uses the right model for each job to optimize cost and quality.
 *
 * Model Recommendations:
 * - Planning: Gemini Flash (fast, cheap, good at structure)
 * - Text Generation: Claude Haiku (excellent writing quality)
 * - Image Prompts: GPT-4o-mini (creative prompt engineering)
 * - Review: Gemini Flash (fast, cost-effective validation)
 * - Coding: Claude Sonnet (best at code generation)
 *
 * Cost Comparison (per 1M tokens):
 * - GPT-5 Nano: ~$0.10 input / $0.40 output
 * - GPT-4o-mini: ~$0.15 input / $0.60 output
 * - Claude Haiku: ~$0.25 input / $1.25 output
 * - Claude Sonnet: ~$3.00 input / $15.00 output
 * - Gemini Flash: ~$0.075 input / $0.30 output (cheapest!)
 * - Gemini Pro: ~$1.25 input / $5.00 output
 */

export type ModelType =
  | 'gpt-5-nano' // Ultra-cheap planning/review
  | 'gpt-4o-mini' // Balanced cost/quality
  | 'claude-haiku' // Fast, good writing
  | 'claude-sonnet' // Best coding/writing
  | 'gemini-flash' // Fast, cheap, good at structure
  | 'gemini-pro'; // More capable Gemini

export function createModel(type: ModelType, temperature: number = 0.7) {
  switch (type) {
    case 'gpt-5-nano':
      return new ChatOpenAI({
        modelName: 'gpt-5-nano-2025-08-07',
        // Note: GPT-5 nano only supports default temperature (1)
      });

    case 'gpt-4o-mini':
      return new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        temperature,
      });

    case 'claude-haiku':
      return new ChatAnthropic({
        modelName: 'claude-3-5-haiku-20241022',
        temperature,
      });

    case 'claude-sonnet':
      return new ChatAnthropic({
        modelName: 'claude-sonnet-4-5-20250929',
        temperature,
      });

    case 'gemini-flash':
      if (!process.env.GOOGLE_API_KEY) {
        console.warn('⚠️  GOOGLE_API_KEY not set, falling back to gpt-4o-mini');
        return new ChatOpenAI({
          modelName: 'gpt-4o-mini',
          temperature,
        });
      }
      return new ChatGoogleGenerativeAI({
        modelName: 'gemini-1.5-flash',
        temperature,
        apiKey: process.env.GOOGLE_API_KEY,
      });

    case 'gemini-pro':
      if (!process.env.GOOGLE_API_KEY) {
        console.warn('⚠️  GOOGLE_API_KEY not set, falling back to gpt-4o-mini');
        return new ChatOpenAI({
          modelName: 'gpt-4o-mini',
          temperature,
        });
      }
      return new ChatGoogleGenerativeAI({
        modelName: 'gemini-1.5-pro',
        temperature,
        apiKey: process.env.GOOGLE_API_KEY,
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
  planning: 'gemini-flash' as ModelType, // Fast, cheap, good at structure
  textGeneration: 'claude-haiku' as ModelType, // Excellent writing
  imagePrompts: 'gpt-4o-mini' as ModelType, // Creative prompts
  review: 'gemini-flash' as ModelType, // Fast validation
  coding: 'claude-sonnet' as ModelType, // Best at code
} as const;

/**
 * Get estimated cost per 1K tokens (rough averages)
 * Useful for cost tracking and optimization decisions
 */
export function getModelCost(type: ModelType): { input: number; output: number } {
  const costs = {
    'gpt-5-nano': { input: 0.0001, output: 0.0004 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'claude-haiku': { input: 0.00025, output: 0.00125 },
    'claude-sonnet': { input: 0.003, output: 0.015 },
    'gemini-flash': { input: 0.000075, output: 0.0003 },
    'gemini-pro': { input: 0.00125, output: 0.005 },
  };

  return costs[type];
}
