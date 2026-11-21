
import {
  normalizeLibrarySong,
  type LibrarySong,
} from "./libraryApi";

import type {
  SearchRelease,
  SearchVideo,
} from "./searchApi";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

export type PublicArtist = {
  id: string;
  stageName: string;
  bio: string;
  country: string;
  profileImage: string;
  coverImage: string;
  verified: boolean;
  followersCount: number;
};

export type ArtistProfileData = {
  artist: PublicArtist;
  songs: LibrarySong[];
  releases: SearchRelease[];
  videos: SearchVideo[];
};

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

function idOf(value: Record<string, unknown>): string {
  return String(value._id || value.id || "");
}

function namesOf(value: unknown): string {
  return Array.isArray(value)
    ? value
        .map((item) => str(object(item).stageName))
        .filter(Boolean)
        .join(", ")
    : "";
}

function normalizeRelease(value: unknown): SearchRelease {
  const release = object(value);

  return {
    id: idOf(release),
    title: str(release.title) || "Untitled release",
    releaseType: str(release.releaseType) || "Release",
    coverImage: str(release.coverImage),
    artists:
      [
        namesOf(release.primaryArtists),
        namesOf(release.collaboratingArtists),
      ]
        .filter(Boolean)
        .join(", ") || "Unknown artist",
  };
}

function normalizeVideo(value: unknown): SearchVideo {
  const video = object(value);
  const linkedRelease = object(video.linkedRelease);

  return {
    id: idOf(video),
    title: str(video.title) || "Untitled video",
    thumbnail:
      str(video.thumbnailUrl) ||
      str(video.thumbnail) ||
      str(video.thumbnailImage) ||
      str(video.coverImage) ||
      str(linkedRelease.coverImage),
    videoUrl:
      str(video.videoUrl) ||
      str(video.videoFileUrl),
    artists:
      [
        namesOf(video.primaryArtists),
        namesOf(video.featuredArtists),
      ]
        .filter(Boolean)
        .join(", ") || "Unknown artist",
  };
}

async function readResponse(
  response: Response
): Promise<Record<string, unknown>> {
  const data = object(
    await response.json().catch(() => null)
  );

  if (!response.ok || data.success !== true) {
    throw new Error(
      str(data.message) ||
      `Request failed (HTTP ${response.status}).`
    );
  }

  return data;
}

export async function getPublicArtistProfile(
  artistId: string,
  signal?: AbortSignal
): Promise<ArtistProfileData> {
  const response = await fetch(
    `${API_BASE_URL}/api/artists/profile/${encodeURIComponent(artistId)}`,
    { signal }
  );

  const data = await readResponse(response);
  const rawArtist = object(data.artist);

  if (!rawArtist._id && !rawArtist.id) {
    throw new Error("Artist profile data is missing.");
  }

  function list(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  return {
    artist: {
      id: idOf(rawArtist),
      stageName:
        str(rawArtist.stageName) || "Unknown artist",
      bio: str(rawArtist.bio),
      country: str(rawArtist.country),
      profileImage: str(rawArtist.profileImage),
      coverImage: str(rawArtist.coverImage),
      verified: rawArtist.verified === true,
      followersCount:
        Number(rawArtist.followersCount) || 0,
    },

    songs: list(data.songs)
      .map(normalizeLibrarySong)
      .filter((song) => song.id),

    releases: list(data.releases)
      .map(normalizeRelease)
      .filter((release) => release.id),

    videos: list(data.videos)
      .map(normalizeVideo)
      .filter((video) => video.id),
  };
}

async function authenticatedRequest(
  path: string,
  method: "POST" | "DELETE"
): Promise<void> {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error("Please log in to continue.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  await readResponse(response);
}

export async function followArtist(
  artistId: string
): Promise<void> {
  await authenticatedRequest(
    `/api/listener/follows/${encodeURIComponent(artistId)}`,
    "POST"
  );
}

export async function unfollowArtist(
  artistId: string
): Promise<void> {
  await authenticatedRequest(
    `/api/listener/follows/${encodeURIComponent(artistId)}`,
    "DELETE"
  );
}
