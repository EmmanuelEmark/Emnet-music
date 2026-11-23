
import {
  normalizeLibrarySong,
  type LibrarySong,
} from "./libraryApi";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

export type HomeSong = LibrarySong & {
  recentPlays: number;
  releaseId?: string;
};

export type HomeRelease = {
  id: string;
  title: string;
  releaseType: string;
  coverImage: string;
  artistNames: string;
};

export type HomeArtist = {
  id: string;
  stageName: string;
  profileImage: string;
  verified: boolean;
  followersCount: number;
};

export type HomeVideo = {
  id: string;
  title: string;
  thumbnail: string;
  artistNames: string;
};

export type HomeFeed = {
  latestSongs: HomeSong[];
  newReleases: HomeRelease[];
  trendingSongs: HomeSong[];
  recommendedSongs: HomeSong[];
  featuredArtists: HomeArtist[];
  latestVideos: HomeVideo[];
};

function asObject(
  value: unknown
): Record<string, unknown> {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getId(
  value: Record<string, unknown>
): string {
  return String(value._id || value.id || "");
}

function getList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function artistNames(value: unknown): string {
  return getList(value)
    .map((item) =>
      asString(asObject(item).stageName)
    )
    .filter(Boolean)
    .join(", ");
}


function normalizeHomeSong(value: unknown): HomeSong {
  const raw = asObject(value);

  const song = normalizeLibrarySong(value);

  // The backend may return the release as
  // a MongoDB ID or a populated release object.
  const releaseValue =
    raw.releaseId || raw.release;

  const releaseId =
    typeof releaseValue === "string"
      ? releaseValue
      : getId(asObject(releaseValue));

  return {
    ...song,

    // Store the release ID for artwork retrieval.
    releaseId,

    recentPlays:
      Number(raw.recentPlays) || 0,
  };
}


function normalizeHomeRelease(
  value: unknown
): HomeRelease {
  const raw = asObject(value);

  return {
    id: getId(raw),
    title:
      asString(raw.title) || "Untitled release",
    releaseType:
      asString(raw.releaseType) || "Release",
    coverImage:
      asString(raw.coverImage),
    artistNames:
      [
        artistNames(raw.primaryArtists),
        artistNames(raw.collaboratingArtists),
      ]
        .filter(Boolean)
        .join(", ") || "Unknown artist",
  };
}

function normalizeHomeArtist(
  value: unknown
): HomeArtist {
  const raw = asObject(value);

  return {
    id: getId(raw),
    stageName:
      asString(raw.stageName) || "Unknown artist",
    profileImage:
      asString(raw.profileImage),
    verified: raw.verified === true,
    followersCount:
      Number(raw.followersCount) || 0,
  };
}

function normalizeHomeVideo(
  value: unknown
): HomeVideo {
  const raw = asObject(value);
  const release = asObject(raw.linkedRelease);

  return {
    id: getId(raw),
    title:
      asString(raw.title) || "Untitled video",
    thumbnail:
      asString(raw.thumbnailUrl) ||
      asString(raw.thumbnail) ||
      asString(raw.thumbnailImage) ||
      asString(raw.coverImage) ||
      asString(release.coverImage),
    artistNames:
      [
        artistNames(raw.primaryArtists),
        artistNames(raw.featuredArtists),
      ]
        .filter(Boolean)
        .join(", ") || "Unknown artist",
  };
}

export async function fetchHomeFeed(
  signal?: AbortSignal
): Promise<HomeFeed> {
  const token = sessionStorage.getItem(
    TOKEN_KEY
  );

  const response = await fetch(
    `${API_BASE_URL}/api/home`,
    {
      method: "GET",
      signal,
      headers: token
        ? { Authorization: `Bearer ${token}` }
        : {},
    }
  );

  const raw: unknown = await response
    .json()
    .catch(() => null);

  const data = asObject(raw);

  if (!response.ok || data.success !== true) {
    throw new Error(
      asString(data.message) ||
      `Unable to load Home (HTTP ${response.status}).`
    );
  }

  const home = asObject(data.home);

  return {
    latestSongs: getList(home.latestSongs)
      .map(normalizeHomeSong)
      .filter((song) => song.id),

    newReleases: getList(home.newReleases)
      .map(normalizeHomeRelease)
      .filter((release) => release.id),

    trendingSongs: getList(home.trendingSongs)
      .map(normalizeHomeSong)
      .filter((song) => song.id),

    recommendedSongs: getList(
      home.recommendedSongs
    )
      .map(normalizeHomeSong)
      .filter((song) => song.id),

    featuredArtists: getList(
      home.featuredArtists
    )
      .map(normalizeHomeArtist)
      .filter((artist) => artist.id),

    latestVideos: getList(home.latestVideos)
      .map(normalizeHomeVideo)
      .filter((video) => video.id),
  };
}
