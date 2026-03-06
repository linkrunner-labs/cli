import { apiPost, type ApiResponse } from "./client.js";
import { getEnvironment } from "../config/store.js";
import { API_BASE_URLS } from "../config/constants.js";

interface MagicLinkSendResponse {
  sent: boolean;
}

interface MagicLinkVerifyResponse {
  user: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    company: string;
  };
  token: string;
}

export async function sendMagicLink(
  email: string
): Promise<ApiResponse<MagicLinkSendResponse>> {
  return apiPost<MagicLinkSendResponse>("/login/magic-link/send", { email });
}

export async function verifyMagicLink(
  token: string
): Promise<ApiResponse<MagicLinkVerifyResponse>> {
  return apiPost<MagicLinkVerifyResponse>("/login/magic-link/verify", {
    token,
  });
}

// --- Device Auth Flow ---

interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
}

interface DeviceTokenResponse {
  token?: string;
  expires_at?: string;
  status?: string;
  user?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
}

interface VerifyCliTokenResponse {
  user: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
}

export async function initiateDeviceAuth(): Promise<
  ApiResponse<DeviceAuthResponse>
> {
  return apiPost<DeviceAuthResponse>("/cli/auth/device");
}

export async function pollDeviceToken(
  deviceCode: string
): Promise<{ status: number; data: DeviceTokenResponse; msg: string }> {
  const baseUrl = API_BASE_URLS[getEnvironment()];
  const res = await fetch(`${baseUrl}/api/cli/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code: deviceCode }),
  });

  const json = (await res.json()) as {
    msg: string;
    status: number;
    data: DeviceTokenResponse;
  };
  return { status: res.status, data: json.data, msg: json.msg };
}

export async function verifyCliToken(
  token: string
): Promise<ApiResponse<VerifyCliTokenResponse>> {
  const baseUrl = API_BASE_URLS[getEnvironment()];
  const res = await fetch(`${baseUrl}/api/cli/auth/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  const json = (await res.json()) as ApiResponse<VerifyCliTokenResponse>;
  if (!res.ok) {
    throw new Error(json.msg || "Token verification failed");
  }
  return json;
}

export type {
  MagicLinkSendResponse,
  MagicLinkVerifyResponse,
  DeviceAuthResponse,
  DeviceTokenResponse,
  VerifyCliTokenResponse,
};
