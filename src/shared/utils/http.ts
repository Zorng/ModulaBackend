import { normalizeOptionalString } from "./string.js";

type HeaderValue = string | string[] | undefined;
type HeaderBag = Record<string, HeaderValue>;

export function readOptionalHeaderString(
  headers: HeaderBag,
  headerName: string
): string | null {
  const raw = headers[headerName.toLowerCase()];
  if (Array.isArray(raw)) {
    return normalizeOptionalString(raw[0]);
  }
  return normalizeOptionalString(raw);
}
