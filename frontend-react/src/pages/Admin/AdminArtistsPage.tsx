import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Flag,
  Mic2,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Users,
  X,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";

import {
  getAdminDashboardOverview,
  type ArtistStatistics,
} from "../../services/adminApi";

import {
  getAdminArtists,
  performArtistAction,
  type AdminArtist,
  type ArtistAction,
  type ArtistListResponse,
} from "../../services/adminArtistApi";

// ==========================================
// CONFIGURATION
// ==========================================

const PAGE_SIZE = 20;

type ActionConfig = {
  label: string;
  description: string;
  danger: boolean;
};

type PendingAction = {
  artist: AdminArtist;
  action: ArtistAction;
};

// ==========================================
// ACTION CONFIGURATION
// ==========================================

const ACTIONS: Record<ArtistAction, ActionConfig> = {
  approve: {
    label: "Approve application",
    description:
      "Approve this artist application and enable eligible artist account functionality.",
    danger: false,
  },

  reject: {
    label: "Reject application",
    description:
      "Reject this pending artist application.",
    danger: true,
  },

  verify: {
    label: "Verify artist",
    description:
      "Grant this artist a verified profile badge.",
    danger: false,
  },

  unverify: {
    label: "Remove verification",
    description:
      "Remove the verification badge from this artist.",
    danger: true,
  },

  feature: {
    label: "Feature artist",
    description:
      "Make this eligible artist available to featured artist sections.",
    danger: false,
  },

  unfeature: {
    label: "Remove from featured",
    description:
      "Remove this artist from featured artist sections.",
    danger: false,
  },

  suspend: {
    label: "Suspend artist",
    description:
      "Suspend artist privileges. This does not automatically remove all previously published music and videos.",
    danger: true,
  },

  restore: {
    label: "Restore artist",
    description:
      "Restore eligible artist privileges. Existing content visibility restrictions remain in place.",
    danger: false,
  },

  hide: {
    label: "Hide profile",
    description:
      "Remove this artist profile from public discovery. Published songs and releases can be moderated separately.",
    danger: true,
  },

  "restore-profile": {
    label: "Restore profile visibility",
    description:
      "Remove the hidden visibility restriction from this artist profile. Other account restrictions still apply.",
    danger: false,
  },

  takedown: {
    label: "Take down profile",
    description:
      "Restrict this artist profile through an administrative takedown. Only Super Admin can reverse this action.",
    danger: true,
  },

  "reverse-takedown": {
    label: "Reverse takedown",
    description:
      "Reverse the takedown and return the profile to hidden status. A separate restoration action is required to make it visible.",
    danger: false,
  },
};

// ==========================================
// FORMAT HELPERS
// ==========================================

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NG").format(value);
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

function formatLabel(value?: string | null) {
  if (!value) return "Unknown";

  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete the request.";
}

function getVisibility(artist: AdminArtist) {
  return artist.visibilityStatus || "visible";
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "A"
  );
}

// ==========================================
// AVAILABLE ARTIST ACTIONS
// ==========================================

function getAvailableActions(
  artist: AdminArtist,
  isSuperAdmin: boolean
): ArtistAction[] {
  const actions: ArtistAction[] = [];

  const status = artist.approvalStatus;
  const visibility = getVisibility(artist);

  const ownerActive =
    artist.userId?.accountStatus === "active";

  // PENDING ARTIST APPLICATIONS

  if (status === "pending") {
    if (visibility === "visible" && ownerActive) {
      actions.push("approve");
    }

    actions.push("reject");

    return actions;
  }

  // APPROVED ARTISTS

  if (status === "approved") {
    if (visibility === "visible" && ownerActive) {
      actions.push(
        artist.verified ? "unverify" : "verify"
      );

      actions.push(
        artist.featured ? "unfeature" : "feature"
      );
    } else {
      if (artist.verified) {
        actions.push("unverify");
      }

      if (artist.featured) {
        actions.push("unfeature");
      }
    }

    actions.push("suspend");
  }

  // SUSPENDED ARTISTS

  if (status === "suspended" && ownerActive) {
    actions.push("restore");
  }

  // PROFILE VISIBILITY MODERATION

  if (
    status === "approved" ||
    status === "suspended"
  ) {
    if (visibility === "visible") {
      actions.push("hide", "takedown");
    }

    if (visibility === "hidden") {
      actions.push("restore-profile", "takedown");
    }

    if (
      visibility === "takedown" &&
      isSuperAdmin
    ) {
      actions.push("reverse-takedown");
    }
  }

  return actions;
}

// ==========================================
// ARTIST AVATAR
// ==========================================

function ArtistAvatar({
  artist,
  large = false,
}: {
  artist: AdminArtist;
  large?: boolean;
}) {
  return (
    <div
      className={`em-users-avatar em-artist-avatar ${
        large ? "large" : ""
      }`}
      aria-hidden="true"
    >
      {getInitials(artist.stageName || "Artist")}
    </div>
  );
}

// ==========================================
// STATUS BADGE
// ==========================================

function ArtistStatus({
  status,
}: {
  status: string;
}) {
  const appearance = [
    "approved",
    "visible",
    "active",
  ].includes(status)
    ? "positive"
    : [
        "pending",
        "hidden",
        "suspended",
      ].includes(status)
      ? "warning"
      : "negative";

  return (
    <span
      className={`em-admin-status ${appearance}`}
    >
      {formatLabel(status)}
    </span>
  );
}

// ==========================================
// ARTIST STATISTICS CARD
// ==========================================

function ArtistStatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value?: number;
  icon: typeof Users;
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
// ARTIST DETAILS DIALOG
// ==========================================

function ArtistDetailsDialog({
  artist,
  isSuperAdmin,
  onClose,
  onAction,
}: {
  artist: AdminArtist;
  isSuperAdmin: boolean;
  onClose: () => void;
  onAction: (
    artist: AdminArtist,
    action: ArtistAction
  ) => void;
}) {
  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const actions = getAvailableActions(
    artist,
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
      className="em-users-dialog em-artist-dialog"
      aria-labelledby="em-artist-details-title"
      onCancel={onClose}
    >
      <div className="em-users-dialog-inner">

        {/* HEADER */}

        <div className="em-users-dialog-heading">
          <div>
            <h2 id="em-artist-details-title">
              Artist details
            </h2>

            <p>Artist profile and account information</p>
          </div>

          <button
            type="button"
            className="em-users-icon-button"
            aria-label="Close artist details"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>

        {/* ARTIST PROFILE */}

        <div className="em-users-profile">
          <ArtistAvatar artist={artist} large />

          <div>
            <h3 className="em-artist-name">
              {artist.stageName}

              {artist.verified && (
                <BadgeCheck
                  size={19}
                  className="em-artist-verified-icon"
                  aria-label="Verified artist"
                />
              )}
            </h3>

            <span>
              {artist.country || "Country unavailable"}
            </span>
          </div>
        </div>

        {/* ARTIST INFORMATION */}

        <dl className="em-users-details-list">
          <div>
            <dt>Stage name</dt>

            <dd>{artist.stageName}</dd>
          </div>

          <div>
            <dt>Account owner</dt>

            <dd>
              {artist.userId?.fullName ||
                "Unavailable"}
            </dd>
          </div>

          <div>
            <dt>Email address</dt>

            <dd>
              {artist.userId?.email ||
                "Unavailable"}
            </dd>
          </div>

          <div>
            <dt>Country</dt>

            <dd>{artist.country || "Unavailable"}</dd>
          </div>

          <div>
            <dt>Application status</dt>

            <dd>
              <ArtistStatus
                status={artist.approvalStatus}
              />
            </dd>
          </div>

          <div>
            <dt>Profile visibility</dt>

            <dd>
              <ArtistStatus
                status={getVisibility(artist)}
              />
            </dd>
          </div>

          <div>
            <dt>Owner account status</dt>

            <dd>
              <ArtistStatus
                status={
                  artist.userId?.accountStatus ||
                  "unknown"
                }
              />
            </dd>
          </div>

          <div>
            <dt>Email verified</dt>

            <dd>
              {artist.userId?.emailVerified
                ? "Yes"
                : "No"}
            </dd>
          </div>

          <div>
            <dt>Artist verification</dt>

            <dd>
              {artist.verified
                ? "Verified artist"
                : "Not verified"}
            </dd>
          </div>

          <div>
            <dt>Featured artist</dt>

            <dd>{artist.featured ? "Yes" : "No"}</dd>
          </div>

          <div>
            <dt>Followers</dt>

            <dd>
              {formatNumber(
                artist.followersCount || 0
              )}
            </dd>
          </div>

          <div>
            <dt>Publicly available</dt>

            <dd>
              {artist.publiclyAvailable
                ? "Yes"
                : "No"}
            </dd>
          </div>

          <div>
            <dt>Application date</dt>

            <dd>{formatDate(artist.createdAt)}</dd>
          </div>

          {artist.moderationReason && (
            <div>
              <dt>Moderation reason</dt>

              <dd>{artist.moderationReason}</dd>
            </div>
          )}

          {artist.moderatedAt && (
            <div>
              <dt>Moderation date</dt>

              <dd>{formatDate(artist.moderatedAt)}</dd>
            </div>
          )}

          <div>
            <dt>Artist ID</dt>

            <dd className="em-users-id">
              {artist._id}
            </dd>
          </div>
        </dl>

        {/* ARTIST BIOGRAPHY */}

        <section className="em-artist-biography">
          <h3>Biography</h3>

          <p>
            {artist.bio ||
              "This artist has not provided a biography."}
          </p>
        </section>

        {/* AVAILABLE MANAGEMENT ACTIONS */}

        <section className="em-artist-manage-section">
          <h3>Management actions</h3>

          {actions.length === 0 ? (
            <p className="em-admin-panel-note">
              No management actions are currently
              available for this artist.
            </p>
          ) : (
            <div className="em-artist-action-grid">
              {actions.map((action) => (
                <button
                  key={action}
                  type="button"
                  className={`em-users-action-button ${
                    ACTIONS[action].danger
                      ? "danger"
                      : "positive"
                  }`}
                  onClick={() =>
                    onAction(artist, action)
                  }
                >
                  {ACTIONS[action].label}
                </button>
              ))}
            </div>
          )}

          {getVisibility(artist) === "takedown" &&
            !isSuperAdmin && (
              <p className="em-admin-panel-note">
                Only Super Admin can reverse an
                artist profile takedown.
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
// ACTION CONFIRMATION DIALOG
// ==========================================

function ArtistActionDialog({
  pending,
  processing,
  error,
  onClose,
  onConfirm,
}: {
  pending: PendingAction;
  processing: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const config = ACTIONS[pending.action];

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
      aria-labelledby="em-artist-action-title"
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
            <h2 id="em-artist-action-title">
              {config.label}
            </h2>

            <p>Administrative artist management</p>
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

        {/* SELECTED ARTIST */}

        <div className="em-users-profile">
          <ArtistAvatar
            artist={pending.artist}
            large
          />

          <div>
            <h3>{pending.artist.stageName}</h3>

            <span>
              {pending.artist.userId?.email ||
                pending.artist.country}
            </span>
          </div>
        </div>

        {/* ACTION EXPLANATION */}

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

        {/* ACTION REASON */}

        <label
          htmlFor="em-artist-action-reason"
          className="em-users-reason-label"
        >
          Reason for this action
        </label>

        <textarea
          id="em-artist-action-reason"
          className="em-users-textarea"
          value={reason}
          minLength={5}
          maxLength={1000}
          rows={5}
          required
          disabled={processing}
          placeholder="Explain why you are performing this action..."
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
              : `Confirm ${config.label.toLowerCase()}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// ==========================================
// MAIN ARTIST MANAGEMENT PAGE
// ==========================================

export default function AdminArtistsPage() {
  const { user } = useAuth();

  const isSuperAdmin =
    user?.role === "superadmin";

  // ========================================
  // PAGE STATE
  // ========================================

  const [result, setResult] =
    useState<ArtistListResponse | null>(null);

  const [statistics, setStatistics] =
    useState<ArtistStatistics | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] =
    useState("");

  const [approvalFilter, setApprovalFilter] =
    useState("all");

  const [visibilityFilter, setVisibilityFilter] =
    useState("all");

  const [verifiedFilter, setVerifiedFilter] =
    useState("all");

  const [featuredFilter, setFeaturedFilter] =
    useState("all");

  const [page, setPage] = useState(1);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [selectedArtist, setSelectedArtist] =
    useState<AdminArtist | null>(null);

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
  // LOAD ARTIST STATISTICS
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
          setStatistics(dashboard.stats.artists);
        }

      } catch (err) {
        if (!controller.signal.aborted) {
          setStatistics(null);
          setStatsError(errorMessage(err));
        }
      }
    }

    void loadStatistics();

    return () => {
      controller.abort();
    };
  }, [refreshKey]);

  // ========================================
  // LOAD ARTIST DATABASE RECORDS
  // ========================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadArtists() {
      setLoading(true);
      setError("");
      setResult(null);

      try {
        const response = await getAdminArtists(
          {
            q: submittedSearch,
            approvalStatus: approvalFilter,
            visibilityStatus: visibilityFilter,
            verified: verifiedFilter,
            featured: featuredFilter,
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
          setError(errorMessage(err));
        }

      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadArtists();

    return () => {
      controller.abort();
    };
  }, [
    submittedSearch,
    approvalFilter,
    visibilityFilter,
    verifiedFilter,
    featuredFilter,
    page,
    refreshKey,
  ]);

  // ========================================
  // REFRESH ARTISTS
  // ========================================

  function refreshArtists() {
    if (processingRef.current) return;

    setSelectedArtist(null);
    setMessage("");

    setRefreshKey((previous) => previous + 1);
  }

  // ========================================
  // RESET FILTERS
  // ========================================

  function resetFilters() {
    setSearch("");
    setSubmittedSearch("");
    setApprovalFilter("all");
    setVisibilityFilter("all");
    setVerifiedFilter("all");
    setFeaturedFilter("all");
    setPage(1);
  }

  // ========================================
  // OPEN MANAGEMENT ACTION
  // ========================================

  function openAction(
    artist: AdminArtist,
    action: ArtistAction
  ) {
    if (processingRef.current) return;

    const availableActions = getAvailableActions(
      artist,
      isSuperAdmin
    );

    if (!availableActions.includes(action)) {
      setError("This action is not available.");
      return;
    }

    setSelectedArtist(null);
    setMessage("");
    setActionError("");

    setPendingAction({
      artist,
      action,
    });
  }

  // ========================================
  // EXECUTE ARTIST MANAGEMENT ACTION
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

      const response = await performArtistAction(
        currentAction.artist._id,
        currentAction.action,
        reason
      );

      if (!mountedRef.current) return;

      setPendingAction(null);

      setMessage(
        response.message ||
        "Artist updated successfully."
      );

      setRefreshKey((previous) => previous + 1);

    } catch (err) {
      if (mountedRef.current) {
        setActionError(errorMessage(err));
      }

    } finally {
      processingRef.current = false;

      if (mountedRef.current) {
        setProcessing(false);
      }
    }
  }

  // ========================================
  // DERIVED DATA
  // ========================================

  const artists = result?.artists || [];

  // ========================================
  // ARTIST MANAGEMENT INTERFACE
  // ========================================

  return (
    <div className="em-users-page em-artists-page">

      {/* PAGE HEADER */}

      <section className="em-admin-page-heading">
        <div>
          <span className="em-admin-eyebrow">
            ARTIST MANAGEMENT
          </span>

          <h1>Artists</h1>

          <p>
            Review artist applications, manage profiles
            and maintain artist community standards.
          </p>
        </div>

        <button
          type="button"
          className="em-admin-secondary-button"
          disabled={loading || processing}
          onClick={refreshArtists}
        >
          <RefreshCw size={17} />

          Refresh artists
        </button>
      </section>

      {/* ARTIST STATISTICS */}

      <section className="em-admin-stat-grid">
        <ArtistStatCard
          label="Artist profiles"
          value={statistics?.total}
          icon={Mic2}
        />

        <ArtistStatCard
          label="Pending applications"
          value={statistics?.pending}
          icon={Clock}
        />

        <ArtistStatCard
          label="Verified artists"
          value={statistics?.verified}
          icon={BadgeCheck}
        />

        <ArtistStatCard
          label="Suspended artists"
          value={statistics?.suspended}
          icon={Ban}
        />
      </section>

      {statsError && (
        <p className="em-admin-panel-note">
          Artist statistics unavailable: {statsError}
        </p>
      )}

      {/* QUICK FILTERS */}

      <div className="em-artist-quick-filters">
        {[
          {
            label: "All artists",
            value: "all",
          },
          {
            label: "Pending applications",
            value: "pending",
          },
          {
            label: "Approved",
            value: "approved",
          },
          {
            label: "Suspended",
            value: "suspended",
          },
          {
            label: "Rejected",
            value: "rejected",
          },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            className={`em-artist-filter-tab ${
              approvalFilter === item.value
                ? "active"
                : ""
            }`}
            aria-pressed={
              approvalFilter === item.value
            }
            onClick={() => {
              setApprovalFilter(item.value);
              setPage(1);
            }}
          >
            {item.label}

            {item.value === "pending" &&
              statistics !== null && (
                <span>{statistics.pending}</span>
              )}
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
            onClick={refreshArtists}
          >
            Retry
          </button>
        </div>
      )}

      {/* MAIN ARTIST PANEL */}

      <section className="em-admin-panel">
        <div className="em-admin-panel-heading">
          <div>
            <h2>Artist directory</h2>

            <p>
              Search, filter and manage artist profiles.
            </p>
          </div>

          <Mic2 size={22} />
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
              aria-label="Search artist stage name"
              value={search}
              maxLength={100}
              placeholder="Search stage name..."
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

          {/* VISIBILITY FILTER */}

          <select
            className="em-users-select"
            aria-label="Filter profile visibility"
            value={visibilityFilter}
            onChange={(event) => {
              setVisibilityFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">
              All visibility
            </option>

            <option value="visible">
              Visible
            </option>

            <option value="hidden">
              Hidden
            </option>

            <option value="takedown">
              Taken down
            </option>
          </select>

          {/* VERIFICATION FILTER */}

          <select
            className="em-users-select"
            aria-label="Filter artist verification"
            value={verifiedFilter}
            onChange={(event) => {
              setVerifiedFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">
              All verification
            </option>

            <option value="true">
              Verified
            </option>

            <option value="false">
              Not verified
            </option>
          </select>

          {/* FEATURED FILTER */}

          <select
            className="em-users-select"
            aria-label="Filter featured artists"
            value={featuredFilter}
            onChange={(event) => {
              setFeaturedFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">
              All featured status
            </option>

            <option value="true">
              Featured
            </option>

            <option value="false">
              Not featured
            </option>
          </select>

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

            <p>Loading artist profiles...</p>
          </div>
        ) : error ? (
          <div className="em-admin-empty">
            <AlertCircle size={34} />

            <p>Unable to load artist profiles.</p>
          </div>
        ) : artists.length === 0 ? (
          <div className="em-admin-empty">
            <Mic2 size={38} />

            <p>No matching artist profiles found.</p>

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
              {formatNumber(result?.total || 0)}{" "}
              matching artists
            </div>

            {/* ARTISTS TABLE */}

            <div className="em-admin-table-wrap">
              <table className="em-admin-table em-artists-table">
                <thead>
                  <tr>
                    <th>Artist</th>
                    <th>Application</th>
                    <th>Visibility</th>
                    <th>Verification</th>
                    <th>Followers</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {artists.map((artist) => {
                    const actions =
                      getAvailableActions(
                        artist,
                        isSuperAdmin
                      );

                    return (
                      <tr key={artist._id}>

                        {/* ARTIST IDENTITY */}

                        <td>
                          <div className="em-users-table-identity">
                            <ArtistAvatar artist={artist} />

                            <div>
                              <strong className="em-artist-name">
                                {artist.stageName}

                                {artist.verified && (
                                  <BadgeCheck
                                    size={16}
                                    className="em-artist-verified-icon"
                                    aria-label="Verified artist"
                                  />
                                )}

                                {artist.featured && (
                                  <Star
                                    size={14}
                                    className="em-artist-featured-icon"
                                    aria-label="Featured artist"
                                  />
                                )}
                              </strong>

                              <span>
                                {artist.userId?.email ||
                                  "Owner unavailable"}
                              </span>

                              <span>
                                {artist.country ||
                                  "Country unavailable"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* APPLICATION STATUS */}

                        <td>
                          <ArtistStatus
                            status={artist.approvalStatus}
                          />
                        </td>

                        {/* VISIBILITY STATUS */}

                        <td>
                          <ArtistStatus
                            status={getVisibility(artist)}
                          />
                        </td>

                        {/* VERIFICATION */}

                        <td>
                          {artist.verified ? (
                            <span className="em-users-verification verified">
                              <BadgeCheck size={15} />
                              Verified
                            </span>
                          ) : (
                            <span className="em-users-verification unverified">
                              Not verified
                            </span>
                          )}
                        </td>

                        {/* FOLLOWERS */}

                        <td>
                          {formatNumber(
                            artist.followersCount || 0
                          )}
                        </td>

                        {/* ACTIONS */}

                        <td>
                          <div className="em-users-row-actions">
                            <button
                              type="button"
                              className="em-users-action-button"
                              onClick={() =>
                                setSelectedArtist(artist)
                              }
                            >
                              <Eye size={15} />

                              Details
                            </button>

                            {actions.includes("approve") ? (
                              <button
                                type="button"
                                className="em-users-action-button positive"
                                onClick={() =>
                                  openAction(
                                    artist,
                                    "approve"
                                  )
                                }
                              >
                                <CheckCircle2 size={15} />

                                Approve
                              </button>
                            ) : actions.includes("hide") ? (
                              <button
                                type="button"
                                className="em-users-action-button danger"
                                onClick={() =>
                                  openAction(
                                    artist,
                                    "hide"
                                  )
                                }
                              >
                                <EyeOff size={15} />

                                Hide
                              </button>
                            ) : actions.includes(
                                "reverse-takedown"
                              ) ? (
                              <button
                                type="button"
                                className="em-users-action-button positive"
                                onClick={() =>
                                  openAction(
                                    artist,
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
                {(page - 1) * PAGE_SIZE + artists.length}
                {" "}of{" "}
                {formatNumber(result?.total || 0)} artists
              </span>

              <div className="em-users-pagination-buttons">
                <button
                  type="button"
                  className="em-admin-secondary-button"
                  disabled={
                    page <= 1 ||
                    loading
                  }
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

      {/* ARTIST DETAILS */}

      {selectedArtist && (
        <ArtistDetailsDialog
          key={selectedArtist._id}
          artist={selectedArtist}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setSelectedArtist(null)}
          onAction={openAction}
        />
      )}

      {/* ACTION CONFIRMATION */}

      {pendingAction && (
        <ArtistActionDialog
          key={`${pendingAction.artist._id}:${pendingAction.action}`}
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