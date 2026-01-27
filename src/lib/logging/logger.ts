import { randomUUID } from 'crypto';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogContext {
  executionId?: string;
  userId?: string;
  ideaId?: string;
  stage?: string;
  subStage?: string;
}

export interface LogData {
  [key: string]: any;
}

export interface TokenUsage {
  input: number;
  output: number;
  model: string;
  cost?: number;
}

/**
 * Logger Utility for Idea Expansion Pipeline
 *
 * Features:
 * - Execution ID tracking across the pipeline
 * - Context propagation (userId, ideaId, stage)
 * - Token usage tracking
 * - Stage timing measurement
 * - Human-readable output format
 *
 * Usage:
 * ```typescript
 * const logger = createLogger({
 *   executionId: 'exec-123',
 *   userId: 'user-456',
 *   ideaId: 'idea-789',
 *   stage: 'router-agent',
 * });
 *
 * logger.info('Analyzing idea for format', { ideaTitle: 'Build a CLI tool' });
 * logger.trackTokens({ input: 500, output: 1200, model: 'gpt-4o-mini' });
 * ```
 */
export class Logger {
  private context: LogContext;
  private tokenUsage: TokenUsage[] = [];
  private startTime: number;

  constructor(context: LogContext = {}) {
    this.context = {
      executionId: context.executionId || `exec-${randomUUID().slice(0, 8)}`,
      ...context,
    };
    this.startTime = Date.now();
  }

  /**
   * Create child logger with additional context
   * Useful for sub-stages that inherit parent context
   */
  child(additionalContext: Partial<LogContext>): Logger {
    return new Logger({
      ...this.context,
      ...additionalContext,
    });
  }

  /**
   * Log methods for different severity levels
   */
  debug(message: string, data?: LogData): void {
    this.log('DEBUG', message, data);
  }

  info(message: string, data?: LogData): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: LogData): void {
    this.log('WARN', message, data);
  }

  error(message: string, errorOrData?: Error | LogData): void {
    const data = errorOrData instanceof Error
      ? { error: errorOrData.message, stack: errorOrData.stack }
      : errorOrData;
    this.log('ERROR', message, data);
  }

  /**
   * Track token usage for LLM calls
   */
  trackTokens(usage: TokenUsage): void {
    this.tokenUsage.push(usage);
    this.debug('Token usage tracked', usage);
  }

  /**
   * Get total tokens used across all tracked calls
   */
  getTotalTokens(): { input: number; output: number; total: number } {
    const input = this.tokenUsage.reduce((sum, u) => sum + u.input, 0);
    const output = this.tokenUsage.reduce((sum, u) => sum + u.output, 0);
    return { input, output, total: input + output };
  }

  /**
   * Get execution duration in milliseconds
   */
  getDuration(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Get current execution context
   */
  getContext(): LogContext {
    return { ...this.context };
  }

  /**
   * Core logging method
   * Formats and outputs log messages with context
   */
  private log(level: LogLevel, message: string, data?: LogData): void {
    const timestamp = new Date().toISOString();
    const { executionId, userId, ideaId, stage, subStage } = this.context;

    // Build prefix with context
    const contextParts = [
      `[${timestamp}]`,
      level.padEnd(5),
      executionId ? `[${executionId}]` : '',
      stage ? `[${stage}${subStage ? `/${subStage}` : ''}]` : '',
    ].filter(Boolean);

    const prefix = contextParts.join(' ');

    // Output main message
    console.log(`${prefix} ${message}`);

    // Output data if provided
    if (data) {
      Object.entries(data).forEach(([key, value]) => {
        // Format arrays and objects nicely
        if (Array.isArray(value)) {
          console.log(`   ${key}: [${value.length} items]`, value.slice(0, 5)); // Show first 5 items
        } else if (typeof value === 'object' && value !== null) {
          console.log(`   ${key}:`, JSON.stringify(value, null, 2).split('\n').map((line, i) => i === 0 ? line : `      ${line}`).join('\n'));
        } else {
          console.log(`   ${key}:`, value);
        }
      });
    }

    /**
     * Production Logging Strategy (Future Enhancement):
     *
     * Current: Console output only (captured by Vercel logs)
     * Future Options:
     * - Vercel Log Drains → External service (Datadog, Logtail)
     * - Structured logging → Database for queryable traces
     *
     * For now, Vercel captures all console output in the Logs tab.
     */
  }
}

/**
 * Factory function to create a new logger instance
 * Convenience wrapper around the Logger class
 */
export const createLogger = (context?: LogContext): Logger => {
  return new Logger(context);
};
