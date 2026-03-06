import { apiGet, apiPost, type ApiResponse } from "./client.js";

interface Project {
  id: number;
  name: string;
  company: string;
  app_store_link: string | null;
  play_store_link: string | null;
  website: string | null;
  custom_uri: string | null;
  domains: Array<{ id: number; domain: string }>;
  tokens: Array<{ id: number; token: string; type: string }>;
}

interface ProjectToken {
  id: number;
  token: string;
  project_id: number;
  type: string;
  valid: boolean;
}

interface SDKCredential {
  id: number;
  created_at: string;
  updated_at: string;
  active: boolean;
  key_id: string;
  secret_key: string;
  platform: "ANDROID" | "IOS";
}

interface BillingAccount {
  id: number;
  name: string;
}

interface PreCreateCheckResponse {
  hasAdminBillingAccounts: boolean;
  billingAccounts: BillingAccount[];
}

interface CreateProjectParams {
  name: string;
  company: string;
  app_store_link?: string;
  play_store_link?: string;
  website?: string;
  custom_uri?: string;
  timezone?: string;
  billing_account_id?: number;
  create_new_billing_account?: boolean;
  billing_currency?: string;
}

export async function getProjects(): Promise<ApiResponse<Project[]>> {
  return apiGet<Project[]>("/project");
}

export async function getProjectToken(
  projectId: number
): Promise<ApiResponse<ProjectToken>> {
  return apiGet<ProjectToken>(`/project/token?project_id=${projectId}`);
}

export async function getSDKCredentials(
  projectId: number
): Promise<ApiResponse<SDKCredential[]>> {
  return apiGet<SDKCredential[]>(
    `/project/sdk-credentials?project_id=${projectId}`
  );
}

export async function createSDKCredentials(
  projectId: number,
  platform: "ANDROID" | "IOS"
): Promise<ApiResponse<SDKCredential>> {
  return apiPost<SDKCredential>("/project/sdk-credentials", {
    project_id: projectId,
    platform,
  });
}

export async function preCreateCheck(): Promise<
  ApiResponse<PreCreateCheckResponse>
> {
  return apiGet<PreCreateCheckResponse>("/project/pre-create-check");
}

export async function createProject(
  params: CreateProjectParams
): Promise<ApiResponse<Project>> {
  return apiPost<Project>("/project", params);
}

export type {
  Project,
  ProjectToken,
  SDKCredential,
  BillingAccount,
  PreCreateCheckResponse,
  CreateProjectParams,
};
