
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  Link,
  useNavigate,
  useParams,
} from "react-router";

import {
  ArrowLeft,
  CheckCircle2,
  Clapperboard,
  CloudUpload,
  ImagePlus,
  Plus,
  Save,
  Trash2,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

import ArtistIdSelector from "../components/ArtistIdSelector";
import LinkedMusicSelector from "../components/LinkedMusicSelector";
import ArtistSavedMediaPreview from "../components/ArtistSavedMediaPreview";

import {
  normalizeArtistIds,
} from "../services/artistSelectionApi";

import {
  uploadArtistMedia,
} from "../services/artistMediaUploadApi";

import {
  MUSIC_GENRES,
} from "../constants/musicGenres";

import "./ArtistMusicUploadPage.css";
import "./ArtistVideoUploadPage.css";

// ==========================================
// API CONFIGURATION
// ==========================================

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

const VIDEO_PATH = "/artist/studio/videos";

// ==========================================
// TYPES
// ==========================================

type VideoType =
  | "music_video"
  | "live_performance"
  | "interview"
  | "other";

type VideoStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected";

type VideoForm = {
  title: string;
  description: string;
  genre: string;
  videoType: VideoType;
  duration: number;

  videoUploadId: string | null;
  thumbnailUploadId: string | null;

  primaryArtists: string[];
  featuredArtists: string[];

  linkedSong: string | null;
  linkedRelease: string | null;
};

type ArtistVideo = VideoForm & {
  _id: string;
  status: VideoStatus;
  visibilityStatus: string;

  videoUrl: string;
  thumbnailUrl: string;

  viewCount: number;

  updatedAt: string;
  publishedAt: string | null;
};

type VideoResponse = {
  success: boolean;
  message?: string;
  video: ArtistVideo;
};

type VideoListResponse = {
  success: boolean;
  videos: ArtistVideo[];
};

type Metadata = {
  title: string;
  description: string;
  genre: string;
  videoType: VideoType;

  featuredArtists: string[];

  linkedSong: string | null;
  linkedRelease: string | null;
};

type UploadState = {
  kind: "video" | "thumbnail";
  progress: number;
} | null;

type SaveStatus =
  | "saved"
  | "saving"
  | "unsaved"
  | "error";

// ==========================================
// HELPERS
// ==========================================

function errorMessage(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong.";
}

// ==========================================
// EXTRACT DATABASE ID
// ==========================================

function getId(value: unknown): string {
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

// ==========================================
// NORMALIZE VIDEO INFORMATION
// ==========================================

function normalizeVideo(
  value: ArtistVideo
): ArtistVideo {
  return {
    ...value,

    title: value.title || "",

    description:
      value.description || "",

    genre: value.genre || "",

    videoType:
      value.videoType ||
      "music_video",

    duration:
      Number(value.duration || 0),

    videoUploadId:
      getId(value.videoUploadId) ||
      null,

    thumbnailUploadId:
      getId(value.thumbnailUploadId) ||
      null,

    primaryArtists:
      normalizeArtistIds(
        value.primaryArtists
      ),

    featuredArtists:
      normalizeArtistIds(
        value.featuredArtists
      ),

    linkedSong:
      getId(value.linkedSong) ||
      null,

    linkedRelease:
      getId(value.linkedRelease) ||
      null,

    videoUrl:
      value.videoUrl || "",

    thumbnailUrl:
      value.thumbnailUrl || "",

    viewCount:
      Number(value.viewCount || 0),

    visibilityStatus:
      value.visibilityStatus ||
      "visible",
  };
}

// ==========================================
// EXTRACT EDITABLE VIDEO METADATA
// ==========================================

function getMetadata(
  video: ArtistVideo
): Metadata {
  return {
    title: video.title,

    description:
      video.description,

    genre: video.genre,

    videoType:
      video.videoType,

    featuredArtists: [
      ...video.featuredArtists,
    ],

    linkedSong:
      video.linkedSong,

    linkedRelease:
      video.linkedRelease,
  };
}

// ==========================================
// FORMAT VIDEO DURATION
// ==========================================

function formatDuration(
  duration: number
): string {
  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return "Not detected";
  }

  const seconds =
    Math.floor(duration);

  const hours =
    Math.floor(seconds / 3600);

  const minutes =
    Math.floor((seconds % 3600) / 60);

  const remainingSeconds =
    String(seconds % 60).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(
      2,
      "0"
    )}:${remainingSeconds}`;
  }

  return `${minutes}:${remainingSeconds}`;
}

// ==========================================
// FORMAT VIDEO STATUS
// ==========================================

function getVideoStatus(
  video: ArtistVideo
): string {
  if (
    video.visibilityStatus !==
    "visible"
  ) {
    return video.visibilityStatus;
  }

  return video.status === "approved"
    ? "Published"
    : video.status;
}

// ==========================================
// CHECK PRIVATE PREVIEW ELIGIBILITY
// ==========================================

function canPreviewVideo(
  video: ArtistVideo
): boolean {
  return (
    video.visibilityStatus === "visible" &&
    ["draft", "approved"].includes(
      video.status
    )
  );
}

// ==========================================
// AUTHENTICATED API REQUEST
// ==========================================

async function apiRequest<T>(
  path: string,
  method = "GET",
  body?: unknown
): Promise<T> {
  const token =
    sessionStorage.getItem(
      TOKEN_KEY
    );

  if (!token) {
    throw new Error(
      "Please sign in again."
    );
  }

  const response = await fetch(
    `${API_BASE_URL}${path}`,

    {
      method,

      cache: "no-store",

      headers: {
        Authorization:
          `Bearer ${token}`,

        ...(body !== undefined
          ? {
              "Content-Type":
                "application/json",
            }
          : {}),
      },

      ...(body !== undefined
        ? {
            body: JSON.stringify(body),
          }
        : {}),
    }
  );

  const payload = await response
    .json()
    .catch(() => null);

  if (
    !response.ok ||
    !payload?.success
  ) {
    throw new Error(
      payload?.message ||
      `Request failed (${response.status}).`
    );
  }

  return payload as T;
}

// ==========================================
// AUTOMATIC VIDEO DURATION DETECTION
// ==========================================

function detectVideoDuration(
  file: File
): Promise<number> {
  return new Promise(
    (resolve, reject) => {
      const element =
        document.createElement(
          "video"
        );

      const url =
        URL.createObjectURL(file);

      let finished = false;

      const timer = window.setTimeout(
        () =>
          finish(
            new Error(
              "Video information could not be read."
            )
          ),

        15000
      );

      function finish(
        error?: Error,
        duration?: number
      ) {
        if (finished) {
          return;
        }

        finished = true;

        window.clearTimeout(timer);

        element.onloadedmetadata = null;
        element.onerror = null;

        element.removeAttribute("src");
        element.load();

        URL.revokeObjectURL(url);

        if (error) {
          reject(error);

        } else {
          resolve(duration || 0);
        }
      }

      element.preload = "metadata";

      element.onloadedmetadata = () => {
        const duration =
          element.duration;

        if (
          !Number.isFinite(duration) ||
          duration < 1
        ) {
          finish(
            new Error(
              "The video has an invalid duration."
            )
          );

          return;
        }

        finish(
          undefined,

          Math.round(
            duration * 100
          ) / 100
        );
      };

      element.onerror = () => {
        finish(
          new Error(
            "Unable to read this video. Check its format or encoding."
          )
        );
      };

      element.src = url;
    }
  );
}

// ==========================================
// VIDEO MANAGEMENT LIST
// ==========================================

function ArtistVideoList() {
  const navigate = useNavigate();

  const [videos, setVideos] =
    useState<ArtistVideo[]>([]);

  const [tab, setTab] =
    useState<
      "drafts" |
      "published" |
      "other"
    >("drafts");

  const [loading, setLoading] =
    useState(true);

  const [creating, setCreating] =
    useState(false);

  const [error, setError] =
    useState("");

  const creatingRef =
    useRef(false);

  const mountedRef =
    useRef(true);

  // ========================================
  // LOAD ARTIST VIDEOS
  // ========================================

  useEffect(() => {
    let cancelled = false;

    mountedRef.current = true;

    async function loadVideos() {
      try {
        const result =
          await apiRequest<
            VideoListResponse
          >("/api/videos/mine");

        if (!cancelled) {
          setVideos(
            (result.videos || [])
              .map(normalizeVideo)
          );
        }

      } catch (err) {
        if (!cancelled) {
          setError(
            errorMessage(err)
          );
        }

      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadVideos();

    return () => {
      cancelled = true;

      mountedRef.current = false;
    };
  }, []);

  // ========================================
  // CREATE EMPTY VIDEO DRAFT
  // ========================================

  async function createVideo() {
    if (creatingRef.current) {
      return;
    }

    creatingRef.current = true;

    try {
      setCreating(true);

      setError("");

      const result =
        await apiRequest<
          VideoResponse
        >(
          "/api/videos",

          "POST",

          {}
        );

      const videoId =
        getId(result.video?._id);

      if (!videoId) {
        throw new Error(
          "The server did not return a video ID."
        );
      }

      if (mountedRef.current) {
        navigate(
          `${VIDEO_PATH}/${videoId}`
        );
      }

    } catch (err) {
      if (mountedRef.current) {
        setError(
          errorMessage(err)
        );
      }

    } finally {
      creatingRef.current = false;

      if (mountedRef.current) {
        setCreating(false);
      }
    }
  }

  // ========================================
  // VIDEO STATUS FILTERS
  // ========================================

  const drafts = videos.filter(
    (video) =>
      video.status === "draft" &&
      video.visibilityStatus ===
        "visible"
  );

  const published = videos.filter(
    (video) =>
      video.status === "approved" &&
      video.visibilityStatus ===
        "visible"
  );

  const other = videos.filter(
    (video) =>
      video.visibilityStatus !==
        "visible" ||

      !["draft", "approved"].includes(
        video.status
      )
  );

  const visibleVideos =
    tab === "drafts"
      ? drafts
      : tab === "published"
        ? published
        : other;

  // ========================================
  // VIDEO MANAGEMENT INTERFACE
  // ========================================

  return (
    <div className="page-content em-upload-page">

      {/* PAGE HEADER */}

      <div className="em-upload-top">
        <div>
          <Link
            to="/artist/studio"
            className="em-upload-back"
          >
            <ArrowLeft size={17} />

            Artist Studio
          </Link>

          <h1>My Videos</h1>

          <p>
            Upload, publish and manage
            your music videos.
          </p>
        </div>

        <button
          type="button"
          className="em-upload-primary"
          disabled={creating}
          onClick={createVideo}
        >
          <Plus size={18} />

          {creating
            ? "Creating..."
            : "Upload Video"}
        </button>
      </div>

      {/* ERROR MESSAGE */}

      {error && (
        <p
          className="em-upload-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* CONTENT STATISTICS */}

      <div className="em-video-stats">

        <div className="em-video-stat">
          <Clapperboard size={23} />

          <span>Total videos</span>

          <strong>
            {loading
              ? "—"
              : videos.length}
          </strong>
        </div>

        <div className="em-video-stat">
          <Save size={23} />

          <span>Drafts</span>

          <strong>
            {loading
              ? "—"
              : drafts.length}
          </strong>
        </div>

        <div className="em-video-stat">
          <CheckCircle2 size={23} />

          <span>Published</span>

          <strong>
            {loading
              ? "—"
              : published.length}
          </strong>
        </div>
      </div>

      {/* VIDEO STATUS TABS */}

      <div
        className="em-video-tabs"
        aria-label="Video status filters"
      >
        <button
          type="button"

          className={
            tab === "drafts"
              ? "active"
              : ""
          }

          aria-pressed={
            tab === "drafts"
          }

          onClick={() =>
            setTab("drafts")
          }
        >
          Drafts ({drafts.length})
        </button>

        <button
          type="button"

          className={
            tab === "published"
              ? "active"
              : ""
          }

          aria-pressed={
            tab === "published"
          }

          onClick={() =>
            setTab("published")
          }
        >
          Published ({published.length})
        </button>

        {other.length > 0 && (
          <button
            type="button"

            className={
              tab === "other"
                ? "active"
                : ""
            }

            aria-pressed={
              tab === "other"
            }

            onClick={() =>
              setTab("other")
            }
          >
            Other ({other.length})
          </button>
        )}
      </div>

      {/* VIDEO LIST */}

      {loading ? (

        <div className="em-upload-empty">
          Loading your videos...
        </div>

      ) : visibleVideos.length === 0 ? (

        <div className="em-upload-empty">
          <Clapperboard size={40} />

          <h2>
            {tab === "drafts"
              ? "No video drafts"
              : tab === "published"
                ? "No published videos yet"
                : "No matching videos"}
          </h2>

          <p>
            {tab === "drafts"
              ? "Start uploading your next video."
              : "Your matching videos will appear here."}
          </p>
        </div>

      ) : (

        <div className="em-upload-release-list">

          {visibleVideos.map(
            (video) => (
              <Link
                key={video._id}

                to={
                  `${VIDEO_PATH}/${video._id}`
                }

                className="em-upload-release-row"
              >

                <span className="em-video-list-icon">
                  <Clapperboard size={25} />
                </span>

                <span className="em-upload-release-info">
                  <strong>
                    {video.title ||
                      "Untitled video"}
                  </strong>

                  <small>
                    {video.videoType
                      .replace(/_/g, " ")}

                    {" · "}

                    {formatDuration(
                      video.duration
                    )}
                  </small>

                  {video.status ===
                    "draft" && (

                    <small>
                      {video.videoUploadId
                        ? "Video uploaded"
                        : "Video incomplete"}

                      {" · "}

                      {video.thumbnailUploadId
                        ? "Thumbnail uploaded"
                        : "No thumbnail"}
                    </small>
                  )}

                  {video.status ===
                    "approved" && (

                    <small>
                      {video.viewCount} views
                    </small>
                  )}
                </span>

                <span
                  className={
                    `em-upload-status ${video.status}`
                  }
                >
                  {getVideoStatus(video)}
                </span>

              </Link>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ==========================================
// LOAD A SAVED VIDEO
// ==========================================

function ArtistVideoLoader({
  videoId,
}: {
  videoId: string;
}) {
  const [video, setVideo] =
    useState<ArtistVideo | null>(
      null
    );

  const [error, setError] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadVideo() {
      try {
        const result =
          await apiRequest<
            VideoResponse
          >(
            `/api/videos/mine/${videoId}`
          );

        if (!cancelled) {
          setVideo(
            normalizeVideo(
              result.video
            )
          );
        }

      } catch (err) {
        if (!cancelled) {
          setError(
            errorMessage(err)
          );
        }
      }
    }

    void loadVideo();

    return () => {
      cancelled = true;
    };

  }, [videoId]);

  if (!video) {
    return (
      <div className="page-content em-upload-page">

        <Link
          to={VIDEO_PATH}
          className="em-upload-back"
        >
          <ArrowLeft size={17} />

          My Videos
        </Link>

        {error ? (

          <p
            className="em-upload-error"
            role="alert"
          >
            {error}
          </p>

        ) : (

          <div className="em-upload-empty">
            Loading video...
          </div>

        )}
      </div>
    );
  }

  return (
    <ArtistVideoEditor
      key={videoId}
      initialVideo={video}
    />
  );
}

// ==========================================
// VIDEO DRAFT EDITOR
// ==========================================

function ArtistVideoEditor({
  initialVideo,
}: {
  initialVideo: ArtistVideo;
}) {
  const navigate =
    useNavigate();

  const { user } =
    useAuth();

  const videoId =
    initialVideo._id;

  const recoveryKey =
    `emnet_video_draft_${user?.id}_${videoId}`;

  const [video, setVideo] =
    useState(initialVideo);

  // ========================================
  // RESTORE SAVED DRAFT INFORMATION
  // ========================================

  const [metadata, setMetadata] =
    useState<Metadata>(() => {
      const initial =
        getMetadata(initialVideo);

      if (
        initialVideo.status !== "draft" ||
        initialVideo.visibilityStatus !==
          "visible"
      ) {
        return initial;
      }

      try {
        const stored =
          localStorage.getItem(
            recoveryKey
          );

        if (!stored) {
          return initial;
        }

        const recovery =
          JSON.parse(stored);

        if (
          recovery.baseUpdatedAt !==
            initialVideo.updatedAt ||

          !recovery.metadata
        ) {
          return initial;
        }

        const recovered =
          recovery.metadata;

        return {
          title:
            typeof recovered.title === "string"
              ? recovered.title
              : initial.title,

          description:
            typeof recovered.description === "string"
              ? recovered.description
              : initial.description,

          genre:
            typeof recovered.genre === "string"
              ? recovered.genre
              : initial.genre,

          videoType:
            [
              "music_video",
              "live_performance",
              "interview",
              "other",
            ].includes(recovered.videoType)
              ? recovered.videoType
              : initial.videoType,

          featuredArtists:
            Array.isArray(
              recovered.featuredArtists
            )
              ? normalizeArtistIds(
                  recovered.featuredArtists
                )
              : initial.featuredArtists,

          linkedSong:
            recovered.linkedSong === null
              ? null
              : typeof recovered.linkedSong === "string"
                ? recovered.linkedSong
                : initial.linkedSong,

          linkedRelease:
            recovered.linkedRelease === null
              ? null
              : typeof recovered.linkedRelease === "string"
                ? recovered.linkedRelease
                : initial.linkedRelease,
        };

      } catch {
        return initial;
      }
    });

  // ========================================
  // CURRENT DRAFT REFERENCES
  // ========================================

  const metadataRef =
    useRef(metadata);

  const updatedAtRef =
    useRef(initialVideo.updatedAt);

  const dirtyRef =
    useRef(
      JSON.stringify(metadata) !==
      JSON.stringify(
        getMetadata(initialVideo)
      )
    );

  const queueRef =
    useRef<Promise<unknown>>(
      Promise.resolve()
    );

  const timerRef =
    useRef<
      ReturnType<typeof setTimeout> |
      null
    >(null);

  const mountedRef =
    useRef(true);

  const busyRef =
    useRef(false);

  const savingRef =
    useRef(false);

  // ========================================
  // EDITOR STATES
  // ========================================

  const [saveStatus, setSaveStatus] =
    useState<SaveStatus>(
      dirtyRef.current
        ? "unsaved"
        : "saved"
    );

  const [upload, setUpload] =
    useState<UploadState>(null);

  const [publishing, setPublishing] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [rightsConfirmed, setRightsConfirmed] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  // ========================================
  // EDITOR PERMISSIONS
  // ========================================

  const editable =
    video.status === "draft" &&
    video.visibilityStatus ===
      "visible";

  const busy =
    upload !== null ||
    publishing ||
    deleting ||
    saving;

  const previewAllowed =
    canPreviewVideo(video);

  // ========================================
  // LOCAL DRAFT RECOVERY
  // ========================================

  function saveLocalRecovery() {
    try {
      localStorage.setItem(
        recoveryKey,

        JSON.stringify({
          baseUpdatedAt:
            updatedAtRef.current,

          metadata:
            metadataRef.current,
        })
      );

    } catch {
      // Server-side draft saving
      // remains available.
    }
  }

  function clearLocalRecovery() {
    try {
      localStorage.removeItem(
        recoveryKey
      );

    } catch {
      // Local storage unavailable.
    }
  }

  // ========================================
  // SERIALIZE SERVER WRITES
  // ========================================

  function enqueue<T>(
    job: () => Promise<T>
  ): Promise<T> {
    const result =
      queueRef.current.then(
        job,
        job
      );

    queueRef.current = result;

    return result;
  }

  // ========================================
  // CLEAR AUTOSAVE TIMER
  // ========================================

  function clearSaveTimer() {
    if (timerRef.current) {
      clearTimeout(
        timerRef.current
      );

      timerRef.current = null;
    }
  }

  // ========================================
  // VALIDATE ARTIST AND MUSIC SELECTIONS
  // ========================================

  function validateRelationships(
    details: Metadata
  ) {
    const selectedIds = [
      ...details.featuredArtists,

      details.linkedSong,

      details.linkedRelease,
    ].filter(
      (id): id is string =>
        Boolean(id)
    );

    // Verify valid artist and music IDs.

    if (
      selectedIds.some(
        (id) =>
          !/^[a-f0-9]{24}$/i.test(id)
      )
    ) {
      throw new Error(
        "One or more selected artists or music records are invalid."
      );
    }

    // Limit featured artists.

    if (
      details.featuredArtists.length > 10
    ) {
      throw new Error(
        "You can select up to 10 featured artists."
      );
    }

    // Prevent duplicate featured artists.

    if (
      new Set(
        details.featuredArtists
      ).size !==
        details.featuredArtists.length
    ) {
      throw new Error(
        "The same featured artist cannot be selected twice."
      );
    }

    // Prevent overlapping artist credits.

    if (
      details.featuredArtists.some(
        (id) =>
          video.primaryArtists.includes(id)
      )
    ) {
      throw new Error(
        "A primary artist cannot also be a featured artist on this video."
      );
    }
  }

  // ========================================
  // SAVE ALL VIDEO DRAFT INFORMATION
  //
  // Text, genre, artists and linked music
  // are saved in the same PATCH request.
  // ========================================

  async function saveDraft() {
    if (!editable) {
      return;
    }

    clearSaveTimer();

    await enqueue(async () => {
      savingRef.current = true;

      try {
        if (!dirtyRef.current) {
          if (mountedRef.current) {
            setSaveStatus("saved");
          }

          return;
        }

        const snapshot: Metadata = {
          ...metadataRef.current,

          featuredArtists: [
            ...metadataRef.current
              .featuredArtists,
          ],
        };

        validateRelationships(
          snapshot
        );

        if (mountedRef.current) {
          setSaveStatus("saving");
        }

        // Save the complete draft metadata.

        const result =
          await apiRequest<
            VideoResponse
          >(
            `/api/videos/${videoId}`,

            "PATCH",

            snapshot
          );

        const updated =
          normalizeVideo(
            result.video
          );

        updatedAtRef.current =
          updated.updatedAt;

        // Check whether the artist changed
        // any information during saving.

        const changedAgain =
          JSON.stringify(snapshot) !==
          JSON.stringify(
            metadataRef.current
          );

        dirtyRef.current =
          changedAgain;

        if (changedAgain) {
          saveLocalRecovery();

        } else {
          const savedMetadata =
            getMetadata(updated);

          metadataRef.current =
            savedMetadata;

          clearLocalRecovery();

          if (mountedRef.current) {
            setMetadata(
              savedMetadata
            );
          }
        }

        if (mountedRef.current) {
          setVideo(updated);

          setSaveStatus(
            changedAgain
              ? "unsaved"
              : "saved"
          );
        }

      } catch (err) {
        dirtyRef.current = true;

        saveLocalRecovery();

        if (mountedRef.current) {
          setSaveStatus("error");
        }

        throw err;

      } finally {
        savingRef.current = false;
      }
    });
  }

  // ========================================
  // AUTOMATIC SAVE SCHEDULER
  // ========================================

  function scheduleSave() {
    setSaveStatus("unsaved");

    clearSaveTimer();

    timerRef.current =
      setTimeout(() => {
        void saveDraft().catch(
          (err) => {
            if (mountedRef.current) {
              setError(
                `Draft save failed: ${errorMessage(err)}`
              );
            }
          }
        );
      }, 700);
  }

  // ========================================
  // UPDATE DRAFT INFORMATION
  // ========================================

  function updateMetadata(
    changes: Partial<Metadata>
  ) {
    if (
      !editable ||
      busyRef.current
    ) {
      return;
    }

    const next = {
      ...metadataRef.current,
      ...changes,
    };

    metadataRef.current = next;

    dirtyRef.current = true;

    setMetadata(next);

    setError("");

    setMessage("");

    setRightsConfirmed(false);

    saveLocalRecovery();

    scheduleSave();
  }

  // ========================================
  // CHANGE SINGLE METADATA FIELD
  // ========================================

  function changeMetadata<
    K extends keyof Metadata
  >(
    key: K,
    value: Metadata[K]
  ) {
    updateMetadata({
      [key]: value,
    });
  }

  // ========================================
  // SELECT FEATURED ARTISTS
  // ========================================

  function changeFeaturedArtists(
    ids: string[]
  ) {
    const uniqueIds = [
      ...new Set(ids),
    ];

    if (
      uniqueIds.some(
        (id) =>
          video.primaryArtists.includes(id)
      )
    ) {
      setError(
        "A primary artist cannot also be a featured artist."
      );

      return;
    }

    if (uniqueIds.length > 10) {
      setError(
        "You can select up to 10 featured artists."
      );

      return;
    }

    changeMetadata(
      "featuredArtists",

      uniqueIds
    );
  }

  // ========================================
  // SELECT LINKED SONG AND RELEASE
  // ========================================

  function changeLinkedMusic(
    releaseId: string,
    songId: string
  ) {
    updateMetadata({
      linkedRelease:
        releaseId || null,

      linkedSong:
        songId || null,
    });
  }

  // ========================================
  // COMPONENT CLEANUP
  //
  // Warn the artist before leaving a page
  // with unfinished saving or uploading.
  // ========================================

  useEffect(() => {
    mountedRef.current = true;

    function beforeUnload(
      event: BeforeUnloadEvent
    ) {
      if (
        busyRef.current ||
        savingRef.current ||
        dirtyRef.current
      ) {
        event.preventDefault();

        event.returnValue = "";
      }
    }

    window.addEventListener(
      "beforeunload",

      beforeUnload
    );

    return () => {
      mountedRef.current = false;

      window.removeEventListener(
        "beforeunload",

        beforeUnload
      );

      if (timerRef.current) {
        clearTimeout(
          timerRef.current
        );

        timerRef.current = null;
      }
    };
  }, []);

  // ========================================
  // UPLOAD VIDEO OR THUMBNAIL
  //
  // All media previews are displayed
  // through ArtistSavedMediaPreview.
  // ========================================

  async function handleUpload(
    file: File,
    kind: "video" | "thumbnail"
  ) {
    if (
      !editable ||
      busyRef.current
    ) {
      return;
    }

    busyRef.current = true;

    try {
      setError("");

      setMessage("");

      setUpload({
        kind,
        progress: 0,
      });

      // ====================================
      // SAVE CURRENT DRAFT INFORMATION
      // ====================================

      await saveDraft();

      if (dirtyRef.current) {
        throw new Error(
          "Some draft changes remain unsaved. Please save your draft before uploading."
        );
      }

      // ====================================
      // DETECT VIDEO DURATION
      // ====================================

      let duration =
        video.duration;

      if (kind === "video") {
        duration =
          await detectVideoDuration(
            file
          );
      }

      // ====================================
      // DIRECT CLOUDFLARE R2 UPLOAD
      // ====================================

      const media =
        await uploadArtistMedia(
          file,

          kind,

          (progress) => {
            if (mountedRef.current) {
              setUpload({
                kind,
                progress,
              });
            }
          }
        );

      // ====================================
      // ATTACH CONFIRMED MEDIA TO DRAFT
      // ====================================

      const result =
        await enqueue(() =>
          apiRequest<
            VideoResponse
          >(
            `/api/videos/${videoId}`,

            "PATCH",

            kind === "video"
              ? {
                  videoUploadId:
                    media.uploadId,

                  duration,
                }
              : {
                  thumbnailUploadId:
                    media.uploadId,
                }
          )
        );

      // ====================================
      // NORMALIZE SAVED VIDEO RESPONSE
      // ====================================

      const updated =
        normalizeVideo(
          result.video
        );

      updatedAtRef.current =
        updated.updatedAt;

      // ====================================
      // SYNCHRONIZE SAVED METADATA
      // ====================================

      if (dirtyRef.current) {
        saveLocalRecovery();

      } else {
        const savedMetadata =
          getMetadata(updated);

        metadataRef.current =
          savedMetadata;

        clearLocalRecovery();

        if (mountedRef.current) {
          setMetadata(
            savedMetadata
          );
        }
      }

      if (!mountedRef.current) {
        return;
      }

      // ====================================
      // UPDATE SAVED VIDEO
      //
      // The secure preview component
      // automatically retrieves the latest
      // confirmed media from R2.
      // ====================================

      setVideo(updated);

      setRightsConfirmed(false);

      setSaveStatus(
        dirtyRef.current
          ? "unsaved"
          : "saved"
      );

      // ====================================
      // DISPLAY SUCCESS MESSAGE
      // ====================================

      setMessage(
        kind === "video"
          ? "Video uploaded and saved successfully."
          : "Thumbnail uploaded and saved successfully."
      );

    } catch (err) {
      if (mountedRef.current) {
        setError(
          errorMessage(err)
        );
      }

    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setUpload(null);
      }
    }
  }

  // ========================================
  // HANDLE FILE SELECTION
  // ========================================

  function selectFile(
    event: ChangeEvent<HTMLInputElement>,

    kind: "video" | "thumbnail"
  ) {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (file) {
      void handleUpload(
        file,

        kind
      );
    }
  }

  // ========================================
  // MANUAL DRAFT SAVE
  // ========================================

  async function manuallySave() {
    if (
      busyRef.current ||
      !editable
    ) {
      return;
    }

    busyRef.current = true;

    try {
      setSaving(true);

      setError("");

      setMessage("");

      await saveDraft();

      if (dirtyRef.current) {
        throw new Error(
          "Some changes remain unsaved. Please try again."
        );
      }

      if (mountedRef.current) {
        setMessage(
          "Video draft saved successfully."
        );
      }

    } catch (err) {
      if (mountedRef.current) {
        setError(
          errorMessage(err)
        );
      }

    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }

  // ========================================
  // SAVE BEFORE RETURNING TO MY VIDEOS
  // ========================================

  async function returnToVideos() {
    if (busyRef.current) {
      return;
    }

    if (!editable) {
      navigate(VIDEO_PATH);

      return;
    }

    busyRef.current = true;

    try {
      setSaving(true);

      setError("");

      await saveDraft();

      if (dirtyRef.current) {
        throw new Error(
          "Some draft changes remain unsaved."
        );
      }

      if (mountedRef.current) {
        navigate(VIDEO_PATH);
      }

    } catch (err) {
      if (mountedRef.current) {
        setError(
          `Unable to save before leaving: ${errorMessage(err)}`
        );
      }

    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }

  // ========================================
  // PUBLISH VIDEO IMMEDIATELY
  //
  // Administrator approval is not required.
  // ========================================

  async function publishVideo() {
    if (
      !editable ||
      busyRef.current
    ) {
      return;
    }

    setError("");

    setMessage("");

    const details =
      metadataRef.current;

    // ======================================
    // VALIDATE VIDEO TITLE
    // ======================================

    if (!details.title.trim()) {
      setError(
        "Enter your video title."
      );

      return;
    }

    // ======================================
    // VALIDATE VIDEO GENRE
    // ======================================

    if (!details.genre.trim()) {
      setError(
        "Select the video genre."
      );

      return;
    }

    // ======================================
    // VALIDATE VIDEO TYPE
    // ======================================

    if (
      ![
        "music_video",
        "live_performance",
        "interview",
        "other",
      ].includes(details.videoType)
    ) {
      setError(
        "Select a valid video type."
      );

      return;
    }

    // ======================================
    // VERIFY CONFIRMED VIDEO FILE
    // ======================================

    if (!video.videoUploadId) {
      setError(
        "Upload your video file."
      );

      return;
    }

    // ======================================
    // VERIFY CONFIRMED THUMBNAIL
    // ======================================

    if (!video.thumbnailUploadId) {
      setError(
        "Upload your video thumbnail."
      );

      return;
    }

    // ======================================
    // VALIDATE VIDEO DURATION
    // ======================================

    if (
      !Number.isFinite(
        video.duration
      ) ||
      video.duration < 1
    ) {
      setError(
        "The video duration is invalid."
      );

      return;
    }

    // ======================================
    // VALIDATE PRIMARY ARTISTS
    // ======================================

    if (
      video.primaryArtists.length === 0
    ) {
      setError(
        "This video requires a primary artist."
      );

      return;
    }

    // ======================================
    // VALIDATE FEATURED ARTISTS
    // AND RELATED MUSIC
    // ======================================

    try {
      validateRelationships(
        details
      );

    } catch (err) {
      setError(
        errorMessage(err)
      );

      return;
    }

    // ======================================
    // COPYRIGHT CONFIRMATION
    // ======================================

    if (!rightsConfirmed) {
      setError(
        "Confirm your publishing rights before continuing."
      );

      return;
    }

    busyRef.current = true;

    try {
      setPublishing(true);

      // ====================================
      // SAVE ALL DRAFT INFORMATION
      // ====================================

      await saveDraft();

      if (dirtyRef.current) {
        throw new Error(
          "Some changes are not saved. Save your draft and try again."
        );
      }

      // ====================================
      // PUBLISH WITHOUT ADMIN APPROVAL
      // ====================================

      const result =
        await enqueue(() =>
          apiRequest<
            VideoResponse
          >(
            `/api/videos/${videoId}/publish`,

            "PATCH",

            {
              rightsConfirmed: true,
            }
          )
        );

      const published =
        normalizeVideo(
          result.video
        );

      // ====================================
      // VERIFY SUCCESSFUL PUBLICATION
      // ====================================

      if (
        published.status !== "approved" ||
        published.visibilityStatus !==
          "visible"
      ) {
        throw new Error(
          "The server has not confirmed public publication."
        );
      }

      dirtyRef.current = false;

      updatedAtRef.current =
        published.updatedAt;

      metadataRef.current =
        getMetadata(published);

      clearLocalRecovery();

      if (mountedRef.current) {
        setVideo(published);

        setMetadata(
          metadataRef.current
        );

        setSaveStatus("saved");

        setMessage(
          result.message ||
          "Your video is now live on Emnet Music."
        );
      }

    } catch (err) {
      if (mountedRef.current) {
        setError(
          errorMessage(err)
        );
      }

    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setPublishing(false);
      }
    }
  }

  // ========================================
  // DELETE UNFINISHED VIDEO DRAFT
  // ========================================

  async function deleteDraft() {
    if (
      busyRef.current ||
      !editable
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Permanently delete this video draft?"
      );

    if (!confirmed) {
      return;
    }

    busyRef.current = true;

    try {
      setDeleting(true);

      setError("");

      setMessage("");

      clearSaveTimer();

      await enqueue(() =>
        apiRequest(
          `/api/videos/${videoId}`,

          "DELETE"
        )
      );

      dirtyRef.current = false;

      clearLocalRecovery();

      if (mountedRef.current) {
        navigate(
          VIDEO_PATH,

          {
            replace: true,
          }
        );
      }

    } catch (err) {
      if (mountedRef.current) {
        setError(
          errorMessage(err)
        );
      }

    } finally {
      busyRef.current = false;

      if (mountedRef.current) {
        setDeleting(false);
      }
    }
  }

  // ========================================
  // DERIVED INTERFACE VALUES
  // ========================================

  const saveLabel =
    saveStatus === "saving"
      ? "Saving draft..."
      : saveStatus === "error"
        ? "Draft save failed"
        : saveStatus === "unsaved"
          ? "Unsaved changes"
          : "Draft saved";

  const published =
    video.status === "approved" &&
    video.visibilityStatus ===
      "visible";

  // ========================================
  // VIDEO UPLOAD INTERFACE
  // ========================================

  return (
    <div className="page-content em-upload-page em-video-page">

      {/* ====================================
          PAGE HEADER
      ==================================== */}

      <div className="em-upload-top">

        <div>

          <button
            type="button"

            className="em-upload-back em-video-back"

            disabled={busy}

            onClick={returnToVideos}
          >
            <ArrowLeft size={17} />

            My Videos
          </button>

          <h1>
            {editable
              ? "Upload Video"
              : "Video Details"}
          </h1>

          <p>
            {editable
              ? "Share your creativity with the world."
              : "View your video information."}
          </p>

        </div>

        <span
          className={
            `em-upload-status ${video.status}`
          }
        >
          {getVideoStatus(video)}
        </span>

      </div>

      {/* ====================================
          ERROR MESSAGE
      ==================================== */}

      {error && (
        <p
          className="em-upload-error"

          role="alert"
        >
          {error}
        </p>
      )}

      {/* ====================================
          SUCCESS MESSAGE
      ==================================== */}

      {message && (
        <p
          className="em-upload-success"

          role="status"
        >
          {message}
        </p>
      )}

      {/* ====================================
          VIDEO AND THUMBNAIL
      ==================================== */}

      <section className="em-upload-card">

        <div className="em-upload-section-title">

          <Clapperboard size={22} />

          <h2>Video & Thumbnail</h2>

        </div>

        <div className="em-video-media-grid">

          {/* ==================================
              VIDEO FILE
          ================================== */}

          <div className="em-video-media-column">

            <h3>Video File</h3>

            {/* SECURE SAVED VIDEO PREVIEW */}

            {video.videoUploadId &&
            previewAllowed ? (

              <ArtistSavedMediaPreview

                key={
                  `video-${user?.id}-${videoId}-${video.videoUploadId}`
                }

                kind="video"

                contentId={videoId}

                uploadId={
                  video.videoUploadId
                }

                disabled={busy}
              />

            ) : (

              <div className="em-video-preview-placeholder">

                <Clapperboard size={40} />

                <span>
                  {!previewAllowed
                    ? "Video preview restricted"
                    : video.videoUploadId ||
                      video.videoUrl
                      ? "Video file saved"
                      : "No video selected"}
                </span>

              </div>

            )}

            {/* CONFIRMED VIDEO INFORMATION */}

            {video.videoUploadId && (

              <div className="em-video-file-confirmed">

                <CheckCircle2 size={16} />

                Video uploaded

                {" · "}

                {formatDuration(
                  video.duration
                )}

              </div>

            )}

            {/* UPLOAD OR REPLACE VIDEO */}

            {editable && (

              <div className="em-upload-file-box">

                <CloudUpload size={25} />

                <p>
                  {video.videoUploadId
                    ? "Replace video file"
                    : "Upload video file"}
                </p>

                <p>
                  MP4 or WebM.
                  Maximum 500 MB.
                </p>

                <input
                  type="file"

                  aria-label="Upload music video"

                  accept=".mp4,.webm"

                  disabled={busy}

                  onChange={(event) =>
                    selectFile(
                      event,

                      "video"
                    )
                  }
                />

                {/* VIDEO UPLOAD PROGRESS */}

                {upload?.kind ===
                  "video" && (

                  <>

                    <progress
                      max={100}

                      value={
                        upload.progress
                      }
                    />

                    <strong>
                      {upload.progress}%
                    </strong>

                  </>

                )}

              </div>

            )}

          </div>

          {/* ==================================
              VIDEO THUMBNAIL
          ================================== */}

          <div className="em-video-media-column">

            <h3>Video Thumbnail</h3>

            {/* SECURE SAVED THUMBNAIL PREVIEW */}

            {video.thumbnailUploadId &&
            previewAllowed ? (

              <ArtistSavedMediaPreview

                key={
                  `thumbnail-${user?.id}-${videoId}-${video.thumbnailUploadId}`
                }

                kind="thumbnail"

                contentId={videoId}

                uploadId={
                  video.thumbnailUploadId
                }

                disabled={busy}
              />

            ) : (

              <div className="em-video-preview-placeholder">

                <ImagePlus size={40} />

                <span>
                  {!previewAllowed
                    ? "Thumbnail preview restricted"
                    : video.thumbnailUploadId ||
                      video.thumbnailUrl
                      ? "Thumbnail saved"
                      : "No thumbnail selected"}
                </span>

              </div>

            )}

            {/* CONFIRMED THUMBNAIL INFORMATION */}

            {video.thumbnailUploadId && (

              <div className="em-video-file-confirmed">

                <CheckCircle2 size={16} />

                Thumbnail uploaded

              </div>

            )}

            {/* UPLOAD OR REPLACE THUMBNAIL */}

            {editable && (

              <div className="em-upload-file-box">

                <ImagePlus size={25} />

                <p>
                  {video.thumbnailUploadId
                    ? "Replace thumbnail"
                    : "Upload thumbnail"}
                </p>

                <p>
                  JPG, PNG or WebP.
                  Maximum 10 MB.
                </p>

                <p>
                  Recommended:
                  1280 × 720 pixels.
                </p>

                <input
                  type="file"

                  aria-label="Upload video thumbnail"

                  accept=".jpg,.jpeg,.png,.webp"

                  disabled={busy}

                  onChange={(event) =>
                    selectFile(
                      event,

                      "thumbnail"
                    )
                  }
                />

                {/* THUMBNAIL UPLOAD PROGRESS */}

                {upload?.kind ===
                  "thumbnail" && (

                  <>

                    <progress
                      max={100}

                      value={
                        upload.progress
                      }
                    />

                    <strong>
                      {upload.progress}%
                    </strong>

                  </>

                )}

              </div>

            )}

          </div>

        </div>

      </section>

      {/* ====================================
          VIDEO INFORMATION
      ==================================== */}

      <section className="em-upload-card">

        <div className="em-upload-section-title">

          <Clapperboard size={22} />

          <h2>Video Information</h2>

        </div>

        <div className="em-upload-grid">

          {/* ==================================
              VIDEO TITLE
          ================================== */}

          <label>

            Video Title

            <input
              type="text"

              value={metadata.title}

              maxLength={200}

              placeholder="Enter video title"

              disabled={!editable || busy}

              onChange={(event) =>
                changeMetadata(
                  "title",

                  event.target.value
                )
              }
            />

          </label>

          {/* ==================================
              MUSIC GENRE DROPDOWN
          ================================== */}

          <label>

            Genre

            <select
              value={metadata.genre}

              disabled={!editable || busy}

              onChange={(event) =>
                changeMetadata(
                  "genre",

                  event.target.value
                )
              }
            >

              <option value="">
                Select genre
              </option>

              {/* PRESERVE EXISTING GENRES */}

              {metadata.genre &&
                !MUSIC_GENRES.some(
                  (genre) =>
                    genre === metadata.genre
                ) && (

                  <option
                    value={metadata.genre}
                  >
                    {metadata.genre}
                  </option>

                )}

              {MUSIC_GENRES.map(
                (genre) => (
                  <option
                    key={genre}

                    value={genre}
                  >
                    {genre}
                  </option>
                )
              )}

            </select>

          </label>

          {/* ==================================
              VIDEO TYPE
          ================================== */}

          <label>

            Video Type

            <select
              value={metadata.videoType}

              disabled={!editable || busy}

              onChange={(event) =>
                changeMetadata(
                  "videoType",

                  event.target.value as VideoType
                )
              }
            >

              <option value="music_video">
                Music Video
              </option>

              <option value="live_performance">
                Live Performance
              </option>

              <option value="interview">
                Interview
              </option>

              <option value="other">
                Other
              </option>

            </select>

          </label>

          {/* ==================================
              AUTOMATIC VIDEO DURATION
          ================================== */}

          <label>

            Video Duration

            <input
              type="text"

              readOnly

              value={
                formatDuration(
                  video.duration
                )
              }
            />

            <small className="em-video-field-help">

              Automatically detected
              from your video.

            </small>

          </label>

          {/* ==================================
              VIDEO DESCRIPTION
          ================================== */}

          <label className="em-video-full-width">

            Description

            <textarea

              value={
                metadata.description
              }

              maxLength={5000}

              placeholder="Tell your audience about this video..."

              rows={5}

              disabled={!editable || busy}

              onChange={(event) =>
                changeMetadata(
                  "description",

                  event.target.value
                )
              }
            />

            <small className="em-video-field-help">

              {metadata.description.length}
              /5000 characters

            </small>

          </label>

        </div>

      </section>

      {/* ====================================
          ARTIST CREDITS
      ==================================== */}

      <section className="em-upload-card">

        <div className="em-upload-section-title">

          <h2>Artist Credits</h2>

        </div>

        <p className="em-video-field-help">

          View the primary artist and select
          additional artists featured in your video.

        </p>

        {/* ==================================
            EXISTING PRIMARY ARTISTS
        ================================== */}

        <ArtistIdSelector

          label="Primary Artists"

          description="Primary artists already credited on this video."

          ids={
            video.primaryArtists
          }

          disabled={true}

          maxArtists={
            Math.max(
              10,

              video.primaryArtists.length
            )
          }

          onChange={() => {
            // Primary artist credits
            // are read-only in this form.
          }}
        />

        {/* ==================================
            SEARCHABLE FEATURED ARTISTS
        ================================== */}

        <ArtistIdSelector

          label="Featured Artists"

          description="Search and select artists featured in this video by their stage names."

          ids={
            metadata.featuredArtists
          }

          excludedArtistIds={
            video.primaryArtists
          }

          disabled={!editable || busy}

          maxArtists={10}

          onChange={
            changeFeaturedArtists
          }
        />

      </section>

      {/* ====================================
          LINKED SONG AND RELEASE SELECTION
      ==================================== */}

      <section className="em-upload-card">

        <div className="em-upload-section-title">

          <h2>Related Music</h2>

        </div>

        <p className="em-video-field-help">

          Optionally connect this video to
          your previously published songs
          and releases.

        </p>

        <LinkedMusicSelector

          releaseId={
            metadata.linkedRelease ||
            ""
          }

          songId={
            metadata.linkedSong ||
            ""
          }

          disabled={!editable || busy}

          onChange={
            changeLinkedMusic
          }
        />

      </section>

      {/* ====================================
          COPYRIGHT AND PUBLISHING
      ==================================== */}

      {editable && (

        <>

          <section className="em-upload-card">

            <div className="em-upload-section-title">

              <h2>
                Copyright & Publishing
              </h2>

            </div>

            <label className="em-video-rights">

              <input
                type="checkbox"

                checked={
                  rightsConfirmed
                }

                disabled={busy}

                onChange={(event) =>
                  setRightsConfirmed(
                    event.target.checked
                  )
                }
              />

              <span>

                I confirm that I own this
                video, thumbnail and
                associated content, or
                have obtained the necessary
                permission to publish it
                on Emnet Music.

                I also confirm that I have
                permission to credit the
                selected artists.

              </span>

            </label>

            <p className="em-video-field-help">

              Your video becomes publicly
              available immediately after
              successful publishing.

              No admin approval is required.

            </p>

          </section>

          {/* ==================================
              SAVE AND PUBLISH ACTIONS
          ================================== */}

          <section className="em-upload-actions">

            <div>

              <strong>
                {saveLabel}
              </strong>

              <p>

                Your video information and
                artist selections can be
                saved and resumed later.

              </p>

            </div>

            <div className="em-upload-action-buttons">

              {/* SAVE DRAFT */}

              <button
                type="button"

                className="em-upload-secondary"

                disabled={busy}

                onClick={manuallySave}
              >
                <Save size={17} />

                {saving
                  ? "Saving..."
                  : "Save Draft"}

              </button>

              {/* PUBLISH NOW */}

              <button
                type="button"

                className="em-upload-primary"

                disabled={busy}

                onClick={publishVideo}
              >
                <CloudUpload size={18} />

                {publishing
                  ? "Publishing..."
                  : "Publish Now"}

              </button>

            </div>

          </section>

          {/* ==================================
              DELETE DRAFT
          ================================== */}

          <button
            type="button"

            className="em-video-delete-draft"

            disabled={busy}

            onClick={deleteDraft}
          >
            <Trash2 size={17} />

            {deleting
              ? "Deleting..."
              : "Delete Draft"}

          </button>

        </>

      )}

      {/* ====================================
          SUCCESSFULLY PUBLISHED VIDEO
      ==================================== */}

      {published && (

        <section className="em-upload-published">

          <CheckCircle2 size={27} />

          <div>

            <strong>

              Your video is published

            </strong>

            <p>

              Your video is available
              to viewers on Emnet Music.

            </p>

            <p>

              {video.viewCount} views

            </p>

            <Link

              to={
                `/videos/${videoId}`
              }

              className="em-video-watch-link"
            >

              Watch Published Video

            </Link>

          </div>

        </section>

      )}

    </div>
  );
}

// ==========================================
// MAIN PAGE EXPORT
// ==========================================

export default function ArtistVideoUploadPage() {
  const { videoId } =
    useParams<{
      videoId?: string;
    }>();

  if (!videoId) {
    return <ArtistVideoList />;
  }

  return (
    <ArtistVideoLoader

      key={videoId}

      videoId={videoId}
    />
  );
}
