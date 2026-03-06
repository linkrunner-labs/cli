import Conf from "conf";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { ProjectConfigSchema, type ProjectConfig } from "../types/index.js";

interface GlobalConfig {
  authToken?: string;
  email?: string;
  environment?: "production" | "staging";
}

const globalConfig = new Conf<GlobalConfig>({
  projectName: "linkrunner",
  schema: {
    authToken: { type: "string" },
    email: { type: "string" },
    environment: { type: "string", enum: ["production", "staging"], default: "production" },
  },
});

export function getAuthToken(): string | undefined {
  return globalConfig.get("authToken");
}

export function setAuthToken(token: string, email: string): void {
  globalConfig.set("authToken", token);
  globalConfig.set("email", email);
}

export function getEmail(): string | undefined {
  return globalConfig.get("email");
}

export function isAuthenticated(): boolean {
  return !!globalConfig.get("authToken");
}

export function clearAuth(): void {
  globalConfig.delete("authToken");
  globalConfig.delete("email");
}

export function getEnvironment(): "production" | "staging" {
  return globalConfig.get("environment") ?? "production";
}

export function setEnvironment(env: "production" | "staging"): void {
  globalConfig.set("environment", env);
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

export function saveProjectConfig(
  config: ProjectConfig,
  dir?: string
): string {
  const targetDir = dir ?? process.cwd();
  const configPath = join(targetDir, PROJECT_CONFIG_FILENAME);

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  return configPath;
}
