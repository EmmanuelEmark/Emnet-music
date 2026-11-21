import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { Link } from "react-router";

import {
  Users,
  Mic2,
  Music2,
  Disc3,
  Video,
  Flag,
  Headphones,
  Eye,
  RefreshCw,
  ArrowUpRight,
  ShieldCheck,
  Heart,
  UserRoundPlus,
  AlertCircle,
  Activity,
} from "lucide-react";

import {
  getAdminDashboardOverview,
  type DashboardOverview,
  type EngagementPoint,
} from "../../services/adminApi";

// ==========================================
// FORMATTING HELPERS
// ==========================================

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-NG").format(
    value
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatLabel(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

// ==========================================
// STATISTICS CARD
// ==========================================

function StatisticCard({
  label,
  value,
  description,
  icon,
  path,
}: {
  label: string;
  value: number;
  description: string;
  icon: ReactNode;
  path?: string;
}) {
  return (
    <article className="em-admin-stat-card">
      <div className="em-admin-stat-top">
        <div className="em-admin-stat-icon">
          {icon}
        </div>

        {path && (
          <Link
            to={path}
            className="em-admin-stat-link"
            aria-label={`View ${label}`}
          >
            <ArrowUpRight size={19} />
          </Link>
        )}
      </div>

      <p>{label}</p>

      <strong className="em-admin-stat-value">
        {formatNumber(value)}
      </strong>

      <span className="em-admin-stat-description">
        {description}
      </span>
    </article>
  );
}

// ==========================================
// ENGAGEMENT CHART
//
// Uses real data from the backend.
// No additional chart package required.
// ==========================================

function EngagementChart({
  data,
}: {
  data: EngagementPoint[];
}) {
  const maximum = Math.max(
    1,
    ...data.flatMap((point) => [
      point.plays,
      point.views,
    ])
  );

  const chartMaximum =
    Math.ceil(maximum / 4) * 4;

  return (
    <section className="em-admin-panel">
      <div className="em-admin-panel-heading">
        <div>
          <h2>Platform engagement</h2>

          <p>Recorded activity over seven UTC days</p>
        </div>

        <Activity size={21} />
      </div>

      <div className="em-admin-chart-legend">
        <span>
          <i className="em-admin-legend-plays" />

          Song plays
        </span>

        <span>
          <i className="em-admin-legend-views" />

          Video views
        </span>
      </div>

      <div className="em-admin-chart">
        <div className="em-admin-chart-axis">
          {[4, 3, 2, 1, 0].map((level) => (
            <span key={level}>
              {formatNumber(
                (chartMaximum / 4) * level
              )}
            </span>
          ))}
        </div>

        <div className="em-admin-chart-body">
          <div className="em-admin-chart-bars">
            {data.map((point) => (
              <div
                key={point.date}
                className="em-admin-chart-column"
              >
                <div className="em-admin-bar-pair">
                  <div
                    className="em-admin-bar plays"
                    style={{
                      height: `${
                        (point.plays / chartMaximum) * 100
                      }%`,
                    }}
                    title={`${point.date}: ${formatNumber(
                      point.plays
                    )} plays`}
                  />

                  <div
                    className="em-admin-bar views"
                    style={{
                      height: `${
                        (point.views / chartMaximum) * 100
                      }%`,
                    }}
                    title={`${point.date}: ${formatNumber(
                      point.views
                    )} views`}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="em-admin-chart-dates">
            {data.map((point) => (
              <span key={point.date}>
                {new Date(
                  `${point.date}T00:00:00Z`
                ).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="em-admin-chart-details">
        <summary>View engagement figures</summary>

        <div className="em-admin-table-wrap">
          <table className="em-admin-table">
            <thead>
              <tr>
                <th>Date (UTC)</th>
                <th>Plays</th>
                <th>Views</th>
              </tr>
            </thead>

            <tbody>
              {data.map((point) => (
                <tr key={point.date}>
                  <td>{point.date}</td>

                  <td>{formatNumber(point.plays)}</td>

                  <td>{formatNumber(point.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

// ==========================================
// STATUS BADGE
// ==========================================

function StatusBadge({
  status,
}: {
  status: string;
}) {
  return (
    <span
      className={`em-admin-status ${
        [
          "active",
          "approved",
          "resolved",
          "success",
          "visible",
        ].includes(status)
          ? "positive"
          : [
              "pending",
              "reviewing",
              "hidden",
            ].includes(status)
          ? "warning"
          : "negative"
      }`}
    >
      {formatLabel(status)}
    </span>
  );
}

// ==========================================
// MAIN DASHBOARD OVERVIEW
// ==========================================

export default function AdminOverview() {
  const [dashboard, setDashboard] =
    useState<DashboardOverview | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [refreshKey, setRefreshKey] =
    useState(0);

  // ========================================
  // FETCH DASHBOARD INFORMATION
  // ========================================

  useEffect(() => {
    const controller =
      new AbortController();

    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");
      setDashboard(null);

      try {
        const result =
          await getAdminDashboardOverview(
            controller.signal
          );

        if (active) {
          setDashboard(result);
        }

      } catch (error) {
        if (
          !active ||
          controller.signal.aborted
        ) {
          return;
        }

        setError(
          error instanceof Error
            ? error.message
            : "Unable to load dashboard."
        );

      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshKey]);

  // ========================================
  // LOADING STATE
  // ========================================

  if (loading) {
    return (
      <div className="em-admin-access-state">
        <div className="em-admin-spinner" />

        <p>Loading platform statistics...</p>
      </div>
    );
  }

  // ========================================
  // ERROR STATE
  // ========================================

  if (error || !dashboard) {
    return (
      <div className="em-admin-access-state">
        <AlertCircle size={36} />

        <h2>Unable to load dashboard</h2>

        <p>
          {error || "Dashboard information is unavailable."}
        </p>

        <button
          type="button"
          className="em-admin-primary-button"
          onClick={() =>
            setRefreshKey((value) => value + 1)
          }
        >
          <RefreshCw size={17} />

          Try again
        </button>
      </div>
    );
  }

  const {
    stats,
    recent,
    charts,
    administrator,
  } = dashboard;

  const isSuperAdmin =
    administrator.role === "superadmin";

  // ========================================
  // DASHBOARD INTERFACE
  // ========================================

  return (
    <div className="em-admin-overview">

      {/* PAGE INTRODUCTION */}

      <section className="em-admin-page-heading">
        <div>
          <span className="em-admin-eyebrow">
            EMNET MUSIC MANAGEMENT
          </span>

          <h1>Platform overview</h1>

          <p>
            Welcome, {administrator.fullName}.
            Monitor and manage the Emnet Music platform.
          </p>
        </div>

        <button
          type="button"
          className="em-admin-secondary-button"
          onClick={() =>
            setRefreshKey((value) => value + 1)
          }
        >
          <RefreshCw size={17} />

          Refresh data
        </button>
      </section>

      {/* SUMMARY STATISTICS */}

      <section className="em-admin-stat-grid">
        <StatisticCard
          label="Total users"
          value={stats.users.total}
          description={`${formatNumber(
            stats.users.newLast7Days
          )} new accounts in the last 7 days`}
          icon={<Users size={22} />}
          path="/admin/users"
        />

        <StatisticCard
          label="Artist profiles"
          value={stats.artists.total}
          description={`${formatNumber(
            stats.artists.pending
          )} pending applications`}
          icon={<Mic2 size={22} />}
          path="/admin/artists"
        />

        <StatisticCard
          label="Published songs"
          value={stats.songs.published}
          description={`${formatNumber(
            stats.songs.publiclyAvailable
          )} publicly available`}
          icon={<Music2 size={22} />}
          path="/admin/songs"
        />

        <StatisticCard
          label="Published releases"
          value={stats.releases.published}
          description={`${formatNumber(
            stats.releases.publiclyAvailable
          )} publicly available`}
          icon={<Disc3 size={22} />}
          path="/admin/releases"
        />

        <StatisticCard
          label="Published videos"
          value={stats.videos.published}
          description={`${formatNumber(
            stats.videos.publiclyAvailable
          )} publicly available`}
          icon={<Video size={22} />}
          path="/admin/videos"
        />

        <StatisticCard
          label="Open reports"
          value={stats.reports.open}
          description={`${formatNumber(
            stats.reports.reviewing
          )} currently under review`}
          icon={<Flag size={22} />}
          path="/admin/reports"
        />

        <StatisticCard
          label="Recorded song plays"
          value={stats.engagement.totalPlays}
          description={`${formatNumber(
            stats.engagement.playsLast7Days
          )} in the last 7 days`}
          icon={<Headphones size={22} />}
        />

        <StatisticCard
          label="Recorded video views"
          value={stats.engagement.totalViews}
          description={`${formatNumber(
            stats.engagement.viewsLast7Days
          )} in the last 7 days`}
          icon={<Eye size={22} />}
        />
      </section>

      {/* ENGAGEMENT AND AUDIENCE */}

      <div className="em-admin-two-column">
        <EngagementChart
          data={charts.engagement}
        />

        <section className="em-admin-panel">
          <div className="em-admin-panel-heading">
            <div>
              <h2>Audience overview</h2>

              <p>User accounts and engagement</p>
            </div>

            <Users size={21} />
          </div>

          <div className="em-admin-audience-list">
            <div>
              <span>Listener accounts</span>

              <strong>
                {formatNumber(stats.users.listeners)}
              </strong>
            </div>

            <div>
              <span>Artist accounts</span>

              <strong>
                {formatNumber(stats.users.artists)}
              </strong>
            </div>

            <div>
              <span>Active accounts</span>

              <strong>
                {formatNumber(stats.users.active)}
              </strong>
            </div>

            <div>
              <span>Verified email accounts</span>

              <strong>
                {formatNumber(stats.users.verified)}
              </strong>
            </div>

            <div>
              <span>Suspended accounts</span>

              <strong>
                {formatNumber(stats.users.suspended)}
              </strong>
            </div>

            <div>
              <span>
                <Heart size={16} />
                Song likes
              </span>

              <strong>
                {formatNumber(
                  stats.engagement.totalSongLikes
                )}
              </strong>
            </div>

            <div>
              <span>Video likes</span>

              <strong>
                {formatNumber(
                  stats.engagement.totalVideoLikes
                )}
              </strong>
            </div>

            <div>
              <span>Artist follows</span>

              <strong>
                {formatNumber(
                  stats.engagement.totalArtistFollows
                )}
              </strong>
            </div>
          </div>
        </section>
      </div>

      {/* CONTENT MODERATION SUMMARY */}

      <section className="em-admin-panel">
        <div className="em-admin-panel-heading">
          <div>
            <h2>Content moderation</h2>

            <p>Visibility and content restrictions</p>
          </div>

          <ShieldCheck size={21} />
        </div>

        <div className="em-admin-table-wrap">
          <table className="em-admin-table">
            <thead>
              <tr>
                <th>Content type</th>
                <th>Publicly available</th>
                <th>Hidden</th>
                <th>Taken down</th>
                <th>Manage</th>
              </tr>
            </thead>

            <tbody>
              {[
                {
                  label: "Artists",
                  data: stats.artists,
                  path: "/admin/artists",
                },
                {
                  label: "Songs",
                  data: stats.songs,
                  path: "/admin/songs",
                },
                {
                  label: "Releases",
                  data: stats.releases,
                  path: "/admin/releases",
                },
                {
                  label: "Videos",
                  data: stats.videos,
                  path: "/admin/videos",
                },
              ].map((item) => (
                <tr key={item.label}>
                  <td>{item.label}</td>

                  <td>
                    {formatNumber(
                      item.data.publiclyAvailable
                    )}
                  </td>

                  <td>
                    {formatNumber(item.data.hidden)}
                  </td>

                  <td>
                    {formatNumber(item.data.takenDown)}
                  </td>

                  <td>
                    <Link
                      className="em-admin-text-link"
                      to={item.path}
                    >
                      View

                      <ArrowUpRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="em-admin-panel-note">
          {formatNumber(
            stats.songs.blockedByParentRelease || 0
          )} otherwise visible songs are unavailable
          because their parent releases are unavailable.
        </p>
      </section>

      {/* RECENT APPLICATIONS AND REPORTS */}

      <div className="em-admin-two-column equal">

        {/* ARTIST APPLICATIONS */}

        <section className="em-admin-panel">
          <div className="em-admin-panel-heading">
            <div>
              <h2>Artist applications</h2>

              <p>Recent pending applications</p>
            </div>

            <Link
              to="/admin/artists"
              className="em-admin-text-link"
            >
              View all
            </Link>
          </div>

          {recent.artistApplications.length === 0 ? (
            <div className="em-admin-empty">
              <UserRoundPlus size={30} />

              <p>No pending artist applications.</p>
            </div>
          ) : (
            <div className="em-admin-recent-list">
              {recent.artistApplications.map(
                (artist) => (
                  <div
                    className="em-admin-recent-item"
                    key={artist._id}
                  >
                    <div className="em-admin-list-icon">
                      <Mic2 size={21} />
                    </div>

                    <div className="em-admin-item-details">
                      <strong>{artist.stageName}</strong>

                      <span>
                        {artist.country || "Country unknown"}
                        {" · "}
                        {formatDate(artist.createdAt)}
                      </span>
                    </div>

                    <StatusBadge
                      status={artist.approvalStatus}
                    />
                  </div>
                )
              )}
            </div>
          )}
        </section>

        {/* RECENT REPORTS */}

        <section className="em-admin-panel">
          <div className="em-admin-panel-heading">
            <div>
              <h2>Recent reports</h2>

              <p>Content requiring attention</p>
            </div>

            <Link
              to="/admin/reports"
              className="em-admin-text-link"
            >
              View all
            </Link>
          </div>

          {recent.reports.length === 0 ? (
            <div className="em-admin-empty">
              <Flag size={30} />

              <p>No open content reports.</p>
            </div>
          ) : (
            <div className="em-admin-recent-list">
              {recent.reports.map((report) => (
                <div
                  className="em-admin-recent-item"
                  key={report._id}
                >
                  <div className="em-admin-list-icon">
                    <Flag size={20} />
                  </div>

                  <div className="em-admin-item-details">
                    <strong>
                      {formatLabel(report.reason)}
                    </strong>

                    <span>
                      {formatLabel(report.targetType)}
                      {" · "}
                      {formatDate(report.createdAt)}
                    </span>
                  </div>

                  <StatusBadge
                    status={report.status}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ===================================
          SUPER ADMIN STATISTICS
      =================================== */}

      {isSuperAdmin && stats.administrators && (
        <section className="em-admin-panel">
          <div className="em-admin-panel-heading">
            <div>
              <h2>Administrator overview</h2>

              <p>Restricted to Super Admin</p>
            </div>

            <ShieldCheck size={22} />
          </div>

          <div className="em-admin-small-stat-grid">
            {[
              {
                label: "Administrators",
                value: stats.administrators.admins,
              },
              {
                label: "Super Admins",
                value: stats.administrators.superAdmins,
              },
              {
                label: "Active admins",
                value: stats.administrators.activeAdmins,
              },
              {
                label: "Suspended admins",
                value: stats.administrators.suspendedAdmins,
              },
            ].map((item) => (
              <div
                className="em-admin-small-stat"
                key={item.label}
              >
                <span>{item.label}</span>

                <strong>
                  {formatNumber(item.value)}
                </strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SUPER ADMIN ACTIVITY LOGS */}

      {isSuperAdmin && recent.adminActivities && (
        <section className="em-admin-panel">
          <div className="em-admin-panel-heading">
            <div>
              <h2>Recent administrative activities</h2>

              <p>Latest recorded management actions</p>
            </div>

            <Link
              to="/admin/activity-logs"
              className="em-admin-text-link"
            >
              View logs
            </Link>
          </div>

          {recent.adminActivities.length === 0 ? (
            <div className="em-admin-empty">
              <ShieldCheck size={30} />

              <p>No administrative activity recorded.</p>
            </div>
          ) : (
            <div className="em-admin-table-wrap">
              <table className="em-admin-table">
                <thead>
                  <tr>
                    <th>Administrator</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Outcome</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>
                  {recent.adminActivities.map(
                    (activity) => (
                      <tr key={activity._id}>
                        <td>{activity.actorName}</td>

                        <td>
                          {formatLabel(activity.action)}
                        </td>

                        <td>
                          {activity.targetName ||
                            formatLabel(
                              activity.targetType
                            )}
                        </td>

                        <td>
                          <StatusBadge
                            status={activity.outcome}
                          />
                        </td>

                        <td>
                          {formatDate(activity.createdAt)}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* DATA GENERATION TIME */}

      <p className="em-admin-last-updated">
        Last updated:{" "}
        {new Date(
          dashboard.generatedAt
        ).toLocaleString("en-NG")}
        {" · "}
        Reporting timezone: {dashboard.reportingTimezone}
      </p>
    </div>
  );
}