import type { ProjectConfig, ProjectType } from "../types/index.js";
import type { Project, SDKCredential } from "../api/project.js";
import { saveProjectConfig } from "../config/store.js";

interface GenerateConfigParams {
  project: Project;
  projectToken: string;
  projectType: ProjectType;
  sdkCredentials: SDKCredential[];
}

function derivePlatforms(projectType: ProjectType): Array<"android" | "ios" | "web"> {
  switch (projectType) {
    case "flutter":
    case "react-native":
    case "expo":
    case "capacitor":
      return ["android", "ios"];
    case "android":
      return ["android"];
    case "ios":
      return ["ios"];
    case "web":
      return ["web"];
  }
}

function deriveDeepLinkDomain(project: Project): string {
  if (project.domains && project.domains.length > 0) {
    return project.domains[0]!.domain;
  }
  return "";
}

export function generateProjectConfig(params: GenerateConfigParams): ProjectConfig {
  const { project, projectToken, projectType, sdkCredentials: _sdkCredentials } = params;
  const platforms = derivePlatforms(projectType);
  const deepLinkDomain = deriveDeepLinkDomain(project);

  const config: ProjectConfig = {
    project_token: projectToken,
    project_id: String(project.id),
    project_name: project.name,
    platforms,
    deep_link_domain: deepLinkDomain,
  };

  return config;
}

export function saveConfig(config: ProjectConfig, dir?: string): string {
  return saveProjectConfig(config, dir);
}
