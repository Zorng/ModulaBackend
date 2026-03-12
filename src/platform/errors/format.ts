export function formatError(error: unknown): string {
  return formatErrorInternal(error, new Set());
}

function formatErrorInternal(error: unknown, seen: Set<unknown>): string {
  if (error === null || error === undefined) {
    return String(error);
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error !== "object") {
    return String(error);
  }

  if (seen.has(error)) {
    return "[Circular error]";
  }
  seen.add(error);

  if (error instanceof AggregateError) {
    const nested = Array.from(error.errors ?? [])
      .map((item) => formatErrorInternal(item, seen))
      .filter(Boolean);

    if (error.message && error.message.trim().length > 0) {
      return nested.length > 0
        ? `${error.message} (${nested.join("; ")})`
        : error.message;
    }

    return nested.length > 0 ? nested.join("; ") : "AggregateError";
  }

  if (error instanceof Error) {
    const message = error.message?.trim();
    const cause = "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    if (message && message.length > 0) {
      if (cause) {
        return `${message} (${formatErrorInternal(cause, seen)})`;
      }
      return message;
    }

    if (cause) {
      return `${error.name} (${formatErrorInternal(cause, seen)})`;
    }

    return error.name || "Error";
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
