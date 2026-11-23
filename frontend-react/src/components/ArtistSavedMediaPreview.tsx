import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  Clapperboard,
  Disc3,
  ImagePlus,
  LoaderCircle,
  Music2,
  RefreshCw,
} from "lucide-react";

import {
  getArtistMediaPreview,
  type ArtistMediaPreview,
  type ArtistPreviewKind,
} from "../services/artistMediaPreviewApi";

import "./ArtistSavedMediaPreview.css";

// ==========================================
// TYPES
// ==========================================

type Props = {
  kind: ArtistPreviewKind;
  contentId: string;
  uploadId: string;
  disabled?: boolean;
};

type PreviewState = "loading" | "ready" | "error";

const mediaLabels: Record<ArtistPreviewKind, string> = {
  audio: "audio",
  artwork: "cover artwork",
  video: "video",
  thumbnail: "thumbnail",
};

// ==========================================
// SAVED MEDIA PREVIEW
// ==========================================

export default function ArtistSavedMediaPreview(
  props: Props
) {
  return (
    <SavedMediaPreview
      key={`${props.kind}-${props.contentId}-${props.uploadId}`}
      {...props}
    />
  );
}

function SavedMediaPreview({
  kind,
  contentId,
  uploadId,
  disabled = false,
}: Props) {
  const [preview, setPreview] =
    useState<ArtistMediaPreview | null>(null);

  const [status, setStatus] =
    useState<PreviewState>("loading");

  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const playbackPositionRef = useRef(0);
  const automaticRetryRef = useRef(false);

  const isPlayable = kind === "audio" || kind === "video";
  const label = mediaLabels[kind];

  // ========================================
  // REFRESH SIGNED MEDIA URL
  // ========================================

  const refreshPreview = useCallback(() => {
    const element = mediaRef.current;

    if (element && Number.isFinite(element.currentTime)) {
      playbackPositionRef.current = element.currentTime;
    }

    setStatus("loading");
    setError("");
    setRequestVersion((previous) => previous + 1);
  }, []);

  // ========================================
  // LOAD PRIVATE MEDIA
  // ========================================

  useEffect(() => {
    const controller = new AbortController();

    setStatus("loading");
    setError("");
    setPreview(null);

    async function loadPreview() {
      try {
        if (!uploadId) {
          throw new Error("No saved media file is attached.");
        }

        const result = await getArtistMediaPreview(
          kind,
          contentId,
          controller.signal
        );

        if (controller.signal.aborted) return;

       setPreview(result);
      automaticRetryRef.current = false;
      setStatus("ready");

      } catch (err) {
        if (controller.signal.aborted) return;

        setPreview(null);
        setStatus("error");

        setError(
          err instanceof Error
            ? err.message
            : "Unable to retrieve saved media."
        );
      }
    }

    void loadPreview();

    return () => {
      controller.abort();
    };
  }, [kind, contentId, uploadId, requestVersion]);

  // ========================================
  // AUTOMATIC SIGNED URL RENEWAL
  // ========================================

  useEffect(() => {
    if (!preview || status !== "ready") return;

    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function checkExpiration() {
      if (cancelled) return;

      const element = mediaRef.current;

      if (
        isPlayable &&
        element &&
        !element.paused &&
        !element.ended
      ) {
        timer = setTimeout(checkExpiration, 15000);
        return;
      }

      refreshPreview();
    }

    const delay = Math.max(
      1000,
      preview.expiresAt - Date.now() - 30000
    );

    timer = setTimeout(checkExpiration, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [preview, status, isPlayable, refreshPreview]);

  // ========================================
  // HANDLE MEDIA ERRORS
  // ========================================

  function handleMediaError() {
    if (status !== "ready") return;

    if (!automaticRetryRef.current) {
      automaticRetryRef.current = true;
      refreshPreview();
      return;
    }

    setPreview(null);
    setStatus("error");

    setError(
      `Unable to load the saved ${label}. Refresh the preview and try again.`
    );
  }

  function retryPreview() {
    automaticRetryRef.current = false;
    refreshPreview();
  }

  // ========================================
  // RESTORE PLAYBACK POSITION
  // ========================================

  function restorePlaybackPosition() {
    const element = mediaRef.current;

    if (!element) return;

    const savedPosition = playbackPositionRef.current;

    if (
      Number.isFinite(element.duration) &&
      savedPosition > 0
    ) {
      element.currentTime = Math.min(
        savedPosition,
        Math.max(0, element.duration - 0.1)
      );
    }

    playbackPositionRef.current = 0;
  }

  // ========================================
  // LOADING STATE
  // ========================================

  if (status === "loading") {
    return (
      <div
        className="em-saved-preview-placeholder"
        role="status"
      >
        <LoaderCircle
          size={30}
          className="em-saved-preview-spinner"
        />

        <span>Loading saved {label}...</span>
      </div>
    );
  }

  // ========================================
  // ERROR STATE
  // ========================================

  if (status === "error" || !preview) {
    return (
      <div className="em-saved-preview-placeholder em-saved-preview-error">
        <AlertCircle size={30} />

        <span role="alert">
          {error || "Saved media is unavailable."}
        </span>

        <button
          type="button"
          className="em-saved-preview-retry"
          disabled={disabled}
          onClick={retryPreview}
        >
          <RefreshCw size={16} />
          Retry Preview
        </button>
      </div>
    );
  }

  const MediaIcon =
    kind === "audio"
      ? Music2
      : kind === "artwork"
        ? Disc3
        : kind === "video"
          ? Clapperboard
          : ImagePlus;

  // ========================================
  // MEDIA PREVIEW INTERFACE
  // ========================================

  return (
    <div className={`em-saved-media-preview em-saved-media-${kind}`}>

      {kind === "audio" && (
        <audio
          ref={(element) => {
            mediaRef.current = element;
          }}
          src={preview.mediaUrl}
          className="em-saved-audio-preview"
          controls
          preload="metadata"
          aria-label="Saved song audio preview"
          onLoadedMetadata={restorePlaybackPosition}
          onError={handleMediaError}
        />
      )}

      {kind === "video" && (
        <video
          ref={(element) => {
            mediaRef.current = element;
          }}
          className="em-video-preview"
          src={preview.mediaUrl}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={restorePlaybackPosition}
          onError={handleMediaError}
        />
      )}

      {kind === "artwork" && (
        <img
          className="em-music-cover-preview"
          src={preview.mediaUrl}
          alt="Saved release cover artwork"
          onError={handleMediaError}
        />
      )}

      {kind === "thumbnail" && (
        <img
          className="em-video-thumbnail"
          src={preview.mediaUrl}
          alt="Saved video thumbnail"
          onError={handleMediaError}
        />
      )}

      <div className="em-saved-preview-footer">
        <span>
          <MediaIcon size={15} />
          Saved {label} preview
        </span>

        <button
          type="button"
          disabled={disabled}
          onClick={retryPreview}
          title={`Refresh ${label} preview`}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
    </div>
  );
}