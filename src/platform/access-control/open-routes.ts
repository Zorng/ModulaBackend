import type { OpenRoute } from "./types.js";

export const OPEN_ROUTES: OpenRoute[] = [
  { method: "POST", pattern: /^\/auth\/register$/ },
  { method: "POST", pattern: /^\/auth\/otp\/send$/ },
  { method: "POST", pattern: /^\/auth\/otp\/verify$/ },
  { method: "POST", pattern: /^\/auth\/login$/ },
  { method: "POST", pattern: /^\/auth\/refresh$/ },
  { method: "POST", pattern: /^\/auth\/logout$/ },
  { method: "GET", pattern: /^\/health$/ },
];

export function isOpenRoute(method: string, path: string): boolean {
  if (method === "OPTIONS") {
    return true;
  }
  return OPEN_ROUTES.some(
    (route) => route.method === method && route.pattern.test(path)
  );
}
