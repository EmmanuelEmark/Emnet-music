import { adminRequest } from "./adminApi";

// ==========================================
// ADMINISTRATOR TYPES
// ==========================================

export type Administrator = {
  _id: string;
  fullName: string;
  email: string;
  role: "admin";
  accountStatus: "active" | "suspended" | "disabled";
  emailVerified: boolean;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
  roleAssignedAt?: string | null;
  accountStatusReason?: string;
  accountStatusUpdatedAt?: string | null;
};

export type AdministratorAction =
  | "suspend"
  | "reactivate"
  | "remove-role";

type AdministratorsResponse = {
  success: boolean;
  count?: number;
  admins: Administrator[];
};

type AdministratorActionResponse = {
  success: boolean;
  message: string;
  user?: Administrator;
};

// ==========================================
// GET ADMINISTRATORS
// ==========================================

export async function getAdministrators(
  signal?: AbortSignal
): Promise<Administrator[]> {
  const response =
    await adminRequest<AdministratorsResponse>(
      "/api/admin",
      { signal }
    );

  return response.admins.filter(
    (administrator) =>
      administrator.role === "admin"
  );
}

// ==========================================
// ADMINISTRATOR MANAGEMENT ACTIONS
// ==========================================

export async function performAdministratorAction(
  adminId: string,
  action: AdministratorAction,
  reason: string
): Promise<AdministratorActionResponse> {
  return adminRequest<AdministratorActionResponse>(
    `/api/admin/${encodeURIComponent(adminId)}/${action}`,
    {
      method: "PATCH",

      body: JSON.stringify({
        reason,
      }),
    }
  );
}

// ==========================================
// PROMOTE EXISTING USER TO ADMIN
// ==========================================

export async function promoteUserToAdmin(
  userId: string,
  reason: string
): Promise<AdministratorActionResponse> {
  return adminRequest<AdministratorActionResponse>(
    `/api/admin/users/${encodeURIComponent(userId)}/promote`,
    {
      method: "PATCH",

      body: JSON.stringify({
        reason,
      }),
    }
  );
}