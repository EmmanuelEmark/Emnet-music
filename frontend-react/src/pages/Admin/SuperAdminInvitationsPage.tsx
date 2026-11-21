import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Link2,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundPlus,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

import { Navigate } from "react-router";
import { useAuth } from "../../context/AuthContext";

import {
  createAdminInvitation,
  getAdminInvitations,
  type AdminInvitation,
  type CreatedInvitation,
} from "../../services/adminInvitationApi";

// ==========================================
// CONFIGURATION
// ==========================================

const PAGE_SIZE = 20;

// ==========================================
// HELPERS
// ==========================================

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

function getStatus(
  invitation: AdminInvitation,
  now: number
) {
  if (invitation.status === "revoked") {
    return "revoked";
  }

  if (invitation.used || invitation.status === "used") {
    return "used";
  }

  if (
    invitation.status === "expired" ||
    new Date(invitation.expiresAt).getTime() <= now
  ) {
    return "expired";
  }

  return "pending";
}

function formatCountdown(
  expiresAt: string,
  now: number
) {
  const remaining = Math.max(
    0,
    Math.ceil(
      (new Date(expiresAt).getTime() - now) / 1000
    )
  );

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
}

// ==========================================
// STATUS BADGE
// ==========================================

function InvitationBadge({
  status,
}: {
  status: string;
}) {
  const appearance =
    status === "used"
      ? "positive"
      : status === "pending"
        ? "warning"
        : "negative";

  return (
    <span className={`em-admin-status ${appearance}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ==========================================
// MAIN INVITATION MANAGEMENT
// ==========================================

function InvitationManagement() {
  const [invitations, setInvitations] =
    useState<AdminInvitation[]>([]);

  const [generated, setGenerated] =
    useState<CreatedInvitation | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [listError, setListError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState("all");

  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [now, setNow] = useState(Date.now());

  const creatingRef = useRef(false);
  const mountedRef = useRef(true);

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
  // COUNTDOWN TIMER
  // ========================================

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  // ========================================
  // LOAD INVITATIONS
  // ========================================

  useEffect(() => {
    const controller = new AbortController();

    async function loadInvitations() {
      setLoading(true);
      setListError("");

      try {
        const result = await getAdminInvitations(
          controller.signal
        );

        if (!controller.signal.aborted) {
          setInvitations(result);

          setGenerated((current) => {
            if (!current) return null;

            const matching = result.find(
              (item) => item.id === current.id
            );

            if (
              !matching ||
              matching.used ||
              matching.status === "revoked"
            ) {
              return null;
            }

            return current;
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setListError(errorMessage(error));
          setInvitations([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadInvitations();

    return () => {
      controller.abort();
    };
  }, [refreshKey]);

  // ========================================
  // INVITATION STATISTICS
  // ========================================

  const statistics = useMemo(() => ({
    total: invitations.length,

    pending: invitations.filter(
      (item) => getStatus(item, now) === "pending"
    ).length,

    used: invitations.filter(
      (item) => getStatus(item, now) === "used"
    ).length,

    expired: invitations.filter(
      (item) => getStatus(item, now) === "expired"
    ).length,
  }), [invitations, now]);

  // ========================================
  // FILTER INVITATIONS
  // ========================================

  const filteredInvitations = useMemo(() => {
    const query = search.trim().toLowerCase();

    return invitations.filter((invitation) => {
      const matchesSearch =
        !query ||
        invitation.fullName.toLowerCase().includes(query) ||
        invitation.email.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "all" ||
        getStatus(invitation, now) === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [invitations, search, statusFilter, now]);

  // ========================================
  // PAGINATION
  // ========================================

  const totalPages = Math.max(
    1,
    Math.ceil(filteredInvitations.length / PAGE_SIZE)
  );

  const currentPage = Math.min(page, totalPages);

  const visibleInvitations = filteredInvitations.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // ========================================
  // CREATE INVITATION
  // ========================================

  async function generateInvitation() {
    if (creatingRef.current) return;

    setFormError("");
    setMessage("");

    const cleanedName = fullName.trim();
    const cleanedEmail = email.trim().toLowerCase();

    if (!cleanedName || cleanedName.length > 100) {
      setFormError("Enter a valid full name.");
      return;
    }

    if (
      cleanedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail)
    ) {
      setFormError("Enter a valid email address.");
      return;
    }

    const previous = invitations.some(
      (item) =>
        item.email.toLowerCase() === cleanedEmail &&
        getStatus(item, Date.now()) === "pending"
    );

    if (
      previous &&
      !window.confirm(
        "An unused invitation already exists for this email. Creating another may invalidate the previous invitation. Continue?"
      )
    ) {
      return;
    }

    creatingRef.current = true;

    try {
      setCreating(true);
      setGenerated(null);

      const result = await createAdminInvitation(
        cleanedName,
        cleanedEmail
      );

      if (!mountedRef.current) return;

      // Only accept the expected signup link format.
      const link = new URL(result.invitationLink);

      const isLocal =
        link.hostname === "localhost" ||
        link.hostname === "127.0.0.1";

      if (
        link.pathname !== "/admin-signup" ||
        !/^[a-f0-9]{64}$/i.test(
          link.searchParams.get("token") || ""
        ) ||
        (
          link.protocol !== "https:" &&
          !(isLocal && link.protocol === "http:")
        )
      ) {
        throw new Error(
          "The invitation was created, but the returned link is invalid. Check FRONTEND_URL in the backend."
        );
      }

      setGenerated(result);
      setNow(Date.now());

      setFullName("");
      setEmail("");

      setMessage("Invitation generated successfully.");

      setRefreshKey((previous) => previous + 1);

    } catch (error) {
      if (mountedRef.current) {
        setFormError(errorMessage(error));
      }
    } finally {
      creatingRef.current = false;

      if (mountedRef.current) {
        setCreating(false);
      }
    }
  }

  // ========================================
  // COPY PRIVATE INVITATION LINK
  // ========================================

  async function copyInvitationLink() {
    if (
      !generated ||
      getStatus(generated, Date.now()) !== "pending"
    ) {
      setMessage(
        "This invitation is no longer available."
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(
        generated.invitationLink
      );

      setMessage(
        "Invitation link copied. Share it privately with the intended recipient."
      );
    } catch {
      setMessage(
        "Unable to copy automatically. Select and copy the invitation link manually."
      );
    }
  }

  const generatedActive =
    generated !== null &&
    getStatus(generated, now) === "pending";

  // ========================================
  // INTERFACE
  // ========================================

  return (
    <div className="em-users-page em-invitations-page">

      {/* PAGE HEADER */}

      <section className="em-admin-page-heading">
        <div>
          <span className="em-admin-eyebrow">
            SUPER ADMIN CONTROL
          </span>

          <h1>Admin invitations</h1>

          <p>
            Invite trusted staff members to create
            dedicated administrative accounts.
          </p>
        </div>

        <button
          type="button"
          className="em-admin-secondary-button"
          disabled={loading || creating}
          onClick={() =>
            setRefreshKey((previous) => previous + 1)
          }
        >
          <RefreshCw size={17} />
          Refresh invitations
        </button>
      </section>

      {/* SECURITY INFORMATION */}

      <div className="em-super-admin-security-notice">
        <div className="em-super-admin-security-icon">
          <ShieldCheck size={23} />
        </div>

        <div>
          <strong>Secure administrative invitations</strong>

          <p>
            Each invitation is valid for 10 minutes
            and can only be accepted once.

            Share invitation links privately.
            Anyone possessing a valid invitation
            link may attempt to accept it.
          </p>
        </div>
      </div>

      {/* STATISTICS */}

      {!loading && !listError && (
        <section className="em-admin-stat-grid">
          {[
            {
              label: "Total invitations",
              value: statistics.total,
              icon: Mail,
            },
            {
              label: "Pending invitations",
              value: statistics.pending,
              icon: Clock,
            },
            {
              label: "Accepted invitations",
              value: statistics.used,
              icon: CheckCircle2,
            },
            {
              label: "Expired invitations",
              value: statistics.expired,
              icon: AlertCircle,
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
                {value.toLocaleString("en-NG")}
              </strong>
            </article>
          ))}
        </section>
      )}

      {/* CREATE INVITATION */}

      <section className="em-admin-panel">
        <div className="em-admin-panel-heading">
          <div>
            <h2>Create administrator invitation</h2>

            <p>
              Enter the details of the intended
              account owner.
            </p>
          </div>

          <UserRoundPlus size={23} />
        </div>

        <form
          className="em-invitation-form"
          onSubmit={(event) => {
            event.preventDefault();
            void generateInvitation();
          }}
        >
          <div className="em-invitation-form-grid">

            <label className="em-invitation-field">
              Full name

              <input
                type="text"
                value={fullName}
                maxLength={100}
                required
                autoComplete="off"
                disabled={creating}
                placeholder="Enter administrator's full name"
                onChange={(event) =>
                  setFullName(event.target.value)
                }
              />
            </label>

            <label className="em-invitation-field">
              Email address

              <input
                type="email"
                value={email}
                maxLength={254}
                required
                autoComplete="off"
                disabled={creating}
                placeholder="Enter administrator's email"
                onChange={(event) =>
                  setEmail(event.target.value)
                }
              />
            </label>
          </div>

          {formError && (
            <div
              className="em-users-alert error"
              role="alert"
            >
              <AlertCircle size={18} />
              <span>{formError}</span>
            </div>
          )}

          <button
            type="submit"
            className="em-admin-primary-button"
            disabled={creating}
          >
            <Link2 size={18} />

            {creating
              ? "Generating invitation..."
              : "Generate invitation link"}
          </button>
        </form>
      </section>

      {/* SUCCESS MESSAGE */}

      {message && (
        <div className="em-users-alert success" role="status">
          <CheckCircle2 size={19} />

          <span>{message}</span>

          <button
            type="button"
            className="em-users-icon-button"
            aria-label="Dismiss message"
            onClick={() => setMessage("")}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* GENERATED INVITATION */}

      {generated && (
        <section className="em-admin-panel">
          <div className="em-admin-panel-heading">
            <div>
              <h2>Your invitation link</h2>

              <p>{generated.email}</p>
            </div>

            <button
              type="button"
              className="em-users-icon-button"
              aria-label="Dismiss invitation link"
              onClick={() => setGenerated(null)}
            >
              <X size={20} />
            </button>
          </div>

          {generatedActive ? (
            <>
              <div className="em-invitation-countdown">
                <Clock size={23} />

                <div>
                  <span>Invitation expires in</span>

                  <strong>
                    {formatCountdown(
                      generated.expiresAt,
                      now
                    )}
                  </strong>
                </div>
              </div>

              <div className="em-invitation-link-box">
                <input
                  type="text"
                  value={generated.invitationLink}
                  readOnly
                  aria-label="Private invitation link"
                  onFocus={(event) =>
                    event.target.select()
                  }
                />

                <button
                  type="button"
                  className="em-admin-primary-button"
                  onClick={() =>
                    void copyInvitationLink()
                  }
                >
                  <Copy size={17} />
                  Copy link
                </button>
              </div>

              <p className="em-admin-panel-note">
                Copy this private link now.
                It cannot be recovered from the
                invitation history.
                Send it only to the intended recipient.
              </p>
            </>
          ) : (
            <div className="em-users-alert error">
              <AlertCircle size={20} />

              <span>
                This invitation has expired or is
                no longer available.
              </span>
            </div>
          )}
        </section>
      )}

      {/* INVITATION HISTORY */}

      <section className="em-admin-panel">
        <div className="em-admin-panel-heading">
          <div>
            <h2>Invitation history</h2>

            <p>
              Monitor administrative account invitations.
            </p>
          </div>

          <Mail size={22} />
        </div>

        <div className="em-users-toolbar">
          <div className="em-users-search">
            <Search size={18} />

            <input
              type="search"
              value={search}
              maxLength={254}
              aria-label="Search invitations"
              placeholder="Search name or email..."
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <select
            className="em-users-select"
            value={statusFilter}
            aria-label="Invitation status"
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="used">Accepted</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </select>

          <button
            type="button"
            className="em-admin-secondary-button"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setPage(1);
            }}
          >
            Reset
          </button>
        </div>

        {loading ? (
          <div className="em-users-loading">
            <div className="em-admin-spinner" />
            <p>Loading invitations...</p>
          </div>
        ) : listError ? (
          <div className="em-users-alert error">
            <AlertCircle size={20} />

            <span>{listError}</span>

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
        ) : visibleInvitations.length === 0 ? (
          <div className="em-admin-empty">
            <Mail size={38} />
            <p>No matching invitations found.</p>
          </div>
        ) : (
          <>
            <div className="em-users-results">
              {filteredInvitations.length} matching invitations
            </div>

            <div className="em-admin-table-wrap">
              <table className="em-admin-table em-invitations-table">
                <thead>
                  <tr>
                    <th>Intended administrator</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Expires</th>
                    <th>Accepted</th>
                    <th>Invited by</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleInvitations.map((invitation) => {
                    const status = getStatus(
                      invitation,
                      now
                    );

                    return (
                      <tr key={invitation.id}>
                        <td>
                          <div className="em-users-table-identity">
                            <div className="em-content-artwork">
                              <Mail size={20} />
                            </div>

                            <div>
                              <strong>
                                {invitation.fullName}
                              </strong>

                              <span>{invitation.email}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <InvitationBadge status={status} />
                        </td>

                        <td>
                          {formatDate(invitation.createdAt)}
                        </td>

                        <td>
                          {status === "pending" ? (
                            <span className="em-invitation-table-timer">
                              {formatCountdown(
                                invitation.expiresAt,
                                now
                              )}
                            </span>
                          ) : (
                            formatDate(invitation.expiresAt)
                          )}
                        </td>

                        <td>
                          {formatDate(invitation.usedAt)}
                        </td>

                        <td>
                          {invitation.createdBy?.fullName ||
                            "Not available"}
                        </td>

                        <td>
                          {status === "expired" ? (
                            <button
                              type="button"
                              className="em-users-action-button positive"
                              disabled={creating}
                              onClick={() => {
                                setFullName(
                                  invitation.fullName
                                );

                                setEmail(invitation.email);

                                setFormError("");

                                window.scrollTo({
                                  top: 0,
                                  behavior: "smooth",
                                });

                                setMessage(
                                  "Invitation details loaded. Generate a new link using the form above."
                                );
                              }}
                            >
                              <RefreshCw size={15} />
                              Re-invite
                            </button>
                          ) : (
                            <span className="em-admin-panel-note">
                              —
                            </span>
                          )}
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
                Showing page {currentPage} of {totalPages}
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
    </div>
  );
}

// ==========================================
// SUPER ADMIN ACCESS PROTECTION
// ==========================================

export default function SuperAdminInvitationsPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="em-admin-access-state">
        <div className="em-admin-spinner" />
        <p>Checking permissions...</p>
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
    <InvitationManagement
      key={`${user.role}:${user.email}`}
    />
  );
}