
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

// ========================================
// TYPES
// ========================================

export type LibrarySong = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  audioUrl: string;
  genre: string;
  duration: number;
};

export type FollowedArtist = {
  id: string;
  stageName: string;
  profileImage: string;
  verified: boolean;
  followersCount: number;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  songs: LibrarySong[];
};

export type PlaylistInput = {
  name: string;
  description: string;
  isPublic: boolean;
};

type ApiResult = {
  success: boolean;
  message?: string;
  songs?: unknown[];
  artists?: unknown[];
  playlists?: unknown[];
  playlist?: unknown;
};

// ========================================
// HELPERS
// ========================================

function object(value: unknown): Record<string, unknown> {
  if (
    value !== null &&
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

function getId(value: Record<string, unknown>): string {
  return String(value._id || value.id || "");
}

export function normalizeLibrarySong(
  value: unknown
): LibrarySong {
  const song = object(value);
  const release = object(song.releaseId);

  const primaryArtists = Array.isArray(song.primaryArtists)
    ? song.primaryArtists
    : [];

  const featuredArtists = Array.isArray(song.featuredArtists)
    ? song.featuredArtists
    : [];

  const artistNames = [
    ...primaryArtists,
    ...featuredArtists,
  ]
    .map((item) => str(object(item).stageName))
    .filter(Boolean);

  const duration = Number(song.duration);

  return {
    id: getId(song),
    title: str(song.title) || "Untitled song",
    artist:
      artistNames.join(", ") ||
      str(song.artistName) ||
      str(object(song.artist).stageName) ||
      "Unknown artist",
    cover:
      str(song.coverImage) ||
      str(song.coverUrl) ||
      str(song.artworkUrl) ||
      str(release.coverImage) ||
      "",
    audioUrl:
      str(song.audioUrl) ||
      str(song.audio) ||
      "",
    genre: str(song.genre) || "Music",
    duration: Number.isFinite(duration) ? duration : 0,
  };
}

function normalizeArtist(value: unknown): FollowedArtist {
  const artist = object(value);

  return {
    id: getId(artist),
    stageName:
      str(artist.stageName) || "Unknown artist",
    profileImage: str(artist.profileImage),
    verified: artist.verified === true,
    followersCount: Number(artist.followersCount) || 0,
  };
}

function normalizePlaylist(value: unknown): Playlist {
  const playlist = object(value);

  return {
    id: getId(playlist),
    name: str(playlist.name) || "Untitled playlist",
    description: str(playlist.description),
    isPublic: playlist.isPublic === true,
    songs: Array.isArray(playlist.songs)
      ? playlist.songs
          .filter((song) => song && typeof song === "object")
          .map(normalizeLibrarySong)
          .filter((song) => song.id)
      : [],
  };
}

// ========================================
// AUTHENTICATED REQUEST
// ========================================

async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<ApiResult> {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error(
      "Your session has ended. Please log in again."
    );
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result: unknown = await response
    .json()
    .catch(() => null);

  if (!result || typeof result !== "object") {
    throw new Error(
      `Invalid server response (HTTP ${response.status}).`
    );
  }

  const data = result as ApiResult;

  if (!response.ok || data.success !== true) {
    throw new Error(
      data.message ||
      `Request failed (HTTP ${response.status}).`
    );
  }

  return data;
}

// ========================================
// LIKED SONGS
// ========================================

export async function getLikedSongs() {
  const response = await apiRequest(
    "/api/listener/likes"
  );

  if (!Array.isArray(response.songs)) {
    throw new Error("Unexpected liked songs response.");
  }

  return response.songs
    .map(normalizeLibrarySong)
    .filter((song) => song.id);
}

export async function unlikeSong(songId: string) {
  return apiRequest(
    `/api/listener/likes/${encodeURIComponent(songId)}`,
    { method: "DELETE" }
  );
}

// ========================================
// FOLLOWED ARTISTS
// ========================================

export async function getFollowedArtists() {
  const response = await apiRequest(
    "/api/listener/follows"
  );

  if (!Array.isArray(response.artists)) {
    throw new Error("Unexpected followed artists response.");
  }

  return response.artists
    .map(normalizeArtist)
    .filter((artist) => artist.id);
}

export async function unfollowArtist(artistId: string) {
  return apiRequest(
    `/api/listener/follows/${encodeURIComponent(artistId)}`,
    { method: "DELETE" }
  );
}

// ========================================
// PLAYLISTS
// ========================================

export async function getPlaylists(): Promise<Playlist[]> {
  const response = await apiRequest("/api/playlists");

  if (!Array.isArray(response.playlists)) {
    throw new Error("Unexpected playlists response.");
  }

  return response.playlists
    .map(normalizePlaylist)
    .filter((playlist) => playlist.id);
}

export async function getPlaylist(
  playlistId: string
): Promise<Playlist> {
  const response = await apiRequest(
    `/api/playlists/${encodeURIComponent(playlistId)}`
  );

  if (!response.playlist) {
    throw new Error("Playlist data is missing.");
  }

  return normalizePlaylist(response.playlist);
}

export async function createPlaylist(
  data: PlaylistInput
) {
  return apiRequest("/api/playlists", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updatePlaylist(
  playlistId: string,
  data: PlaylistInput
) {
  return apiRequest(
    `/api/playlists/${encodeURIComponent(playlistId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    }
  );
}

export async function deletePlaylist(
  playlistId: string
) {
  return apiRequest(
    `/api/playlists/${encodeURIComponent(playlistId)}`,
    { method: "DELETE" }
  );
}

export async function addSongToPlaylist(
  playlistId: string,
  songId: string
) {
  return apiRequest(
    `/api/playlists/${encodeURIComponent(playlistId)}` +
      `/songs/${encodeURIComponent(songId)}`,
    { method: "POST" }
  );
}

export async function removeSongFromPlaylist(
  playlistId: string,
  songId: string
) {
  return apiRequest(
    `/api/playlists/${encodeURIComponent(playlistId)}` +
      `/songs/${encodeURIComponent(songId)}`,
    { method: "DELETE" }
  );
}
