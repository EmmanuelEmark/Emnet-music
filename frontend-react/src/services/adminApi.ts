const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

// ==========================================
// DASHBOARD TYPES
// ==========================================

export type AdminRole = "admin" | "superadmin";

export type UserStatistics = {
  total: number;
  listeners: number;
  artists: number;
  distributors: number;
  active: number;
  suspended: number;
  disabled: number;
  verified: number;
  unverified: number;
  newLast7Days: number;
  newLast30Days: number;
};

export type ArtistStatistics = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  suspended: number;
  publiclyAvailable: number;
  verified: number;
  featured: number;
  hidden: number;
  takenDown: number;
};

export type ContentStatistics = {
  total: number;
  published: number;
  pending: number;
  rejected: number;
  visible: number;
  hidden: number;
  takenDown: number;
  publiclyAvailable: number;
  blockedByParentRelease?: number;
};

export type ReportStatistics = {
  total: number;
  pending: number;
  reviewing: number;
  resolved: number;
  dismissed: number;
  open: number;
};

export type EngagementStatistics = {
  totalPlays: number;
  totalViews: number;
  totalSongLikes: number;
  totalVideoLikes: number;
  totalArtistFollows: number;
  playsLast7Days: number;
  viewsLast7Days: number;
  playsLast30Days: number;
  viewsLast30Days: number;
};

export type AdministratorStatistics = {
  total: number;
  admins: number;
  superAdmins: number;
  activeAdmins: number;
  suspendedAdmins: number;
  disabledAdmins: number;
};

export type EngagementPoint = {
  date: string;
  plays: number;
  views: number;
};

export type ArtistApplication = {
  _id: string;
  stageName: string;
  country: string;
  profileImage?: string;
  profileImageUploadId?: string;
  approvalStatus: string;
  createdAt: string;
};

export type RecentReport = {
  _id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
};

export type AdminActivity = {
  _id: string;
  actorId: string;
  actorName: string;
  actorRole: AdminRole;
  action: string;
  targetType: string;
  targetId?: string;
  targetName?: string;
  outcome: string;
  createdAt: string;
};

export type DashboardOverview = {
  administrator: {
    id: string;
    fullName: string;
    role: AdminRole;
  };

  stats: {
    users: UserStatistics;
    artists: ArtistStatistics;
    songs: ContentStatistics;
    releases: ContentStatistics;
    videos: ContentStatistics;
    reports: ReportStatistics;
    engagement: EngagementStatistics;
    administrators?: AdministratorStatistics;
  };

  charts: {
    engagement: EngagementPoint[];
  };

  recent: {
    artistApplications: ArtistApplication[];
    reports: RecentReport[];
    adminActivities?: AdminActivity[];
  };

  generatedAt: string;
  reportingTimezone: string;
};

type DashboardResponse = {
  success: true;
  dashboard: DashboardOverview;
};

// ==========================================
// API ERROR
// ==========================================

export class AdminApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

// ==========================================
// AUTHENTICATED ADMIN REQUEST
// ==========================================

export async function adminRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new AdminApiError(
      "Please sign in to your administrative account.",
      401
    );
  }

  if (!path.startsWith("/api/")) {
    throw new Error("Invalid API request path.");
  }

  const headers = new Headers(options.headers);

  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  if (options.body !== undefined && options.body !== null) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers,
      cache: "no-store",
      redirect: "error",
    }
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success !== true) {
    throw new AdminApiError(
      typeof payload?.message === "string"
        ? payload.message
        : `Administrative request failed (${response.status}).`,
      response.status
    );
  }

  return payload as T;
}

// ==========================================
// DASHBOARD OVERVIEW
// ==========================================

export async function getAdminDashboardOverview(
  signal?: AbortSignal
): Promise<DashboardOverview> {
  const response = await adminRequest<DashboardResponse>(
    "/api/admin/dashboard/overview",
    { signal }
  );

  return response.dashboard;
}