import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  History,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { Navigate } from "react-router";

import { useAuth } from "../../context/AuthContext";

import {
  getAdminActivities,
  getAdminActivityById,
  type AdminActivityRecord,
  type ActivityListResponse,
  type ActivityValue,
} from "../../services/adminActivityApi";

// ==========================================
// CONFIGURATION
// ==========================================

const PAGE_SIZE = 20;

const TARGET_TYPES = [
  "user",
  "admin",
  "artist",
  "song",
  "release",
  "video",
  "report",
  "invitation",
  "announcement",
  "settings",
];

const ACTIVITY_ACTIONS = [
  "admin_invited",
  "admin_created",
  "admin_invitation_revoked",
  "admin_suspended",
  "admin_reactivated",
  "admin_role_removed",

  "user_suspended",
  "user_reactivated",
  "user_disabled",

  "artist_approved",
  "artist_rejected",
  "artist_verified",
  "artist_unverified",
  "artist_suspended",
  "artist_restored",
  "artist_featured",
  "artist_unfeatured",
  "artist_hidden",
  "artist_unhidden",
  "artist_takedown",
  "artist_takedown_reversed",

  "song_hidden",
  "song_restored",
  "song_takedown",
  "song_takedown_reversed",
  "song_deleted",
  "song_featured",
  "song_unfeatured",

  "release_approved",
  "release_rejected",
  "release_hidden",
  "release_restored",
  "release_takedown",
  "release_takedown_reversed",
  "release_deleted",
  "release_featured",
  "release_unfeatured",

  "video_approved",
  "video_rejected",
  "video_hidden",
  "video_restored",
  "video_takedown",
  "video_takedown_reversed",
  "video_deleted",
  "video_featured",
  "video_unfeatured",

  "report_reviewing",
  "report_resolved",
  "report_dismissed",

  "announcement_created",
  "announcement_deleted",
  "settings_updated",
];

// Only display approved, non-sensitive
// fields from activity snapshots.

const SAFE_SNAPSHOT_FIELDS = [
  "role",
  "accountStatus",
  "approvalStatus",
  "visibilityStatus",
  "status",
  "verified",
  "featured",
  "isFeatured",
  "emailVerified",
  "used",
];

// ==========================================
// FORMATTING HELPERS
// ==========================================

function formatLabel(value?: string | null) {
  if (!value) return "Not available";

  if (value === "superadmin") {
    return "Super Admin";
  }

  return value
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function formatDate(value?: string | null) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatNumber(value: number) {
  return value.toLocaleString("en-NG");
}

function formatValue(
  value: ActivityValue | undefined
) {
  if (value === undefined || value === null) {
    return "Not available";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete the request.";
}

function getActorName(activity: AdminActivityRecord) {
  if (activity.actorName) {
    return activity.actorName;
  }

  if (
    activity.actorId &&
    typeof activity.actorId === "object"
  ) {
    return activity.actorId.fullName || "Unknown administrator";
  }

  return "Unknown administrator";
}

function getActorId(activity: AdminActivityRecord) {
  return typeof activity.actorId === "string"
    ? activity.actorId
    : activity.actorId?._id || "";
}

// ==========================================
// OUTCOME BADGE
// ==========================================

function OutcomeBadge({
  outcome,
}: {
  outcome: string;
}) {
  const appearance =
    outcome === "success"
      ? "positive"
      : outcome === "denied"
        ? "warning"
        : "negative";

  return (
    <span className={`em-admin-status ${appearance}`}>
      {formatLabel(outcome)}
    </span>
  );
}

// ==========================================
// PREVIOUS AND UPDATED VALUES
// ==========================================

function ActivityChanges({
  activity,
}: {
  activity: AdminActivityRecord;
}) {
  const previous = activity.previousValues || {};
  const updated = activity.newValues || {};

  const fields = SAFE_SNAPSHOT_FIELDS.filter(
    (field) =>
      Object.prototype.hasOwnProperty.call(
        previous,
        field
      ) ||
      Object.prototype.hasOwnProperty.call(
        updated,
        field
      )
  );

  return (
    <section className="em-activity-changes">
      <h3>Recorded values</h3>

      {fields.length === 0 ? (
        <p className="em-admin-panel-note">
          No supported change values were recorded
          for this activity.
        </p>
      ) : (
        <div className="em-admin-table-wrap">
          <table className="em-admin-table em-activity-changes-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Previous value</th>
                <th>Updated value</th>
              </tr>
            </thead>

            <tbody>
              {fields.map((field) => {
                const changed =
                  previous[field] !== updated[field];

                return (
                  <tr key={field}>
                    <td>{formatLabel(field)}</td>

                    <td>
                      <span
                        className={
                          changed
                            ? "em-activity-previous-value"
                            : ""
                        }
                      >
                        {formatValue(previous[field])}
                      </span>
                    </td>

                    <td>
                      <span
                        className={
                          changed
                            ? "em-activity-new-value"
                            : ""
                        }
                      >
                        {formatValue(updated[field])}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ==========================================
// ACTIVITY DETAILS DIALOG
// ==========================================

function ActivityDetailsDialog({
  activityId,
  onClose,
}: {
  activityId: string;
  onClose: () => void;
}) {
  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const [activity, setActivity] =
    useState<AdminActivityRecord | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    dialog.showModal();

    return () => {
      dialog.close();
    };
  }, []);

  // ========================================
  // LOAD COMPLETE ACTIVITY RECORD
  // ========================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadActivity() {
      setLoading(true);
      setError("");
      setActivity(null);

      try {
        const result = await getAdminActivityById(
          activityId,
          controller.signal
        );

        if (!controller.signal.aborted) {
          setActivity(result);
        }
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

    void loadActivity();

    return () => {
      controller.abort();
    };
  }, [activityId, retryKey]);

  return (
    <dialog
      ref={dialogRef}
      className="em-users-dialog em-activity-dialog"
      aria-labelledby="em-activity-details-title"
      onCancel={onClose}
    >
      <div className="em-users-dialog-inner">

        {/* HEADER */}

        <div className="em-users-dialog-heading">
          <div>
            <h2 id="em-activity-details-title">
              Activity details
            </h2>

            <p>Administrative audit record</p>
          </div>

          <button
            type="button"
            className="em-users-icon-button"
            aria-label="Close activity details"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>

        {loading ? (
          <div className="em-users-loading">
            <div className="em-admin-spinner" />
            <p>Loading activity details...</p>
          </div>
        ) : error ? (
          <div className="em-users-alert error" role="alert">
            <AlertCircle size={20} />
            <span>{error}</span>

            <button
              type="button"
              className="em-admin-secondary-button"
              onClick={() =>
                setRetryKey((previous) => previous + 1)
              }
            >
              Retry
            </button>
          </div>
        ) : activity ? (
          <>
            {/* ACTIVITY SUMMARY */}

            <div className="em-users-profile">
              <div className="em-activity-icon large">
                <History size={28} />
              </div>

              <div>
                <h3>{formatLabel(activity.action)}</h3>

                <span>
                  {formatDate(activity.createdAt)}
                </span>
              </div>

              <OutcomeBadge
                outcome={activity.outcome}
              />
            </div>

            {/* ADMINISTRATOR INFORMATION */}

            <section className="em-activity-details-section">
              <h3>Administrator information</h3>

              <dl className="em-users-details-list">
                <div>
                  <dt>Administrator</dt>
                  <dd>{getActorName(activity)}</dd>
                </div>

                <div>
                  <dt>Role at time of action</dt>

                  <dd>
                    {formatLabel(activity.actorRole)}
                  </dd>
                </div>

                <div>
                  <dt>Administrator ID</dt>

                  <dd className="em-users-id">
                    {getActorId(activity) || "Not available"}
                  </dd>
                </div>
              </dl>
            </section>

            {/* AFFECTED CONTENT OR ACCOUNT */}

            <section className="em-activity-details-section">
              <h3>Affected account or content</h3>

              <dl className="em-users-details-list">
                <div>
                  <dt>Target type</dt>

                  <dd>
                    {formatLabel(activity.targetType)}
                  </dd>
                </div>

                <div>
                  <dt>Target name</dt>

                  <dd>
                    {activity.targetName || "Not available"}
                  </dd>
                </div>

                <div>
                  <dt>Target ID</dt>

                  <dd className="em-users-id">
                    {activity.targetId || "Not available"}
                  </dd>
                </div>
              </dl>
            </section>

            {/* ADMINISTRATIVE REASON */}

            <section className="em-artist-biography">
              <h3>Reason for action</h3>

              <p>
                {activity.reason ||
                  "No reason was recorded."}
              </p>
            </section>

            {/* CHANGES */}

            <ActivityChanges activity={activity} />

            {/* REQUEST INFORMATION */}

            <section className="em-activity-details-section">
              <h3>Request information</h3>

              <dl className="em-users-details-list">
                <div>
                  <dt>Request method</dt>

                  <dd>
                    {activity.requestMethod ||
                      "Not available"}
                  </dd>
                </div>

                <div>
                  <dt>Recorded IP address</dt>

                  <dd className="em-users-id">
                    {activity.ipAddress ||
                      "Not available"}
                  </dd>
                </div>

                <div>
                  <dt>Date and time</dt>

                  <dd>
                    {formatDate(activity.createdAt)}
                  </dd>
                </div>

                <div>
                  <dt>Activity ID</dt>

                  <dd className="em-users-id">
                    {activity._id}
                  </dd>
                </div>
              </dl>
            </section>
          </>
        ) : null}

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
// MAIN ACTIVITY LOG MANAGEMENT
// ==========================================

function ActivityLogsManagement() {
  const [result, setResult] =
    useState<ActivityListResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [actorRole, setActorRole] =
    useState("all");

  const [targetType, setTargetType] =
    useState("all");

  const [outcome, setOutcome] =
    useState("all");

  const [action, setAction] =
    useState("all");

  const [searchType, setSearchType] =
    useState<"actorId" | "targetId">("actorId");

  const [search, setSearch] =
    useState("");

  const [submittedSearch, setSubmittedSearch] =
    useState<{
      actorId?: string;
      targetId?: string;
    }>({});

  const [searchError, setSearchError] =
    useState("");

  const [page, setPage] = useState(1);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  // ========================================
  // LOAD ACTIVITY RECORDS
  // ========================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadActivities() {
      setLoading(true);
      setError("");
      setResult(null);

      try {
        const response = await getAdminActivities(
          {
            actorRole,
            targetType,
            outcome,
            action,

            ...submittedSearch,

            page,
            limit: PAGE_SIZE,
          },

          controller.signal
        );

        if (controller.signal.aborted) return;

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

    void loadActivities();

    return () => {
      controller.abort();
    };
  }, [
    actorRole,
    targetType,
    outcome,
    action,
    submittedSearch,
    page,
    refreshKey,
  ]);

  // ========================================
  // SEARCH BY OBJECT ID
  // ========================================

  function submitSearch() {
    const id = search.trim();

    if (id && !/^[a-f0-9]{24}$/i.test(id)) {
      setSearchError(
        "Enter a valid 24-character administrator or target ID."
      );

      return;
    }

    setSearchError("");

    setSubmittedSearch(
      id ? { [searchType]: id } : {}
    );

    setPage(1);
  }

  // ========================================
  // RESET FILTERS
  // ========================================

  function resetFilters() {
    setActorRole("all");
    setTargetType("all");
    setOutcome("all");
    setAction("all");

    setSearchType("actorId");
    setSearch("");
    setSubmittedSearch({});
    setSearchError("");

    setPage(1);
  }

  // ========================================
  // REFRESH ACTIVITY LOGS
  // ========================================

  function refreshActivities() {
    setSelectedId(null);

    setRefreshKey(
      (previous) => previous + 1
    );
  }

  const activities = result?.activities || [];

  const successfulOnPage = activities.filter(
    (activity) => activity.outcome === "success"
  ).length;

  const failedOnPage = activities.filter(
    (activity) => activity.outcome === "failed"
  ).length;

  const deniedOnPage = activities.filter(
    (activity) => activity.outcome === "denied"
  ).length;

  // ========================================
  // MAIN INTERFACE
  // ========================================

  return (
    <div className="em-users-page em-activity-page">

      {/* PAGE HEADER */}

      <section className="em-admin-page-heading">
        <div>
          <span className="em-admin-eyebrow">
            ADMINISTRATIVE ACCOUNTABILITY
          </span>

          <h1>Activity logs</h1>

          <p>
            Monitor administrative operations and
            inspect recorded platform changes.
          </p>
        </div>

        <button
          type="button"
          className="em-admin-secondary-button"
          onClick={refreshActivities}
          disabled={loading}
        >
          <RefreshCw size={17} />
          Refresh activity
        </button>
      </section>

      {/* SECURITY NOTICE */}

      <div className="em-super-admin-security-notice">
        <div className="em-super-admin-security-icon">
          <LockKeyhole size={23} />
        </div>

        <div>
          <strong>Restricted audit records</strong>

          <p>
            Administrative activity logs are read-only
            through this interface and accessible
            exclusively to Super Admin.

            Only operations recorded by the backend
            will appear here.
          </p>
        </div>
      </div>

      {/* STATISTICS */}

      <section className="em-admin-stat-grid">
        {[
          {
            label: "Matching activities",
            value: result?.total,
            icon: Activity,
          },
          {
            label: "Successful on this page",
            value: result ? successfulOnPage : undefined,
            icon: CheckCircle2,
          },
          {
            label: "Failed on this page",
            value: result ? failedOnPage : undefined,
            icon: AlertCircle,
          },
          {
            label: "Denied on this page",
            value: result ? deniedOnPage : undefined,
            icon: ShieldCheck,
          },
        ].map(({ label, value, icon: Icon }) => (
          <article
            key={label}
            className="em-admin-stat-card"
          >
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
        ))}
      </section>

      {/* ERROR MESSAGE */}

      {error && (
        <div className="em-users-alert error" role="alert">
          <AlertCircle size={20} />

          <span>{error}</span>

          <button
            type="button"
            className="em-admin-secondary-button"
            onClick={refreshActivities}
          >
            Retry
          </button>
        </div>
      )}

      {/* ACTIVITY DIRECTORY */}

      <section className="em-admin-panel">
        <div className="em-admin-panel-heading">
          <div>
            <h2>Administrative history</h2>

            <p>
              Search and filter recorded administrative
              operations.
            </p>
          </div>

          <History size={22} />
        </div>

        {/* SEARCH */}

        <form
          className="em-users-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <select
            className="em-users-select"
            value={searchType}
            aria-label="Activity search type"
            onChange={(event) => {
              setSearchType(
                event.target.value as
                  "actorId" | "targetId"
              );

              setSearch("");
              setSearchError("");
              setSubmittedSearch({});
              setPage(1);
            }}
          >
            <option value="actorId">
              Administrator ID
            </option>

            <option value="targetId">
              Target ID
            </option>
          </select>

          <div className="em-users-search">
            <Search size={18} />

            <input
              type="search"
              value={search}
              maxLength={24}
              aria-label="Search activity ID"
              placeholder={
                searchType === "actorId"
                  ? "Enter administrator ID..."
                  : "Enter affected content or account ID..."
              }
              onChange={(event) => {
                setSearch(event.target.value);
                setSearchError("");
              }}
            />
          </div>

          <button
            type="submit"
            className="em-admin-primary-button"
            disabled={loading}
          >
            Search
          </button>
        </form>

        {searchError && (
          <p className="em-report-search-error" role="alert">
            {searchError}
          </p>
        )}

        {/* ACTIVITY FILTERS */}

        <div className="em-activity-filters">

          <label>
            Administrator role

            <select
              className="em-users-select"
              value={actorRole}
              onChange={(event) => {
                setActorRole(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All roles</option>
              <option value="admin">Admin</option>
              <option value="superadmin">
                Super Admin
              </option>
            </select>
          </label>

          <label>
            Target type

            <select
              className="em-users-select"
              value={targetType}
              onChange={(event) => {
                setTargetType(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All targets</option>

              {TARGET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatLabel(type)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Operation outcome

            <select
              className="em-users-select"
              value={outcome}
              onChange={(event) => {
                setOutcome(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All outcomes</option>
              <option value="success">Successful</option>
              <option value="failed">Failed</option>
              <option value="denied">Denied</option>
            </select>
          </label>

          <label>
            Administrative action

            <select
              className="em-users-select"
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All actions</option>

              {ACTIVITY_ACTIONS.map((item) => (
                <option key={item} value={item}>
                  {formatLabel(item)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="em-activity-reset">
          <button
            type="button"
            className="em-admin-secondary-button"
            onClick={resetFilters}
          >
            Reset filters
          </button>
        </div>

        {/* LOADING STATE */}

        {loading ? (
          <div className="em-users-loading">
            <div className="em-admin-spinner" />

            <p>Loading administrative activities...</p>
          </div>
        ) : error ? (
          <div className="em-admin-empty">
            <AlertCircle size={34} />

            <p>Unable to load activity logs.</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="em-admin-empty">
            <History size={38} />

            <p>No matching activity records found.</p>

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
              {formatNumber(result?.total || 0)}
              {" "}matching activity records
            </div>

            {/* ACTIVITY TABLE */}

            <div className="em-admin-table-wrap">
              <table className="em-admin-table em-activity-table">
                <thead>
                  <tr>
                    <th>Administrator</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Outcome</th>
                    <th>Date and time</th>
                    <th>Details</th>
                  </tr>
                </thead>

                <tbody>
                  {activities.map((activity) => (
                    <tr key={activity._id}>

                      {/* ADMINISTRATOR */}

                      <td>
                        <div className="em-users-table-identity">
                          <div className="em-activity-icon">
                            <ShieldCheck size={20} />
                          </div>

                          <div>
                            <strong>
                              {getActorName(activity)}
                            </strong>

                            <span>
                              {formatLabel(activity.actorRole)}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* ADMINISTRATIVE ACTION */}

                      <td>
                        {formatLabel(activity.action)}
                      </td>

                      {/* TARGET */}

                      <td>
                        <div className="em-activity-target">
                          <strong>
                            {activity.targetName ||
                              "Unnamed target"}
                          </strong>

                          <span>
                            {formatLabel(
                              activity.targetType
                            )}
                          </span>
                        </div>
                      </td>

                      {/* OUTCOME */}

                      <td>
                        <OutcomeBadge
                          outcome={activity.outcome}
                        />
                      </td>

                      {/* TIME */}

                      <td>
                        <div className="em-activity-time">
                          <Clock size={14} />

                          {formatDate(
                            activity.createdAt
                          )}
                        </div>
                      </td>

                      {/* INSPECT ACTIVITY */}

                      <td>
                        <button
                          type="button"
                          className="em-users-action-button"
                          onClick={() =>
                            setSelectedId(activity._id)
                          }
                        >
                          <Eye size={15} />

                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}

            <div className="em-users-pagination">
              <span>
                Showing{" "}
                {((result?.page || 1) - 1) *
                  (result?.limit || PAGE_SIZE) + 1}
                –
                {((result?.page || 1) - 1) *
                  (result?.limit || PAGE_SIZE) +
                  activities.length}
                {" "}of{" "}
                {formatNumber(result?.total || 0)}
                {" "}activities
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

      {/* ACTIVITY DETAILS DIALOG */}

      {selectedId && (
        <ActivityDetailsDialog
          key={selectedId}
          activityId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ==========================================
// SUPER ADMIN ACCESS PROTECTION
// ==========================================

export default function SuperAdminActivityLogsPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="em-admin-access-state">
        <div className="em-admin-spinner" />

        <p>Checking Super Admin permissions...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "superadmin") {
    return <Navigate to="/admin" replace />;
  }

  return (
    <ActivityLogsManagement
      key={`${user.role}:${user.email}`}
    />
  );
}