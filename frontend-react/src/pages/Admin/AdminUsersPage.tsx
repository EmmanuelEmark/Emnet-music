import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";

import {
  getPlatformUsers,
  suspendPlatformUser,
  reactivatePlatformUser,
  type PlatformUser,
} from "../../services/adminUserApi";

// ==========================================
// CONFIGURATION
// ==========================================

const PAGE_SIZE = 20;

type ActionType = "suspend" | "reactivate";

type PendingAction = {
  type: ActionType;
  user: PlatformUser;
};

// ==========================================
// FORMATTING HELPERS
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

function formatDateTime(value?: string | null) {
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

function formatLabel(value: string) {
  if (!value) return "Unknown";

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function getInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U"
  );
}

// ==========================================
// USER AVATAR
// ==========================================

function UserAvatar({
  user,
  large = false,
}: {
  user: PlatformUser;
  large?: boolean;
}) {
  return (
    <div
      className={`em-users-avatar ${
        large ? "large" : ""
      }`}
      aria-hidden="true"
    >
      {getInitials(user.fullName || "User")}
    </div>
  );
}

// ==========================================
// ACCOUNT STATUS
// ==========================================

function AccountStatusBadge({
  status,
}: {
  status: string;
}) {
  const appearance =
    status === "active"
      ? "positive"
      : status === "suspended"
        ? "warning"
        : "negative";

  return (
    <span className={`em-admin-status ${appearance}`}>
      {formatLabel(status)}
    </span>
  );
}

// ==========================================
// EMAIL VERIFICATION STATUS
// ==========================================

function VerificationStatus({
  verified,
}: {
  verified: boolean;
}) {
  return (
    <span
      className={`em-users-verification ${
        verified ? "verified" : "unverified"
      }`}
    >
      {verified ? (
        <>
          <CheckCircle2 size={14} />
          Verified
        </>
      ) : (
        <>
          <Clock size={14} />
          Unverified
        </>
      )}
    </span>
  );
}

// ==========================================
// USER STATISTIC CARD
// ==========================================

function UserStatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: typeof Users;
}) {
  const Icon = icon;

  return (
    <article className="em-admin-stat-card">
      <div className="em-admin-stat-top">
        <div className="em-admin-stat-icon">
          <Icon size={22} />
        </div>
      </div>

      <p>{label}</p>

      <strong className="em-admin-stat-value">
        {formatNumber(value)}
      </strong>
    </article>
  );
}

// ==========================================
// USER DETAILS DIALOG
// ==========================================

function UserDetailsDialog({
  user,
  onClose,
  onAction,
}: {
  user: PlatformUser;
  onClose: () => void;
  onAction: (
    type: ActionType,
    user: PlatformUser
  ) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

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
      onCancel={onClose}
      aria-labelledby="em-user-details-title"
    >
      <div className="em-users-dialog-inner">

        {/* DIALOG HEADER */}

        <div className="em-users-dialog-heading">
          <div>
            <h2 id="em-user-details-title">
              User details
            </h2>

            <p>Platform account information</p>
          </div>

          <button
            type="button"
            className="em-users-icon-button"
            onClick={onClose}
            aria-label="Close user details"
          >
            <X size={22} />
          </button>
        </div>

        {/* USER PROFILE */}

        <div className="em-users-profile">
          <UserAvatar user={user} large />

          <div>
            <h3>{user.fullName || "Unnamed user"}</h3>

            <span>{user.email}</span>
          </div>
        </div>

        {/* ACCOUNT INFORMATION */}

        <dl className="em-users-details-list">
          <div>
            <dt>Full name</dt>
            <dd>{user.fullName || "Not available"}</dd>
          </div>

          <div>
            <dt>Email address</dt>
            <dd>{user.email}</dd>
          </div>

          <div>
            <dt>User role</dt>
            <dd>{formatLabel(user.role)}</dd>
          </div>

          <div>
            <dt>Account status</dt>

            <dd>
              <AccountStatusBadge
                status={user.accountStatus}
              />
            </dd>
          </div>

          <div>
            <dt>Email verification</dt>

            <dd>
              <VerificationStatus
                verified={user.emailVerified}
              />
            </dd>
          </div>

          <div>
            <dt>Registration date</dt>

            <dd>{formatDateTime(user.createdAt)}</dd>
          </div>

          <div>
            <dt>Last login</dt>

            <dd>{formatDateTime(user.lastLoginAt)}</dd>
          </div>

          <div>
            <dt>Last account status change</dt>

            <dd>
              {formatDateTime(user.accountStatusUpdatedAt)}
            </dd>
          </div>

          {user.accountStatusReason && (
            <div>
              <dt>Account status reason</dt>

              <dd>{user.accountStatusReason}</dd>
            </div>
          )}

          <div>
            <dt>User ID</dt>

            <dd className="em-users-id">
              {user._id}
            </dd>
          </div>
        </dl>

        {/* AVAILABLE ACCOUNT ACTIONS */}

        <div className="em-users-dialog-footer">
          <button
            type="button"
            className="em-admin-secondary-button"
            onClick={onClose}
          >
            Close
          </button>

          {user.accountStatus === "active" && (
            <button
              type="button"
              className="em-users-danger-button"
              onClick={() => onAction("suspend", user)}
            >
              <Ban size={17} />

              Suspend account
            </button>
          )}

          {user.accountStatus === "suspended" && (
            <button
              type="button"
              className="em-admin-primary-button"
              onClick={() => onAction("reactivate", user)}
            >
              <UserCheck size={17} />

              Reactivate account
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

// ==========================================
// CONFIRM ACCOUNT ACTION DIALOG
// ==========================================

function AccountActionDialog({
  action,
  processing,
  error,
  onClose,
  onConfirm,
}: {
  action: PendingAction;
  processing: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  const dialogRef = useRef<HTMLDialogElement>(null);

  const isSuspension = action.type === "suspend";

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
      aria-labelledby="em-user-action-title"
      onCancel={(event) => {
        event.preventDefault();

        if (!processing) {
          onClose();
        }
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
        {/* ACTION HEADER */}

        <div className="em-users-dialog-heading">
          <div>
            <h2 id="em-user-action-title">
              {isSuspension
                ? "Suspend user account"
                : "Reactivate user account"}
            </h2>

            <p>Administrative account action</p>
          </div>

          <button
            type="button"
            className="em-users-icon-button"
            disabled={processing}
            onClick={onClose}
            aria-label="Close action dialog"
          >
            <X size={22} />
          </button>
        </div>

        {/* SELECTED USER */}

        <div className="em-users-profile">
          <UserAvatar user={action.user} large />

          <div>
            <h3>{action.user.fullName}</h3>

            <span>{action.user.email}</span>
          </div>
        </div>

        {/* ACTION EXPLANATION */}

        <div
          className={`em-users-action-notice ${
            isSuspension ? "danger" : "positive"
          }`}
        >
          {isSuspension ? (
            <Ban size={22} />
          ) : (
            <ShieldCheck size={22} />
          )}

          <p>
            {isSuspension
              ? "This action will restrict the user's authenticated access to Emnet Music. Their stored account information will not be deleted."
              : "This action will restore the suspended user's account access, subject to the platform's other account restrictions."}
          </p>
        </div>

        {/* REASON */}

        <label
          className="em-users-reason-label"
          htmlFor="em-account-reason"
        >
          Reason for{" "}
          {isSuspension ? "suspension" : "reactivation"}
        </label>

        <textarea
          id="em-account-reason"
          className="em-users-textarea"
          value={reason}
          maxLength={1000}
          minLength={5}
          required
          rows={5}
          disabled={processing}
          placeholder={
            isSuspension
              ? "Explain why this account is being suspended..."
              : "Explain why this account is being reactivated..."
          }
          onChange={(event) => {
            setReason(event.target.value);
          }}
        />

        <div className="em-users-character-count">
          {reason.length}/1000
        </div>

        {/* ERROR MESSAGE */}

        {error && (
          <div
            className="em-users-alert error"
            role="alert"
          >
            <AlertCircle size={19} />

            <span>{error}</span>
          </div>
        )}

        {/* CONFIRMATION BUTTONS */}

        <div className="em-users-dialog-footer">
          <button
            type="button"
            className="em-admin-secondary-button"
            onClick={onClose}
            disabled={processing}
          >
            Cancel
          </button>

          <button
            type="submit"
            className={
              isSuspension
                ? "em-users-danger-button"
                : "em-admin-primary-button"
            }
            disabled={!validReason || processing}
          >
            {processing
              ? "Processing..."
              : isSuspension
                ? "Confirm suspension"
                : "Confirm reactivation"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// ==========================================
// MAIN USER MANAGEMENT PAGE
// ==========================================

export default function AdminUsersPage() {
  // ========================================
  // STATE
  // ========================================

  const [users, setUsers] =
    useState<PlatformUser[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [verificationFilter, setVerificationFilter] =
    useState("all");

  const [page, setPage] = useState(1);

  const [refreshKey, setRefreshKey] = useState(0);

  const [selectedUser, setSelectedUser] =
    useState<PlatformUser | null>(null);

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
  // LOAD PLATFORM USERS
  // ========================================

  useEffect(() => {
    const controller = new AbortController();

    let active = true;

    async function loadUsers() {
      setLoading(true);
      setError("");

      try {
        const result = await getPlatformUsers(
          controller.signal
        );

        if (active) {
          setUsers(result);
        }

      } catch (err) {
        if (!active || controller.signal.aborted) {
          return;
        }

        setUsers([]);
        setError(getErrorMessage(err));

      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadUsers();

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshKey]);

  // ========================================
  // USER STATISTICS
  // ========================================

  const statistics = useMemo(() => {
    return {
      total: users.length,

      active: users.filter(
        (user) => user.accountStatus === "active"
      ).length,

      suspended: users.filter(
        (user) => user.accountStatus === "suspended"
      ).length,

      verified: users.filter(
        (user) => user.emailVerified === true
      ).length,
    };
  }, [users]);

  // ========================================
  // SEARCH AND FILTER USERS
  // ========================================

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !query ||
        (user.fullName || "")
          .toLowerCase()
          .includes(query) ||
        (user.email || "")
          .toLowerCase()
          .includes(query);

      const matchesRole =
        roleFilter === "all" ||
        user.role === roleFilter;

      const matchesStatus =
        statusFilter === "all" ||
        user.accountStatus === statusFilter;

      const matchesVerification =
        verificationFilter === "all" ||
        (
          verificationFilter === "verified" &&
          user.emailVerified === true
        ) ||
        (
          verificationFilter === "unverified" &&
          user.emailVerified !== true
        );

      return (
        matchesSearch &&
        matchesRole &&
        matchesStatus &&
        matchesVerification
      );
    });
  }, [
    users,
    search,
    roleFilter,
    statusFilter,
    verificationFilter,
  ]);

  // ========================================
  // PAGINATION
  // ========================================

  const totalPages = Math.max(
    1,
    Math.ceil(filteredUsers.length / PAGE_SIZE)
  );

  const currentPage = Math.min(page, totalPages);

  const startIndex =
    (currentPage - 1) * PAGE_SIZE;

  const visibleUsers = filteredUsers.slice(
    startIndex,
    startIndex + PAGE_SIZE
  );

  // ========================================
  // RESET FILTERS
  // ========================================

  function resetFilters() {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
    setVerificationFilter("all");
    setPage(1);
  }

  // ========================================
  // REFRESH USERS
  // ========================================

  function refreshUsers() {
    if (processingRef.current) return;

    setMessage("");
    setSelectedUser(null);

    setRefreshKey((previous) => previous + 1);
  }

  // ========================================
  // OPEN ACCOUNT ACTION
  // ========================================

  function openAccountAction(
    type: ActionType,
    user: PlatformUser
  ) {
    if (processingRef.current) return;

    setSelectedUser(null);
    setError("");
    setMessage("");
    setActionError("");

    setPendingAction({
      type,
      user,
    });
  }

  // ========================================
  // CLOSE ACCOUNT ACTION
  // ========================================

  function closeAccountAction() {
    if (processingRef.current) return;

    setPendingAction(null);
    setActionError("");
  }

  // ========================================
  // EXECUTE ACCOUNT ACTION
  // ========================================

  async function executeAccountAction(
    reason: string
  ) {
    if (!pendingAction || processingRef.current) {
      return;
    }

    processingRef.current = true;

    const action = pendingAction;

    try {
      setProcessing(true);
      setActionError("");

      const result =
        action.type === "suspend"
          ? await suspendPlatformUser(
              action.user._id,
              reason
            )
          : await reactivatePlatformUser(
              action.user._id,
              reason
            );

      if (!mountedRef.current) return;

      setPendingAction(null);

      setMessage(
        result.message ||
        "Account updated successfully."
      );

      // Reload authoritative information
      // from MongoDB after successful mutation.

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

  // ========================================
  // USER MANAGEMENT INTERFACE
  // ========================================

  return (
    <div className="em-users-page">

      {/* PAGE HEADER */}

      <section className="em-admin-page-heading">
        <div>
          <span className="em-admin-eyebrow">
            ACCOUNT MANAGEMENT
          </span>

          <h1>Users</h1>

          <p>
            View and manage listener, artist and
            distributor accounts on Emnet Music.
          </p>
        </div>

        <button
          type="button"
          className="em-admin-secondary-button"
          onClick={refreshUsers}
          disabled={loading || processing}
        >
          <RefreshCw size={17} />

          Refresh users
        </button>
      </section>

      {/* STATISTICS */}

      {!loading && !error && (
        <section className="em-admin-stat-grid">
          <UserStatCard
            label="Total users"
            value={statistics.total}
            icon={Users}
          />

          <UserStatCard
            label="Active accounts"
            value={statistics.active}
            icon={UserCheck}
          />

          <UserStatCard
            label="Suspended accounts"
            value={statistics.suspended}
            icon={Ban}
          />

          <UserStatCard
            label="Verified emails"
            value={statistics.verified}
            icon={Mail}
          />
        </section>
      )}

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
            aria-label="Dismiss success message"
          >
            <X size={17} />
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
            onClick={refreshUsers}
          >
            Retry
          </button>
        </div>
      )}

      {/* MAIN USERS PANEL */}

      <section className="em-admin-panel">
        <div className="em-admin-panel-heading">
          <div>
            <h2>Platform users</h2>

            <p>
              Search and manage registered user accounts.
            </p>
          </div>

          <Users size={22} />
        </div>

        {/* SEARCH AND FILTERS */}

        <div className="em-users-toolbar">

          {/* SEARCH */}

          <div className="em-users-search">
            <Search size={18} />

            <input
              type="search"
              aria-label="Search users"
              value={search}
              maxLength={100}
              placeholder="Search name or email..."
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* ROLE FILTER */}

          <select
            className="em-users-select"
            aria-label="Filter user role"
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All roles</option>
            <option value="listener">Listeners</option>
            <option value="artist">Artists</option>
            <option value="distributor">Distributors</option>
          </select>

          {/* ACCOUNT STATUS FILTER */}

          <select
            className="em-users-select"
            aria-label="Filter account status"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="disabled">Disabled</option>
          </select>

          {/* VERIFICATION FILTER */}

          <select
            className="em-users-select"
            aria-label="Filter email verification"
            value={verificationFilter}
            onChange={(event) => {
              setVerificationFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All emails</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>

          <button
            type="button"
            className="em-admin-secondary-button"
            onClick={resetFilters}
          >
            Reset
          </button>
        </div>

        {/* LOADING STATE */}

        {loading ? (
          <div className="em-users-loading">
            <div className="em-admin-spinner" />

            <p>Loading user accounts...</p>
          </div>
        ) : error ? (
          <div className="em-admin-empty">
            <AlertCircle size={32} />

            <p>User accounts could not be loaded.</p>
          </div>
        ) : filteredUsers.length === 0 ? (

          /* EMPTY STATE */

          <div className="em-admin-empty">
            <UserRound size={38} />

            <p>No matching user accounts found.</p>

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
              {formatNumber(filteredUsers.length)}{" "}
              matching accounts
            </div>

            {/* USERS TABLE */}

            <div className="em-admin-table-wrap">
              <table className="em-admin-table em-users-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Email verification</th>
                    <th>Date joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleUsers.map((user) => (
                    <tr key={user._id}>

                      {/* USER INFORMATION */}

                      <td>
                        <div className="em-users-table-identity">
                          <UserAvatar user={user} />

                          <div>
                            <strong>
                              {user.fullName || "Unnamed user"}
                            </strong>

                            <span>{user.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* ROLE */}

                      <td>
                        <span className="em-users-role">
                          {formatLabel(user.role)}
                        </span>
                      </td>

                      {/* ACCOUNT STATUS */}

                      <td>
                        <AccountStatusBadge
                          status={user.accountStatus}
                        />
                      </td>

                      {/* EMAIL VERIFICATION */}

                      <td>
                        <VerificationStatus
                          verified={user.emailVerified}
                        />
                      </td>

                      {/* REGISTRATION DATE */}

                      <td>
                        {formatDate(user.createdAt)}
                      </td>

                      {/* MANAGEMENT ACTIONS */}

                      <td>
                        <div className="em-users-row-actions">
                          <button
                            type="button"
                            className="em-users-action-button"
                            onClick={() => {
                              setSelectedUser(user);
                            }}
                          >
                            <Eye size={15} />

                            View
                          </button>

                          {user.accountStatus === "active" && (
                            <button
                              type="button"
                              className="em-users-action-button danger"
                              onClick={() =>
                                openAccountAction(
                                  "suspend",
                                  user
                                )
                              }
                            >
                              <Ban size={15} />

                              Suspend
                            </button>
                          )}

                          {user.accountStatus === "suspended" && (
                            <button
                              type="button"
                              className="em-users-action-button positive"
                              onClick={() =>
                                openAccountAction(
                                  "reactivate",
                                  user
                                )
                              }
                            >
                              <UserCheck size={15} />

                              Reactivate
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
                Showing {startIndex + 1}–
                {Math.min(
                  startIndex + PAGE_SIZE,
                  filteredUsers.length
                )}{" "}
                of {formatNumber(filteredUsers.length)} users
              </span>

              <div className="em-users-pagination-buttons">
                <button
                  type="button"
                  className="em-admin-secondary-button"
                  disabled={currentPage <= 1}
                  onClick={() =>
                    setPage(currentPage - 1)
                  }
                >
                  <ChevronLeft size={17} />

                  Previous
                </button>

                <strong>
                  {currentPage} / {totalPages}
                </strong>

                <button
                  type="button"
                  className="em-admin-secondary-button"
                  disabled={currentPage >= totalPages}
                  onClick={() =>
                    setPage(currentPage + 1)
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

      {/* USER DETAILS DIALOG */}

      {selectedUser && (
        <UserDetailsDialog
          key={selectedUser._id}
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onAction={openAccountAction}
        />
      )}

      {/* ACCOUNT ACTION CONFIRMATION */}

      {pendingAction && (
        <AccountActionDialog
          key={`${pendingAction.type}:${pendingAction.user._id}`}
          action={pendingAction}
          processing={processing}
          error={actionError}
          onClose={closeAccountAction}
          onConfirm={executeAccountAction}
        />
      )}
    </div>
  );
}