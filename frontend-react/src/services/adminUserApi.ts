import { adminRequest } from "./adminApi";

// ==========================================
// USER TYPES
// ==========================================

export type PlatformUserRole =
  | "listener"
  | "artist"
  | "distributor";

export type AccountStatus =
  | "active"
  | "suspended"
  | "disabled";

export type PlatformUser = {
  _id: string;
  fullName: string;
  email: string;
  role: PlatformUserRole;
  accountStatus: AccountStatus;
  emailVerified: boolean;
  profileImage?: string;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
  accountStatusReason?: string;
  accountStatusUpdatedAt?: string | null;
};

type UsersResponse = {
  success: boolean;
  count: number;
  users: PlatformUser[];
};

type UserActionResponse = {
  success: boolean;
  message: string;
  user?: PlatformUser;
};

// ==========================================
// GET PLATFORM USERS
// ==========================================

export async function getPlatformUsers(
  signal?: AbortSignal
): Promise<PlatformUser[]> {
  const response =
    await adminRequest<UsersResponse>(
      "/api/admin/users",
      { signal }
    );

  return response.users.filter(
    (user) =>
      ["listener", "artist", "distributor"].includes(
        user.role
      )
  );
}

// ==========================================
// SUSPEND USER
// ==========================================

export async function suspendPlatformUser(
  userId: string,
  reason: string
): Promise<UserActionResponse> {
  return adminRequest<UserActionResponse>(
    `/api/admin/users/${encodeURIComponent(userId)}/suspend`,
    {
      method: "PATCH",

      body: JSON.stringify({
        reason,
      }),
    }
  );
}

// ==========================================
// REACTIVATE USER
// ==========================================

export async function reactivatePlatformUser(
  userId: string,
  reason: string
): Promise<UserActionResponse> {
  return adminRequest<UserActionResponse>(
    `/api/admin/users/${encodeURIComponent(userId)}/reactivate`,
    {
      method: "PATCH",

      body: JSON.stringify({
        reason,
      }),
    }
  );
}