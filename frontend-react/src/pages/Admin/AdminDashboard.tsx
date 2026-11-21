import { useState } from "react";

import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router";

import {
  LayoutDashboard,
  Users,
  Mic2,
  Music2,
  Disc3,
  Video,
  Flag,
  ShieldCheck,
  UserRoundPlus,
  ClipboardList,
  LogOut,
  Menu,
  X,
  ChevronRight,
  LockKeyhole,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";

import AdminOverview from "./AdminOverview";
import AdminUsersPage from "./AdminUsersPage";
import AdminArtistsPage from "./AdminArtistsPage";
import AdminSongsPage from "./AdminSongsPage";
import AdminReleasesPage from "./AdminReleasesPage";

import AdminVideosPage from "./AdminVideosPage";
import AdminReportsPage from "./AdminReportsPage";
import SuperAdminAdministratorsPage from "./SuperAdminAdministratorsPage";
import SuperAdminInvitationsPage from "./SuperAdminInvitationsPage";
import SuperAdminActivityLogsPage from "./SuperAdminActivityLogsPage";

import "./admin.css";

// ==========================================
// NAVIGATION CONFIGURATION
// ==========================================

const commonNavigation = [
  {
    label: "Overview",
    path: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "Users",
    path: "/admin/users",
    icon: Users,
  },
  {
    label: "Artists",
    path: "/admin/artists",
    icon: Mic2,
  },
  {
    label: "Songs",
    path: "/admin/songs",
    icon: Music2,
  },
  {
    label: "Releases",
    path: "/admin/releases",
    icon: Disc3,
  },
  {
    label: "Videos",
    path: "/admin/videos",
    icon: Video,
  },
  {
    label: "Reports",
    path: "/admin/reports",
    icon: Flag,
  },
];

const superAdminNavigation = [
  {
    label: "Administrators",
    path: "/admin/administrators",
    icon: ShieldCheck,
  },
  {
    label: "Admin invitations",
    path: "/admin/invitations",
    icon: UserRoundPlus,
  },
  {
    label: "Activity logs",
    path: "/admin/activity-logs",
    icon: ClipboardList,
  },
];


// ==========================================
// ACCESS DENIED
// ==========================================

function AdminAccessDenied() {
  return (
    <div className="em-admin-access-state">
      <LockKeyhole size={36} />

      <h2>Access restricted</h2>

      <p>
        You do not have permission to access
        this administrative section.
      </p>

      <NavLink
        to="/admin"
        className="em-admin-primary-button"
      >
        Return to dashboard
      </NavLink>
    </div>
  );
}

// ==========================================
// MAIN ADMINISTRATIVE DASHBOARD
// ==========================================

export default function AdminDashboard() {
  const {
    user,
    loading,
    logout,
  } = useAuth();

  const location = useLocation();

  const [menuOpen, setMenuOpen] =
    useState(false);

  // ========================================
  // PROTECT ADMINISTRATIVE INTERFACE
  // ========================================

  if (loading) {
    return (
      <div className="em-admin-access-state">
        <div className="em-admin-spinner" />

        <p>Checking administrative session...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (
    user.role !== "admin" &&
    user.role !== "superadmin"
  ) {
    return <Navigate to="/" replace />;
  }

  const isSuperAdmin =
    user.role === "superadmin";

  const roleLabel = isSuperAdmin
    ? "Super Admin"
    : "Administrator";

  const navigation = [
    ...commonNavigation,
    ...(isSuperAdmin
      ? superAdminNavigation
      : []),
  ];

  const currentPage =
    navigation.find(
      (item) =>
        item.path === location.pathname
    )?.label || "Administration";

  // ========================================
  // RENDER DASHBOARD
  // ========================================

  return (
    <div className="em-admin-shell">

      {/* MOBILE BACKDROP */}

      {menuOpen && (
        <button
          type="button"
          className="em-admin-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-label="Close administrative menu"
        />
      )}

      {/* ADMIN SIDEBAR */}

      <aside
        className={`em-admin-sidebar ${
          menuOpen
            ? "em-admin-sidebar-open"
            : ""
        }`}
      >
        <div className="em-admin-brand">
          <div className="em-admin-brand-icon">
            <Music2 size={24} />
          </div>

          <div>
            <strong>EMNET MUSIC</strong>

            <span>Management Console</span>
          </div>

          <button
            type="button"
            className="em-admin-mobile-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={22} />
          </button>
        </div>

        <div className="em-admin-role-card">
          <ShieldCheck size={20} />

          <div>
            <strong>{roleLabel}</strong>

            <span>Administrative workspace</span>
          </div>
        </div>

        <nav className="em-admin-navigation">
          <p className="em-admin-nav-label">
            WORKSPACE
          </p>

          {commonNavigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/admin"}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `em-admin-nav-link ${
                    isActive ? "active" : ""
                  }`
                }
              >
                <Icon size={19} />

                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {/* SUPER ADMIN NAVIGATION */}

          {isSuperAdmin && (
            <>
              <p className="em-admin-nav-label">
                PLATFORM CONTROL
              </p>

              {superAdminNavigation.map(
                (item) => {
                  const Icon = item.icon;

                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() =>
                        setMenuOpen(false)
                      }
                      className={({ isActive }) =>
                        `em-admin-nav-link ${
                          isActive ? "active" : ""
                        }`
                      }
                    >
                      <Icon size={19} />

                      <span>{item.label}</span>
                    </NavLink>
                  );
                }
              )}
            </>
          )}
        </nav>

        {/* SIDEBAR FOOTER */}

        <div className="em-admin-sidebar-footer">
          <div className="em-admin-account">
            <div className="em-admin-avatar">
              {(user.fullName || "A")
                .charAt(0)
                .toUpperCase()}
            </div>

            <div className="em-admin-account-info">
              <strong>
                {user.fullName || roleLabel}
              </strong>

              <span>{roleLabel}</span>
            </div>
          </div>

          <button
            type="button"
            className="em-admin-logout"
            onClick={() => logout()}
          >
            <LogOut size={18} />

            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN ADMIN AREA */}

      <div className="em-admin-main">

        {/* TOP HEADER */}

        <header className="em-admin-header">
          <div className="em-admin-header-left">
            <button
              type="button"
              className="em-admin-menu-button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={24} />
            </button>

            <div className="em-admin-breadcrumb">
              <span>Administration</span>

              <ChevronRight size={15} />

              <strong>{currentPage}</strong>
            </div>
          </div>

          <div className="em-admin-header-role">
            <ShieldCheck size={18} />

            <span>{roleLabel}</span>
          </div>
        </header>

        {/* DASHBOARD CONTENT */}

        <main className="em-admin-content">
          <Routes>

            <Route
              index
              element={
                <AdminOverview
                  key={`${user.role}:${user.email}`}
                />
              }
            />

            <Route
              path="users"
              element={
                <AdminUsersPage
                  key={`${user.role}:${user.email}`}
                />
              }
            />

              <Route
              path="artists"
              element={
                <AdminArtistsPage
                  key={`${user.role}:${user.email}`}
                />
              }
            />

             <Route
            path="songs"
            element={
              <AdminSongsPage
                key={`${user.role}:${user.email}`}
              />
            }
          />

            <Route
            path="releases"
            element={
              <AdminReleasesPage
                key={`${user.role}:${user.email}`}
              />
            }
          />

            <Route
            path="videos"
            element={
              <AdminVideosPage
                key={`${user.role}:${user.email}`}
              />
            }
          />

           <Route
            path="reports"
            element={
              <AdminReportsPage
                key={`${user.role}:${user.email}`}
              />
            }
          />

            {/* SUPER ADMIN ONLY */}

            <Route
            path="administrators"
            element={
              isSuperAdmin ? (
                <SuperAdminAdministratorsPage
                  key={`${user.role}:${user.email}`}
                />
              ) : (
                <AdminAccessDenied />
              )
            }
          />
            <Route
            path="invitations"
            element={
              isSuperAdmin ? (
                <SuperAdminInvitationsPage
                  key={`${user.role}:${user.email}`}
                />
              ) : (
                <AdminAccessDenied />
              )
            }
          />

            <Route
            path="activity-logs"
            element={
              isSuperAdmin ? (
                <SuperAdminActivityLogsPage
                  key={`${user.role}:${user.email}`}
                />
              ) : (
                <AdminAccessDenied />
              )
            }
          />

            <Route
              path="*"
              element={
                <Navigate to="/admin" replace />
              }
            />

          </Routes>
        </main>

        <footer className="em-admin-footer">
          <span>
            © {new Date().getFullYear()} Emnet Music
          </span>

          <span>Management Console</span>
        </footer>
      </div>
    </div>
  );
}