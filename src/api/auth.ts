import { apiPost, type ApiResponse } from "./client.js";

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

export async function sendMagicLink(email: string): Promise<ApiResponse<MagicLinkSendResponse>> {
  return apiPost<MagicLinkSendResponse>("/login/magic-link/send", { email });
}

export async function verifyMagicLink(token: string): Promise<ApiResponse<MagicLinkVerifyResponse>> {
  return apiPost<MagicLinkVerifyResponse>("/login/magic-link/verify", { token });
}

export type { MagicLinkSendResponse, MagicLinkVerifyResponse };
