import { z } from "zod";

export const PROJECT_TYPES = [
  "flutter",
  "react-native",
  "expo",
  "ios",
  "android",
  "capacitor",
  "web",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export interface ValidationResult {
  id: string;
  name: string;
  status: "pass" | "warn" | "error";
  severity: "error" | "warn";
  message: string;
  fix?: string;
  autoFixable: boolean;
  docsUrl?: string;
}

export interface ProjectPaths {
  root: string;
  androidManifest?: string;
  buildGradle?: string;
  gradleWrapper?: string;
  settingsGradle?: string;
  infoPlist?: string;
  podfile?: string;
  entitlements?: string;
  pubspec?: string;
  packageJson?: string;
  appJson?: string;
  appConfig?: string;
}

export interface DetectedProject {
  type: ProjectType;
  paths: ProjectPaths;
  sdkVersion?: string;
}

export const ProjectConfigSchema = z.object({
  project_token: z.string(),
  project_id: z.string(),
  project_name: z.string(),
  platforms: z.array(z.enum(["android", "ios", "web"])),
  deep_link_domain: z.string(),
  android: z
    .object({
      package_name: z.string(),
      sha256_cert_fingerprints: z.array(z.string()).optional(),
    })
    .optional(),
  ios: z
    .object({
      bundle_id: z.string(),
      team_id: z.string().optional(),
      app_prefix: z.string().optional(),
    })
    .optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
