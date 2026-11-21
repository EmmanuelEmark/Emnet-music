const User = require("../models/User");
const Artist = require("../models/Artist");
const Song = require("../models/song");
const Release = require("../models/Release");
const Video = require("../models/video");
const Report = require("../models/Report");
const Play = require("../models/play");
const View = require("../models/View");
const Like = require("../models/Like");
const Follow = require("../models/follow");
const VideoLike = require("../models/VideoLike");
const AdminActivity = require("../models/AdminActivity");

// ==========================================
// CONFIGURATION
// ==========================================

const ADMIN_ROLES = ["admin", "superadmin"];

const RECENT_ACTIVITY_LIMIT = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

// ==========================================
// PUBLIC VISIBILITY FILTER
// ==========================================

function publicVisibilityFilter() {
  return {
    $or: [
      { visibilityStatus: "visible" },
      { visibilityStatus: null },
      {
        visibilityStatus: {
          $exists: false,
        },
      },
    ],
  };
}

// ==========================================
// CUSTOM DASHBOARD ERROR
// ==========================================

class DashboardError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "DashboardError";
    this.status = status;
  }
}

// ==========================================
// SECURITY HEADERS
// ==========================================

function preventCaching(res) {
  res.set(
    "Cache-Control",
    "private, no-store, max-age=0"
  );

  res.set(
    "Referrer-Policy",
    "no-referrer"
  );
}

// ==========================================
// VERIFY ADMINISTRATIVE ACCESS
// ==========================================

function requireDashboardUser(req) {
  if (!req.user?._id || !req.auth) {
    throw new DashboardError(
      "Authentication is required.",
      401
    );
  }

  if (!ADMIN_ROLES.includes(req.user.role)) {
    throw new DashboardError(
      "Administrative access is required.",
      403
    );
  }

  if (
    req.user.accountStatus !== "active" ||
    req.user.emailVerified !== true
  ) {
    throw new DashboardError(
      "Your administrative account is unavailable.",
      403
    );
  }

  if (
    String(req.auth.userId) !==
      String(req.user._id) ||

    req.auth.role !== req.user.role ||

    !Number.isSafeInteger(
      req.auth.tokenVersion
    ) ||

    req.auth.tokenVersion < 0
  ) {
    throw new DashboardError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// CENTRALIZED ERROR HANDLING
// ==========================================

function sendError(res, error, context) {
  preventCaching(res);

  if (error instanceof DashboardError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
    });
  }

  console.error(
    context,
    error.name,
    error.code || "",
    error.message
  );

  return res.status(500).json({
    success: false,

    message:
      "Unable to load the administrative dashboard.",
  });
}

// ==========================================
// CONVERT AGGREGATION RESULTS INTO COUNTS
// ==========================================

function createCountMap(records) {
  const result = new Map();

  for (const record of records) {
    result.set(
      record._id,
      record.total
    );
  }

  return result;
}

// ==========================================
// USER ACCOUNT STATISTICS
//
// Admin and Super Admin can view
// ordinary user account statistics.
//
// Administrative account statistics
// are handled separately.
// ==========================================

async function getUserStatistics(now) {
  const sevenDaysAgo = new Date(
    now.getTime() - 7 * DAY_MS
  );

  const thirtyDaysAgo = new Date(
    now.getTime() - 30 * DAY_MS
  );

  const result = await User.aggregate([
    {
      $match: {
        role: {
          $in: [
            "listener",
            "artist",
            "distributor",
          ],
        },
      },
    },

    {
      $facet: {
        total: [
          {
            $count: "total",
          },
        ],

        byRole: [
          {
            $group: {
              _id: "$role",

              total: {
                $sum: 1,
              },
            },
          },
        ],

        byStatus: [
          {
            $group: {
              _id: "$accountStatus",

              total: {
                $sum: 1,
              },
            },
          },
        ],

        verified: [
          {
            $match: {
              emailVerified: true,
            },
          },

          {
            $count: "total",
          },
        ],

        newLast7Days: [
          {
            $match: {
              createdAt: {
                $gte: sevenDaysAgo,
                $lte: now,
              },
            },
          },

          {
            $count: "total",
          },
        ],

        newLast30Days: [
          {
            $match: {
              createdAt: {
                $gte: thirtyDaysAgo,
                $lte: now,
              },
            },
          },

          {
            $count: "total",
          },
        ],
      },
    },
  ]);

  const data = result[0] || {};

  const roleCounts = createCountMap(
    data.byRole || []
  );

  const statusCounts = createCountMap(
    data.byStatus || []
  );

  const total =
    data.total?.[0]?.total || 0;

  const verified =
    data.verified?.[0]?.total || 0;

  return {
    total,

    listeners:
      roleCounts.get("listener") || 0,

    artists:
      roleCounts.get("artist") || 0,

    distributors:
      roleCounts.get("distributor") || 0,

    active:
      statusCounts.get("active") || 0,

    suspended:
      statusCounts.get("suspended") || 0,

    disabled:
      statusCounts.get("disabled") || 0,

    verified,

    unverified:
      Math.max(0, total - verified),

    newLast7Days:
      data.newLast7Days?.[0]?.total || 0,

    newLast30Days:
      data.newLast30Days?.[0]?.total || 0,
  };
}

// ==========================================
// ARTIST PROFILE STATISTICS
// ==========================================

async function getArtistStatistics() {
  const result = await Artist.aggregate([
    {
      $facet: {
        byStatus: [
          {
            $group: {
              _id: "$approvalStatus",

              total: {
                $sum: 1,
              },
            },
          },
        ],

        publiclyAvailable: [
          {
            $match: {
              approvalStatus: "approved",

              ...publicVisibilityFilter(),
            },
          },

          {
            $count: "total",
          },
        ],

        verified: [
          {
            $match: {
              approvalStatus: "approved",

              verified: true,

              ...publicVisibilityFilter(),
            },
          },

          {
            $count: "total",
          },
        ],

        featured: [
          {
            $match: {
              approvalStatus: "approved",

              featured: true,

              ...publicVisibilityFilter(),
            },
          },

          {
            $count: "total",
          },
        ],

        hidden: [
          {
            $match: {
              visibilityStatus: "hidden",
            },
          },

          {
            $count: "total",
          },
        ],

        takenDown: [
          {
            $match: {
              visibilityStatus: "takedown",
            },
          },

          {
            $count: "total",
          },
        ],
      },
    },
  ]);

  const data = result[0] || {};

  const statuses = createCountMap(
    data.byStatus || []
  );

  const total = (
    data.byStatus || []
  ).reduce(
    (sum, record) => sum + record.total,
    0
  );

  return {
    total,

    pending:
      statuses.get("pending") || 0,

    approved:
      statuses.get("approved") || 0,

    rejected:
      statuses.get("rejected") || 0,

    suspended:
      statuses.get("suspended") || 0,

    publiclyAvailable:
      data.publiclyAvailable?.[0]?.total || 0,

    verified:
      data.verified?.[0]?.total || 0,

    featured:
      data.featured?.[0]?.total || 0,

    hidden:
      data.hidden?.[0]?.total || 0,

    takenDown:
      data.takenDown?.[0]?.total || 0,
  };
}

// ==========================================
// MUSIC CATALOGUE STATISTICS
//
// Private drafts are excluded.
//
// Published content includes visible,
// hidden and taken-down approved content.
// ==========================================

async function getCatalogueStatistics(Model) {
  const result = await Model.aggregate([
    {
      $match: {
        status: {
          $in: [
            "approved",
            "pending",
            "rejected",
          ],
        },
      },
    },

    {
      $facet: {
        byStatus: [
          {
            $group: {
              _id: "$status",

              total: {
                $sum: 1,
              },
            },
          },
        ],

        visible: [
          {
            $match: {
              status: "approved",

              ...publicVisibilityFilter(),
            },
          },

          {
            $count: "total",
          },
        ],

        hidden: [
          {
            $match: {
              status: "approved",

              visibilityStatus: "hidden",
            },
          },

          {
            $count: "total",
          },
        ],

        takenDown: [
          {
            $match: {
              status: "approved",

              visibilityStatus: "takedown",
            },
          },

          {
            $count: "total",
          },
        ],
      },
    },
  ]);

  const data = result[0] || {};

  const statuses = createCountMap(
    data.byStatus || []
  );

  const published =
    statuses.get("approved") || 0;

  const pending =
    statuses.get("pending") || 0;

  const rejected =
    statuses.get("rejected") || 0;

  return {
    total:
      published + pending + rejected,

    published,

    pending,

    rejected,

    visible:
      data.visible?.[0]?.total || 0,

    hidden:
      data.hidden?.[0]?.total || 0,

    takenDown:
      data.takenDown?.[0]?.total || 0,
  };
}

// ==========================================
// COUNT EFFECTIVELY PUBLIC SONGS
//
// A song is publicly available only
// when its parent release is also public.
// ==========================================

async function countPublicSongs() {
  const result = await Song.aggregate([
    {
      $match: {
        status: "approved",

        ...publicVisibilityFilter(),
      },
    },

    {
      $lookup: {
        from: Release.collection.name,

        localField: "releaseId",

        foreignField: "_id",

        as: "parentRelease",
      },
    },

    {
      $match: {
        parentRelease: {
          $elemMatch: {
            status: "approved",

            ...publicVisibilityFilter(),
          },
        },
      },
    },

    {
      $count: "total",
    },
  ]);

  return result[0]?.total || 0;
}

// ==========================================
// REPORT STATISTICS
// ==========================================

async function getReportStatistics() {
  const records = await Report.aggregate([
    {
      $group: {
        _id: "$status",

        total: {
          $sum: 1,
        },
      },
    },
  ]);

  const counts = createCountMap(records);

  const pending =
    counts.get("pending") || 0;

  const reviewing =
    counts.get("reviewing") || 0;

  const resolved =
    counts.get("resolved") || 0;

  const dismissed =
    counts.get("dismissed") || 0;

  return {
    total: records.reduce(
      (sum, record) => sum + record.total,
      0
    ),

    pending,

    reviewing,

    resolved,

    dismissed,

    open:
      pending + reviewing,
  };
}

// ==========================================
// ENGAGEMENT STATISTICS
//
// Official plays and views are counted
// from their corresponding database
// records.
//
// Historical engagement is preserved
// even when content becomes restricted.
// ==========================================

async function getEngagementStatistics(now) {
  const sevenDaysAgo = new Date(
    now.getTime() - 7 * DAY_MS
  );

  const thirtyDaysAgo = new Date(
    now.getTime() - 30 * DAY_MS
  );

  const [
    totalPlays,

    totalViews,

    totalSongLikes,

    totalVideoLikes,

    totalArtistFollows,

    playsLast7Days,

    viewsLast7Days,

    playsLast30Days,

    viewsLast30Days,
  ] = await Promise.all([
    Play.countDocuments(),

    View.countDocuments(),

    Like.countDocuments(),

    VideoLike.countDocuments(),

    Follow.countDocuments(),

    Play.countDocuments({
      countedAt: {
        $gte: sevenDaysAgo,
        $lte: now,
      },
    }),

    View.countDocuments({
      countedAt: {
        $gte: sevenDaysAgo,
        $lte: now,
      },
    }),

    Play.countDocuments({
      countedAt: {
        $gte: thirtyDaysAgo,
        $lte: now,
      },
    }),

    View.countDocuments({
      countedAt: {
        $gte: thirtyDaysAgo,
        $lte: now,
      },
    }),
  ]);

  return {
    totalPlays,

    totalViews,

    totalSongLikes,

    totalVideoLikes,

    totalArtistFollows,

    playsLast7Days,

    viewsLast7Days,

    playsLast30Days,

    viewsLast30Days,
  };
}

// ==========================================
// BUILD DAILY ENGAGEMENT STATISTICS
//
// Used by dashboard charts.
//
// Dates use UTC to keep reporting
// consistent across users and servers.
// ==========================================

async function getDailyCounts(
  Model,
  startDate,
  endDate
) {
  return Model.aggregate([
    {
      $match: {
        countedAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },

    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m-%d",

            date: "$countedAt",

            timezone: "UTC",
          },
        },

        total: {
          $sum: 1,
        },
      },
    },

    {
      $sort: {
        _id: 1,
      },
    },
  ]);
}

// ==========================================
// GET ENGAGEMENT CHART
//
// Includes today's partial day and
// the previous six UTC calendar days.
//
// Missing dates receive zero values.
// ==========================================

async function getEngagementChart(now) {
  const startDate = new Date(now);

  startDate.setUTCHours(0, 0, 0, 0);

  startDate.setUTCDate(
    startDate.getUTCDate() - 6
  );

  const [playRecords, viewRecords] =
    await Promise.all([
      getDailyCounts(
        Play,
        startDate,
        now
      ),

      getDailyCounts(
        View,
        startDate,
        now
      ),
    ]);

  const playCounts = createCountMap(
    playRecords
  );

  const viewCounts = createCountMap(
    viewRecords
  );

  const chart = [];

  for (let day = 0; day < 7; day++) {
    const date = new Date(
      startDate.getTime() + day * DAY_MS
    );

    const dateKey = date
      .toISOString()
      .slice(0, 10);

    chart.push({
      date: dateKey,

      plays:
        playCounts.get(dateKey) || 0,

      views:
        viewCounts.get(dateKey) || 0,
    });
  }

  return chart;
}

// ==========================================
// GET RECENT PENDING ARTISTS
//
// Display new artist applications on
// the administrative dashboard.
// ==========================================

async function getRecentArtistApplications() {
  return Artist.find({
    approvalStatus: "pending",
  })
    .select(
      "stageName country profileImage profileImageUploadId approvalStatus createdAt"
    )
    .sort({
      createdAt: -1,

      _id: -1,
    })
    .limit(5)
    .lean();
}

// ==========================================
// GET RECENT OPEN REPORTS
//
// Detailed report management remains
// inside the existing report controller.
// ==========================================

async function getRecentReports() {
  return Report.find({
    status: {
      $in: [
        "pending",
        "reviewing",
      ],
    },
  })
    .select(
      "targetType targetId reason status createdAt"
    )
    .sort({
      createdAt: -1,

      _id: -1,
    })
    .limit(5)
    .lean();
}

// ==========================================
// SUPER ADMIN STATISTICS
//
// Only Super Admin will receive
// administrative account information.
// ==========================================

async function getAdministratorStatistics() {
  const records = await User.aggregate([
    {
      $match: {
        role: {
          $in: [
            "admin",
            "superadmin",
          ],
        },
      },
    },

    {
      $group: {
        _id: {
          role: "$role",

          status: "$accountStatus",
        },

        total: {
          $sum: 1,
        },
      },
    },
  ]);

  const result = {
    total: 0,

    admins: 0,

    superAdmins: 0,

    activeAdmins: 0,

    suspendedAdmins: 0,

    disabledAdmins: 0,
  };

  for (const record of records) {
    const role = record._id.role;

    const status = record._id.status;

    const count = record.total;

    result.total += count;

    if (role === "admin") {
      result.admins += count;

      if (status === "active") {
        result.activeAdmins += count;
      }

      if (status === "suspended") {
        result.suspendedAdmins += count;
      }

      if (status === "disabled") {
        result.disabledAdmins += count;
      }
    }

    if (role === "superadmin") {
      result.superAdmins += count;
    }
  }

  return result;
}

// ==========================================
// GET RECENT ADMINISTRATIVE ACTIVITIES
//
// SUPER ADMIN ONLY
//
// Exclude IP addresses and detailed
// administrative snapshots from the
// dashboard overview.
// ==========================================

async function getRecentAdminActivities() {
  return AdminActivity.find()
    .select(
      "actorId actorName actorRole action targetType targetId targetName outcome createdAt"
    )
    .sort({
      createdAt: -1,

      _id: -1,
    })
    .limit(RECENT_ACTIVITY_LIMIT)
    .lean();
}

// ==========================================
// GET ADMINISTRATIVE DASHBOARD OVERVIEW
//
// GET /api/admin/dashboard/overview
//
// Admin:
// - Users
// - Artists
// - Songs
// - Releases
// - Videos
// - Reports
// - Engagement
//
// Super Admin:
// - All the above
// - Administrator statistics
// - Recent administrative activities
// ==========================================

const getAdminDashboardOverview =
  async (req, res) => {
    try {
      preventCaching(res);

      const administrator =
        requireDashboardUser(req);

      const now = new Date();

      // ====================================
      // LOAD DASHBOARD STATISTICS
      // ====================================

      const [
        users,

        artists,

        songs,

        releases,

        videos,

        reports,

        engagement,

        engagementChart,

        publicSongCount,

        recentArtistApplications,

        recentReports,
      ] = await Promise.all([
        getUserStatistics(now),

        getArtistStatistics(),

        getCatalogueStatistics(Song),

        getCatalogueStatistics(Release),

        getCatalogueStatistics(Video),

        getReportStatistics(),

        getEngagementStatistics(now),

        getEngagementChart(now),

        countPublicSongs(),

        getRecentArtistApplications(),

        getRecentReports(),
      ]);

      // ====================================
      // BUILD COMMON DASHBOARD INFORMATION
      // ====================================

      const dashboard = {
        administrator: {
          id: administrator._id,

          fullName: administrator.fullName,

          role: administrator.role,
        },

        stats: {
          users,

          artists,

          songs: {
            ...songs,

            publiclyAvailable:
              publicSongCount,

            blockedByParentRelease:
              Math.max(
                0,
                songs.visible - publicSongCount
              ),
          },

          releases: {
            ...releases,

            publiclyAvailable:
              releases.visible,
          },

          videos: {
            ...videos,

            publiclyAvailable:
              videos.visible,
          },

          reports,

          engagement,
        },

        charts: {
          engagement:
            engagementChart,
        },

        recent: {
          artistApplications:
            recentArtistApplications,

          reports:
            recentReports,
        },

        generatedAt:
          now.toISOString(),

        reportingTimezone:
          "UTC",
      };

      // ====================================
      // ADD SUPER ADMIN INFORMATION
      // ====================================

      if (
        administrator.role === "superadmin"
      ) {
        const [
          administrators,

          recentActivities,
        ] = await Promise.all([
          getAdministratorStatistics(),

          getRecentAdminActivities(),
        ]);

        dashboard.stats.administrators =
          administrators;

        dashboard.recent.adminActivities =
          recentActivities;
      }

      // ====================================
      // RETURN DASHBOARD OVERVIEW
      // ====================================

      return res.status(200).json({
        success: true,

        dashboard,
      });

    } catch (error) {
      return sendError(
        res,
        error,
        "Get admin dashboard overview error:"
      );
    }
  };

// ==========================================
// EXPORT DASHBOARD CONTROLLER
// ==========================================

module.exports = {
  getAdminDashboardOverview,
};
