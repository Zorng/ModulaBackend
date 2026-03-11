import fs from "fs";
import path from "path";
import dotenv from "dotenv";

type LoadEnvironmentResult = {
  nodeEnv: string;
  appEnv: string;
  loadedFiles: string[];
};

let envLoaded = false;
let cachedResult: LoadEnvironmentResult | null = null;

export function loadEnvironment(defaultNodeEnv = "development"): LoadEnvironmentResult {
  if (envLoaded && cachedResult) {
    return cachedResult;
  }

  const nodeEnv = normalizeNodeEnv(process.env.NODE_ENV, defaultNodeEnv);
  const appEnv = normalizeAppEnv(process.env.APP_ENV, nodeEnv);
  process.env.NODE_ENV = nodeEnv;
  process.env.APP_ENV = appEnv;
  const lockedKeys = new Set(Object.keys(process.env));

  const loadedFiles: string[] = [];

  const baseFiles = [".env", `.env.${nodeEnv}`];
  for (const fileName of baseFiles) {
    if (!loadEnvFileIfExists(fileName, lockedKeys)) {
      continue;
    }
    loadedFiles.push(fileName);
  }

  assertLegacyLocalNotPresent(nodeEnv, appEnv);

  for (const fileName of resolveScopedEnvFiles(nodeEnv, appEnv)) {
    if (!loadEnvFileIfExists(fileName, lockedKeys)) {
      continue;
    }
    loadedFiles.push(fileName);
  }

  cachedResult = {
    nodeEnv,
    appEnv,
    loadedFiles,
  };
  envLoaded = true;
  return cachedResult;
}

export function expectedLocalEnvFilename(nodeEnv: string, appEnv?: string): string {
  const normalizedNodeEnv = normalizeNodeEnv(nodeEnv, "development");
  const normalizedAppEnv = normalizeAppEnv(appEnv, normalizedNodeEnv);

  if (normalizedAppEnv === "local" || normalizedAppEnv === normalizedNodeEnv) {
    return `.env.${normalizedNodeEnv}.local`;
  }

  return `.env.${normalizedNodeEnv}.${normalizedAppEnv}.local`;
}

export function parseBooleanEnv(rawValue: string | undefined): boolean | null {
  const normalized = String(rawValue ?? "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

function normalizeNodeEnv(rawNodeEnv: string | undefined, fallback: string): string {
  const normalized = String(rawNodeEnv ?? "").trim();
  if (normalized.length > 0) {
    return normalized;
  }
  return fallback;
}

function normalizeAppEnv(rawAppEnv: string | undefined, nodeEnv: string): string {
  const normalized = String(rawAppEnv ?? "").trim().toLowerCase();
  if (normalized.length > 0) {
    return normalized;
  }
  if (nodeEnv === "test") {
    return "test";
  }
  if (nodeEnv === "production") {
    return "production";
  }
  return "local";
}

function resolveScopedEnvFiles(nodeEnv: string, appEnv: string): string[] {
  if (appEnv === "local" || appEnv === nodeEnv) {
    return [`.env.${nodeEnv}.local`];
  }

  return [
    `.env.${nodeEnv}.${appEnv}`,
    `.env.${nodeEnv}.${appEnv}.local`,
  ];
}

function loadEnvFileIfExists(fileName: string, lockedKeys: Set<string>): boolean {
  const envPath = resolveEnvPath(fileName);
  if (!fs.existsSync(envPath)) {
    return false;
  }
  const content = fs.readFileSync(envPath, "utf8");
  const parsed = dotenv.parse(content);
  for (const [key, value] of Object.entries(parsed)) {
    if (lockedKeys.has(key)) {
      continue;
    }
    process.env[key] = value;
  }
  return true;
}

function envFileExists(fileName: string): boolean {
  return fs.existsSync(resolveEnvPath(fileName));
}

function resolveEnvPath(fileName: string): string {
  return path.resolve(process.cwd(), fileName);
}

function assertLegacyLocalNotPresent(nodeEnv: string, appEnv: string): void {
  const legacyLocal = ".env.local";
  if (!envFileExists(legacyLocal)) {
    return;
  }
  throw new Error(
    `[env] "${legacyLocal}" is no longer supported. Move values into "${expectedLocalEnvFilename(nodeEnv, appEnv)}" and remove "${legacyLocal}".`
  );
}
