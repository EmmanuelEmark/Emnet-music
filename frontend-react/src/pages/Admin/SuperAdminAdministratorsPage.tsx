import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  LockKeyhole,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldMinus,
  UserCheck,
  UserRoundPlus,
  Users,
  X,
} from "lucide-react";

import {
  Link,
  Navigate,
} from "react-router";

import { useAuth } from "../../context/AuthContext";

import {
  getAdministrators,
  performAdministratorAction,
  promoteUserToAdmin,
  type Administrator,
  type AdministratorAction,
} from "../../services/superAdminApi";

import {
  getPlatformUsers,
  type PlatformUser,
} from "../../services/adminUserApi";

// ==========================================
// CONFIGURATION
// ==========================================

const PAGE_SIZE = 20;

type ManagementAction =
  | AdministratorAction
  | "promote";

type ActionTarget = {
  _id: string;
  fullName: string;
  email: string;
};

type PendingAction = {
  action: ManagementAction;
  target: ActionTarget;
};

const ACTION_CONFIG = {
  suspend: {
    title: "Suspend administrator",
    description:
      "Restrict this administrator's access to the management console without deleting their account.",
    button: "Confirm suspension",
    danger: true,
  },

  reactivate: {
    title: "Reactivate administrator",
    description:
      "Restore administrative access to this suspended account, subject to other account restrictions.",
    button: "Confirm reactivation",
    danger: false,
  },

  "remove-role": {
    title: "Remove administrator privileges",
    description:
      "Remove this account's administrative role. The account will become an ordinary listener account.",
    button: "Remove privileges",
    danger: true,
  },

  promote: {
    title: "Promote user to administrator",
    description:
      "Grant this user administrative privileges, including access to user information, artist management, content moderation and reports.",
    button: "Grant administrator access",
    danger: true,
  },
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

  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLabel(value?: string) {
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

function getInitials(value: string) {
  return (
    value
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) =>
        part.charAt(0).toUpperCase()
      )
      .join("") || "A"
  );
}

// ==========================================
// ADMINISTRATOR AVATAR
// ==========================================

function AdministratorAvatar({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
  return (
    <div
      className={`em-users-avatar em-super-admin-avatar ${
        large ? "large" : ""
      }`}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}

// ==========================================
// ACCOUNT STATUS
// ==========================================

function StatusBadge({
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
    <span
      className={`em-admin-status ${appearance}`}
    >
      {formatLabel(status)}
    </span>
  );
}

// ==========================================
// STATISTICS CARD
// ==========================================

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <article className="em-admin-stat-card">
      <div className="em-admin-stat-top">
        <div className="em-admin-stat-icon">
          {icon}
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
// ADMINISTRATOR DETAILS DIALOG
// ==========================================

function AdministratorDetailsDialog({
  administrator,
  onClose,
  onAction,
}: {
  administrator: Administrator;
  onClose: () => void;
  onAction: (
    target: ActionTarget,
    action: AdministratorAction
  ) => void;
}) {
  const dialogRef =
    useRef<HTMLDialogElement>(null);

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
      className="em-users-dialog em-super-admin-dialog"
      aria-labelledby="em-administrator-details-title"
      onCancel={onClose}
    >
      <div className="em-users-dialog-inner">

        {/* HEADER */}

        <div className="em-users-dialog-heading">
          <div>
            <h2 id="em-administrator-details-title">
              Administrator details
            </h2>

            <p>
              Administrative account information
            </p>
          </div>

          <button
            type="button"
            className="em-users-icon-button"
            onClick={onClose}
            aria-label="Close administrator details"
          >
            <X size={22} />
          </button>
        </div>

        {/* ADMINISTRATOR PROFILE */}

        <div className="em-users-profile">
          <AdministratorAvatar
            name={administrator.fullName || "Admin"}
            large
          />

          <div>
            <h3 className="em-artist-name">
              {administrator.fullName}

              <ShieldCheck
                size={19}
                className="em-artist-verified-icon"
              />
            </h3>

            <span>{administrator.email}</span>
          </div>
        </div>

        {/* ACCOUNT INFORMATION */}

        <dl className="em-users-details-list">
          <div>
            <dt>Full name</dt>
            <dd>{administrator.fullName}</dd>
          </div>

          <div>
            <dt>Email address</dt>
            <dd>{administrator.email}</dd>
          </div>

          <div>
            <dt>Account role</dt>
            <dd>Administrator</dd>
          </div>

          <div>
            <dt>Account status</dt>

            <dd>
              <StatusBadge
                status={administrator.accountStatus}
              />
            </dd>
          </div>

          <div>
            <dt>Email verification</dt>

            <dd>
              {administrator.emailVerified
                ? "Verified"
                : "Not verified"}
            </dd>
          </div>

          <div>
            <dt>Account created</dt>

            <dd>
              {formatDate(administrator.createdAt)}
            </dd>
          </div>

          <div>
            <dt>Administrative role assigned</dt>

            <dd>
              {formatDate(
                administrator.roleAssignedAt
              )}
            </dd>
          </div>

          <div>
            <dt>Last login</dt>

            <dd>
              {formatDate(
                administrator.lastLoginAt
              )}
            </dd>
          </div>

          <div>
            <dt>Last account status change</dt>

            <dd>
              {formatDate(
                administrator.accountStatusUpdatedAt
              )}
            </dd>
          </div>

          {administrator.accountStatusReason && (
            <div>
              <dt>Account status reason</dt>

              <dd>
                {administrator.accountStatusReason}
              </dd>
            </div>
          )}

          <div>
            <dt>Administrator ID</dt>

            <dd className="em-users-id">
              {administrator._id}
            </dd>
          </div>
        </dl>

        {/* ADMINISTRATOR RESPONSIBILITIES */}

        <section className="em-artist-biography">
          <h3>Administrative permissions</h3>

          <p>
            This administrator can manage ordinary
            platform users, artist applications,
            published content and content reports.

            They cannot manage other administrators,
            create administrative invitations,
            access Super Admin activity logs or
            reverse content takedowns.
          </p>
        </section>

        {/* MANAGEMENT ACTIONS */}

        <section className="em-artist-manage-section">
          <h3>Account management</h3>

          <div className="em-artist-action-grid">

            {administrator.accountStatus === "active" && (
              <button
                type="button"
                className="em-users-action-button danger"
                onClick={() =>
                  onAction(administrator, "suspend")
                }
              >
                <Ban size={16} />

                Suspend administrator
              </button>
            )}

            {administrator.accountStatus === "suspended" && (
              <button
                type="button"
                className="em-users-action-button positive"
                onClick={() =>
                  onAction(administrator, "reactivate")
                }
              >
                <UserCheck size={16} />

                Reactivate administrator
              </button>
            )}

            <button
              type="button"
              className="em-users-action-button danger"
              onClick={() =>
                onAction(administrator, "remove-role")
              }
            >
              <ShieldMinus size={16} />

              Remove admin privileges
            </button>
          </div>

          {administrator.accountStatus === "disabled" && (
            <p className="em-admin-panel-note">
              Disabled administrator accounts cannot
              be reactivated through this page.
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
// PROMOTE EXISTING USER DIALOG
// ==========================================

function PromoteUserDialog({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (user: PlatformUser) => void;
}) {
  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const [users, setUsers] =
    useState<PlatformUser[]>([]);

  const [search, setSearch] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [selectedId, setSelectedId] =
    useState("");

  // ========================================
  // OPEN DIALOG
  // ========================================

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    dialog.showModal();

    return () => {
      dialog.close();
    };
  }, []);

  // ========================================
  // LOAD ELIGIBLE USERS
  // ========================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsers() {
      setLoading(true);
      setError("");
      setSelectedId("");

      try {
        const result =
          await getPlatformUsers(
            controller.signal
          );

        if (controller.signal.aborted) {
          return;
        }

        // Prefer separate administrative accounts.
        // Do not convert active artist accounts
        // into administrative accounts here.

        setUsers(
          result.filter(
            (user) =>
              user.role === "listener" &&
              user.accountStatus === "active" &&
              user.emailVerified === true
          )
        );

      } catch (err) {
        if (!controller.signal.aborted) {
          setUsers([]);
          setError(errorMessage(err));
        }

      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadUsers();

    return () => {
      controller.abort();
    };
  }, [refreshKey]);

  // ========================================
  // FILTER ELIGIBLE USERS
  // ========================================

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return [];

    return users
      .filter((user) =>
        (user.fullName || "")
          .toLowerCase()
          .includes(query) ||
        (user.email || "")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 30);
  }, [users, search]);

  const selectedUser =
    filteredUsers.find(
      (user) => user._id === selectedId
    );

  // ========================================
  // PROMOTION INTERFACE
  // ========================================

  return (
    <dialog
      ref={dialogRef}
      className="em-users-dialog em-super-admin-dialog"
      aria-labelledby="em-promote-user-title"
      onCancel={onClose}
    >
      <div className="em-users-dialog-inner">

        {/* HEADER */}

        <div className="em-users-dialog-heading">
          <div>
            <h2 id="em-promote-user-title">
              Promote existing user
            </h2>

            <p>
              Select an eligible account
            </p>
          </div>

          <button
            type="button"
            className="em-users-icon-button"
            onClick={onClose}
            aria-label="Close promotion dialog"
          >
            <X size={22} />
          </button>
        </div>

        {/* ELIGIBILITY NOTICE */}

        <div className="em-users-action-notice positive">
          <ShieldCheck size={22} />

          <p>
            Only active listener accounts with verified
            email addresses are selectable here.

            For new members of staff, creating a
            separate administrative account through
            a secure invitation is recommended.
          </p>
        </div>

        {/* SEARCH USERS */}

        <div className="em-users-search">
          <Search size={18} />

          <input
            type="search"
            aria-label="Search eligible users"
            placeholder="Search full name or email..."
            value={search}
            maxLength={100}
            disabled={loading}
            onChange={(event) => {
              setSearch(event.target.value);
              setSelectedId("");
            }}
          />
        </div>

        {/* SEARCH RESULTS */}

        <div className="em-super-admin-user-picker">
          {loading ? (
            <div className="em-admin-empty">
              <div className="em-admin-spinner" />

              <p>Loading eligible users...</p>
            </div>
          ) : error ? (
            <div className="em-admin-empty">
              <AlertCircle size={30} />

              <p>{error}</p>

              <button
                type="button"
                className="em-admin-secondary-button"
                onClick={() =>
                  setRefreshKey(
                    (previous) => previous + 1
                  )
                }
              >
                Retry
              </button>
            </div>
          ) : !search.trim() ? (
            <div className="em-admin-empty">
              <Search size={30} />

              <p>
                Search for the exact user you
                want to promote.
              </p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="em-admin-empty">
              <Users size={30} />

              <p>No eligible users found.</p>
            </div>
          ) : (
            filteredUsers.map((user) => (
              <label
                key={user._id}
                className={`em-super-admin-user-option ${
                  selectedId === user._id
                    ? "selected"
                    : ""
                }`}
              >
                <input
                  type="radio"
                  name="promotion-user"
                  checked={selectedId === user._id}
                  onChange={() =>
                    setSelectedId(user._id)
                  }
                />

                <AdministratorAvatar
                  name={user.fullName}
                />

                <div className="em-super-admin-user-info">
                  <strong>{user.fullName}</strong>

                  <span>{user.email}</span>
                </div>

                <CheckCircle2
                  size={16}
                  className="em-artist-verified-icon"
                />
              </label>
            ))
          )}
        </div>

        {search.trim() && filteredUsers.length === 30 && (
          <p className="em-admin-panel-note">
            Showing up to 30 matching accounts.
            Refine your search if necessary.
          </p>
        )}

        {/* FOOTER */}

        <div className="em-users-dialog-footer">
          <button
            type="button"
            className="em-admin-secondary-button"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="em-admin-primary-button"
            disabled={!selectedUser || loading}
            onClick={() => {
              if (selectedUser) {
                onSelect(selectedUser);
              }
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </dialog>
  );
}

// ==========================================
// CONFIRM ADMINISTRATIVE ACTION DIALOG
// ==========================================

function AdministratorActionDialog({
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
  const dialogRef =
    useRef<HTMLDialogElement>(null);

  const [reason, setReason] =
    useState("");

  const [confirmation, setConfirmation] =
    useState("");

  const config =
    ACTION_CONFIG[pending.action];

  const requiresExtraConfirmation =
    pending.action === "promote" ||
    pending.action === "remove-role";

  const confirmationWord =
    pending.action === "promote"
      ? "PROMOTE"
      : "REMOVE";

  const validReason =
    reason.trim().length >= 5 &&
    reason.trim().length <= 1000;

  const validConfirmation =
    !requiresExtraConfirmation ||
    confirmation.trim() === confirmationWord;

  const canSubmit =
    validReason &&
    validConfirmation &&
    !processing;

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
      aria-labelledby="em-admin-action-title"
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

          if (canSubmit) {
            onConfirm(reason.trim());
          }
        }}
      >
        {/* HEADER */}

        <div className="em-users-dialog-heading">
          <div>
            <h2 id="em-admin-action-title">
              {config.title}
            </h2>

            <p>
              Restricted Super Admin operation
            </p>
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

        {/* TARGET ACCOUNT */}

        <div className="em-users-profile">
          <AdministratorAvatar
            name={pending.target.fullName}
            large
          />

          <div>
            <h3>{pending.target.fullName}</h3>

            <span>{pending.target.email}</span>
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

        {/* REASON */}

        <label
          htmlFor="em-administrator-action-reason"
          className="em-users-reason-label"
        >
          Reason for this action
        </label>

        <textarea
          id="em-administrator-action-reason"
          className="em-users-textarea"
          rows={5}
          value={reason}
          required
          minLength={5}
          maxLength={1000}
          disabled={processing}
          placeholder="Explain why you are performing this action..."
          onChange={(event) =>
            setReason(event.target.value)
          }
        />

        <div className="em-users-character-count">
          {reason.length}/1000
        </div>

        {/* EXTRA CONFIRMATION */}

        {requiresExtraConfirmation && (
          <div className="em-super-admin-confirmation">
            <label
              htmlFor="em-admin-confirmation-word"
              className="em-users-reason-label"
            >
              Type{" "}
              <strong>{confirmationWord}</strong>
              {" "}to confirm
            </label>

            <input
              id="em-admin-confirmation-word"
              type="text"
              value={confirmation}
              required
              autoComplete="off"
              disabled={processing}
              placeholder={confirmationWord}
              onChange={(event) =>
                setConfirmation(event.target.value)
              }
            />
          </div>
        )}

        {/* ERROR */}

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
            disabled={!canSubmit}
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
// ADMINISTRATOR MANAGEMENT CONTENT
// ==========================================

function AdministratorsManagement() {
  // ========================================
  // STATE
  // ========================================

  const [administrators, setAdministrators] =
    useState<Administrator[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("all");

  const [verificationFilter, setVerificationFilter] =
    useState("all");

  const [page, setPage] =
    useState(1);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const [selectedAdministrator, setSelectedAdministrator] =
    useState<Administrator | null>(null);

  const [showPromoteDialog, setShowPromoteDialog] =
    useState(false);

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
  // LOAD ADMINISTRATORS
  // ========================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadAdministrators() {
      setLoading(true);
      setError("");

      try {
        const result =
          await getAdministrators(
            controller.signal
          );

        if (controller.signal.aborted) {
          return;
        }

        setAdministrators(result);

      } catch (err) {
        if (!controller.signal.aborted) {
          setAdministrators([]);
          setError(errorMessage(err));
        }

      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadAdministrators();

    return () => {
      controller.abort();
    };
  }, [refreshKey]);

  // ========================================
  // ADMINISTRATOR STATISTICS
  // ========================================

  const statistics = useMemo(() => ({
    total: administrators.length,

    active: administrators.filter(
      (administrator) =>
        administrator.accountStatus === "active"
    ).length,

    suspended: administrators.filter(
      (administrator) =>
        administrator.accountStatus === "suspended"
    ).length,

    verified: administrators.filter(
      (administrator) =>
        administrator.emailVerified === true
    ).length,
  }), [administrators]);

  // ========================================
  // FILTER ADMINISTRATORS
  // ========================================

  const filteredAdministrators = useMemo(() => {
    const query = search.trim().toLowerCase();

    return administrators.filter(
      (administrator) => {
        const matchesSearch =
          !query ||
          (administrator.fullName || "")
            .toLowerCase()
            .includes(query) ||
          (administrator.email || "")
            .toLowerCase()
            .includes(query);

        const matchesStatus =
          statusFilter === "all" ||
          administrator.accountStatus === statusFilter;

        const matchesVerification =
          verificationFilter === "all" ||
          (
            verificationFilter === "verified" &&
            administrator.emailVerified === true
          ) ||
          (
            verificationFilter === "unverified" &&
            administrator.emailVerified !== true
          );

        return (
          matchesSearch &&
          matchesStatus &&
          matchesVerification
        );
      }
    );
  }, [
    administrators,
    search,
    statusFilter,
    verificationFilter,
  ]);

  // ========================================
  // PAGINATION
  // ========================================

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredAdministrators.length / PAGE_SIZE
    )
  );

  const currentPage = Math.min(
    page,
    totalPages
  );

  const startIndex =
    (currentPage - 1) * PAGE_SIZE;

  const visibleAdministrators =
    filteredAdministrators.slice(
      startIndex,
      startIndex + PAGE_SIZE
    );

  // ========================================
  // RESET FILTERS
  // ========================================

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setVerificationFilter("all");
    setPage(1);
  }

  // ========================================
  // REFRESH ADMINISTRATORS
  // ========================================

  function refreshAdministrators() {
    if (processingRef.current) return;

    setSelectedAdministrator(null);
    setMessage("");

    setRefreshKey(
      (previous) => previous + 1
    );
  }

  // ========================================
  // OPEN ADMINISTRATIVE ACTION
  // ========================================

  function openAction(
    target: ActionTarget,
    action: ManagementAction
  ) {
    if (processingRef.current) return;

    setSelectedAdministrator(null);
    setShowPromoteDialog(false);
    setMessage("");
    setActionError("");

    setPendingAction({
      target,
      action,
    });
  }

  // ========================================
  // EXECUTE ADMINISTRATIVE ACTION
  // ========================================

  async function executeAction(
    reason: string
  ) {
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
        currentAction.action === "promote"
          ? await promoteUserToAdmin(
              currentAction.target._id,
              reason
            )
          : await performAdministratorAction(
              currentAction.target._id,
              currentAction.action,
              reason
            );

      if (!mountedRef.current) return;

      setPendingAction(null);

      setMessage(
        response.message ||
        "Administrative account updated successfully."
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

  // ========================================
  // MAIN INTERFACE
  // ========================================

  return (
    <div className="em-users-page em-super-admin-page">

      {/* PAGE HEADER */}

      <section className="em-admin-page-heading">
        <div>
          <span className="em-admin-eyebrow">
            SUPER ADMIN CONTROL
          </span>

          <h1>Administrators</h1>

          <p>
            Manage administrative accounts,
            permissions and platform access.
          </p>
        </div>

        <div className="em-super-admin-header-actions">
          <button
            type="button"
            className="em-admin-secondary-button"
            disabled={loading || processing}
            onClick={refreshAdministrators}
          >
            <RefreshCw size={17} />

            Refresh
          </button>

          <Link
            to="/admin/invitations"
            className="em-admin-primary-button"
          >
            <UserRoundPlus size={18} />

            Invite administrator
          </Link>
        </div>
      </section>

      {/* SUPER ADMIN SECURITY NOTICE */}

      <div className="em-super-admin-security-notice">
        <div className="em-super-admin-security-icon">
          <LockKeyhole size={23} />
        </div>

        <div>
          <strong>Restricted administrative workspace</strong>

          <p>
            Only Super Admin can grant, suspend,
            restore or remove administrative privileges.
            Super Admin accounts are not included
            in this manageable administrator list.
          </p>
        </div>
      </div>

      {/* STATISTICS */}

      {!loading && !error && (
        <section className="em-admin-stat-grid">
          <StatCard
            label="Total administrators"
            value={statistics.total}
            icon={<ShieldCheck size={22} />}
          />

          <StatCard
            label="Active administrators"
            value={statistics.active}
            icon={<UserCheck size={22} />}
          />

          <StatCard
            label="Suspended administrators"
            value={statistics.suspended}
            icon={<Ban size={22} />}
          />

          <StatCard
            label="Verified emails"
            value={statistics.verified}
            icon={<Mail size={22} />}
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
            onClick={refreshAdministrators}
          >
            Retry
          </button>
        </div>
      )}

      {/* ADMINISTRATOR DIRECTORY */}

      <section className="em-admin-panel">
        <div className="em-admin-panel-heading">
          <div>
            <h2>Administrator directory</h2>

            <p>
              View and manage existing administrative accounts.
            </p>
          </div>

          <button
            type="button"
            className="em-admin-secondary-button"
            disabled={processing}
            onClick={() =>
              setShowPromoteDialog(true)
            }
          >
            <UserRoundPlus size={17} />

            Promote user
          </button>
        </div>

        {/* SEARCH AND FILTERS */}

        <div className="em-users-toolbar">
          <div className="em-users-search">
            <Search size={18} />

            <input
              type="search"
              value={search}
              aria-label="Search administrators"
              placeholder="Search name or email..."
              maxLength={100}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            className="em-users-select"
            value={statusFilter}
            aria-label="Administrator status"
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">
              All statuses
            </option>

            <option value="active">
              Active
            </option>

            <option value="suspended">
              Suspended
            </option>

            <option value="disabled">
              Disabled
            </option>
          </select>

          <select
            className="em-users-select"
            value={verificationFilter}
            aria-label="Email verification"
            onChange={(event) => {
              setVerificationFilter(
                event.target.value
              );

              setPage(1);
            }}
          >
            <option value="all">
              All emails
            </option>

            <option value="verified">
              Verified
            </option>

            <option value="unverified">
              Unverified
            </option>
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

            <p>Loading administrators...</p>
          </div>
        ) : error ? (
          <div className="em-admin-empty">
            <AlertCircle size={34} />

            <p>Unable to load administrators.</p>
          </div>
        ) : filteredAdministrators.length === 0 ? (
          <div className="em-admin-empty">
            <ShieldCheck size={38} />

            <p>
              No matching administrators found.
            </p>

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
              {formatNumber(
                filteredAdministrators.length
              )} matching administrators
            </div>

            {/* ADMINISTRATOR TABLE */}

            <div className="em-admin-table-wrap">
              <table className="em-admin-table em-super-admin-table">
                <thead>
                  <tr>
                    <th>Administrator</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Email verification</th>
                    <th>Last login</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleAdministrators.map(
                    (administrator) => (
                      <tr key={administrator._id}>

                        {/* IDENTITY */}

                        <td>
                          <div className="em-users-table-identity">
                            <AdministratorAvatar
                              name={
                                administrator.fullName
                              }
                            />

                            <div>
                              <strong>
                                {administrator.fullName}
                              </strong>

                              <span>
                                {administrator.email}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* ROLE */}

                        <td>
                          <span className="em-super-admin-role-label">
                            <ShieldCheck size={14} />

                            Admin
                          </span>
                        </td>

                        {/* ACCOUNT STATUS */}

                        <td>
                          <StatusBadge
                            status={
                              administrator.accountStatus
                            }
                          />
                        </td>

                        {/* EMAIL VERIFICATION */}

                        <td>
                          {administrator.emailVerified ? (
                            <span className="em-users-verification verified">
                              <CheckCircle2 size={15} />

                              Verified
                            </span>
                          ) : (
                            <span className="em-users-verification unverified">
                              Unverified
                            </span>
                          )}
                        </td>

                        {/* LAST LOGIN */}

                        <td>
                          {formatDate(
                            administrator.lastLoginAt
                          )}
                        </td>

                        {/* MANAGEMENT ACTIONS */}

                        <td>
                          <div className="em-users-row-actions">
                            <button
                              type="button"
                              className="em-users-action-button"
                              onClick={() =>
                                setSelectedAdministrator(
                                  administrator
                                )
                              }
                            >
                              <Eye size={15} />

                              Details
                            </button>

                            {administrator.accountStatus ===
                              "active" && (
                              <button
                                type="button"
                                className="em-users-action-button danger"
                                onClick={() =>
                                  openAction(
                                    administrator,
                                    "suspend"
                                  )
                                }
                              >
                                <Ban size={15} />

                                Suspend
                              </button>
                            )}

                            {administrator.accountStatus ===
                              "suspended" && (
                              <button
                                type="button"
                                className="em-users-action-button positive"
                                onClick={() =>
                                  openAction(
                                    administrator,
                                    "reactivate"
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
                    )
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}

            <div className="em-users-pagination">
              <span>
                Showing {startIndex + 1}–
                {Math.min(
                  startIndex + PAGE_SIZE,
                  filteredAdministrators.length
                )}{" "}
                of {formatNumber(
                  filteredAdministrators.length
                )} administrators
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
                  disabled={
                    currentPage >= totalPages
                  }
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

      {/* ADMINISTRATOR DETAILS */}

      {selectedAdministrator && (
        <AdministratorDetailsDialog
          key={selectedAdministrator._id}
          administrator={selectedAdministrator}
          onClose={() =>
            setSelectedAdministrator(null)
          }
          onAction={openAction}
        />
      )}

      {/* PROMOTE USER */}

      {showPromoteDialog && (
        <PromoteUserDialog
          onClose={() =>
            setShowPromoteDialog(false)
          }
          onSelect={(user) =>
            openAction(user, "promote")
          }
        />
      )}

      {/* ACTION CONFIRMATION */}

      {pendingAction && (
        <AdministratorActionDialog
          key={`${pendingAction.target._id}:${pendingAction.action}`}
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

// ==========================================
// MAIN PAGE EXPORT
//
// Protect the page before mounting the
// administrator management component.
// ==========================================

export default function SuperAdminAdministratorsPage() {
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
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (user.role !== "superadmin") {
    return (
      <div className="em-admin-access-state">
        <LockKeyhole size={36} />

        <h2>Access restricted</h2>

        <p>
          Only Super Admin can manage
          administrative accounts.
        </p>

        <Link
          to="/admin"
          className="em-admin-primary-button"
        >
          Return to dashboard
        </Link>
      </div>
    );
  }

  return (
    <AdministratorsManagement
      key={`${user.role}:${user.email}`}
    />
  );
}