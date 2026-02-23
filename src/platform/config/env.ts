import fs from "fs";
import path from "path";
import dotenv from "dotenv";

type LoadEnvironmentResult = {
  nodeEnv: string;
  loadedFiles: string[];
};

let envLoaded = false;
let cachedResult: LoadEnvironmentResult | null = null;

export function loadEnvironment(defaultNodeEnv = "development"): LoadEnvironmentResult {
  if (envLoaded && cachedResult) {
    return cachedResult;
  }

  const nodeEnv = normalizeNodeEnv(process.env.NODE_ENV, defaultNodeEnv);
  process.env.NODE_ENV = nodeEnv;
  const lockedKeys = new Set(Object.keys(process.env));

  const loadedFiles: string[] = [];

  const baseFiles = [".env", `.env.${nodeEnv}`];
  for (const fileName of baseFiles) {
    if (!loadEnvFileIfExists(fileName, lockedKeys)) {
      continue;
    }
    loadedFiles.push(fileName);
  }

  const scopedLocal = `.env.${nodeEnv}.local`;
  const hasScopedLocal = envFileExists(scopedLocal);
  assertLegacyLocalNotPresent(nodeEnv);

  if (hasScopedLocal) {
    loadEnvFileIfExists(scopedLocal, lockedKeys);
    loadedFiles.push(scopedLocal);
  }

  cachedResult = {
    nodeEnv,
    loadedFiles,
  };
  envLoaded = true;
  return cachedResult;
}

export function expectedLocalEnvFilename(nodeEnv: string): string {
  return `.env.${normalizeNodeEnv(nodeEnv, "development")}.local`;
}

function normalizeNodeEnv(rawNodeEnv: string | undefined, fallback: string): string {
  const normalized = String(rawNodeEnv ?? "").trim();
  if (normalized.length > 0) {
    return normalized;
  }
  return fallback;
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

function assertLegacyLocalNotPresent(nodeEnv: string): void {
  const legacyLocal = ".env.local";
  if (!envFileExists(legacyLocal)) {
    return;
  }
  throw new Error(
    `[env] "${legacyLocal}" is no longer supported. Move values into ".env.${nodeEnv}.local" and remove "${legacyLocal}".`
  );
}
