import { getAuthToken, getEnvironment } from "../config/store.js";
import { API_BASE_URLS } from "../config/constants.js";

interface ApiResponse<T = unknown> {
  msg: string;
  status: number;
  data: T;
}

class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getBaseUrl(): string {
  const env = getEnvironment();
  return API_BASE_URLS[env];
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: "https://dashboard.linkrunner.io",
  };

  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  const url = `${getBaseUrl()}${path}`;

  const res = await fetch(url, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    throw new ApiError(401, "Session expired. Run `lr login` to re-authenticate.");
  }

  const json = (await res.json()) as ApiResponse<T>;

  if (!res.ok) {
    throw new ApiError(res.status, json.msg || `Request failed with status ${res.status}`);
  }

  return json;
}

export async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  return request<T>("GET", path);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  return request<T>("POST", path, body);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
  return request<T>("PUT", path, body);
}

export async function apiDelete<T>(path: string): Promise<ApiResponse<T>> {
  return request<T>("DELETE", path);
}

export { ApiError };
export type { ApiResponse };
