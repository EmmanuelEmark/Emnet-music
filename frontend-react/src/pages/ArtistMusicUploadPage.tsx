import { useEffect, useRef, useState } from "react";

import {
  Link,
  useNavigate,
  useParams,
} from "react-router";

import {
  ArrowLeft,
  CheckCircle2,
  CloudUpload,
  Disc3,
  Music2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import {
  uploadArtistMedia,
} from "../services/artistMediaUploadApi";

import {
  detectAudioDuration,
  formatAudioDuration,
} from "../services/audioMetadataApi";

import { MUSIC_GENRES } from "../constants/musicGenres";

import ArtistIdSelector from "../components/ArtistIdSelector";

import ArtistSavedMediaPreview from "../components/ArtistSavedMediaPreview";

import {
  normalizeArtistIds,
} from "../services/artistSelectionApi";

import "./ArtistMusicUploadPage.css";

// ==========================================
// API CONFIGURATION
// ==========================================

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

const MUSIC_PATH = "/artist/studio/music";

// ==========================================
// TYPES
// ==========================================

type ReleaseType = "single" | "ep" | "album" | "";

type ReleaseStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected";

type ReleaseDraft = {
  _id: string;
  title: string;
  releaseType: ReleaseType;
  releaseDate: string;
  coverUploadId: string | null;
  coverImage: string;
  status: ReleaseStatus;
  visibilityStatus: string;
  primaryArtists: string[];
  collaboratingArtists: string[];
};

type SongDraft = {
  _id: string;
  title: string;
  genre: string;
  duration: number;
  trackNumber: number | null;
  isrc: string;
  audioUploadId: string | null;
  audioUrl: string;
  status: string;
  primaryArtists: string[];
  featuredArtists: string[];
};

type ReleaseForm = {
  title: string;
  releaseType: ReleaseType;
  releaseDate: string;
  primaryArtists: string[];
  collaboratingArtists: string[];
};

type SaveState = "saved" | "saving" | "unsaved" | "error";

type UploadState = {
  key: string;
  progress: number;
} | null;

type ReleaseResponse = {
  success: boolean;
  message?: string;
  release: Record<string, unknown>;
};

type SongResponse = {
  success: boolean;
  message?: string;
  song: Record<string, unknown>;
};

type ReleaseDetailsResponse = ReleaseResponse & {
  songs: Record<string, unknown>[];
};

type ArtistProfileResponse = {
  success: boolean;
  artist: {
    _id: string;
    stageName: string;
  };
};

// ==========================================
// HELPERS
// ==========================================

function idOf(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "_id" in value
  ) {
    return String(value._id || "");
  }

  return "";
}

function dateForInput(value: unknown): string {
  if (typeof value !== "string" || !value) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toISOString().slice(0, 10);
}

function normalizeRelease(
  value: Record<string, unknown>
): ReleaseDraft {
  return {
    _id: String(value._id || value.id || ""),

    title: String(value.title || ""),

    releaseType: (
      value.releaseType || ""
    ) as ReleaseType,

    releaseDate: dateForInput(value.releaseDate),

    coverUploadId: idOf(value.coverUploadId) || null,

    coverImage:
      typeof value.coverImage === "string"
        ? value.coverImage
        : "",

    status: (value.status || "draft") as ReleaseStatus,

    visibilityStatus: String(
      value.visibilityStatus || "visible"
    ),

    primaryArtists: normalizeArtistIds(
      value.primaryArtists
    ),

    collaboratingArtists: normalizeArtistIds(
      value.collaboratingArtists
    ),
  };
}

function normalizeSong(
  value: Record<string, unknown>
): SongDraft {
  return {
    _id: String(value._id || value.id || ""),

    title: String(value.title || ""),

    genre: String(value.genre || ""),

    duration: Number(value.duration || 0),

    trackNumber:
      value.trackNumber == null
        ? null
        : Number(value.trackNumber),

    isrc: String(value.isrc || ""),

    audioUploadId:
      idOf(value.audioUploadId) || null,

    audioUrl:
      typeof value.audioUrl === "string"
        ? value.audioUrl
        : "",

    status: String(value.status || "draft"),

    primaryArtists: normalizeArtistIds(
      value.primaryArtists
    ),

    featuredArtists: normalizeArtistIds(
      value.featuredArtists
    ),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong.";
}

function getReleaseStatus(release: ReleaseDraft): string {
  if (release.visibilityStatus !== "visible") {
    return release.visibilityStatus;
  }

  return release.status === "approved"
    ? "Published"
    : release.status;
}

function includeOwner(
  ownerArtistId: string,
  artistIds: string[]
): string[] {
  return [
    ...new Set([ownerArtistId, ...artistIds]),
  ].filter(Boolean);
}

function hasOverlappingArtists(
  first: string[],
  second: string[]
): boolean {
  const firstIds = new Set(first);

  return second.some((id) => firstIds.has(id));
}

function songMetadata(
  song: SongDraft,
  ownerArtistId: string
) {
  return {
    title: song.title,
    genre: song.genre,
    trackNumber: song.trackNumber,
    duration: song.duration,
    isrc: song.isrc,

    primaryArtists: includeOwner(
      ownerArtistId,
      song.primaryArtists
    ),

    featuredArtists: [...song.featuredArtists],
  };
}

function nextTrackNumber(songs: SongDraft[]): number {
  const used = new Set(
    songs
      .map((song) => song.trackNumber)
      .filter(
        (number): number is number =>
          number !== null &&
          Number.isSafeInteger(number) &&
          number > 0
      )
  );

  let number = 1;

  while (used.has(number)) {
    number++;
  }

  return number;
}

// ==========================================
// AUTHENTICATED API REQUEST
// ==========================================

async function apiRequest<T>(
  path: string,
  method = "GET",
  data?: unknown
): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error("Please sign in again.");
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      method,
      cache: "no-store",

      headers: {
        Authorization: `Bearer ${token}`,

        ...(data !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
      },

      ...(data !== undefined
        ? { body: JSON.stringify(data) }
        : {}),
    }
  );

  const result = await response
    .json()
    .catch(() => null);

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.message ||
      `Request failed (${response.status}).`
    );
  }

  return result as T;
}

// ==========================================
// ARTIST MUSIC LIST
// ==========================================

function ArtistMusicList() {
  const navigate = useNavigate();

  const [releases, setReleases] =
    useState<ReleaseDraft[]>([]);

  const [tab, setTab] =
    useState<"drafts" | "published" | "other">("drafts");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const creatingRef = useRef(false);

  // ========================================
  // LOAD ARTIST RELEASES
  // ========================================

  useEffect(() => {
    let cancelled = false;

    async function loadReleases() {
      try {
        const result = await apiRequest<{
          success: boolean;
          releases: Record<string, unknown>[];
        }>("/api/releases/mine");

        if (!cancelled) {
          setReleases(
            (result.releases || []).map(normalizeRelease)
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadReleases();

    return () => {
      cancelled = true;
    };
  }, []);

  // ========================================
  // CREATE NEW RELEASE
  // ========================================

  async function createRelease() {
    if (creatingRef.current) return;

    creatingRef.current = true;

    try {
      setCreating(true);
      setError("");

      const result = await apiRequest<ReleaseResponse>(
        "/api/releases",
        "POST",
        {}
      );

      const release = normalizeRelease(result.release);

      if (!release._id) {
        throw new Error(
          "The server did not return a release ID."
        );
      }

      navigate(`${MUSIC_PATH}/${release._id}`);

    } catch (err) {
      setError(errorMessage(err));

    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  const drafts = releases.filter(
    (release) =>
      release.status === "draft" &&
      release.visibilityStatus === "visible"
  );

  const published = releases.filter(
    (release) =>
      release.status === "approved" &&
      release.visibilityStatus === "visible"
  );

  const other = releases.filter(
    (release) =>
      release.visibilityStatus !== "visible" ||
      !["draft", "approved"].includes(release.status)
  );

  const visibleReleases =
    tab === "drafts"
      ? drafts
      : tab === "published"
        ? published
        : other;

  // ========================================
  // RELEASE LIST INTERFACE
  // ========================================

  return (
    <div className="page-content em-upload-page">
      <div className="em-upload-top">
        <div>
          <Link
            to="/artist/studio"
            className="em-upload-back"
          >
            <ArrowLeft size={17} />
            Artist Studio
          </Link>

          <h1>My Music</h1>

          <p>Create, publish and manage your music releases.</p>
        </div>

        <button
          type="button"
          className="em-upload-primary"
          disabled={creating}
          onClick={createRelease}
        >
          <Plus size={18} />

          {creating ? "Creating..." : "Create Release"}
        </button>
      </div>

      {error && (
        <p className="em-upload-error" role="alert">
          {error}
        </p>
      )}

      {/* MUSIC STATISTICS */}

      <div className="em-music-stats">
        <div className="em-music-stat">
          <Disc3 size={24} />

          <span>Total releases</span>

          <strong>
            {loading ? "—" : releases.length}
          </strong>
        </div>

        <div className="em-music-stat">
          <Save size={24} />

          <span>Drafts</span>

          <strong>
            {loading ? "—" : drafts.length}
          </strong>
        </div>

        <div className="em-music-stat">
          <CheckCircle2 size={24} />

          <span>Published</span>

          <strong>
            {loading ? "—" : published.length}
          </strong>
        </div>
      </div>

      {/* RELEASE TABS */}

      <div className="em-music-tabs">
        <button
          type="button"
          className={tab === "drafts" ? "active" : ""}
          aria-pressed={tab === "drafts"}
          onClick={() => setTab("drafts")}
        >
          Drafts ({drafts.length})
        </button>

        <button
          type="button"
          className={tab === "published" ? "active" : ""}
          aria-pressed={tab === "published"}
          onClick={() => setTab("published")}
        >
          Published ({published.length})
        </button>

        {other.length > 0 && (
          <button
            type="button"
            className={tab === "other" ? "active" : ""}
            aria-pressed={tab === "other"}
            onClick={() => setTab("other")}
          >
            Other ({other.length})
          </button>
        )}
      </div>

      {/* RELEASE LIST */}

      {loading ? (
        <div className="em-upload-empty">
          Loading your releases...
        </div>
      ) : visibleReleases.length === 0 ? (
        <div className="em-upload-empty">
          <Disc3 size={42} />

          <h2>
            {tab === "drafts"
              ? "No saved drafts"
              : tab === "published"
                ? "No published music yet"
                : "No matching releases"}
          </h2>

          <p>
            {tab === "drafts"
              ? "Create your next Single, EP or Album."
              : "Your matching releases will appear here."}
          </p>
        </div>
      ) : (
        <div className="em-upload-release-list">
          {visibleReleases.map((release) => (
            <Link
              key={release._id}
              to={`${MUSIC_PATH}/${release._id}`}
              className="em-upload-release-row"
            >
              <span className="em-upload-disc">
                <Disc3 size={25} />
              </span>

              <span className="em-upload-release-info">
                <strong>
                  {release.title || "Untitled release"}
                </strong>

                <small>
                  {release.releaseType || "Type not selected"}
                </small>

                <small>
                  {release.coverUploadId || release.coverImage
                    ? "Artwork uploaded"
                    : "Artwork incomplete"}
                </small>
              </span>

              <span
                className={`em-upload-status ${release.status}`}
              >
                {getReleaseStatus(release)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// LOAD INDIVIDUAL RELEASE
// ==========================================

function ArtistMusicLoader({
  releaseId,
}: {
  releaseId: string;
}) {
  const [data, setData] = useState<{
    release: ReleaseDraft;
    songs: SongDraft[];
    ownerArtistId: string;
    ownerStageName: string;
  } | null>(null);

  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadRelease() {
      try {
        const [result, profileResult] = await Promise.all([
          apiRequest<ReleaseDetailsResponse>(
            `/api/releases/mine/${releaseId}`
          ),

          apiRequest<ArtistProfileResponse>(
            "/api/artists/me"
          ),
        ]);

        const ownerArtistId = idOf(
          profileResult.artist?._id
        );

        if (!ownerArtistId) {
          throw new Error(
            "Unable to identify your artist profile."
          );
        }

        if (!cancelled) {
          setData({
            release: normalizeRelease(result.release),

            songs: (result.songs || []).map(normalizeSong),

            ownerArtistId,

            ownerStageName:
              profileResult.artist.stageName ||
              "Your artist profile",
          });
        }

      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err));
        }
      }
    }

    void loadRelease();

    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  if (!data) {
    return (
      <div className="page-content em-upload-page">
        <Link
          to={MUSIC_PATH}
          className="em-upload-back"
        >
          <ArrowLeft size={17} />
          My Music
        </Link>

        {error ? (
          <p className="em-upload-error" role="alert">
            {error}
          </p>
        ) : (
          <div className="em-upload-empty">
            Loading release...
          </div>
        )}
      </div>
    );
  }

  return (
    <ArtistMusicEditor
      key={releaseId}
      initialRelease={data.release}
      initialSongs={data.songs}
      ownerArtistId={data.ownerArtistId}
      ownerStageName={data.ownerStageName}
    />
  );
}

// ==========================================
// MUSIC RELEASE EDITOR
// ==========================================

function ArtistMusicEditor({
  initialRelease,
  initialSongs,
  ownerArtistId,
  ownerStageName,
}: {
  initialRelease: ReleaseDraft;
  initialSongs: SongDraft[];
  ownerArtistId: string;
  ownerStageName: string;
}) {
  const navigate = useNavigate();

  const releaseId = initialRelease._id;

  const initialEditable =
    initialRelease.status === "draft" &&
    initialRelease.visibilityStatus === "visible";

  // ========================================
  // EDITOR STATE
  // ========================================

  const [release, setRelease] = useState(initialRelease);

  const [form, setForm] = useState<ReleaseForm>({
    title: initialRelease.title,
    releaseType: initialRelease.releaseType,
    releaseDate: initialRelease.releaseDate,

    primaryArtists: initialEditable
      ? includeOwner(
          ownerArtistId,
          initialRelease.primaryArtists
        )
      : initialRelease.primaryArtists,

    collaboratingArtists: [
      ...initialRelease.collaboratingArtists,
    ],
  });

  const [songs, setSongs] =
    useState<SongDraft[]>(initialSongs);

  const [saveState, setSaveState] =
    useState<SaveState>("saved");

  const [upload, setUpload] =
    useState<UploadState>(null);

  const [busyAction, setBusyAction] = useState("");

  const [rightsConfirmed, setRightsConfirmed] =
    useState(false);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [coverPreview, setCoverPreview] = useState("");

  const [audioPreviews, setAudioPreviews] =
    useState<Record<string, string>>({});

  // ========================================
  // DRAFT SYNCHRONIZATION REFERENCES
  // ========================================

  const formRef = useRef(form);
  const songsRef = useRef(songs);

  const dirtyRelease = useRef(false);

  const dirtySongs = useRef(new Set<string>());

  const timerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);

  const queueRef = useRef<Promise<unknown>>(
    Promise.resolve()
  );

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const savingRef = useRef(false);

  const previewUrlsRef = useRef<Record<string, string>>({});

  const editable =
    release.status === "draft" &&
    release.visibilityStatus === "visible";

  const busy = busyAction !== "" || upload !== null;

  // ========================================
  // SERIALIZE DRAFT REQUESTS
  // ========================================

  function enqueue<T>(
    job: () => Promise<T>
  ): Promise<T> {
    const result = queueRef.current.then(job, job);

    queueRef.current = result;

    return result;
  }

  function clearSaveTimer() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  // ========================================
  // SAVE DRAFT
  // ========================================

  async function saveDraft() {
    if (!editable) return;

    clearSaveTimer();

    await enqueue(async () => {
      savingRef.current = true;

      try {
        if (
          !dirtyRelease.current &&
          dirtySongs.current.size === 0
        ) {
          if (mountedRef.current) {
            setSaveState("saved");
          }

          return;
        }

        if (mountedRef.current) {
          setSaveState("saving");
        }

        // SAVE RELEASE INFORMATION

        if (dirtyRelease.current) {
          const snapshot = {
            ...formRef.current,

            primaryArtists: includeOwner(
              ownerArtistId,
              formRef.current.primaryArtists
            ),

            collaboratingArtists: [
              ...formRef.current.collaboratingArtists,
            ],
          };

          if (
            hasOverlappingArtists(
              snapshot.primaryArtists,
              snapshot.collaboratingArtists
            )
          ) {
            throw new Error(
              "An artist cannot be both a primary artist and a release collaborator."
            );
          }

          await apiRequest(
            `/api/releases/mine/${releaseId}`,
            "PATCH",
            snapshot
          );

          dirtyRelease.current =
            JSON.stringify(snapshot) !==
            JSON.stringify(formRef.current);
        }

        // SAVE INDIVIDUAL SONG INFORMATION

        const songIds = [...dirtySongs.current];

        for (const songId of songIds) {
          const song = songsRef.current.find(
            (item) => item._id === songId
          );

          if (!song) {
            dirtySongs.current.delete(songId);
            continue;
          }

          const snapshot = songMetadata(
            song,
            ownerArtistId
          );

          if (
            hasOverlappingArtists(
              snapshot.primaryArtists,
              snapshot.featuredArtists
            )
          ) {
            throw new Error(
              "An artist cannot be both a primary and featured artist on the same song."
            );
          }

          await apiRequest(
            `/api/songs/release/${releaseId}/${songId}`,
            "PATCH",
            snapshot
          );

          const latest = songsRef.current.find(
            (item) => item._id === songId
          );

          if (
            latest &&
            JSON.stringify(
              songMetadata(latest, ownerArtistId)
            ) === JSON.stringify(snapshot)
          ) {
            dirtySongs.current.delete(songId);
          }
        }

        if (mountedRef.current) {
          setSaveState(
            dirtyRelease.current ||
            dirtySongs.current.size > 0
              ? "unsaved"
              : "saved"
          );
        }

      } catch (err) {
        if (mountedRef.current) {
          setSaveState("error");
        }

        throw err;

      } finally {
        savingRef.current = false;
      }
    });
  }

  // ========================================
  // AUTOMATIC DRAFT SAVING
  // ========================================

  function scheduleSave() {
    setSaveState("unsaved");

    clearSaveTimer();

    timerRef.current = setTimeout(() => {
      void saveDraft().catch((err) => {
        if (mountedRef.current) {
          setError(
            `Draft save failed: ${errorMessage(err)}`
          );
        }
      });
    }, 700);
  }

  // ========================================
  // UPDATE RELEASE FIELDS
  // ========================================

  function changeReleaseField<K extends keyof ReleaseForm>(
    key: K,
    value: ReleaseForm[K]
  ) {
    if (!editable || busyRef.current) return;

    if (
      key === "releaseType" &&
      value === "single" &&
      songsRef.current.length > 1
    ) {
      setError("A Single can contain only one song.");
      return;
    }

    const next = {
      ...formRef.current,
      [key]: value,
    };

    next.primaryArtists = includeOwner(
      ownerArtistId,
      next.primaryArtists
    );

    if (
      hasOverlappingArtists(
        next.primaryArtists,
        next.collaboratingArtists
      )
    ) {
      setError(
        "A primary artist cannot also be selected as a release collaborator."
      );

      return;
    }

    formRef.current = next;

    setForm(next);

    dirtyRelease.current = true;

    setError("");
    setMessage("");

    scheduleSave();
  }

  // ========================================
  // UPDATE SONG FIELDS
  // ========================================

  function changeSongField<K extends keyof SongDraft>(
    songId: string,
    key: K,
    value: SongDraft[K]
  ) {
    if (!editable || busyRef.current) return;

    const currentSong = songsRef.current.find(
      (song) => song._id === songId
    );

    if (!currentSong) return;

    const updatedSong = {
      ...currentSong,
      [key]: value,
    };

    updatedSong.primaryArtists = includeOwner(
      ownerArtistId,
      updatedSong.primaryArtists
    );

    if (
      hasOverlappingArtists(
        updatedSong.primaryArtists,
        updatedSong.featuredArtists
      )
    ) {
      setError(
        "A primary artist cannot also be a featured artist on the same song."
      );

      return;
    }

    if (
      key === "trackNumber" &&
      updatedSong.trackNumber !== null
    ) {
      const duplicate = songsRef.current.some(
        (song) =>
          song._id !== songId &&
          song.trackNumber === updatedSong.trackNumber
      );

      if (duplicate) {
        setError(
          "This track number is already assigned to another song."
        );

        return;
      }
    }

    const next = songsRef.current.map(
      (song) =>
        song._id === songId ? updatedSong : song
    );

    songsRef.current = next;

    setSongs(next);

    dirtySongs.current.add(songId);

    setError("");
    setMessage("");

    scheduleSave();
  }

  // ========================================
  // PREVENT UNSAVED CHANGES ON PAGE RELOAD
  // ========================================

  useEffect(() => {
    mountedRef.current = true;

    function beforeUnload(event: BeforeUnloadEvent) {
      if (
        busyRef.current ||
        savingRef.current ||
        dirtyRelease.current ||
        dirtySongs.current.size > 0
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    }

    window.addEventListener(
      "beforeunload",
      beforeUnload
    );

    const previewUrls = previewUrlsRef.current;

    return () => {
      mountedRef.current = false;

      window.removeEventListener(
        "beforeunload",
        beforeUnload
      );

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      Object.values(previewUrls).forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, []);

  // ========================================
  // CREATE LOCAL MEDIA PREVIEW
  // ========================================

  function setLocalPreview(
    key: string,
    file: File
  ) {
    const oldUrl = previewUrlsRef.current[key];

    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }

    const newUrl = URL.createObjectURL(file);

    previewUrlsRef.current[key] = newUrl;

    if (key === "artwork") {
      setCoverPreview(newUrl);
    } else {
      setAudioPreviews((previous) => ({
        ...previous,
        [key]: newUrl,
      }));
    }
  }

  // ========================================
  // ADD SONG TO RELEASE
  // ========================================

  async function addSong() {
    if (!editable || busyRef.current) return;

    if (
      formRef.current.releaseType === "single" &&
      songsRef.current.length >= 1
    ) {
      setError("A Single can contain only one song.");
      return;
    }

    busyRef.current = true;

    try {
      setBusyAction("adding");
      setError("");
      setMessage("");

      await saveDraft();

      const trackNumber = nextTrackNumber(
        songsRef.current
      );

      const result = await enqueue(() =>
        apiRequest<SongResponse>(
          `/api/songs/release/${releaseId}`,
          "POST",
          {
            trackNumber,
            primaryArtists: [ownerArtistId],
            featuredArtists: [],
          }
        )
      );

      const song = normalizeSong(result.song);

      const next = [...songsRef.current, song];

      songsRef.current = next;

      if (mountedRef.current) {
        setSongs(next);
        setMessage("New track added to your draft.");
      }

    } catch (err) {
      if (mountedRef.current) {
        setError(errorMessage(err));
      }

    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setBusyAction("");
      }
    }
  }

  // ========================================
  // DELETE SONG DRAFT
  // ========================================

  async function deleteSong(songId: string) {
    if (!editable || busyRef.current) return;

    if (!window.confirm("Delete this unfinished song?")) {
      return;
    }

    busyRef.current = true;

    try {
      setBusyAction("deleting");
      setError("");
      setMessage("");

      clearSaveTimer();

      await queueRef.current.catch(() => undefined);

      await enqueue(() =>
        apiRequest(
          `/api/songs/release/${releaseId}/${songId}`,
          "DELETE"
        )
      );

      dirtySongs.current.delete(songId);

      const next = songsRef.current.filter(
        (song) => song._id !== songId
      );

      songsRef.current = next;

      if (mountedRef.current) {
        setSongs(next);
      }

      const oldPreview = previewUrlsRef.current[songId];

      if (oldPreview) {
        URL.revokeObjectURL(oldPreview);

        delete previewUrlsRef.current[songId];
      }

      if (mountedRef.current) {
        setAudioPreviews((previous) => {
          const updated = { ...previous };

          delete updated[songId];

          return updated;
        });
      }

      await saveDraft();

      if (mountedRef.current) {
        setMessage("Song draft deleted.");
      }

    } catch (err) {
      if (mountedRef.current) {
        setError(errorMessage(err));
      }

    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setBusyAction("");
      }
    }
  }

  // ========================================
  // UPLOAD ARTWORK OR AUDIO TO CLOUDFLARE R2
  // ========================================

  async function uploadFile(
    file: File,
    kind: "artwork" | "audio",
    songId?: string
  ) {
    if (!editable || busyRef.current) return;

    if (kind === "audio" && !songId) return;

    busyRef.current = true;

    const key = songId || "artwork";

    try {
      setError("");
      setMessage("");

      setUpload({
        key,
        progress: 0,
      });

      await saveDraft();

      const duration =
        kind === "audio"
          ? await detectAudioDuration(file)
          : 0;

      const media = await uploadArtistMedia(
        file,
        kind,
        (progress) => {
          if (mountedRef.current) {
            setUpload({
              key,
              progress,
            });
          }
        }
      );

      // SAVE UPLOADED AUDIO REFERENCE

      if (songId) {
        const result = await enqueue(() =>
          apiRequest<SongResponse>(
            `/api/songs/release/${releaseId}/${songId}`,
            "PATCH",
            {
              audioUploadId: media.uploadId,
              duration,
            }
          )
        );

        const updatedSong = normalizeSong(result.song);

        const next = songsRef.current.map(
          (song) =>
            song._id === songId ? updatedSong : song
        );

        songsRef.current = next;

        if (mountedRef.current) {
          setSongs(next);
        }

      } else {

        // SAVE UPLOADED ARTWORK REFERENCE

        const result = await enqueue(() =>
          apiRequest<ReleaseResponse>(
            `/api/releases/mine/${releaseId}`,
            "PATCH",
            {
              coverUploadId: media.uploadId,
            }
          )
        );

        if (mountedRef.current) {
          setRelease(normalizeRelease(result.release));
        }
      }

      if (mountedRef.current) {
        setLocalPreview(key, file);

        setMessage(
          `${file.name} uploaded and saved successfully.`
        );
      }

    } catch (err) {
      if (mountedRef.current) {
        setError(errorMessage(err));
      }

    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setUpload(null);
      }
    }
  }

  // ========================================
  // MANUAL SAVE DRAFT
  // ========================================

  async function manuallySave() {
    if (busyRef.current || !editable) return;

    busyRef.current = true;

    try {
      setBusyAction("saving");
      setError("");
      setMessage("");

      await saveDraft();

      if (
        dirtyRelease.current ||
        dirtySongs.current.size > 0
      ) {
        throw new Error(
          "Some changes remain unsaved. Please try saving again."
        );
      }

      setMessage("Release draft saved successfully.");

    } catch (err) {
      setError(errorMessage(err));

    } finally {
      busyRef.current = false;
      setBusyAction("");
    }
  }

  // ========================================
  // RETURN TO MY MUSIC
  // ========================================

  async function returnToMusic() {
    if (busyRef.current) return;

    if (!editable) {
      navigate(MUSIC_PATH);
      return;
    }

    busyRef.current = true;

    try {
      setBusyAction("saving");
      setError("");

      await saveDraft();

      if (
        dirtyRelease.current ||
        dirtySongs.current.size > 0
      ) {
        throw new Error(
          "Some draft changes remain unsaved."
        );
      }

      navigate(MUSIC_PATH);

    } catch (err) {
      setError(
        `Unable to save before leaving: ${errorMessage(err)}`
      );

    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setBusyAction("");
      }
    }
  }

  // ========================================
  // PUBLISH RELEASE
  // ========================================

  async function publishRelease() {
    if (!editable || busyRef.current) return;

    setError("");
    setMessage("");

    const details = formRef.current;
    const tracks = songsRef.current;

    // VALIDATE RELEASE INFORMATION

    if (!details.title.trim()) {
      setError("Enter a release title.");
      return;
    }

    if (!details.releaseType) {
      setError("Select a release type.");
      return;
    }

    if (!details.releaseDate) {
      setError("Select a release date.");
      return;
    }

    if (!release.coverUploadId) {
      setError("Upload your release artwork.");
      return;
    }

    if (!details.primaryArtists.includes(ownerArtistId)) {
      setError(
        "Your artist profile must remain a primary artist."
      );

      return;
    }

    if (
      hasOverlappingArtists(
        details.primaryArtists,
        details.collaboratingArtists
      )
    ) {
      setError(
        "An artist cannot be both a primary artist and a release collaborator."
      );

      return;
    }

    // VALIDATE RELEASE TRACKS

    if (!tracks.length) {
      setError("Add at least one song.");
      return;
    }

    if (
      details.releaseType === "single" &&
      tracks.length !== 1
    ) {
      setError("A Single must contain exactly one song.");
      return;
    }

    const incompleteSong = tracks.find(
      (song) =>
        !song.title.trim() ||
        !song.genre.trim() ||
        !Number.isFinite(song.duration) ||
        song.duration < 1 ||
        song.trackNumber === null ||
        !Number.isSafeInteger(song.trackNumber) ||
        song.trackNumber < 1 ||
        !song.audioUploadId
    );

    if (incompleteSong) {
      setError(
        `Complete all information and upload the audio for "${incompleteSong.title || "Untitled song"}".`
      );

      return;
    }

    const invalidArtistSong = tracks.find(
      (song) =>
        !song.primaryArtists.includes(ownerArtistId) ||
        hasOverlappingArtists(
          song.primaryArtists,
          song.featuredArtists
        )
    );

    if (invalidArtistSong) {
      setError(
        `Review the artist credits for "${invalidArtistSong.title || "Untitled song"}".`
      );

      return;
    }

    const trackNumbers = tracks.map(
      (song) => song.trackNumber
    );

    if (
      new Set(trackNumbers).size !== trackNumbers.length
    ) {
      setError(
        "Every song must have a unique track number."
      );

      return;
    }

    // VALIDATE PUBLISHING RIGHTS

    if (!rightsConfirmed) {
      setError(
        "Confirm your publishing rights before continuing."
      );

      return;
    }

    busyRef.current = true;

    try {
      setBusyAction("publishing");

      await saveDraft();

      if (
        dirtyRelease.current ||
        dirtySongs.current.size > 0
      ) {
        throw new Error(
          "Some changes are not saved. Save your draft and try again."
        );
      }

      const result = await enqueue(() =>
        apiRequest<ReleaseResponse>(
          `/api/releases/${releaseId}/submit`,
          "PATCH",
          {
            rightsConfirmed: true,
          }
        )
      );

      const publishedRelease = normalizeRelease(
        result.release
      );

      if (publishedRelease.status !== "approved") {
        throw new Error(
          "The server has not confirmed publication."
        );
      }

      setRelease(publishedRelease);

      const publishedSongs = songsRef.current.map(
        (song) => ({
          ...song,
          status: "approved",
        })
      );

      songsRef.current = publishedSongs;

      setSongs(publishedSongs);

      dirtyRelease.current = false;
      dirtySongs.current.clear();

      setSaveState("saved");

      setMessage(
        result.message ||
        "Your music is now live on Emnet Music."
      );

    } catch (err) {
      setError(errorMessage(err));

    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setBusyAction("");
      }
    }
  }

  // ========================================
  // DERIVED EDITOR INFORMATION
  // ========================================

  const saveLabel =
    saveState === "saved"
      ? "Draft saved"
      : saveState === "saving"
        ? "Saving draft..."
        : saveState === "error"
          ? "Draft save failed"
          : "Unsaved changes";

  const published =
    release.status === "approved" &&
    release.visibilityStatus === "visible";

  const sortedSongs = [...songs].sort(
    (a, b) =>
      (a.trackNumber ?? Number.MAX_SAFE_INTEGER) -
      (b.trackNumber ?? Number.MAX_SAFE_INTEGER)
  );

  // ========================================
  // EDITOR INTERFACE
  // ========================================

  return (
    <div className="page-content em-upload-page">

      {/* PAGE HEADER */}

      <div className="em-upload-top">
        <div>
          <button
            type="button"
            className="em-upload-back em-music-back"
            disabled={busy}
            onClick={returnToMusic}
          >
            <ArrowLeft size={17} />
            My Music
          </button>

          <h1>
            {editable ? "Create Music" : "Release Details"}
          </h1>

          <p>
            {editable
              ? "Give your sound a place in the world."
              : "View your release information."}
          </p>
        </div>

        <span
          className={`em-upload-status ${release.status}`}
        >
          {getReleaseStatus(release)}
        </span>
      </div>

      {/* ERROR MESSAGE */}

      {error && (
        <p className="em-upload-error" role="alert">
          {error}
        </p>
      )}

      {/* SUCCESS MESSAGE */}

      {message && (
        <p className="em-upload-success" role="status">
          {message}
        </p>
      )}

      {/* ====================================
          RELEASE INFORMATION
      ==================================== */}

      <section className="em-upload-card">
        <div className="em-upload-section-title">
          <Disc3 size={22} />
          <h2>Release Information</h2>
        </div>

        <div className="em-upload-grid">

          {/* RELEASE TITLE */}

          <label>
            Release Title

            <input
              type="text"
              value={form.title}
              maxLength={200}
              disabled={!editable || busy}
              placeholder="Enter release title"
              onChange={(event) =>
                changeReleaseField(
                  "title",
                  event.target.value
                )
              }
            />
          </label>

          {/* RELEASE TYPE */}

          <label>
            Release Type

            <select
              value={form.releaseType}
              disabled={!editable || busy}
              onChange={(event) =>
                changeReleaseField(
                  "releaseType",
                  event.target.value as ReleaseType
                )
              }
            >
              <option value="">
                Select release type
              </option>

              <option value="single">Single</option>
              <option value="ep">EP</option>
              <option value="album">Album</option>
            </select>
          </label>

          {/* RELEASE DATE */}

          <label>
            Release Date

            <input
              type="date"
              value={form.releaseDate}
              disabled={!editable || busy}
              onChange={(event) =>
                changeReleaseField(
                  "releaseDate",
                  event.target.value
                )
              }
            />

            <small className="em-music-help">
              Music goes live when you publish.
              This date is release information,
              not a scheduled publishing date.
            </small>
          </label>
        </div>

        {/* ==================================
            RELEASE ARTIST CREDITS
        ================================== */}

        <div className="em-music-artist-credits">

          {form.primaryArtists.includes(ownerArtistId) && (
            <div className="em-music-owner-credit">
              <CheckCircle2 size={18} />

              <div>
                <strong>{ownerStageName}</strong>

                <small>
                  Primary artist

                  {editable
                    ? " — automatically included in your release."
                    : ""}
                </small>
              </div>
            </div>
          )}

          <ArtistIdSelector
            label="Additional Primary Artists"
            description="Select other artists who share the main release credit."
            ids={form.primaryArtists.filter(
              (id) => id !== ownerArtistId
            )}
            excludedArtistIds={[
              ownerArtistId,
              ...form.collaboratingArtists,
            ]}
            disabled={!editable || busy}
            onChange={(ids) =>
              changeReleaseField(
                "primaryArtists",
                includeOwner(ownerArtistId, ids)
              )
            }
          />

          <ArtistIdSelector
            label="Release Collaborators"
            description="Select other artists credited on this release."
            ids={form.collaboratingArtists}
            excludedArtistIds={[
              ownerArtistId,
              ...form.primaryArtists,
            ]}
            disabled={!editable || busy}
            onChange={(ids) =>
              changeReleaseField(
                "collaboratingArtists",
                ids
              )
            }
          />
        </div>

        {/* ==================================
            COVER ARTWORK
        ================================== */}

        <div className="em-upload-file-section">
          <h3>Cover Artwork</h3>

          <div className="em-music-artwork-grid">

            {/* LOCAL OR SAVED ARTWORK PREVIEW */}

            {coverPreview ? (
              <img
                className="em-music-cover-preview"
                src={coverPreview}
                alt="Release cover artwork"
              />
            ) : release.coverUploadId &&
              (editable || published) ? (
              <ArtistSavedMediaPreview
                kind="artwork"
                contentId={releaseId}
                uploadId={release.coverUploadId}
                disabled={busy}
              />
            ) : (
              <div className="em-music-cover-placeholder">
                <Disc3 size={48} />

                <span>
                  {release.coverUploadId || release.coverImage
                    ? "Artwork saved"
                    : "No artwork selected"}
                </span>
              </div>
            )}

            <div className="em-upload-file-box">
              <CloudUpload size={28} />

              <p>JPG, PNG or WebP. Maximum 10 MB.</p>

              <p>Recommended: 3000 × 3000 pixels.</p>

              {release.coverUploadId && (
                <strong className="em-upload-file-ready">
                  <CheckCircle2 size={17} />
                  Artwork uploaded
                </strong>
              )}

              {editable && (
                <input
                  type="file"
                  aria-label="Upload release artwork"
                  accept=".jpg,.jpeg,.png,.webp"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];

                    event.target.value = "";

                    if (file) {
                      void uploadFile(file, "artwork");
                    }
                  }}
                />
              )}

              {upload?.key === "artwork" && (
                <>
                  <progress
                    max={100}
                    value={upload.progress}
                  />

                  <strong>{upload.progress}%</strong>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ====================================
          SONGS AND TRACKS
      ==================================== */}

      <section className="em-upload-card">
        <div className="em-upload-section-title em-upload-section-between">
          <div>
            <Music2 size={22} />

            <h2>Songs & Tracks ({songs.length})</h2>
          </div>

          {editable && (
            <button
              type="button"
              className="em-upload-secondary"
              onClick={addSong}
              disabled={
                busy ||
                (
                  form.releaseType === "single" &&
                  songs.length >= 1
                )
              }
            >
              <Plus size={17} />

              {busyAction === "adding"
                ? "Adding..."
                : "Add Song"}
            </button>
          )}
        </div>

        {songs.length === 0 ? (
          <div className="em-upload-empty">
            <Music2 size={34} />

            <h2>No tracks yet</h2>

            <p>Add the first song to your release.</p>
          </div>
        ) : (
          <div className="em-upload-songs">
            {sortedSongs.map((song) => (
              <div
                key={song._id}
                className="em-upload-song-card"
              >

                {/* TRACK HEADER */}

                <div className="em-upload-song-head">
                  <strong>
                    Track {song.trackNumber ?? "—"}

                    {song.title ? ` · ${song.title}` : ""}
                  </strong>

                  {editable && (
                    <button
                      type="button"
                      className="em-upload-delete"
                      disabled={busy}
                      aria-label="Delete song draft"
                      title="Delete song draft"
                      onClick={() => deleteSong(song._id)}
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>

                {/* SONG INFORMATION */}

                <div className="em-upload-grid">

                  {/* SONG TITLE */}

                  <label>
                    Song Title

                    <input
                      type="text"
                      value={song.title}
                      maxLength={200}
                      disabled={!editable || busy}
                      placeholder="Enter song title"
                      onChange={(event) =>
                        changeSongField(
                          song._id,
                          "title",
                          event.target.value
                        )
                      }
                    />
                  </label>

                  {/* SONG GENRE */}

                  <label>
                    Genre

                    <select
                      value={song.genre}
                      disabled={!editable || busy}
                      onChange={(event) =>
                        changeSongField(
                          song._id,
                          "genre",
                          event.target.value
                        )
                      }
                    >
                      <option value="">Select genre</option>

                      {song.genre &&
                        !MUSIC_GENRES.some(
                          (genre) => genre === song.genre
                        ) && (
                          <option value={song.genre}>
                            {song.genre}
                          </option>
                        )}

                      {MUSIC_GENRES.map((genre) => (
                        <option
                          key={genre}
                          value={genre}
                        >
                          {genre}
                        </option>
                      ))}
                    </select>
                  </label>

                  {/* TRACK NUMBER */}

                  <label>
                    Track Number

                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={song.trackNumber ?? ""}
                      disabled={!editable || busy}
                      onChange={(event) => {
                        const value = event.target.value;

                        const number = value
                          ? Number(value)
                          : null;

                        if (
                          number !== null &&
                          (
                            !Number.isSafeInteger(number) ||
                            number < 1
                          )
                        ) {
                          return;
                        }

                        changeSongField(
                          song._id,
                          "trackNumber",
                          number
                        );
                      }}
                    />

                    <small className="em-music-help">
                      Automatically assigned.
                      You can change it.
                    </small>
                  </label>

                  {/* SONG DURATION */}

                  <label>
                    Song Duration

                    <input
                      type="text"
                      readOnly
                      value={formatAudioDuration(song.duration)}
                    />

                    <small className="em-music-help">
                      Automatically detected from uploaded audio.
                    </small>
                  </label>

                  {/* ISRC */}

                  <label>
                    ISRC (optional)

                    <input
                      type="text"
                      value={song.isrc}
                      maxLength={20}
                      placeholder="Enter ISRC"
                      disabled={!editable || busy}
                      onChange={(event) =>
                        changeSongField(
                          song._id,
                          "isrc",
                          event.target.value.toUpperCase()
                        )
                      }
                    />
                  </label>
                </div>

                {/* ==================================
                    SONG ARTIST CREDITS
                ================================== */}

                <div className="em-music-artist-credits">

                  {song.primaryArtists.includes(
                    ownerArtistId
                  ) && (
                    <div className="em-music-owner-credit">
                      <CheckCircle2 size={18} />

                      <div>
                        <strong>{ownerStageName}</strong>

                        <small>Primary artist</small>
                      </div>
                    </div>
                  )}

                  <ArtistIdSelector
                    label="Additional Primary Artists"
                    description="Select artists who share the main credit for this song."
                    ids={song.primaryArtists.filter(
                      (id) => id !== ownerArtistId
                    )}
                    excludedArtistIds={[
                      ownerArtistId,
                      ...song.featuredArtists,
                    ]}
                    disabled={!editable || busy}
                    onChange={(ids) =>
                      changeSongField(
                        song._id,
                        "primaryArtists",
                        includeOwner(ownerArtistId, ids)
                      )
                    }
                  />

                  <ArtistIdSelector
                    label="Featured Artists"
                    description="Search for artists featured on this particular song."
                    ids={song.featuredArtists}
                    excludedArtistIds={[
                      ownerArtistId,
                      ...song.primaryArtists,
                    ]}
                    disabled={!editable || busy}
                    onChange={(ids) =>
                      changeSongField(
                        song._id,
                        "featuredArtists",
                        ids
                      )
                    }
                  />
                </div>

                {/* ==================================
                    SONG AUDIO UPLOAD
                ================================== */}

                <div className="em-upload-file-section">
                  <h3>Audio File</h3>

                  <div className="em-upload-file-box">
                    <CloudUpload size={26} />

                    <p>
                      MP3, WAV, FLAC or M4A.
                      Maximum 100 MB.
                    </p>

                    {song.audioUploadId ? (
                      <strong className="em-upload-file-ready">
                        <CheckCircle2 size={17} />

                        Audio uploaded

                        {" · "}

                        {formatAudioDuration(song.duration)}
                      </strong>
                    ) : (
                      <span>
                        {song.audioUrl
                          ? "Legacy audio — upload a new file for publishing."
                          : "No audio uploaded yet"}
                      </span>
                    )}

                    {editable && (
                      <input
                        type="file"
                        aria-label={`Upload audio for ${song.title || "song"}`}
                        accept=".mp3,.wav,.flac,.m4a"
                        disabled={busy}
                        onChange={(event) => {
                          const file =
                            event.target.files?.[0];

                          event.target.value = "";

                          if (file) {
                            void uploadFile(
                              file,
                              "audio",
                              song._id
                            );
                          }
                        }}
                      />
                    )}

                    {upload?.key === song._id && (
                      <>
                        <progress
                          max={100}
                          value={upload.progress}
                        />

                        <strong>{upload.progress}%</strong>
                      </>
                    )}
                  </div>

                  {/* =================================
                      LOCAL OR SAVED AUDIO PREVIEW
                  ================================= */}

                  {audioPreviews[song._id] ? (
                    <div className="em-music-audio-preview">
                      <span>Listen to your song</span>

                      <audio
                        controls
                        preload="metadata"
                        src={audioPreviews[song._id]}
                      />
                    </div>
                  ) : song.audioUploadId &&
                    (editable || published) &&
                    ["draft", "approved"].includes(
                      song.status
                    ) ? (
                    <ArtistSavedMediaPreview
                      kind="audio"
                      contentId={song._id}
                      uploadId={song.audioUploadId}
                      disabled={busy}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ====================================
          COPYRIGHT CONFIRMATION
      ==================================== */}

      {editable && (
        <section className="em-upload-card">
          <div className="em-upload-section-title">
            <h2>Copyright & Publishing</h2>
          </div>

          <label className="em-music-rights">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              disabled={busy}
              onChange={(event) =>
                setRightsConfirmed(event.target.checked)
              }
            />

            <span>
              I confirm that I own this music, artwork
              and associated content, or have obtained
              the necessary permission to publish it
              on Emnet Music.

              I also confirm that I have permission
              to credit the selected artists.
            </span>
          </label>

          <p className="em-music-help">
            Your release becomes available to listeners
            immediately after successful publication.
            No admin approval is required.
          </p>
        </section>
      )}

      {/* ====================================
          SAVE AND PUBLISH
      ==================================== */}

      {editable && (
        <section className="em-upload-actions">
          <div>
            <strong>{saveLabel}</strong>

            <p>Save your draft and continue later.</p>
          </div>

          <div className="em-upload-action-buttons">

            {/* SAVE DRAFT */}

            <button
              type="button"
              className="em-upload-secondary"
              onClick={manuallySave}
              disabled={busy}
            >
              <Save size={17} />

              {busyAction === "saving"
                ? "Saving..."
                : "Save Draft"}
            </button>

            {/* PUBLISH */}

            <button
              type="button"
              className="em-upload-primary"
              onClick={publishRelease}
              disabled={busy}
            >
              <CloudUpload size={18} />

              {busyAction === "publishing"
                ? "Publishing..."
                : "Publish Now"}
            </button>
          </div>
        </section>
      )}

      {/* ====================================
          SUCCESSFUL PUBLICATION
      ==================================== */}

      {published && (
        <section className="em-upload-published">
          <CheckCircle2 size={27} />

          <div>
            <strong>Your release is published</strong>

            <p>
              Your music is now available to listeners
              on Emnet Music.
            </p>

            <button
              type="button"
              className="em-upload-secondary em-music-return"
              onClick={returnToMusic}
            >
              Return to My Music
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// ==========================================
// MAIN PAGE EXPORT
//
// This component does not require props.
// It retrieves releaseId from React Router.
// ==========================================

export default function ArtistMusicUploadPage() {
  const { releaseId } = useParams<{
    releaseId?: string;
  }>();

  if (!releaseId) {
    return <ArtistMusicList />;
  }

  return (
    <ArtistMusicLoader
      key={releaseId}
      releaseId={releaseId}
    />
  );
}