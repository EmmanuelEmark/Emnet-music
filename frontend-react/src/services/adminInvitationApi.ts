import { adminRequest } from "./adminApi";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

// ==========================================
// INVITATION TYPES
// ==========================================

export type InvitationStatus =
  | "pending"
  | "used"
  | "expired"
  | "revoked";

export type AdminInvitation = {
  id: string;
  fullName: string;
  email: string;
  expiresAt: string;
  createdAt?: string;
  used: boolean;
  usedAt?: string | null;
  status?: InvitationStatus;

  createdBy?: {
    _id: string;
    fullName: string;
    email: string;
  } | null;
};

export type CreatedInvitation = AdminInvitation & {
  invitationLink: string;
};

export type VerifiedInvitation = {
  fullName: string;
  email: string;
  expiresAt: string;
};

// ==========================================
// GET INVITATIONS
// ==========================================

export async function getAdminInvitations(
  signal?: AbortSignal
): Promise<AdminInvitation[]> {
  const response = await adminRequest<{
    success: boolean;
    invitations: AdminInvitation[];
  }>("/api/admin/invitations", { signal });

  return response.invitations;
}

// ==========================================
// CREATE INVITATION
// ==========================================

export async function createAdminInvitation(
  fullName: string,
  email: string
): Promise<CreatedInvitation> {
  const response = await adminRequest<{
    success: boolean;
    message: string;
    invitation: CreatedInvitation;
  }>("/api/admin/invitations", {
    method: "POST",
    body: JSON.stringify({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
    }),
  });

  return response.invitation;
}

// ==========================================
// PUBLIC INVITATION REQUEST
//
// Does not use an existing account token.
// ==========================================

async function invitationRequest<T>(
  token: string,
  options: RequestInit = {}
): Promise<T> {
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    throw new Error("Invalid invitation link.");
  }

  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/auth/admin-invite/${encodeURIComponent(token)}`,
    {
      ...options,
      headers,
      cache: "no-store",
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    }
  );

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.success !== true) {
    throw new Error(
      result?.message ||
      `Invitation request failed (${response.status}).`
    );
  }

  return result as T;
}

// ==========================================
// VERIFY INVITATION
// ==========================================

export async function verifyAdminInvitation(
  token: string,
  signal?: AbortSignal
): Promise<VerifiedInvitation> {
  const response = await invitationRequest<{
    success: boolean;
    invitation: VerifiedInvitation;
  }>(token, {
    method: "GET",
    signal,
  });

  return response.invitation;
}

// ==========================================
// ACCEPT INVITATION
// ==========================================

export async function acceptAdminInvitation(
  token: string,
  password: string,
  dateOfBirth: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return invitationRequest(token, {
    method: "POST",
    body: JSON.stringify({
      password,
      dateOfBirth,
    }),
  });
}