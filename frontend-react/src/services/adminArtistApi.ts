import { adminRequest } from "./adminApi";

// ==========================================
// ARTIST TYPES
// ==========================================

export type ArtistApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";

export type ArtistVisibilityStatus =
  | "visible"
  | "hidden"
  | "takedown";

export type AdminArtist = {
  _id: string;
  stageName: string;
  bio?: string;
  country: string;
  profileImage?: string;
  profileImageUploadId?: string;
  coverImage?: string;
  coverImageUploadId?: string;

  approvalStatus: ArtistApprovalStatus;
  visibilityStatus?: ArtistVisibilityStatus | null;

  verified: boolean;
  featured: boolean;
  followersCount: number;
  publiclyAvailable: boolean;

  moderationReason?: string;
  moderatedAt?: string;

  createdAt: string;
  updatedAt?: string;

  userId?: {
    _id: string;
    fullName: string;
    email: string;
    role: string;
    accountStatus: string;
    emailVerified: boolean;
  } | null;
};

export type ArtistFilters = {
  q?: string;
  approvalStatus?: string;
  visibilityStatus?: string;
  verified?: string;
  featured?: string;
  page?: number;
  limit?: number;
};

export type ArtistListResponse = {
  success: boolean;
  count: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  artists: AdminArtist[];
};

export type ArtistAction =
  | "approve"
  | "reject"
  | "verify"
  | "unverify"
  | "feature"
  | "unfeature"
  | "suspend"
  | "restore"
  | "hide"
  | "restore-profile"
  | "takedown"
  | "reverse-takedown";

type ArtistActionResponse = {
  success: boolean;
  message: string;
  artist?: AdminArtist;
};

// ==========================================
// GET ADMINISTRATIVE ARTISTS
// ==========================================

export async function getAdminArtists(
  filters: ArtistFilters = {},
  signal?: AbortSignal
): Promise<ArtistListResponse> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(
    ([key, value]) => {
      if (
        value !== undefined &&
        value !== "" &&
        value !== "all"
      ) {
        params.set(key, String(value));
      }
    }
  );

  return adminRequest<ArtistListResponse>(
    `/api/admin/content/artists?${params.toString()}`,
    { signal }
  );
}

// ==========================================
// ARTIST MANAGEMENT ACTIONS
// ==========================================

export async function performArtistAction(
  artistId: string,
  action: ArtistAction,
  reason: string
): Promise<ArtistActionResponse> {
  const id = encodeURIComponent(artistId);

  const applicationActions: ArtistAction[] = [
    "approve",
    "reject",
    "feature",
    "unfeature",
  ];

  const path = applicationActions.includes(action)
    ? `/api/artists/${id}/${action}`
    : `/api/admin/moderation/artists/${id}/${action}`;

  return adminRequest<ArtistActionResponse>(
    path,
    {
      method: "PATCH",

      body: JSON.stringify({
        reason,
      }),
    }
  );
}