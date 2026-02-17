export function normalizeOptionalString(input: unknown): string | null {
  const normalized = String(input ?? "").trim();
  return normalized ? normalized : null;
}
