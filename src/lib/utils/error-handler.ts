import type { Logger } from '../logging/logger';

export interface ErrorHandlerConfig {
  agent: string;
  logger?: Logger;
  defaultReturn?: any;
}

/**
 * Normalize error message extraction
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error);
}

/**
 * Create a consistent error response
 *
 * Usage:
 * ```typescript
 * const handleError = createErrorHandler({
 *   agent: 'router-agent',
 *   logger,
 *   defaultReturn: { chosenFormat: null, formatReasoning: '', errors: [] },
 * });
 *
 * try {
 *   // ... do work ...
 * } catch (error) {
 *   return handleError(error);
 * }
 * ```
 */
export function createErrorHandler(config: ErrorHandlerConfig) {
  return (error: unknown) => {
    const message = getErrorMessage(error);
    config.logger?.error(`${config.agent} failed`, { error: message });

    return {
      ...config.defaultReturn,
      errors: [
        ...(config.defaultReturn?.errors || []),
        `${config.agent} failed: ${message}`,
      ],
    };
  };
}
