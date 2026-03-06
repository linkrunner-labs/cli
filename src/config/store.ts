import Conf from "conf";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { ProjectConfigSchema, type ProjectConfig } from "../types/index.js";
import { debug } from "../utils/debug.js";

interface GlobalConfig {
  authToken?: string;
  cliToken?: string;
  email?: string;
  environment?: "production" | "staging";
}

const globalConfig = new Conf<GlobalConfig>({
  projectName: "linkrunner",
  schema: {
    authToken: { type: "string" },
    cliToken: { type: "string" },
    email: { type: "string" },
    environment: {
      type: "string",
      enum: ["production", "staging"],
      default: "production",
    },
  },
});

export function getAuthToken(): string | undefined {
  // Precedence: env var > cliToken > (legacy) authToken
  const envToken = process.env.LINKRUNNER_TOKEN;
  if (envToken) {
    debug("auth token source: LINKRUNNER_TOKEN env var");
    return envToken;
  }
  const cliToken = globalConfig.get("cliToken");
  if (cliToken) {
    debug("auth token source: CLI token (stored)");
    return cliToken;
  }
  const authToken = globalConfig.get("authToken");
  if (authToken) {
    debug("auth token source: legacy auth token");
    return authToken;
  }
  debug("no auth token found");
  return undefined;
}

export function setAuthToken(token: string, email: string): void {
  globalConfig.set("authToken", token);
  globalConfig.set("email", email);
}

export function setCliToken(token: string, email: string): void {
  globalConfig.set("cliToken", token);
  globalConfig.set("email", email);
}

export function clearCliToken(): void {
  globalConfig.delete("cliToken");
}

export function getEmail(): string | undefined {
  return globalConfig.get("email");
}

export function isAuthenticated(): boolean {
  return (
    !!process.env.LINKRUNNER_TOKEN ||
    !!globalConfig.get("cliToken") ||
    !!globalConfig.get("authToken")
  );
}

export function hasLegacyAuth(): boolean {
  return !globalConfig.get("cliToken") && !!globalConfig.get("authToken");
}

export function clearAuth(): void {
  globalConfig.delete("authToken");
  globalConfig.delete("cliToken");
  globalConfig.delete("email");
}

let envOverride: "production" | "staging" | undefined;

export function getEnvironment(): "production" | "staging" {
  return envOverride ?? globalConfig.get("environment") ?? "production";
}

export function setEnvironment(env: "production" | "staging"): void {
  globalConfig.set("environment", env);
}

export function overrideEnvironment(env: "production" | "staging"): void {
  envOverride = env;
}

const PROJECT_CONFIG_FILENAME = ".linkrunner.json";

function findProjectConfigPath(startDir?: string): string | null {
  let current = startDir ?? process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = join(current, PROJECT_CONFIG_FILENAME);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function getProjectConfig(startDir?: string): ProjectConfig | null {
  const configPath = findProjectConfigPath(startDir);
  if (!configPath) return null;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    const result = ProjectConfigSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

export function getProjectConfigPath(startDir?: string): string | null {
  return findProjectConfigPath(startDir);
}

export function saveProjectConfig(config: ProjectConfig, dir?: string): string {
  const targetDir = dir ?? process.cwd();
  const configPath = join(targetDir, PROJECT_CONFIG_FILENAME);

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  return configPath;
}
