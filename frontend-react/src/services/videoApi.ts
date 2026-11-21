
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

export type VideoArtist = {
  id: string;
  stageName: string;
  profileImage: string;
  verified: boolean;
};

export type MusicVideo = {
  id: string;
  title: string;
  videoType: string;
  videoUrl: string;
  videoUploadId: string;
  thumbnailUrl: string;
  thumbnailUploadId: string;
  duration: number;
  createdAt: string;
  primaryArtists: VideoArtist[];
  featuredArtists: VideoArtist[];
  linkedSongTitle: string;
  linkedSongGenre: string;
  linkedReleaseTitle: string;
};

function record(value: unknown): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function id(value: unknown): string {
  if (typeof value === "string") return value;
  return str(record(value)._id);
}

function normalizeArtist(value: unknown): VideoArtist {
  const item = record(value);

  return {
    id: id(item._id || item.id),
    stageName: str(item.stageName) || "Artist",
    profileImage: str(item.profileImage),
    verified: item.verified === true,
  };
}

export function normalizeVideo(
  value: unknown
): MusicVideo {
  const item = record(value);
  const song = record(item.linkedSong);
  const release = record(item.linkedRelease);

  return {
    id: id(item._id || item.id),
    title: str(item.title) || "Untitled video",
    videoType: str(item.videoType) || "music_video",
    videoUrl: str(item.videoUrl),
    videoUploadId: id(item.videoUploadId),
    thumbnailUrl:
      str(item.thumbnailUrl) ||
      str(release.coverImage),
    thumbnailUploadId: id(item.thumbnailUploadId),
    duration: Number(item.duration) || 0,
    createdAt: str(item.createdAt),
    primaryArtists: Array.isArray(item.primaryArtists)
      ? item.primaryArtists.map(normalizeArtist)
      : [],
    featuredArtists: Array.isArray(item.featuredArtists)
      ? item.featuredArtists.map(normalizeArtist)
      : [],
    linkedSongTitle: str(song.title),
    linkedSongGenre: str(song.genre),
    linkedReleaseTitle: str(release.title),
  };
}

async function getJSON(
  path: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    { signal }
  );

  const payload: unknown = await response
    .json()
    .catch(() => null);

  const data = record(payload);

  if (!response.ok || data.success !== true) {
    throw new Error(
      str(data.message) ||
      `Video request failed (${response.status}).`
    );
  }

  return data;
}

export async function getPublicVideos(
  signal?: AbortSignal
): Promise<MusicVideo[]> {
  const data = await getJSON("/api/videos", signal);

  return Array.isArray(data.videos)
    ? data.videos
        .map(normalizeVideo)
        .filter((video) => video.id)
    : [];
}

export async function getPublicVideoById(
  videoId: string,
  signal?: AbortSignal
): Promise<MusicVideo> {
  const data = await getJSON(
    `/api/videos/${encodeURIComponent(videoId)}`,
    signal
  );

  return normalizeVideo(data.video);
}

export function formatVideoDuration(
  seconds: number
): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export function getVideoArtistNames(
  video: MusicVideo
): string {
  return [
    ...video.primaryArtists,
    ...video.featuredArtists,
  ]
    .map((artist) => artist.stageName)
    .filter(Boolean)
    .join(", ") || "Unknown artist";
}



/* ==========================================
   VIDEO MEDIA DELIVERY
========================================== */

export async function getVideoPlaybackUrl(
  videoId: string,
  signal?: AbortSignal
): Promise<string> {
  const data = await getJSON(
    `/api/media/videos/${encodeURIComponent(videoId)}/play`,
    signal
  );

  const playbackUrl = str(data.playbackUrl);

  if (!playbackUrl) {
    throw new Error(
      "The server did not return a video playback URL."
    );
  }

  return playbackUrl;
}

export async function getVideoThumbnailUrl(
  videoId: string,
  signal?: AbortSignal
): Promise<string> {
  const data = await getJSON(
    `/api/media/videos/${encodeURIComponent(videoId)}/thumbnail`,
    signal
  );

  const thumbnailUrl = str(data.mediaUrl);

  if (!thumbnailUrl) {
    throw new Error(
      "The server did not return a thumbnail URL."
    );
  }

  return thumbnailUrl;
}
