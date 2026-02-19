import { createHash } from "crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const body = entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableJsonStringify(val)}`)
    .join(",");
  return `{${body}}`;
}

export function hashJsonPayload(value: unknown): string {
  return sha256(stableJsonStringify(value));
}

