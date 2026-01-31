import { randomUUID } from 'crypto';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogContext {
  executionId?: string;
  userId?: string;
  ideaId?: string;
  stage?: string;
}

export interface LogData {
  [key: string]: any;
}

/**
 * Logger for the pipeline
 *
 * Features:
 * - Execution ID tracking
 * - Stage context propagation
 * - Child loggers for sub-stages
 * - Duration measurement
 */
export class Logger {
  private context: LogContext;
  private startTime: number;

  constructor(context: LogContext = {}) {
    this.context = {
      executionId: context.executionId || `exec-${randomUUID().slice(0, 8)}`,
      ...context,
    };
    this.startTime = Date.now();
  }

  child(additionalContext: Partial<LogContext>): Logger {
    return new Logger({
      ...this.context,
      ...additionalContext,
    });
  }

  debug(message: string, data?: LogData): void {
    this.log('DEBUG', message, data);
  }

  info(message: string, data?: LogData): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: LogData): void {
    this.log('WARN', message, data);
  }

  error(message: string, error?: Error | LogData): void {
    const data = error instanceof Error
      ? { error: error.message }
      : error;
    this.log('ERROR', message, data);
  }

  getDuration(): number {
    return Date.now() - this.startTime;
  }

  getContext(): LogContext {
    return { ...this.context };
  }

  private log(level: LogLevel, message: string, data?: LogData): void {
    const { executionId, stage } = this.context;
    const timestamp = new Date().toISOString();

    const prefix = [
      `[${timestamp}]`,
      level.padEnd(5),
      executionId ? `[${executionId}]` : '',
      stage ? `[${stage}]` : '',
    ]
      .filter(Boolean)
      .join(' ');

    console.log(`${prefix} ${message}`);

    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

export const createLogger = (context?: LogContext): Logger => new Logger(context);
