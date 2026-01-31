import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ZodType } from 'zod';
import type { Logger } from '../logging/logger';

export interface LLMCallOptions {
  temperature?: number;
  logger?: Logger;
}

export interface LLMFallbackConfig {
  primary: {
    provider: 'openai' | 'anthropic';
    model: string;
    options?: LLMCallOptions;
  };
  fallback: {
    provider: 'openai' | 'anthropic';
    model: string;
    options?: LLMCallOptions;
  };
}

/**
 * Call LLM with structured output and automatic fallback
 *
 * Handles:
 * - Primary LLM call with structured output schema
 * - Automatic fallback to secondary provider if primary fails
 * - Logging of success/failure at each step
 *
 * Usage:
 * ```typescript
 * const result = await callLLMStructured(
 *   prompt,
 *   MySchema,
 *   {
 *     primary: { provider: 'openai', model: 'gpt-4o-mini-2024-07-18' },
 *     fallback: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
 *   },
 *   logger
 * );
 * ```
 */
export async function callLLMStructured<T>(
  prompt: string,
  schema: ZodType<T>,
  config: LLMFallbackConfig,
  logger?: Logger
): Promise<T> {
  try {
    logger?.debug('Calling LLM (primary)', {
      provider: config.primary.provider,
      model: config.primary.model,
    });

    const result = await callLLM(
      prompt,
      schema,
      config.primary.provider,
      config.primary.model,
      config.primary.options
    );

    logger?.debug('LLM call successful (primary)');
    return result;
  } catch (primaryError) {
    logger?.warn('Primary LLM failed, trying fallback', {
      error: primaryError instanceof Error ? primaryError.message : String(primaryError),
    });

    try {
      const result = await callLLM(
        prompt,
        schema,
        config.fallback.provider,
        config.fallback.model,
        config.fallback.options
      );

      logger?.debug('LLM call successful (fallback)');
      return result;
    } catch (fallbackError) {
      throw new Error(
        `Both LLMs failed. Primary (${config.primary.provider}): ${primaryError}. Fallback (${config.fallback.provider}): ${fallbackError}`
      );
    }
  }
}

/**
 * Internal: Call single LLM provider with structured output
 */
async function callLLM<T>(
  prompt: string,
  schema: ZodType<T>,
  provider: 'openai' | 'anthropic',
  modelName: string,
  options?: LLMCallOptions
): Promise<T> {
  const temperature = options?.temperature ?? 0.7;

  if (provider === 'openai') {
    const model = new ChatOpenAI({
      modelName,
      temperature,
      apiKey: process.env.OPENAI_API_KEY,
    });
    const structuredModel = model.withStructuredOutput(schema);
    return (await structuredModel.invoke(prompt)) as T;
  } else {
    const model = new ChatAnthropic({
      modelName,
      temperature,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    const structuredModel = model.withStructuredOutput(schema);
    return (await structuredModel.invoke(prompt)) as T;
  }
}
