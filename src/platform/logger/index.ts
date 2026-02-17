import pino, { type Logger as PinoLogger } from "pino";

export type LogContext = Record<string, unknown>;

export interface StructuredLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  withContext(context: LogContext): StructuredLogger;
}

class PinoStructuredLogger implements StructuredLogger {
  constructor(private readonly logger: PinoLogger) {}

  debug(message: string, context?: LogContext): void {
    this.emit("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.emit("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.emit("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.emit("error", message, context);
  }

  withContext(context: LogContext): StructuredLogger {
    return new PinoStructuredLogger(this.logger.child(context));
  }

  private emit(level: "debug" | "info" | "warn" | "error", message: string, context?: LogContext) {
    if (context && Object.keys(context).length > 0) {
      this.logger[level](context, message);
      return;
    }
    this.logger[level](message);
  }
}

function createBasePinoLogger(): PinoLogger {
  const level = process.env.LOG_LEVEL ?? "info";
  const pretty = process.env.LOG_PRETTY === "true";

  return pino({
    level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: pretty
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            singleLine: true,
            ignore: "pid,hostname",
          },
        }
      : undefined,
  });
}

export const log: StructuredLogger = new PinoStructuredLogger(createBasePinoLogger());
