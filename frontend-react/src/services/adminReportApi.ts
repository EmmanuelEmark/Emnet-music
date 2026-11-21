import { adminRequest } from "./adminApi";

// ==========================================
// REPORT TYPES
// ==========================================

export type ReportStatus =
  | "pending"
  | "reviewing"
  | "resolved"
  | "dismissed";

export type ReportTargetType =
  | "artist"
  | "song"
  | "release"
  | "video";

export type ReportUser = {
  _id: string;
  fullName: string;
  email: string;
  role: string;
};

export type AdminReport = {
  _id: string;

  targetType: ReportTargetType;
  targetId: string;

  reason: string;
  description?: string;

  status: ReportStatus;

  reportedBy?: ReportUser | string | null;
  reviewedBy?: ReportUser | string | null;

  reviewedAt?: string | null;

  resolutionReason?: string;
  closedAt?: string | null;

  createdAt: string;
  updatedAt?: string;
};

export type ReportFilters = {
  status?: string;
  targetType?: string;
  reason?: string;
  targetId?: string;
  page?: number;
  limit?: number;
};

export type ReportListResponse = {
  success: boolean;
  count: number;
  totalReports: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  reports: AdminReport[];
};

type ReportActionResponse = {
  success: boolean;
  message: string;
  report?: AdminReport;
};

// ==========================================
// GET REPORTS
// ==========================================

export async function getAdminReports(
  filters: ReportFilters = {},
  signal?: AbortSignal
): Promise<ReportListResponse> {
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

  return adminRequest<ReportListResponse>(
    `/api/reports?${params.toString()}`,
    { signal }
  );
}

// ==========================================
// MARK REPORT AS REVIEWING
// ==========================================

export async function reviewReport(
  reportId: string,
  reason: string
): Promise<ReportActionResponse> {
  return adminRequest<ReportActionResponse>(
    `/api/reports/${encodeURIComponent(reportId)}/review`,
    {
      method: "PATCH",

      body: JSON.stringify({
        reason,
      }),
    }
  );
}

// ==========================================
// CLOSE REPORT
// ==========================================

export async function closeReport(
  reportId: string,
  status: "resolved" | "dismissed",
  resolutionReason: string
): Promise<ReportActionResponse> {
  return adminRequest<ReportActionResponse>(
    `/api/reports/${encodeURIComponent(reportId)}/close`,
    {
      method: "PATCH",

      body: JSON.stringify({
        status,
        resolutionReason,
      }),
    }
  );
}