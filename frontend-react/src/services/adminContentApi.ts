import { adminRequest } from "./adminApi";

// ==========================================
// CONTENT TYPES
// ==========================================

export type ContentType =
  | "songs"
  | "releases"
  | "videos";

export type ContentStatus =
  | "pending"
  | "approved"
  | "rejected";

export type ContentVisibility =
  | "visible"
  | "hidden"
  | "takedown";

export type ContentAction =
  | "hide"
  | "restore"
  | "takedown"
  | "reverse-takedown";

export type ContentArtist = {
  _id: string;
  stageName: string;
  verified?: boolean;
  approvalStatus?: string;
  visibilityStatus?: string;
};

export type ContentRelease = {
  _id: string;
  title: string;
  releaseType: string;
  status: string;
  visibilityStatus?: string;
  releaseDate?: string;
};

export type AdminContent = {
  _id: string;
  title: string;

  status: ContentStatus;
  visibilityStatus?: ContentVisibility | null;

  primaryArtists?: ContentArtist[];
  featuredArtists?: ContentArtist[];
  collaboratingArtists?: ContentArtist[];

  releaseId?: ContentRelease | null;

  releaseType?: string;
  releaseDate?: string;

  genre?: string;
  duration?: number;
  trackNumber?: number;
  isrc?: string;

  description?: string;
  videoType?: string;

  playCount?: number;
  viewCount?: number;

  publiclyAvailable: boolean;
  parentReleaseAvailable?: boolean;

  moderationReason?: string;
  moderatedAt?: string;

  createdAt: string;
  updatedAt?: string;
  publishedAt?: string;
};

export type ContentFilters = {
  q?: string;
  status?: string;
  visibilityStatus?: string;
  artistId?: string;
  releaseId?: string;
  releaseType?: string;
  videoType?: string;
  page?: number;
  limit?: number;
};

export type ContentListResponse = {
  success: boolean;
  count: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  items: AdminContent[];
};

type RawContentResponse = Omit<
  ContentListResponse,
  "items"
> & {
  songs?: AdminContent[];
  releases?: AdminContent[];
  videos?: AdminContent[];
};

type ContentActionResponse = {
  success: boolean;
  message: string;
  changed?: boolean;
  alreadyUpdated?: boolean;
  content?: AdminContent;
};

// ==========================================
// GET ADMINISTRATIVE CONTENT
// ==========================================

export async function getAdminContent(
  type: ContentType,
  filters: ContentFilters = {},
  signal?: AbortSignal
): Promise<ContentListResponse> {
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

  const response =
    await adminRequest<RawContentResponse>(
      `/api/admin/content/${type}?${params.toString()}`,
      { signal }
    );

  return {
    success: response.success,
    count: response.count,
    total: response.total,
    page: response.page,
    limit: response.limit,
    totalPages: response.totalPages,
    hasNextPage: response.hasNextPage,
    hasPreviousPage: response.hasPreviousPage,
    items: response[type] || [],
  };
}

// ==========================================
// PERFORM CONTENT MODERATION ACTION
// ==========================================

export async function moderateAdminContent(
  type: ContentType,
  contentId: string,
  action: ContentAction,
  reason: string
): Promise<ContentActionResponse> {
  return adminRequest<ContentActionResponse>(
    `/api/admin/moderation/${type}/${encodeURIComponent(contentId)}/${action}`,
    {
      method: "PATCH",

      body: JSON.stringify({
        reason,
      }),
    }
  );
}