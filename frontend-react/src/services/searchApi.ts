
import {
  normalizeLibrarySong,
  type LibrarySong,
} from "./libraryApi";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

export type SearchArtist = {
  id: string;
  stageName: string;
  profileImage: string;
  coverImage: string;
  verified: boolean;
  followersCount: number;
};

export type SearchRelease = {
  id: string;
  title: string;
  releaseType: string;
  coverImage: string;
  artists: string;
};

export type SearchVideo = {
  id: string;
  title: string;
  thumbnail: string;
  videoUrl: string;
  artists: string;
};

export type SearchResults = {
  songs: LibrarySong[];
  artists: SearchArtist[];
  releases: SearchRelease[];
  videos: SearchVideo[];
};

function obj(value: unknown): Record<string, unknown> {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function idOf(value: Record<string, unknown>): string {
  return String(value._id || value.id || "");
}

function artistNames(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((item) => stringValue(obj(item).stageName))
    .filter(Boolean)
    .join(", ");
}

function normalizeArtist(value: unknown): SearchArtist {
  const artist = obj(value);

  return {
    id: idOf(artist),
    stageName:
      stringValue(artist.stageName) || "Unknown artist",
    profileImage: stringValue(artist.profileImage),
    coverImage: stringValue(artist.coverImage),
    verified: artist.verified === true,
    followersCount: Number(artist.followersCount) || 0,
  };
}

function normalizeRelease(value: unknown): SearchRelease {
  const release = obj(value);

  const names = [
    artistNames(release.primaryArtists),
    artistNames(release.collaboratingArtists),
  ].filter(Boolean);

  return {
    id: idOf(release),
    title: stringValue(release.title) || "Untitled release",
    releaseType:
      stringValue(release.releaseType) || "Release",
    coverImage: stringValue(release.coverImage),
    artists: names.join(", ") || "Unknown artist",
  };
}

function normalizeVideo(value: unknown): SearchVideo {
  const video = obj(value);

  const names = [
    artistNames(video.primaryArtists),
    artistNames(video.featuredArtists),
  ].filter(Boolean);

  const linkedRelease = obj(video.linkedRelease);

  return {
    id: idOf(video),
    title: stringValue(video.title) || "Untitled video",
    thumbnail:
      stringValue(video.thumbnailUrl) ||
      stringValue(video.thumbnail) ||
      stringValue(video.thumbnailImage) ||
      stringValue(video.coverImage) ||
      stringValue(linkedRelease.coverImage),
    videoUrl:
      stringValue(video.videoUrl) ||
      stringValue(video.videoFileUrl),
    artists: names.join(", ") || "Unknown artist",
  };
}

export async function searchMusic(
  query: string,
  signal?: AbortSignal
): Promise<SearchResults> {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error("Please log in to search music.");
  }

  const searchText = query.trim();

  if (!searchText) {
    return {
      songs: [],
      artists: [],
      releases: [],
      videos: [],
    };
  }

  const response = await fetch(
    `${API_BASE_URL}/api/search?q=${encodeURIComponent(searchText)}`,
    {
      method: "GET",
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data: unknown = await response
    .json()
    .catch(() => null);

  const body = obj(data);

  if (!response.ok || body.success !== true) {
    throw new Error(
      stringValue(body.message) ||
      `Search failed (HTTP ${response.status}).`
    );
  }

  const results = obj(body.results);

  function list(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  return {
    songs: list(results.songs)
      .map(normalizeLibrarySong)
      .filter((song) => song.id),

    artists: list(results.artists)
      .map(normalizeArtist)
      .filter((artist) => artist.id),

    releases: list(results.releases)
      .map(normalizeRelease)
      .filter((release) => release.id),

    videos: list(results.videos)
      .map(normalizeVideo)
      .filter((video) => video.id),
  };
}