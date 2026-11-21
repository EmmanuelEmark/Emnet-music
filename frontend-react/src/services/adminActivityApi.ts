import { adminRequest } from "./adminApi";

// ==========================================
// ACTIVITY TYPES
// ==========================================

export type ActivityOutcome =
  | "success"
  | "failed"
  | "denied";

export type ActivityActorRole =
  | "admin"
  | "superadmin";

export type ActivityTargetType =
  | "user"
  | "admin"
  | "artist"
  | "song"
  | "release"
  | "video"
  | "report"
  | "invitation"
  | "announcement"
  | "settings";

export type ActivityValue =
  | string
  | number
  | boolean
  | null;

export type AdminActivityRecord = {
  _id: string;

  actorId: string | {
    _id: string;
    fullName?: string;
    email?: string;
    role?: string;
  };

  actorName: string;
  actorRole: ActivityActorRole;

  action: string;

  targetType: ActivityTargetType;
  targetId?: string | null;
  targetName?: string;

  previousValues?: Record<string, ActivityValue>;
  newValues?: Record<string, ActivityValue>;

  reason?: string;
  outcome: ActivityOutcome;

  ipAddress?: string;
  requestMethod?: string;

  createdAt: string;
};

export type ActivityFilters = {
  actorRole?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  action?: string;
  outcome?: string;
  page?: number;
  limit?: number;
};

export type ActivityListResponse = {
  success: boolean;
  count: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  activities: AdminActivityRecord[];
};

// ==========================================
// GET ACTIVITY LOGS
// ==========================================

export async function getAdminActivities(
  filters: ActivityFilters = {},
  signal?: AbortSignal
): Promise<ActivityListResponse> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (
      value !== undefined &&
      value !== "" &&
      value !== "all"
    ) {
      params.set(key, String(value));
    }
  });

  // Support the existing activity response
  // field names without exposing raw documents.

  const response = await adminRequest<{
    success: boolean;
    count?: number;
    total?: number;
    totalActivities?: number;
    totalLogs?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    hasNextPage?: boolean;
    hasPreviousPage?: boolean;
    activities?: AdminActivityRecord[];
    logs?: AdminActivityRecord[];
  }>(
    `/api/admin/activity-logs?${params.toString()}`,
    { signal }
  );

  const activities =
    response.activities ?? response.logs;

  if (!Array.isArray(activities)) {
    throw new Error(
      "Unexpected activity logs response."
    );
  }

  const page = response.page ?? filters.page ?? 1;
  const limit = response.limit ?? filters.limit ?? 20;

  const total =
    response.total ??
    response.totalActivities ??
    response.totalLogs;

  if (typeof total !== "number") {
    throw new Error(
      "Activity log pagination information is unavailable."
    );
  }

  const totalPages =
    response.totalPages ??
    Math.ceil(total / limit);

  return {
    success: true,
    count: response.count ?? activities.length,
    total,
    page,
    limit,
    totalPages,

    hasNextPage:
      response.hasNextPage ?? page < totalPages,

    hasPreviousPage:
      response.hasPreviousPage ?? page > 1,

    activities,
  };
}

// ==========================================
// GET SINGLE ACTIVITY
// ==========================================

export async function getAdminActivityById(
  activityId: string,
  signal?: AbortSignal
): Promise<AdminActivityRecord> {
  const response = await adminRequest<{
    success: boolean;
    activity?: AdminActivityRecord;
    log?: AdminActivityRecord;
  }>(
    `/api/admin/activity-logs/${encodeURIComponent(activityId)}`,
    { signal }
  );

  const activity =
    response.activity ?? response.log;

  if (!activity) {
    throw new Error(
      "Activity record is unavailable."
    );
  }

  return activity;
}