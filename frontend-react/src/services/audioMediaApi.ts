
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

type MediaResponse = {
  success?: boolean;
  message?: string;
  playbackUrl?: string;
  mediaUrl?: string;
};

async function getMedia(
  path: string,
  signal?: AbortSignal
): Promise<MediaResponse> {
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    { signal, cache: "no-store" }
  );

  const data: MediaResponse = await response.json();

  if (!response.ok || data.success !== true) {
    throw new Error(
      data.message || "Media is unavailable."
    );
  }

  return data;
}

export async function getSongPlaybackUrl(
  songId: string,
  signal?: AbortSignal
): Promise<string> {
  const result = await getMedia(
    `/api/media/songs/${encodeURIComponent(songId)}/play`,
    signal
  );

  const url = result.playbackUrl || result.mediaUrl;

  if (!url) {
    throw new Error("No audio playback URL returned.");
  }

  return url;
}

export async function getReleaseArtworkUrl(
  releaseId: string,
  signal?: AbortSignal
): Promise<string> {
  const result = await getMedia(
    `/api/media/releases/${encodeURIComponent(releaseId)}/artwork`,
    signal
  );

  if (!result.mediaUrl) {
    throw new Error("Artwork is unavailable.");
  }

  return result.mediaUrl;
}

export async function getIsSongLiked(
  songId: string,
  signal?: AbortSignal
): Promise<boolean> {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) return false;

  const response = await fetch(
    `${API_BASE_URL}/api/listener/likes`,
    {
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Unable to load liked songs.");
  }

  const data: unknown = await response.json();

  const payload =
    data && typeof data === "object"
      ? data as Record<string, unknown>
      : {};

  const songs = Array.isArray(payload.songs)
    ? payload.songs
    : [];

  return songs.some((value: unknown) => {
    if (typeof value === "string") {
      return value === songId;
    }

    if (!value || typeof value !== "object") {
      return false;
    }

    const song = value as Record<string, unknown>;

    return String(song._id || song.id || "") === songId;
  });
}

export async function setSongLiked(
  songId: string,
  liked: boolean
): Promise<void> {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error("Please log in first.");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/listener/likes/${encodeURIComponent(songId)}`,
    {
      method: liked ? "POST" : "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const data: { message?: string } =
      await response.json().catch(() => ({}));

    throw new Error(
      data.message || "Unable to update liked song."
    );
  }
}
