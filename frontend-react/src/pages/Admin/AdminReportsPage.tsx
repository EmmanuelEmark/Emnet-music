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
  ClipboardCheck,
  Clock,
  Eye,
  Flag,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

import {
  Link,
} from "react-router";

import {
  getAdminDashboardOverview,
  type ReportStatistics,
} from "../../services/adminApi";

import {
  getAdminReports,
  reviewReport,
  closeReport,
  type AdminReport,
  type ReportListResponse,
  type ReportUser,
} from "../../services/adminReportApi";

// ==========================================
// CONFIGURATION
// ==========================================

const PAGE_SIZE = 20;

type ReportAction =
  | "review"
  | "resolve"
  | "dismiss";

type PendingAction = {
  report: AdminReport;
  action: ReportAction;
};

const ACTION_CONFIG = {
  review: {
    title: "Start reviewing report",
    description:
      "Mark this report as under investigation. This does not change the visibility of the reported content.",
    button: "Start review",
    danger: false,
  },

  resolve: {
    title: "Resolve report",
    description:
      "Confirm that this report has been addressed. Any necessary content moderation must be performed separately.",
    button: "Resolve report",
    danger: false,
  },

  dismiss: {
    title: "Dismiss report",
    description:
      "Close this report without further action. The reported content will retain its current visibility.",
    button: "Dismiss report",
    danger: true,
  },
};

// ==========================================
// FORMATTING HELPERS
// ==========================================

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NG").format(value);
}

function formatLabel(value?: string | null) {
  if (!value) return "Not available";

  return value
    .replace(/[_-]/g, " ")
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
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete the request.";
}

function userName(
  user?: ReportUser | string | null
) {
  if (!user) return "Not available";

  if (typeof user === "string") {
    return user;
  }

  return user.fullName || "Unknown user";
}

function userEmail(
  user?: ReportUser | string | null
) {
  if (!user || typeof user === "string") {
    return "";
  }

  return user.email || "";
}

function isOpenReport(report: AdminReport) {
  return (
    report.status === "pending" ||
    report.status === "reviewing"
  );
}

// ==========================================
// CONTENT MANAGEMENT LINKS
// ==========================================

const CONTENT_PATHS = {
  artist: "/admin/artists",
  song: "/admin/songs",
  release: "/admin/releases",
  video: "/admin/videos",
};

// ==========================================
// REPORT STATUS BADGE
// ==========================================

function ReportStatusBadge({
  status,
}: {
  status: string;
}) {
  const appearance =
    status === "resolved"
      ? "positive"
      : status === "pending" ||
          status === "reviewing"
        ? "warning"
        : "negative";

  return (
    <span className={`em-admin-status ${appearance}`}>
      {formatLabel(status)}
    </span>
  );
}

// ==========================================
// STATISTICS CARD
// ==========================================

function ReportStatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value?: number;
  icon: typeof Flag;
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
// REPORT DETAILS DIALOG
// ==========================================

function ReportDetailsDialog({
  report,
  onClose,
  onAction,
}: {
  report: AdminReport;
  onClose: () => void;
  onAction: (
    report: AdminReport,
    action: ReportAction
  ) => void;
}) {
  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const [copyMessage, setCopyMessage] =
    useState("");

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    dialog.showModal();

    return () => {
      dialog.close();
    };
  }, []);

  async function copyContentId() {
    try {
      await navigator.clipboard.writeText(
        report.targetId
      );

      setCopyMessage("Content ID copied.");
    } catch {
      setCopyMessage(
        "Unable to copy. Select the content ID manually."
      );
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="em-users-dialog em-content-dialog"
      aria-labelledby="em-report-details-title"
      onCancel={onClose}
    >
      <div className="em-users-dialog-inner">

        {/* HEADER */}

        <div className="em-users-dialog-heading">
          <div>
            <h2 id="em-report-details-title">
              Report details
            </h2>

            <p>Content report investigation</p>
          </div>

          <button
            type="button"
            className="em-users-icon-button"
            onClick={onClose}
            aria-label="Close report details"
          >
            <X size={22} />
          </button>
        </div>

        {/* REPORT SUMMARY */}

        <div className="em-users-profile">
          <div className="em-content-artwork large">
            <Flag size={28} />
          </div>

          <div>
            <h3>{formatLabel(report.reason)}</h3>

            <span>
              {formatLabel(report.targetType)} report
            </span>
          </div>

          <ReportStatusBadge
            status={report.status}
          />
        </div>

        {/* REPORT INFORMATION */}

        <dl className="em-users-details-list">
          <div>
            <dt>Report reason</dt>
            <dd>{formatLabel(report.reason)}</dd>
          </div>

          <div>
            <dt>Reported content type</dt>
            <dd>{formatLabel(report.targetType)}</dd>
          </div>

          <div>
            <dt>Content ID</dt>

            <dd className="em-users-id">
              {report.targetId}
            </dd>
          </div>

          <div>
            <dt>Report status</dt>

            <dd>
              <ReportStatusBadge
                status={report.status}
              />
            </dd>
          </div>

          <div>
            <dt>Reported by</dt>

            <dd>{userName(report.reportedBy)}</dd>
          </div>

          {userEmail(report.reportedBy) && (
            <div>
              <dt>Reporter email</dt>

              <dd>
                {userEmail(report.reportedBy)}
              </dd>
            </div>
          )}

          <div>
            <dt>Submitted on</dt>

            <dd>{formatDate(report.createdAt)}</dd>
          </div>

          <div>
            <dt>Reviewed by</dt>

            <dd>{userName(report.reviewedBy)}</dd>
          </div>

          <div>
            <dt>Reviewed on</dt>

            <dd>{formatDate(report.reviewedAt)}</dd>
          </div>

          <div>
            <dt>Closed on</dt>

            <dd>{formatDate(report.closedAt)}</dd>
          </div>

          <div>
            <dt>Report ID</dt>

            <dd className="em-users-id">
              {report._id}
            </dd>
          </div>
        </dl>

        {/* REPORT DESCRIPTION */}

        <section className="em-artist-biography">
          <h3>Report description</h3>

          <p>
            {report.description ||
              "No additional description was provided."}
          </p>
        </section>

        {/* RESOLUTION REASON */}

        {report.resolutionReason && (
          <section className="em-artist-biography">
            <h3>Resolution notes</h3>

            <p>{report.resolutionReason}</p>
          </section>
        )}

        {/* INVESTIGATE REPORTED CONTENT */}

        <section className="em-artist-manage-section">
          <h3>Investigate reported content</h3>

          <p className="em-admin-panel-note">
            Use the content ID to identify the reported
            item in its management section. Content
            moderation and report resolution are
            separate administrative operations.
          </p>

          <div className="em-report-investigation-actions">
            <button
              type="button"
              className="em-admin-secondary-button"
              onClick={copyContentId}
            >
              Copy content ID
            </button>

            {CONTENT_PATHS[report.targetType] && (
              <Link
                to={CONTENT_PATHS[report.targetType]}
                className="em-admin-primary-button"
                onClick={onClose}
              >
                <Eye size={17} />

                Open content management
              </Link>
            )}
          </div>

          {copyMessage && (
            <p
              className="em-admin-panel-note"
              role="status"
            >
              {copyMessage}
            </p>
          )}
        </section>

        {/* REPORT MANAGEMENT ACTIONS */}

        <section className="em-artist-manage-section">
          <h3>Report management</h3>

          {isOpenReport(report) ? (
            <div className="em-artist-action-grid">
              {report.status === "pending" && (
                <button
                  type="button"
                  className="em-users-action-button positive"
                  onClick={() =>
                    onAction(report, "review")
                  }
                >
                  <Eye size={16} />

                  Start review
                </button>
              )}

              <button
                type="button"
                className="em-users-action-button positive"
                onClick={() =>
                  onAction(report, "resolve")
                }
              >
                <CheckCircle2 size={16} />

                Resolve report
              </button>

              <button
                type="button"
                className="em-users-action-button danger"
                onClick={() =>
                  onAction(report, "dismiss")
                }
              >
                <XCircle size={16} />

                Dismiss report
              </button>
            </div>
          ) : (
            <p className="em-admin-panel-note">
              This report is closed. Its information
              remains available for administrative records.
            </p>
          )}
        </section>

        {/* FOOTER */}

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
// REPORT ACTION CONFIRMATION DIALOG
// ==========================================

function ReportActionDialog({
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

  const config =
    ACTION_CONFIG[pending.action];

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
      aria-labelledby="em-report-action-title"
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
        {/* HEADER */}

        <div className="em-users-dialog-heading">
          <div>
            <h2 id="em-report-action-title">
              {config.title}
            </h2>

            <p>Administrative report action</p>
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

        {/* REPORT SUMMARY */}

        <div className="em-users-profile">
          <div className="em-content-artwork large">
            <Flag size={28} />
          </div>

          <div>
            <h3>
              {formatLabel(pending.report.reason)}
            </h3>

            <span>
              {formatLabel(
                pending.report.targetType
              )} report
            </span>
          </div>
        </div>

        {/* ACTION NOTICE */}

        <div
          className={`em-users-action-notice ${
            config.danger
              ? "danger"
              : "positive"
          }`}
        >
          {config.danger ? (
            <AlertCircle size={22} />
          ) : (
            <ShieldCheck size={22} />
          )}

          <p>{config.description}</p>
        </div>

        {/* REQUIRED REASON */}

        <label
          htmlFor="em-report-action-reason"
          className="em-users-reason-label"
        >
          {pending.action === "review"
            ? "Review notes"
            : "Resolution reason"}
        </label>

        <textarea
          id="em-report-action-reason"
          className="em-users-textarea"
          value={reason}
          minLength={5}
          maxLength={1000}
          rows={5}
          required
          disabled={processing}
          placeholder="Explain the reason for this report action..."
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
              : config.button}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// ==========================================
// MAIN REPORT MANAGEMENT PAGE
// ==========================================

export default function AdminReportsPage() {
  // ========================================
  // STATE
  // ========================================

  const [result, setResult] =
    useState<ReportListResponse | null>(null);

  const [statistics, setStatistics] =
    useState<ReportStatistics | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [message, setMessage] = useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [targetTypeFilter, setTargetTypeFilter] =
    useState("all");

  const [targetId, setTargetId] = useState("");

  const [submittedTargetId, setSubmittedTargetId] =
    useState("");

  const [searchError, setSearchError] =
    useState("");

  const [page, setPage] = useState(1);

  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedReport, setSelectedReport] =
    useState<AdminReport | null>(null);

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
  // LOAD REPORT STATISTICS
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
          setStatistics(dashboard.stats.reports);
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
  // LOAD REPORTS
  // ========================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadReports() {
      setLoading(true);
      setError("");
      setResult(null);

      try {
        const response = await getAdminReports(
          {
            status: statusFilter,

            targetType: targetTypeFilter,

            targetId: submittedTargetId,

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

    void loadReports();

    return () => {
      controller.abort();
    };
  }, [
    statusFilter,
    targetTypeFilter,
    submittedTargetId,
    page,
    refreshKey,
  ]);

  // ========================================
  // SEARCH REPORTED CONTENT ID
  // ========================================

  function submitSearch() {
    const cleanedId = targetId.trim();

    if (
      cleanedId &&
      !/^[a-fA-F0-9]{24}$/.test(cleanedId)
    ) {
      setSearchError(
        "Enter a valid 24-character content ID."
      );

      return;
    }

    setSearchError("");

    setSubmittedTargetId(cleanedId);

    setPage(1);
  }

  // ========================================
  // RESET FILTERS
  // ========================================

  function resetFilters() {
    setStatusFilter("all");
    setTargetTypeFilter("all");
    setTargetId("");
    setSubmittedTargetId("");
    setSearchError("");
    setPage(1);
  }

  // ========================================
  // REFRESH REPORTS
  // ========================================

  function refreshReports() {
    if (processingRef.current) return;

    setSelectedReport(null);

    setMessage("");

    setRefreshKey((previous) => previous + 1);
  }

  // ========================================
  // OPEN REPORT ACTION
  // ========================================

  function openAction(
    report: AdminReport,
    action: ReportAction
  ) {
    if (processingRef.current) return;

    if (!isOpenReport(report)) {
      setError("This report has already been closed.");
      return;
    }

    if (
      action === "review" &&
      report.status !== "pending"
    ) {
      setError(
        "This report is already being reviewed."
      );

      return;
    }

    setSelectedReport(null);
    setMessage("");
    setActionError("");

    setPendingAction({
      report,
      action,
    });
  }

  // ========================================
  // EXECUTE REPORT ACTION
  // ========================================

  async function executeAction(reason: string) {
    if (
      !pendingAction ||
      processingRef.current
    ) {
      return;
    }

    processingRef.current = true;

    const currentAction = pendingAction;

    try {
      setProcessing(true);
      setActionError("");

      const response =
        currentAction.action === "review"
          ? await reviewReport(
              currentAction.report._id,
              reason
            )
          : await closeReport(
              currentAction.report._id,
              currentAction.action === "resolve"
                ? "resolved"
                : "dismissed",
              reason
            );

      if (!mountedRef.current) return;

      setPendingAction(null);

      setMessage(
        response.message ||
        "Report updated successfully."
      );

      setRefreshKey(
        (previous) => previous + 1
      );

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

  const reports = result?.reports || [];

  // ========================================
  // MAIN REPORT MANAGEMENT INTERFACE
  // ========================================

  return (
    <div className="em-users-page em-reports-page">

      {/* PAGE HEADER */}

      <section className="em-admin-page-heading">
        <div>
          <span className="em-admin-eyebrow">
            TRUST & SAFETY
          </span>

          <h1>Reports</h1>

          <p>
            Investigate reported content and maintain
            a safe Emnet Music community.
          </p>
        </div>

        <button
          type="button"
          className="em-admin-secondary-button"
          disabled={loading || processing}
          onClick={refreshReports}
        >
          <RefreshCw size={17} />

          Refresh reports
        </button>
      </section>

      {/* REPORT STATISTICS */}

      <section className="em-admin-stat-grid">
        <ReportStatCard
          label="Total reports"
          value={statistics?.total}
          icon={Flag}
        />

        <ReportStatCard
          label="Pending reports"
          value={statistics?.pending}
          icon={Clock}
        />

        <ReportStatCard
          label="Under review"
          value={statistics?.reviewing}
          icon={Eye}
        />

        <ReportStatCard
          label="Resolved reports"
          value={statistics?.resolved}
          icon={ClipboardCheck}
        />
      </section>

      {statsError && (
        <p className="em-admin-panel-note">
          Report statistics unavailable: {statsError}
        </p>
      )}

      {/* REPORT STATUS FILTERS */}

      <div className="em-artist-quick-filters">
        {[
          {
            label: "All reports",
            value: "all",
          },
          {
            label: "Pending",
            value: "pending",
            count: statistics?.pending,
          },
          {
            label: "Reviewing",
            value: "reviewing",
            count: statistics?.reviewing,
          },
          {
            label: "Resolved",
            value: "resolved",
            count: statistics?.resolved,
          },
          {
            label: "Dismissed",
            value: "dismissed",
            count: statistics?.dismissed,
          },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            className={`em-artist-filter-tab ${
              statusFilter === item.value
                ? "active"
                : ""
            }`}
            aria-pressed={
              statusFilter === item.value
            }
            onClick={() => {
              setStatusFilter(item.value);
              setPage(1);
            }}
          >
            {item.label}

            {item.count !== undefined && (
              <span>{item.count}</span>
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
            onClick={refreshReports}
          >
            Retry
          </button>
        </div>
      )}

      {/* REPORT DIRECTORY */}

      <section className="em-admin-panel">
        <div className="em-admin-panel-heading">
          <div>
            <h2>Content reports</h2>

            <p>
              Review reports submitted by platform users.
            </p>
          </div>

          <Flag size={22} />
        </div>

        {/* SEARCH AND FILTERS */}

        <form
          className="em-users-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <div className="em-users-search">
            <Search size={18} />

            <input
              type="search"
              value={targetId}
              maxLength={24}
              aria-label="Search reported content ID"
              placeholder="Search by content ID..."
              onChange={(event) => {
                setTargetId(event.target.value);
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

          <select
            className="em-users-select"
            aria-label="Reported content type"
            value={targetTypeFilter}
            onChange={(event) => {
              setTargetTypeFilter(
                event.target.value
              );

              setPage(1);
            }}
          >
            <option value="all">
              All content types
            </option>

            <option value="artist">
              Artists
            </option>

            <option value="song">
              Songs
            </option>

            <option value="release">
              Releases
            </option>

            <option value="video">
              Videos
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

        {searchError && (
          <p
            className="em-report-search-error"
            role="alert"
          >
            {searchError}
          </p>
        )}

        {/* LOADING STATE */}

        {loading ? (
          <div className="em-users-loading">
            <div className="em-admin-spinner" />

            <p>Loading reports...</p>
          </div>
        ) : error ? (
          <div className="em-admin-empty">
            <AlertCircle size={34} />

            <p>Unable to load content reports.</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="em-admin-empty">
            <ShieldCheck size={38} />

            <p>No matching reports found.</p>

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
            {/* REPORT COUNT */}

            <div className="em-users-results">
              {formatNumber(
                result?.totalReports || 0
              )} matching reports
            </div>

            {/* REPORTS TABLE */}

            <div className="em-admin-table-wrap">
              <table className="em-admin-table em-reports-table">
                <thead>
                  <tr>
                    <th>Report reason</th>
                    <th>Content type</th>
                    <th>Reported by</th>
                    <th>Status</th>
                    <th>Date submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {reports.map((report) => (
                    <tr key={report._id}>

                      {/* REPORT REASON */}

                      <td>
                        <div className="em-users-table-identity">
                          <div className="em-report-table-icon">
                            <Flag size={20} />
                          </div>

                          <div>
                            <strong>
                              {formatLabel(report.reason)}
                            </strong>

                            <span>
                              {report.description ||
                                "No additional description"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* CONTENT TYPE */}

                      <td>
                        <span className="em-users-role">
                          {formatLabel(
                            report.targetType
                          )}
                        </span>
                      </td>

                      {/* REPORTER */}

                      <td>
                        <div className="em-report-reporter">
                          <strong>
                            {userName(
                              report.reportedBy
                            )}
                          </strong>

                          <span>
                            {userEmail(
                              report.reportedBy
                            )}
                          </span>
                        </div>
                      </td>

                      {/* REPORT STATUS */}

                      <td>
                        <ReportStatusBadge
                          status={report.status}
                        />
                      </td>

                      {/* SUBMISSION DATE */}

                      <td>
                        {formatDate(
                          report.createdAt
                        )}
                      </td>

                      {/* REPORT ACTIONS */}

                      <td>
                        <div className="em-users-row-actions">
                          <button
                            type="button"
                            className="em-users-action-button"
                            onClick={() =>
                              setSelectedReport(report)
                            }
                          >
                            <Eye size={15} />

                            Details
                          </button>

                          {report.status === "pending" && (
                            <button
                              type="button"
                              className="em-users-action-button positive"
                              onClick={() =>
                                openAction(
                                  report,
                                  "review"
                                )
                              }
                            >
                              Review
                            </button>
                          )}

                          {report.status === "reviewing" && (
                            <button
                              type="button"
                              className="em-users-action-button positive"
                              onClick={() =>
                                openAction(
                                  report,
                                  "resolve"
                                )
                              }
                            >
                              <CheckCircle2 size={15} />

                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}

            <div className="em-users-pagination">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–
                {(page - 1) * PAGE_SIZE + reports.length}
                {" "}of{" "}
                {formatNumber(
                  result?.totalReports || 0
                )} reports
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
                    setPage(
                      (previous) => previous + 1
                    )
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

      {/* REPORT DETAILS DIALOG */}

      {selectedReport && (
        <ReportDetailsDialog
          key={selectedReport._id}
          report={selectedReport}
          onClose={() =>
            setSelectedReport(null)
          }
          onAction={openAction}
        />
      )}

      {/* REPORT ACTION CONFIRMATION */}

      {pendingAction && (
        <ReportActionDialog
          key={`${pendingAction.report._id}:${pendingAction.action}`}
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