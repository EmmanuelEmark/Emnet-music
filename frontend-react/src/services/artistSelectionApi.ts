
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

// ==========================================
// ARTIST SELECTION TYPE
// ==========================================

export type SelectableArtist = {
  _id: string;
  stageName: string;
  profileImage?: string;
  profileImageUploadId?: string | null;
  verified?: boolean;
  country?: string;
};

type ArtistSearchResponse = {
  success: boolean;
  message?: string;
  count?: number;
  artists: SelectableArtist[];
};

// ==========================================
// AUTHENTICATED ARTIST SEARCH
// ==========================================

export async function searchArtists(
  searchTerm: string,
  signal?: AbortSignal
): Promise<SelectableArtist[]> {
  const query = searchTerm.trim();

  if (query.length < 2) {
    return [];
  }

  if (query.length > 100) {
    throw new Error(
      "Search cannot exceed 100 characters."
    );
  }

  const token =
    sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error(
      "Please sign in again."
    );
  }

  const params = new URLSearchParams({
    q: query,
  });

  const response = await fetch(
    `${API_BASE_URL}/api/artists/search?${params}`,
    {
      method: "GET",

      cache: "no-store",

      headers: {
        Authorization: `Bearer ${token}`,
      },

      signal,
    }
  );

  const result =
    (await response
      .json()
      .catch(() => null)) as
      ArtistSearchResponse | null;

  if (
    !response.ok ||
    !result?.success
  ) {
    throw new Error(
      result?.message ||
      `Artist search failed (${response.status}).`
    );
  }

  return Array.isArray(result.artists)
    ? result.artists
    : [];
}




export async function resolveSelectedArtists(
  ids: string[],
  signal?: AbortSignal
): Promise<SelectableArtist[]> {
  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length === 0) {
    return [];
  }

  const token =
    sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error("Please sign in again.");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/artists/selection/resolve`,
    {
      method: "POST",
      cache: "no-store",

      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        ids: uniqueIds,
      }),

      signal,
    }
  );

  const result = await response
    .json()
    .catch(() => null);

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.message ||
      "Unable to retrieve selected artists."
    );
  }

  return Array.isArray(result.artists)
    ? result.artists
    : [];
}

// Extract IDs from both populated
// artist objects and raw MongoDB IDs.

export function normalizeArtistIds(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = value
    .map((artist: unknown) => {
      if (typeof artist === "string") {
        return artist;
      }

      if (
        artist &&
        typeof artist === "object" &&
        "_id" in artist
      ) {
        return String(artist._id);
      }

      return "";
    })
    .filter(
      (id) => /^[a-f0-9]{24}$/i.test(id)
    );

  return [...new Set(ids)];
}
