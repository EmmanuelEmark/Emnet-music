import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Disc3,
  Eye,
  EyeOff,
  Flag,
  Music2,
  RefreshCw,
  Search,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";

import {
  getAdminDashboardOverview,
  type ContentStatistics,
} from "../../services/adminApi";

import {
  getAdminContent,
  moderateAdminContent,
  type AdminContent,
  type ContentType,
  type ContentAction,
  type ContentListResponse,
} from "../../services/adminContentApi";

// ==========================================
// CONFIGURATION
// ==========================================

const PAGE_SIZE = 20;

const CONTENT_CONFIG = {
  songs: {
    title: "Songs",
    singular: "song",
    heading: "Song catalogue",
    icon: Music2,
    description:
      "Manage published songs, monitor streams and enforce content moderation.",
  },

  releases: {
    title: "Releases",
    singular: "release",
    heading: "Release catalogue",
    icon: Disc3,
    description:
      "Manage singles, EPs and albums across Emnet Music.",
  },

  videos: {
    title: "Videos",
    singular: "video",
    heading: "Video catalogue",
    icon: Video,
    description:
      "Manage published videos and enforce video content standards.",
  },
};

const ACTION_CONFIG: Record<
  ContentAction,
  {
    label: string;
    description: string;
    danger: boolean;
  }
> = {
  hide: {
    label: "Hide content",
    description:
      "Remove this content from public availability while preserving its stored information and historical engagement.",
    danger: true,
  },

  restore: {
    label: "Restore visibility",
    description:
      "Remove the hidden visibility restriction. Other moderation restrictions may still prevent public access.",
    danger: false,
  },

  takedown: {
    label: "Take down content",
    description:
      "Apply a stronger content restriction. Only Super Admin can reverse a takedown.",
    danger: true,
  },

  "reverse-takedown": {
    label: "Reverse takedown",
    description:
      "Return the taken-down content to hidden status. A separate restoration action is required to make it publicly available.",
    danger: false,
  },
};

type PendingAction = {
  content: AdminContent;
  action: ContentAction;
};

// ==========================================
// FORMATTING HELPERS
// ==========================================

function formatNumber(value?: number) {
  return new Intl.NumberFormat("en-NG").format(
    value || 0
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDuration(value?: number) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return "Not available";
  }

  const seconds = Math.floor(value);

  const minutes = Math.floor(seconds / 60);

  const remaining = seconds % 60;

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function formatLabel(value?: string | null) {
  if (!value) return "Not available";

  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function formatStatus(status: string) {
  return status === "approved"
    ? "Published"
    : formatLabel(status);
}

function getVisibility(content: AdminContent) {
  return content.visibilityStatus || "visible";
}

function getArtistNames(content: AdminContent) {
  const names = (content.primaryArtists || [])
    .map((artist) => artist?.stageName)
    .filter(Boolean);

  return names.join(", ") || "Artist unavailable";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete the request.";
}

// ==========================================
// AVAILABLE MODERATION ACTIONS
// ==========================================

function getAvailableActions(
  content: AdminContent,
  isSuperAdmin: boolean
): ContentAction[] {
  if (content.status !== "approved") {
    return [];
  }

  const visibility = getVisibility(content);

  if (visibility === "visible") {
    return ["hide", "takedown"];
  }

  if (visibility === "hidden") {
    return ["restore", "takedown"];
  }

  if (
    visibility === "takedown" &&
    isSuperAdmin
  ) {
    return ["reverse-takedown"];
  }

  return [];
}

// ==========================================
// CONTENT STATUS BADGE
// ==========================================

function ContentBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const appearance =
    ["approved", "visible", "available"].includes(status)
      ? "positive"
      : ["pending", "hidden"].includes(status)
        ? "warning"
        : "negative";

  return (
    <span className={`em-admin-status ${appearance}`}>
      {label || formatStatus(status)}
    </span>
  );
}

// ==========================================
// CONTENT STATISTICS CARD
// ==========================================

function ContentStatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value?: number;
  icon: typeof Music2;
}) {
  return (
    <article className="em-admin-stat-card">
      <div className="em-admin-stat-top">
        <div className="em-admin-stat-icon">
          <Icon size={22} />
        </div>
      </div>

      <p>{label}</p>

      <strong className="em-admin-stat-value">
        {value === undefined
          ? "—"
          : formatNumber(value)}
      </strong>
    </article>
  );
}

// ==========================================
// CONTENT DETAILS DIALOG
// ==========================================

function ContentDetailsDialog({
  type,
  content,
  isSuperAdmin,
  onClose,
  onAction,
}: {
  type: ContentType;
  content: AdminContent;
  isSuperAdmin: boolean;
  onClose: () => void;
  onAction: (
    content: AdminContent,
    action: ContentAction
  ) => void;
}) {
  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const config = CONTENT_CONFIG[type];

  const Icon = config.icon;

  const actions = getAvailableActions(
    content,
    isSuperAdmin
  );

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    dialog.showModal();

    return () => {
      dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="em-users-dialog em-content-dialog"
      aria-labelledby="em-content-details-title"
      onCancel={onClose}
    >
      <div className="em-users-dialog-inner">

        {/* HEADER */}

        <div className="em-users-dialog-heading">
          <div>
            <h2 id="em-content-details-title">
              {formatLabel(config.singular)} details
            </h2>

            <p>Catalogue and moderation information</p>
          </div>

          <button
            type="button"
            className="em-users-icon-button"
            aria-label="Close content details"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>

        {/* CONTENT IDENTITY */}

        <div className="em-users-profile">
          <div className="em-content-artwork large">
            <Icon size={30} />
          </div>

          <div>
            <h3>
              {content.title || "Untitled content"}
            </h3>

            <span>
              {getArtistNames(content)}
            </span>
          </div>
        </div>

        {/* INFORMATION */}

        <dl className="em-users-details-list">
          <div>
            <dt>Title</dt>

            <dd>{content.title}</dd>
          </div>

          <div>
            <dt>Primary artists</dt>

            <dd>{getArtistNames(content)}</dd>
          </div>

          <div>
            <dt>Publication status</dt>

            <dd>
              <ContentBadge status={content.status} />
            </dd>
          </div>

          <div>
            <dt>Visibility status</dt>

            <dd>
              <ContentBadge
                status={getVisibility(content)}
              />
            </dd>
          </div>

          <div>
            <dt>Publicly available</dt>

            <dd>
              {content.publiclyAvailable
                ? "Yes"
                : "No"}
            </dd>
          </div>

          {/* SONG AND VIDEO INFORMATION */}

          {type !== "releases" && (
            <>
              <div>
                <dt>Genre</dt>

                <dd>
                  {content.genre || "Not available"}
                </dd>
              </div>

              <div>
                <dt>Duration</dt>

                <dd>
                  {formatDuration(content.duration)}
                </dd>
              </div>
            </>
          )}

          {/* SONG-SPECIFIC INFORMATION */}

          {type === "songs" && (
            <>
              <div>
                <dt>Parent release</dt>

                <dd>
                  {content.releaseId?.title ||
                    "Release unavailable"}
                </dd>
              </div>

              <div>
                <dt>Parent release availability</dt>

                <dd>
                  {content.parentReleaseAvailable
                    ? "Available"
                    : "Unavailable"}
                </dd>
              </div>

              <div>
                <dt>Track number</dt>

                <dd>{content.trackNumber ?? "—"}</dd>
              </div>

              <div>
                <dt>ISRC</dt>

                <dd>{content.isrc || "Not assigned"}</dd>
              </div>

              <div>
                <dt>Total recorded plays</dt>

                <dd>
                  {formatNumber(content.playCount)}
                </dd>
              </div>
            </>
          )}

          {/* RELEASE-SPECIFIC INFORMATION */}

          {type === "releases" && (
            <>
              <div>
                <dt>Release type</dt>

                <dd>
                  {formatLabel(content.releaseType)}
                </dd>
              </div>

              <div>
                <dt>Release date</dt>

                <dd>
                  {formatDate(content.releaseDate)}
                </dd>
              </div>
            </>
          )}

          {/* VIDEO-SPECIFIC INFORMATION */}

          {type === "videos" && (
            <>
              <div>
                <dt>Video type</dt>

                <dd>
                  {formatLabel(content.videoType)}
                </dd>
              </div>

              <div>
                <dt>Total recorded views</dt>

                <dd>
                  {formatNumber(content.viewCount)}
                </dd>
              </div>
            </>
          )}

          {/* ADDITIONAL ARTIST CREDITS */}

          <div>
            <dt>
              {type === "releases"
                ? "Collaborating artists"
                : "Featured artists"}
            </dt>

            <dd>
              {(
                type === "releases"
                  ? content.collaboratingArtists
                  : content.featuredArtists
              )
                ?.map((artist) => artist?.stageName)
                .filter(Boolean)
                .join(", ") || "None"}
            </dd>
          </div>

          <div>
            <dt>Date created</dt>

            <dd>{formatDate(content.createdAt)}</dd>
          </div>

          <div>
            <dt>Last updated</dt>

            <dd>{formatDate(content.updatedAt)}</dd>
          </div>

          {content.moderationReason && (
            <div>
              <dt>Moderation reason</dt>

              <dd>{content.moderationReason}</dd>
            </div>
          )}

          {content.moderatedAt && (
            <div>
              <dt>Moderation date</dt>

              <dd>{formatDate(content.moderatedAt)}</dd>
            </div>
          )}

          <div>
            <dt>Content ID</dt>

            <dd className="em-users-id">
              {content._id}
            </dd>
          </div>
        </dl>

        {/* VIDEO DESCRIPTION */}

        {type === "videos" && content.description && (
          <section className="em-artist-biography">
            <h3>Description</h3>

            <p>{content.description}</p>
          </section>
        )}

        {/* PARENT RELEASE RESTRICTION */}

        {type === "songs" &&
          content.status === "approved" &&
          !content.parentReleaseAvailable && (
            <div className="em-content-restriction-notice">
              <AlertCircle size={20} />

              <p>
                This song cannot become publicly available
                while its parent release is restricted
                or unavailable.
              </p>
            </div>
          )}

        {/* MODERATION ACTIONS */}

        <section className="em-artist-manage-section">
          <h3>Moderation actions</h3>

          {actions.length === 0 ? (
            <p className="em-admin-panel-note">
              No moderation actions are currently available
              for this content.
            </p>
          ) : (
            <div className="em-artist-action-grid">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  className={`em-users-action-button ${
                    ACTION_CONFIG[action].danger
                      ? "danger"
                      : "positive"
                  }`}
                  onClick={() => onAction(content, action)}
                >
                  {ACTION_CONFIG[action].label}
                </button>
              ))}
            </div>
          )}

          {getVisibility(content) === "takedown" &&
            !isSuperAdmin && (
              <p className="em-admin-panel-note">
                Only Super Admin can reverse a takedown.
              </p>
            )}
        </section>

        <div className="em-users-dialog-footer">
          <button
            type="button"
            className="em-admin-secondary-button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}

// ==========================================
// MODERATION CONFIRMATION DIALOG
// ==========================================

function ContentActionDialog({
  type,
  pending,
  processing,
  error,
  onClose,
  onConfirm,
}: {
  type: ContentType;
  pending: PendingAction;
  processing: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const config = ACTION_CONFIG[pending.action];

  const Icon = CONTENT_CONFIG[type].icon;

  const validReason =
    reason.trim().length >= 5 &&
    reason.trim().length <= 1000;

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    dialog.showModal();

    return () => {
      dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="em-users-dialog"
      aria-labelledby="em-content-action-title"
      onCancel={(event) => {
        event.preventDefault();

        if (!processing) onClose();
      }}
    >
      <form
        className="em-users-dialog-inner"
        onSubmit={(event) => {
          event.preventDefault();

          if (validReason && !processing) {
            onConfirm(reason.trim());
          }
        }}
      >
        <div className="em-users-dialog-heading">
          <div>
            <h2 id="em-content-action-title">
              {config.label}
            </h2>

            <p>Administrative content moderation</p>
          </div>

          <button
            type="button"
            className="em-users-icon-button"
            disabled={processing}
            onClick={onClose}
            aria-label="Close confirmation"
          >
            <X size={22} />
          </button>
        </div>

        {/* SELECTED CONTENT */}

        <div className="em-users-profile">
          <div className="em-content-artwork large">
            <Icon size={30} />
          </div>

          <div>
            <h3>{pending.content.title}</h3>

            <span>
              {getArtistNames(pending.content)}
            </span>
          </div>
        </div>

        {/* ACTION NOTICE */}

        <div
          className={`em-users-action-notice ${
            config.danger ? "danger" : "positive"
          }`}
        >
          {config.danger ? (
            <AlertCircle size={22} />
          ) : (
            <ShieldCheck size={22} />
          )}

          <p>{config.description}</p>
        </div>

        {/* RELEASE MODERATION WARNING */}

        {type === "releases" && (
          <p className="em-content-release-warning">
            Changing release visibility can also affect
            public access to every song belonging to
            this release.
          </p>
        )}

        {/* REQUIRED MODERATION REASON */}

        <label
          htmlFor="em-content-reason"
          className="em-users-reason-label"
        >
          Moderation reason
        </label>

        <textarea
          id="em-content-reason"
          className="em-users-textarea"
          value={reason}
          minLength={5}
          maxLength={1000}
          rows={5}
          required
          disabled={processing}
          placeholder="Explain why you are performing this moderation action..."
          onChange={(event) =>
            setReason(event.target.value)
          }
        />

        <div className="em-users-character-count">
          {reason.length}/1000
        </div>

        {error && (
          <div
            className="em-users-alert error"
            role="alert"
          >
            <AlertCircle size={18} />

            <span>{error}</span>
          </div>
        )}

        {/* CONFIRMATION BUTTONS */}

        <div className="em-users-dialog-footer">
          <button
            type="button"
            className="em-admin-secondary-button"
            disabled={processing}
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="submit"
            className={
              config.danger
                ? "em-users-danger-button"
                : "em-admin-primary-button"
            }
            disabled={!validReason || processing}
          >
            {processing
              ? "Processing..."
              : "Confirm action"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// ==========================================
// MAIN CONTENT MANAGEMENT COMPONENT
// ==========================================

export default function AdminContentPage({
  type,
}: {
  type: ContentType;
}) {
  const { user } = useAuth();

  const isSuperAdmin =
    user?.role === "superadmin";

  const config = CONTENT_CONFIG[type];

  const Icon = config.icon;

  // ========================================
  // PAGE STATE
  // ========================================

  const [result, setResult] =
    useState<ContentListResponse | null>(null);

  const [statistics, setStatistics] =
    useState<ContentStatistics | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [statsError, setStatsError] = useState("");

  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");

  const [submittedSearch, setSubmittedSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [visibilityFilter, setVisibilityFilter] =
    useState("all");

  const [typeFilter, setTypeFilter] =
    useState("all");

  const [page, setPage] = useState(1);

  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedContent, setSelectedContent] =
    useState<AdminContent | null>(null);

  const [pendingAction, setPendingAction] =
    useState<PendingAction | null>(null);

  const [processing, setProcessing] =
    useState(false);

  const [actionError, setActionError] =
    useState("");

  const mountedRef = useRef(true);

  const processingRef = useRef(false);

  // ========================================
  // COMPONENT LIFECYCLE
  // ========================================

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ========================================
  // LOAD CONTENT STATISTICS
  // ========================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadStatistics() {
      setStatsError("");

      try {
        const dashboard =
          await getAdminDashboardOverview(
            controller.signal
          );

        if (!controller.signal.aborted) {
          setStatistics(dashboard.stats[type]);
        }

      } catch (err) {
        if (!controller.signal.aborted) {
          setStatistics(null);
          setStatsError(getErrorMessage(err));
        }
      }
    }

    void loadStatistics();

    return () => {
      controller.abort();
    };
  }, [type, refreshKey]);

  // ========================================
  // LOAD CONTENT RECORDS
  // ========================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadContent() {
      setLoading(true);
      setError("");
      setResult(null);

      try {
        const response = await getAdminContent(
          type,
          {
            q: submittedSearch,
            status: statusFilter,
            visibilityStatus: visibilityFilter,

            releaseType:
              type === "releases"
                ? typeFilter
                : undefined,

            videoType:
              type === "videos"
                ? typeFilter
                : undefined,

            page,
            limit: PAGE_SIZE,
          },
          controller.signal
        );

        if (controller.signal.aborted) {
          return;
        }

        const lastPage = Math.max(
          1,
          response.totalPages
        );

        if (page > lastPage) {
          setPage(lastPage);
          return;
        }

        setResult(response);

      } catch (err) {
        if (!controller.signal.aborted) {
          setError(getErrorMessage(err));
        }

      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadContent();

    return () => {
      controller.abort();
    };
  }, [
    type,
    submittedSearch,
    statusFilter,
    visibilityFilter,
    typeFilter,
    page,
    refreshKey,
  ]);

  // ========================================
  // REFRESH CONTENT
  // ========================================

  function refreshContent() {
    if (processingRef.current) return;

    setSelectedContent(null);

    setMessage("");

    setRefreshKey((previous) => previous + 1);
  }

  // ========================================
  // RESET FILTERS
  // ========================================

  function resetFilters() {
    setSearch("");
    setSubmittedSearch("");
    setStatusFilter("all");
    setVisibilityFilter("all");
    setTypeFilter("all");
    setPage(1);
  }

  // ========================================
  // OPEN MODERATION ACTION
  // ========================================

  function openAction(
    content: AdminContent,
    action: ContentAction
  ) {
    if (processingRef.current) return;

    if (
      !getAvailableActions(
        content,
        isSuperAdmin
      ).includes(action)
    ) {
      setError("This moderation action is unavailable.");
      return;
    }

    setSelectedContent(null);

    setMessage("");
    setActionError("");

    setPendingAction({
      content,
      action,
    });
  }

  // ========================================
  // EXECUTE MODERATION ACTION
  // ========================================

  async function executeAction(reason: string) {
    if (!pendingAction || processingRef.current) {
      return;
    }

    processingRef.current = true;

    const currentAction = pendingAction;

    try {
      setProcessing(true);
      setActionError("");

      const response =
        await moderateAdminContent(
          type,
          currentAction.content._id,
          currentAction.action,
          reason
        );

      if (!mountedRef.current) return;

      setPendingAction(null);

      setMessage(
        response.message ||
        "Content updated successfully."
      );

      setRefreshKey((previous) => previous + 1);

    } catch (err) {
      if (mountedRef.current) {
        setActionError(getErrorMessage(err));
      }

    } finally {
      processingRef.current = false;

      if (mountedRef.current) {
        setProcessing(false);
      }
    }
  }

  const items = result?.items || [];

  // ========================================
  // MANAGEMENT INTERFACE
  // ========================================

  return (
    <div className="em-users-page em-content-page">

      {/* PAGE HEADER */}

      <section className="em-admin-page-heading">
        <div>
          <span className="em-admin-eyebrow">
            CONTENT MANAGEMENT
          </span>

          <h1>{config.title}</h1>

          <p>{config.description}</p>
        </div>

        <button
          type="button"
          className="em-admin-secondary-button"
          disabled={loading || processing}
          onClick={refreshContent}
        >
          <RefreshCw size={17} />

          Refresh {type}
        </button>
      </section>

      {/* CONTENT STATISTICS */}

      <section className="em-admin-stat-grid">
        <ContentStatCard
          label={`Published ${type}`}
          value={statistics?.published}
          icon={Icon}
        />

        <ContentStatCard
          label="Publicly available"
          value={statistics?.publiclyAvailable}
          icon={Eye}
        />

        <ContentStatCard
          label="Hidden content"
          value={statistics?.hidden}
          icon={EyeOff}
        />

        <ContentStatCard
          label="Taken down"
          value={statistics?.takenDown}
          icon={Flag}
        />
      </section>

      {statsError && (
        <p className="em-admin-panel-note">
          Statistics unavailable: {statsError}
        </p>
      )}

      {/* PARENT RELEASE RESTRICTION SUMMARY */}

      {type === "songs" &&
        (statistics?.blockedByParentRelease || 0) > 0 && (
          <div className="em-content-restriction-notice">
            <AlertCircle size={20} />

            <p>
              {formatNumber(
                statistics?.blockedByParentRelease
              )} otherwise visible songs are currently
              unavailable because their parent releases
              are unavailable.
            </p>
          </div>
        )}

      {/* QUICK VISIBILITY FILTERS */}

      <div className="em-artist-quick-filters">
        {[
          {
            label: "All content",
            value: "all",
          },
          {
            label: "Visible",
            value: "visible",
          },
          {
            label: "Hidden",
            value: "hidden",
          },
          {
            label: "Taken down",
            value: "takedown",
          },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            className={`em-artist-filter-tab ${
              visibilityFilter === item.value
                ? "active"
                : ""
            }`}
            aria-pressed={
              visibilityFilter === item.value
            }
            onClick={() => {
              setVisibilityFilter(item.value);
              setPage(1);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* SUCCESS MESSAGE */}

      {message && (
        <div
          className="em-users-alert success"
          role="status"
        >
          <CheckCircle2 size={20} />

          <span>{message}</span>

          <button
            type="button"
            className="em-users-icon-button"
            onClick={() => setMessage("")}
            aria-label="Dismiss message"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* ERROR MESSAGE */}

      {error && (
        <div
          className="em-users-alert error"
          role="alert"
        >
          <AlertCircle size={20} />

          <span>{error}</span>

          <button
            type="button"
            className="em-admin-secondary-button"
            onClick={refreshContent}
          >
            Retry
          </button>
        </div>
      )}

      {/* MAIN CONTENT PANEL */}

      <section className="em-admin-panel">
        <div className="em-admin-panel-heading">
          <div>
            <h2>{config.heading}</h2>

            <p>
              Search, inspect and moderate platform content.
            </p>
          </div>

          <Icon size={22} />
        </div>

        {/* SEARCH AND FILTERS */}

        <form
          className="em-users-toolbar"
          onSubmit={(event) => {
            event.preventDefault();

            setSubmittedSearch(search.trim());
            setPage(1);
          }}
        >
          <div className="em-users-search">
            <Search size={18} />

            <input
              type="search"
              value={search}
              maxLength={100}
              aria-label={`Search ${type}`}
              placeholder={`Search ${config.singular} title...`}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          <button
            type="submit"
            className="em-admin-primary-button"
            disabled={loading}
          >
            Search
          </button>

          {/* PUBLICATION STATUS FILTER */}

          <select
            className="em-users-select"
            value={statusFilter}
            aria-label="Publication status"
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">
              All publication statuses
            </option>

            <option value="approved">
              Published
            </option>

            <option value="pending">
              Pending
            </option>

            <option value="rejected">
              Rejected
            </option>
          </select>

          {/* RELEASE TYPE FILTER */}

          {type === "releases" && (
            <select
              className="em-users-select"
              value={typeFilter}
              aria-label="Release type"
              onChange={(event) => {
                setTypeFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All release types</option>
              <option value="single">Single</option>
              <option value="ep">EP</option>
              <option value="album">Album</option>
            </select>
          )}

          {/* VIDEO TYPE FILTER */}

          {type === "videos" && (
            <select
              className="em-users-select"
              value={typeFilter}
              aria-label="Video type"
              onChange={(event) => {
                setTypeFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All video types</option>

              <option value="music_video">
                Music video
              </option>

              <option value="live_performance">
                Live performance
              </option>

              <option value="interview">Interview</option>

              <option value="other">Other</option>
            </select>
          )}

          <button
            type="button"
            className="em-admin-secondary-button"
            onClick={resetFilters}
          >
            Reset
          </button>
        </form>

        {/* LOADING STATE */}

        {loading ? (
          <div className="em-users-loading">
            <div className="em-admin-spinner" />

            <p>Loading {type}...</p>
          </div>
        ) : error ? (
          <div className="em-admin-empty">
            <AlertCircle size={34} />

            <p>Unable to load {type}.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="em-admin-empty">
            <Icon size={38} />

            <p>No matching {type} found.</p>

            <button
              type="button"
              className="em-admin-secondary-button"
              onClick={resetFilters}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {/* RESULTS SUMMARY */}

            <div className="em-users-results">
              {formatNumber(result?.total)} matching {type}
            </div>

            {/* CONTENT TABLE */}

            <div className="em-admin-table-wrap">
              <table className="em-admin-table em-content-table">
                <thead>
                  <tr>
                    <th>Title / Artist</th>

                    <th>
                      {type === "releases"
                        ? "Release type"
                        : "Genre"}
                    </th>

                    <th>Publication</th>
                    <th>Visibility</th>
                    <th>Public access</th>

                    <th>
                      {type === "songs"
                        ? "Plays"
                        : type === "videos"
                          ? "Views"
                          : "Release date"}
                    </th>

                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((content) => {
                    const actions =
                      getAvailableActions(
                        content,
                        isSuperAdmin
                      );

                    return (
                      <tr key={content._id}>

                        {/* TITLE AND ARTIST */}

                        <td>
                          <div className="em-users-table-identity">
                            <div className="em-content-artwork">
                              <Icon size={22} />
                            </div>

                            <div>
                              <strong>
                                {content.title ||
                                  "Untitled content"}
                              </strong>

                              <span>
                                {getArtistNames(content)}
                              </span>

                              {type === "songs" && (
                                <span>
                                  {content.releaseId?.title ||
                                    "Release unavailable"}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* GENRE OR TYPE */}

                        <td>
                          {type === "releases"
                            ? formatLabel(content.releaseType)
                            : content.genre || "—"}
                        </td>

                        {/* PUBLICATION STATUS */}

                        <td>
                          <ContentBadge
                            status={content.status}
                          />
                        </td>

                        {/* VISIBILITY STATUS */}

                        <td>
                          <ContentBadge
                            status={getVisibility(content)}
                          />
                        </td>

                        {/* EFFECTIVE PUBLIC ACCESS */}

                        <td>
                          <ContentBadge
                            status={
                              content.publiclyAvailable
                                ? "available"
                                : "unavailable"
                            }
                            label={
                              content.publiclyAvailable
                                ? "Available"
                                : "Unavailable"
                            }
                          />
                        </td>

                        {/* ENGAGEMENT / RELEASE DATE */}

                        <td>
                          {type === "songs"
                            ? formatNumber(content.playCount)
                            : type === "videos"
                              ? formatNumber(content.viewCount)
                              : formatDate(content.releaseDate)}
                        </td>

                        {/* MODERATION ACTIONS */}

                        <td>
                          <div className="em-users-row-actions">
                            <button
                              type="button"
                              className="em-users-action-button"
                              onClick={() =>
                                setSelectedContent(content)
                              }
                            >
                              <Eye size={15} />

                              Details
                            </button>

                            {actions.includes("hide") ? (
                              <button
                                type="button"
                                className="em-users-action-button danger"
                                onClick={() =>
                                  openAction(content, "hide")
                                }
                              >
                                <EyeOff size={15} />

                                Hide
                              </button>
                            ) : actions.includes("restore") ? (
                              <button
                                type="button"
                                className="em-users-action-button positive"
                                onClick={() =>
                                  openAction(content, "restore")
                                }
                              >
                                <Eye size={15} />

                                Restore
                              </button>
                            ) : actions.includes(
                                "reverse-takedown"
                              ) ? (
                              <button
                                type="button"
                                className="em-users-action-button positive"
                                onClick={() =>
                                  openAction(
                                    content,
                                    "reverse-takedown"
                                  )
                                }
                              >
                                <Flag size={15} />

                                Reverse
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}

            <div className="em-users-pagination">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {(page - 1) * PAGE_SIZE + items.length}
                {" "}of{" "}
                {formatNumber(result?.total)} {type}
              </span>

              <div className="em-users-pagination-buttons">
                <button
                  type="button"
                  className="em-admin-secondary-button"
                  disabled={page <= 1 || loading}
                  onClick={() =>
                    setPage((previous) =>
                      Math.max(1, previous - 1)
                    )
                  }
                >
                  <ChevronLeft size={17} />

                  Previous
                </button>

                <strong>
                  {page} /{" "}
                  {Math.max(
                    1,
                    result?.totalPages || 1
                  )}
                </strong>

                <button
                  type="button"
                  className="em-admin-secondary-button"
                  disabled={
                    !result?.hasNextPage ||
                    loading
                  }
                  onClick={() =>
                    setPage((previous) => previous + 1)
                  }
                >
                  Next

                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* CONTENT DETAILS DIALOG */}

      {selectedContent && (
        <ContentDetailsDialog
          key={selectedContent._id}
          type={type}
          content={selectedContent}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setSelectedContent(null)}
          onAction={openAction}
        />
      )}

      {/* MODERATION CONFIRMATION DIALOG */}

      {pendingAction && (
        <ContentActionDialog
          key={`${pendingAction.content._id}:${pendingAction.action}`}
          type={type}
          pending={pendingAction}
          processing={processing}
          error={actionError}
          onClose={() => {
            if (!processingRef.current) {
              setPendingAction(null);
              setActionError("");
            }
          }}
          onConfirm={executeAction}
        />
      )}
    </div>
  );
}