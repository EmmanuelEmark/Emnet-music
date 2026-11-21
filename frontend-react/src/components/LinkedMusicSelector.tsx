
import {
  useEffect,
  useState,
} from "react";

// ==========================================
// API CONFIGURATION
// ==========================================

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

// ==========================================
// TYPES
// ==========================================

type CatalogueItem = {
  _id: string;
  title: string;
  status: string;
  visibilityStatus?: string;
};

type ReleaseItem = CatalogueItem & {
  releaseType: string;
};

type Props = {
  releaseId: string;
  songId: string;

  onChange: (
    releaseId: string,
    songId: string
  ) => void;

  disabled?: boolean;
};

// ==========================================
// AUTHENTICATED API REQUEST
// ==========================================

async function getCatalogue<T>(
  path: string,
  signal: AbortSignal
): Promise<T> {
  const token =
    sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error(
      "Please sign in again."
    );
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      method: "GET",
      cache: "no-store",
      signal,

      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result = await response
    .json()
    .catch(() => null);

  if (
    !response.ok ||
    !result?.success
  ) {
    throw new Error(
      result?.message ||
      "Unable to load your music."
    );
  }

  return result as T;
}

// ==========================================
// CHECK PUBLISHED CONTENT
// ==========================================

function isPublished(
  item: CatalogueItem
): boolean {
  return (
    item.status === "approved" &&
    (item.visibilityStatus || "visible") ===
      "visible"
  );
}

// ==========================================
// LINKED MUSIC SELECTOR
// ==========================================

export default function LinkedMusicSelector({
  releaseId,
  songId,
  onChange,
  disabled = false,
}: Props) {
  const [releases, setReleases] =
    useState<ReleaseItem[]>([]);

  const [songs, setSongs] =
    useState<CatalogueItem[]>([]);

  const [
    loadingReleases,
    setLoadingReleases,
  ] = useState(true);

  const [
    loadingSongs,
    setLoadingSongs,
  ] = useState(false);

  const [
    releaseError,
    setReleaseError,
  ] = useState("");

  const [
    songError,
    setSongError,
  ] = useState("");

  // ========================================
  // LOAD ARTIST'S PUBLISHED RELEASES
  // ========================================

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadReleases() {
      try {
        setLoadingReleases(true);
        setReleaseError("");

        const result =
          await getCatalogue<{
            releases: ReleaseItem[];
          }>(
            "/api/releases/mine",
            controller.signal
          );

        if (!controller.signal.aborted) {
          setReleases(
            (result.releases || [])
              .filter(isPublished)
          );
        }

      } catch (error) {
        if (!controller.signal.aborted) {
          setReleaseError(
            error instanceof Error
              ? error.message
              : "Unable to load releases."
          );
        }

      } finally {
        if (!controller.signal.aborted) {
          setLoadingReleases(false);
        }
      }
    }

    void loadReleases();

    return () => {
      controller.abort();
    };
  }, []);

  // ========================================
  // LOAD SONGS FROM SELECTED RELEASE
  // ========================================

  useEffect(() => {
    setSongs([]);
    setSongError("");

    if (!releaseId) {
      setLoadingSongs(false);
      return;
    }

    const controller =
      new AbortController();

    setLoadingSongs(true);

    async function loadSongs() {
      try {
        const result =
          await getCatalogue<{
            songs: CatalogueItem[];
          }>(
            `/api/songs/release/${encodeURIComponent(releaseId)}`,
            controller.signal
          );

        if (!controller.signal.aborted) {
          setSongs(
            (result.songs || [])
              .filter(isPublished)
          );
        }

      } catch (error) {
        if (!controller.signal.aborted) {
          setSongError(
            error instanceof Error
              ? error.message
              : "Unable to load songs."
          );
        }

      } finally {
        if (!controller.signal.aborted) {
          setLoadingSongs(false);
        }
      }
    }

    void loadSongs();

    return () => {
      controller.abort();
    };
  }, [releaseId]);

  // ========================================
  // SELECTOR INTERFACE
  // ========================================

  return (
    <div className="em-upload-grid">

      {/* LINKED RELEASE */}

      <label>
        Linked Release (optional)

        <select
          value={releaseId}

          disabled={
            disabled ||
            loadingReleases
          }

          onChange={(event) =>
            onChange(
              event.target.value,
              ""
            )
          }
        >
          <option value="">
            {loadingReleases
              ? "Loading releases..."
              : "No linked release"}
          </option>

          {/* PRESERVE PREVIOUS SELECTION */}

          {releaseId &&
            !releases.some(
              (release) =>
                release._id === releaseId
            ) && (
              <option value={releaseId}>
                Previously selected release
              </option>
            )}

          {/* PUBLISHED RELEASES */}

          {releases.map((release) => (
            <option
              key={release._id}
              value={release._id}
            >
              {release.title}
              {" — "}
              {release.releaseType}
            </option>
          ))}
        </select>

        <small className="em-video-field-help">
          Select one of your published
          Singles, EPs or Albums.
        </small>
      </label>

      {/* LINKED SONG */}

      <label>
        Linked Song (optional)

        <select
          value={songId}

          disabled={
            disabled ||
            loadingSongs ||
            (!releaseId && !songId)
          }

          onChange={(event) =>
            onChange(
              releaseId,
              event.target.value
            )
          }
        >
          <option value="">
            {loadingSongs
              ? "Loading songs..."
              : releaseId
                ? "No linked song"
                : "Select a release first"}
          </option>

          {/* PRESERVE PREVIOUS SELECTION */}

          {songId &&
            !songs.some(
              (song) =>
                song._id === songId
            ) && (
              <option value={songId}>
                Previously selected song
              </option>
            )}

          {/* PUBLISHED SONGS */}

          {songs.map((song) => (
            <option
              key={song._id}
              value={song._id}
            >
              {song.title}
            </option>
          ))}
        </select>

        <small className="em-video-field-help">
          Select the song associated
          with this music video.
        </small>
      </label>

      {/* ERROR MESSAGES */}

      {(releaseError || songError) && (
        <p
          className="em-upload-error em-video-full-width"
          role="alert"
        >
          {releaseError || songError}
        </p>
      )}

      {/* EMPTY MUSIC CATALOGUE */}

      {!loadingReleases &&
        !releaseError &&
        releases.length === 0 && (
          <small className="em-video-field-help em-video-full-width">
            You have no published releases
            available to link yet.
            You can still publish your video
            without linking a release or song.
          </small>
        )}

    </div>
  );
}
