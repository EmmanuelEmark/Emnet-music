
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

// ==========================================
// TYPES
// ==========================================

export type ArtistMediaPreview = {
  mediaUrl: string;

  expiresIn: number;

  expiresAt: number;

  source: "r2";
};

export type ArtistPreviewKind =
  | "audio"
  | "artwork"
  | "video"
  | "thumbnail";

type PreviewApiResponse = {
  success: boolean;

  message?: string;

  source?: string;

  mediaUrl?: string;

  previewUrl?: string;

  playbackUrl?: string;

  expiresIn?: number;
};

// ==========================================
// VALIDATE CONTENT ID
// ==========================================

function validateContentId(
  contentId: string
): void {
  if (!/^[a-f0-9]{24}$/i.test(contentId)) {
    throw new Error(
      "Invalid media content ID."
    );
  }
}

// ==========================================
// AUTHENTICATED PREVIEW REQUEST
// ==========================================

async function requestPreview(
  path: string,

  signal?: AbortSignal
): Promise<ArtistMediaPreview> {

  // Retrieve current authentication token.

  const token =
    sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error(
      "Please sign in again to preview your media."
    );
  }

  // Record request time for conservative
  // signed URL expiration calculation.

  const requestedAt = Date.now();

  // ========================================
  // REQUEST PRIVATE MEDIA URL
  // ========================================

  const response = await fetch(
    `${API_BASE_URL}${path}`,

    {
      method: "GET",

      cache: "no-store",

      signal,

      headers: {
        Authorization: `Bearer ${token}`,

        Accept: "application/json",
      },
    }
  );

  const result: PreviewApiResponse | null =
    await response
      .json()
      .catch(() => null);

  // ========================================
  // HANDLE AUTHENTICATION ERRORS
  // ========================================

  if (response.status === 401) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  // ========================================
  // HANDLE AUTHORIZATION ERRORS
  // ========================================

  if (response.status === 403) {
    throw new Error(
      result?.message ||
      "You do not have permission to preview this media."
    );
  }

  // ========================================
  // HANDLE MISSING MEDIA
  // ========================================

  if (response.status === 404) {
    throw new Error(
      result?.message ||
      "The saved media file is unavailable."
    );
  }

  // ========================================
  // HANDLE OTHER REQUEST ERRORS
  // ========================================

  if (
    !response.ok ||
    !result?.success
  ) {
    throw new Error(
      result?.message ||
      "Unable to retrieve the media preview."
    );
  }

  // ========================================
  // EXTRACT SIGNED MEDIA URL
  // ========================================

  const mediaUrl =
    result.mediaUrl ||
    result.previewUrl ||
    result.playbackUrl;

  if (
    typeof mediaUrl !== "string" ||
    !mediaUrl
  ) {
    throw new Error(
      "The server did not return a valid preview URL."
    );
  }

  // ========================================
  // VERIFY MEDIA SOURCE
  // ========================================

  if (result.source !== "r2") {
    throw new Error(
      "Unexpected media preview source."
    );
  }

  // Only accept secure HTTPS media URLs.

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(mediaUrl);

  } catch {
    throw new Error(
      "The preview URL is invalid."
    );
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error(
      "The preview URL is not secure."
    );
  }

  // ========================================
  // VALIDATE URL EXPIRATION
  // ========================================

  const expiresIn = result.expiresIn;

  if (
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new Error(
      "The server returned an invalid preview expiration time."
    );
  }

  // ========================================
  // RETURN SECURE PREVIEW INFORMATION
  // ========================================

  return {
    mediaUrl,

    expiresIn,

    expiresAt:
      requestedAt + expiresIn * 1000,

    source: "r2",
  };
}

// ==========================================
// GET PRIVATE SONG AUDIO PREVIEW
// ==========================================

export async function getArtistSongPreview(
  songId: string,

  signal?: AbortSignal
): Promise<ArtistMediaPreview> {
  validateContentId(songId);

  return requestPreview(
    `/api/media/artist/songs/${encodeURIComponent(songId)}/preview`,

    signal
  );
}

// ==========================================
// GET PRIVATE RELEASE ARTWORK PREVIEW
// ==========================================

export async function getArtistReleaseArtworkPreview(
  releaseId: string,

  signal?: AbortSignal
): Promise<ArtistMediaPreview> {
  validateContentId(releaseId);

  return requestPreview(
    `/api/media/artist/releases/${encodeURIComponent(releaseId)}/artwork`,

    signal
  );
}

// ==========================================
// GET PRIVATE VIDEO PREVIEW
// ==========================================

export async function getArtistVideoPreview(
  videoId: string,

  signal?: AbortSignal
): Promise<ArtistMediaPreview> {
  validateContentId(videoId);

  return requestPreview(
    `/api/media/artist/videos/${encodeURIComponent(videoId)}/preview`,

    signal
  );
}

// ==========================================
// GET PRIVATE VIDEO THUMBNAIL PREVIEW
// ==========================================

export async function getArtistVideoThumbnailPreview(
  videoId: string,

  signal?: AbortSignal
): Promise<ArtistMediaPreview> {
  validateContentId(videoId);

  return requestPreview(
    `/api/media/artist/videos/${encodeURIComponent(videoId)}/thumbnail`,

    signal
  );
}

// ==========================================
// UNIVERSAL ARTIST MEDIA PREVIEW
// ==========================================

export async function getArtistMediaPreview(
  kind: ArtistPreviewKind,

  contentId: string,

  signal?: AbortSignal
): Promise<ArtistMediaPreview> {

  switch (kind) {
    case "audio":
      return getArtistSongPreview(
        contentId,
        signal
      );

    case "artwork":
      return getArtistReleaseArtworkPreview(
        contentId,
        signal
      );

    case "video":
      return getArtistVideoPreview(
        contentId,
        signal
      );

    case "thumbnail":
      return getArtistVideoThumbnailPreview(
        contentId,
        signal
      );

    default:
      throw new Error(
        "Unsupported media preview type."
      );
  }
}

// ==========================================
// CHECK WHETHER PREVIEW IS EXPIRING
//
// Default safety margin: 30 seconds.
// ==========================================

export function isArtistPreviewExpiring(
  preview: ArtistMediaPreview,

  safetySeconds = 30
): boolean {
  return (
    preview.expiresAt <=
    Date.now() + safetySeconds * 1000
  );
}

// ==========================================
// RENEW EXPIRED OR EXPIRING PREVIEW
// ==========================================

export async function renewArtistMediaPreview(
  kind: ArtistPreviewKind,

  contentId: string,

  currentPreview?: ArtistMediaPreview | null,

  signal?: AbortSignal
): Promise<ArtistMediaPreview> {

  // Reuse a preview that is still valid
  // for this content and media type.

  if (
    currentPreview &&
    !isArtistPreviewExpiring(currentPreview)
  ) {
    return currentPreview;
  }

  // Request a fresh signed URL.

  return getArtistMediaPreview(
    kind,

    contentId,

    signal
  );
}
