
const mongoose = require("mongoose");

const User = require("../models/User");
const Release = require("../models/Release");
const Song = require("../models/song");
const Video = require("../models/video");
const Artist = require("../models/Artist");

// ==========================================
// CONFIGURATION
// ==========================================

const platformRoles = [
  "listener",
  "artist",
  "distributor",
];

const administrativeRoles = [
  "admin",
  "superadmin",
];

const accountStatuses = [
  "active",
  "suspended",
  "disabled",
];

const PUBLIC_USER_FIELDS = [
  "_id",
  "fullName",
  "email",
  "role",
  "accountStatus",
  "emailVerified",
  "profileImage",
  "lastLoginAt",
  "createdAt",
  "updatedAt",
  "createdBy",
  "roleAssignedAt",
  "roleAssignedBy",
  "accountStatusReason",
  "accountStatusUpdatedAt",
  "accountStatusUpdatedBy",
].join(" ");

// ==========================================
// CUSTOM ADMINISTRATIVE ERROR
// ==========================================

class AdminError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "AdminError";
    this.status = status;
  }
}

// ==========================================
// VALIDATE MONGODB ID
// ==========================================

const isValidId = (id) => {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{24}$/i.test(id)
  );
};

// ==========================================
// FORMAT SAFE USER RESPONSE
// ==========================================

const userResponse = (user) => ({
  _id: user._id,

  id: user._id,

  fullName: user.fullName,

  email: user.email,

  role: user.role,

  accountStatus: user.accountStatus,

  emailVerified:
    user.emailVerified,

  profileImage:
    user.profileImage || "",

  lastLoginAt:
    user.lastLoginAt || null,

  createdAt:
    user.createdAt,

  updatedAt:
    user.updatedAt,

  createdBy:
    user.createdBy || null,

  roleAssignedAt:
    user.roleAssignedAt || null,

  roleAssignedBy:
    user.roleAssignedBy || null,

  accountStatusReason:
    user.accountStatusReason || "",

  accountStatusUpdatedAt:
    user.accountStatusUpdatedAt || null,

  accountStatusUpdatedBy:
    user.accountStatusUpdatedBy || null,
});

// ==========================================
// ERROR HANDLING
// ==========================================

const serverError = (
  res,
  label,
  error
) => {
  if (error instanceof AdminError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
    });
  }

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,

      message:
        "Invalid account information.",
    });
  }

  if (
    error.hasErrorLabel?.(
      "UnknownTransactionCommitResult"
    )
  ) {
    return res.status(503).json({
      success: false,

      message:
        "The operation result could not be confirmed. Refresh the account information before trying again.",
    });
  }

  if (
    error.code === 112 ||

    error.hasErrorLabel?.(
      "TransientTransactionError"
    )
  ) {
    return res.status(409).json({
      success: false,

      message:
        "The account was modified by another request. Please try again.",
    });
  }

  console.error(
    label,
    error.name,
    error.code || ""
  );

  return res.status(500).json({
    success: false,

    message:
      "Unable to complete the administrative operation.",
  });
};

// ==========================================
// VERIFY ADMINISTRATIVE REQUEST
// ==========================================

function requireAdministrativeRequest(
  req,
  superAdminOnly = false
) {
  if (!req.user?._id || !req.auth) {
    throw new AdminError(
      "Authentication required.",
      401
    );
  }

  if (
    !administrativeRoles.includes(
      req.user.role
    ) ||

    req.user.accountStatus !== "active" ||

    req.user.emailVerified !== true
  ) {
    throw new AdminError(
      "Administrative access is required.",
      403
    );
  }

  if (
    superAdminOnly &&
    req.user.role !== "superadmin"
  ) {
    throw new AdminError(
      "Only a Super Admin can perform this operation.",
      403
    );
  }

  if (
    !Number.isSafeInteger(
      req.auth.tokenVersion
    ) ||

    req.auth.tokenVersion < 0
  ) {
    throw new AdminError(
      "Invalid administrator session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// RUN DATABASE TRANSACTION
// ==========================================

async function runAdminTransaction(
  operation
) {
  const session =
    await mongoose.startSession();

  let result;

  try {
    await session.withTransaction(
      async () => {
        result =
          await operation(session);
      },

      {
        readPreference: "primary",

        readConcern: {
          level: "snapshot",
        },

        writeConcern: {
          w: "majority",
        },
      }
    );

    return result;

  } finally {
    await session.endSession();
  }
}

// ==========================================
// VERIFY AND LOCK ACTING ADMINISTRATOR
//
// Coordinates administrative operations
// with concurrent changes to the acting
// administrator's account.
// ==========================================

async function lockAdministrator(
  req,
  session,
  superAdminOnly = false
) {
  const actor =
    requireAdministrativeRequest(
      req,
      superAdminOnly
    );

  const filter = {
    _id: actor._id,

    role: actor.role,

    accountStatus: "active",

    emailVerified: true,

    tokenVersion:
      req.auth.tokenVersion,
  };

  const currentActor =
    await User.findOneAndUpdate(
      filter,

      {
        $inc: {
          __v: 1,
        },
      },

      {
        new: true,

        session,

        runValidators: true,
      }
    ).select(
      "_id fullName role accountStatus"
    );

  if (!currentActor) {
    throw new AdminError(
      "Your administrative permissions or session have changed.",
      403
    );
  }

  return currentActor;
}

// ==========================================
// PREVENT SELF-MODIFICATION
// ==========================================

function preventSelfModification(
  actorId,
  targetId
) {
  if (
    String(actorId) === String(targetId)
  ) {
    throw new AdminError(
      "You cannot perform this operation on your own account.",
      403
    );
  }
}

// ==========================================
// VALIDATE ADMINISTRATIVE REASON
// ==========================================

function getReason(
  value,
  defaultReason
) {
  if (
    value === undefined ||
    value === null
  ) {
    return defaultReason;
  }

  if (typeof value !== "string") {
    throw new AdminError(
      "The reason must be a string."
    );
  }

  const reason = value.trim();

  if (reason.length > 1000) {
    throw new AdminError(
      "The reason cannot exceed 1000 characters."
    );
  }

  return reason || defaultReason;
}

// ==========================================
// ESCAPE SEARCH QUERY
//
// Prevent user-supplied regular expression
// operators from changing the search.
// ==========================================

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

// ==========================================
// PARSE PAGINATION
// ==========================================

function getPagination(query) {
  const pageValue =
    query.page ?? "1";

  const limitValue =
    query.limit ?? "50";

  if (
    typeof pageValue !== "string" ||
    typeof limitValue !== "string" ||

    !/^[1-9]\d*$/.test(pageValue) ||
    !/^[1-9]\d*$/.test(limitValue)
  ) {
    throw new AdminError(
      "Invalid pagination parameters."
    );
  }

  const page = Number(pageValue);
  const limit = Number(limitValue);

  if (
    !Number.isSafeInteger(page) ||

    !Number.isSafeInteger(limit) ||

    page > 10000 ||

    limit > 100
  ) {
    throw new AdminError(
      "Pagination exceeds the allowed limits."
    );
  }

  return {
    page,

    limit,

    skip: (page - 1) * limit,
  };
}

// ==========================================
// BUILD ACCOUNT SEARCH FILTER
// ==========================================

function buildAccountFilter(
  query,
  allowedRoles
) {
  const filter = {
    role: {
      $in: allowedRoles,
    },
  };

  // ========================================
  // FILTER BY ROLE
  // ========================================

  if (
    query.role !== undefined &&
    query.role !== ""
  ) {
    if (
      typeof query.role !== "string" ||

      !allowedRoles.includes(
        query.role
      )
    ) {
      throw new AdminError(
        "Invalid account role filter."
      );
    }

    filter.role = query.role;
  }

  // ========================================
  // FILTER BY ACCOUNT STATUS
  // ========================================

  if (
    query.status !== undefined &&
    query.status !== ""
  ) {
    if (
      typeof query.status !== "string" ||

      !accountStatuses.includes(
        query.status
      )
    ) {
      throw new AdminError(
        "Invalid account status filter."
      );
    }

    filter.accountStatus =
      query.status;
  }

  // ========================================
  // SEARCH BY NAME OR EMAIL
  // ========================================

  if (query.search !== undefined) {
    if (typeof query.search !== "string") {
      throw new AdminError(
        "Invalid search query."
      );
    }

    const search =
      query.search.trim();

    if (search.length > 100) {
      throw new AdminError(
        "Search query is too long."
      );
    }

    if (search) {
      const safeSearch =
        escapeRegex(search);

      filter.$or = [
        {
          fullName: {
            $regex: safeSearch,
            $options: "i",
          },
        },

        {
          email: {
            $regex: safeSearch,
            $options: "i",
          },
        },
      ];
    }
  }

  return filter;
}

// ==========================================
// ATOMIC ACCOUNT MODIFICATION
//
// Changes account information and revokes
// existing authentication tokens together.
// ==========================================

async function modifyAccount({
  target,

  changes,

  session,
}) {
  const version =
    target.tokenVersion ?? 0;

  if (
    !Number.isSafeInteger(version) ||

    version < 0 ||

    version >= Number.MAX_SAFE_INTEGER
  ) {
    throw new AdminError(
      "The account has an invalid security version.",
      409
    );
  }

  const filter = {
    _id: target._id,

    role: target.role,

    accountStatus:
      target.accountStatus,
  };

  // Support older user documents that
  // do not contain tokenVersion.

  if (version === 0) {
    filter.$or = [
      {
        tokenVersion: 0,
      },

      {
        tokenVersion: {
          $exists: false,
        },
      },

      {
        tokenVersion: null,
      },
    ];

  } else {
    filter.tokenVersion =
      version;
  }

  const updated =
    await User.findOneAndUpdate(
      filter,

      {
        $set: {
          ...changes,

          tokenVersion:
            version + 1,
        },
      },

      {
        new: true,

        session,

        runValidators: true,
      }
    ).select(
      PUBLIC_USER_FIELDS
    );

  if (!updated) {
    throw new AdminError(
      "The account changed during this operation. Please refresh and try again.",
      409
    );
  }

  return updated;
}

// ==========================================
// GET ADMINISTRATORS
//
// SUPER ADMIN ONLY
// ==========================================

const getAdmins = async (
  req,
  res
) => {
  try {
    requireAdministrativeRequest(
      req,
      true
    );

    const pagination =
      getPagination(req.query);

    const filter =
      buildAccountFilter(
        req.query,

        ["admin"]
      );

    const [
      admins,

      total,
    ] = await Promise.all([
      User.find(filter)

        .select(PUBLIC_USER_FIELDS)

        .sort({
          createdAt: -1,
          _id: -1,
        })

        .skip(pagination.skip)

        .limit(pagination.limit)

        .lean(),

      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,

      count: admins.length,

      admins:
        admins.map(userResponse),

      pagination: {
        page: pagination.page,

        limit: pagination.limit,

        total,

        totalPages: Math.ceil(
          total / pagination.limit
        ),
      },
    });

  } catch (error) {
    return serverError(
      res,

      "Get administrators error:",

      error
    );
  }
};

// ==========================================
// LEGACY PROMOTE USER TO ADMIN
//
// SUPER ADMIN ONLY
//
// Existing endpoint retained, but disabled.
// New administrators must use invitations.
// ==========================================

const promoteToAdmin = async (
  req,
  res
) => {
  try {
    requireAdministrativeRequest(
      req,
      true
    );

    const { userId } =
      req.params;

    if (!isValidId(userId)) {
      throw new AdminError(
        "Invalid user ID."
      );
    }

    return res.status(409).json({
      success: false,

      message:
        "Direct promotion is disabled. Create the administrator using a secure invitation and a separate administrative email address.",

      code:
        "ADMIN_INVITATION_REQUIRED",
    });

  } catch (error) {
    return serverError(
      res,

      "Promote administrator error:",

      error
    );
  }
};

// ==========================================
// CHANGE ACCOUNT STATUS
//
// Shared internal function for:
// - Suspend administrator
// - Reactivate administrator
// - Suspend platform user
// - Reactivate platform user
// ==========================================

async function changeAccountStatus({
  req,

  targetId,

  allowedRoles,

  expectedStatus,

  newStatus,

  superAdminOnly,

  defaultReason,
}) {
  const actor =
    requireAdministrativeRequest(
      req,

      superAdminOnly
    );

  if (!isValidId(targetId)) {
    throw new AdminError(
      "Invalid account ID."
    );
  }

  preventSelfModification(
    actor._id,

    targetId
  );

  const reason =
    getReason(
      req.body?.reason,

      defaultReason
    );

  return runAdminTransaction(
    async (session) => {
      // Recheck administrator permissions.

      const currentActor =
        await lockAdministrator(
          req,

          session,

          superAdminOnly
        );

      // ====================================
      // FIND TARGET ACCOUNT
      // ====================================

      const target =
        await User.findById(targetId)

          .select(
            "_id role accountStatus tokenVersion"
          )

          .session(session);

      if (!target) {
        throw new AdminError(
          "Account not found.",
          404
        );
      }

      // ====================================
      // PROTECT HIGHER PRIVILEGED ACCOUNTS
      // ====================================

      if (
        !allowedRoles.includes(
          target.role
        )
      ) {
        throw new AdminError(
          "You cannot manage this account through this endpoint.",
          403
        );
      }

      // ====================================
      // VALIDATE ACCOUNT STATUS
      // ====================================

      if (
        target.accountStatus !==
        expectedStatus
      ) {
        if (
          target.accountStatus ===
          newStatus
        ) {
          throw new AdminError(
            `This account is already ${newStatus}.`,
            409
          );
        }

        throw new AdminError(
          `Only ${expectedStatus} accounts can be changed to ${newStatus}.`,
          409
        );
      }

      // ====================================
      // CHANGE STATUS AND REVOKE SESSIONS
      // ====================================

      return modifyAccount({
        target,

        session,

        changes: {
          accountStatus:
            newStatus,

          accountStatusReason:
            reason,

          accountStatusUpdatedAt:
            new Date(),

          accountStatusUpdatedBy:
            currentActor._id,
        },
      });
    }
  );
}

// ==========================================
// SUSPEND ADMINISTRATOR
//
// SUPER ADMIN ONLY
// ==========================================

const suspendAdmin = async (
  req,
  res
) => {
  try {
    const admin =
      await changeAccountStatus({
        req,

        targetId:
          req.params.adminId,

        allowedRoles:
          ["admin"],

        expectedStatus:
          "active",

        newStatus:
          "suspended",

        superAdminOnly:
          true,

        defaultReason:
          "Administrator suspended by Super Admin.",
      });

    return res.status(200).json({
      success: true,

      message:
        "Admin suspended successfully.",

      user:
        userResponse(admin),

      sessionsRevoked:
        true,
    });

  } catch (error) {
    return serverError(
      res,

      "Suspend administrator error:",

      error
    );
  }
};

// ==========================================
// REACTIVATE ADMINISTRATOR
//
// SUPER ADMIN ONLY
// ==========================================

const reactivateAdmin = async (
  req,
  res
) => {
  try {
    const admin =
      await changeAccountStatus({
        req,

        targetId:
          req.params.adminId,

        allowedRoles:
          ["admin"],

        expectedStatus:
          "suspended",

        newStatus:
          "active",

        superAdminOnly:
          true,

        defaultReason:
          "Administrator reactivated by Super Admin.",
      });

    return res.status(200).json({
      success: true,

      message:
        "Admin reactivated successfully.",

      user:
        userResponse(admin),

      sessionsRevoked:
        true,
    });

  } catch (error) {
    return serverError(
      res,

      "Reactivate administrator error:",

      error
    );
  }
};

// ==========================================
// REMOVE ADMINISTRATIVE PRIVILEGES
//
// SUPER ADMIN ONLY
// ==========================================

const removeAdminRole = async (
  req,
  res
) => {
  try {
    const actor =
      requireAdministrativeRequest(
        req,

        true
      );

    const { adminId } =
      req.params;

    if (!isValidId(adminId)) {
      throw new AdminError(
        "Invalid administrator ID."
      );
    }

    preventSelfModification(
      actor._id,

      adminId
    );

    // ======================================
    // RUN ROLE CHANGE TRANSACTION
    // ======================================

    const user =
      await runAdminTransaction(
        async (session) => {
          const currentActor =
            await lockAdministrator(
              req,

              session,

              true
            );

          const admin =
            await User.findOne({
              _id: adminId,

              role: "admin",
            })

              .select(
                "_id role accountStatus tokenVersion"
              )

              .session(session);

          if (!admin) {
            throw new AdminError(
              "Administrator not found.",
              404
            );
          }

          // ==================================
          // REMOVE ADMIN ROLE
          //
          // Preserve existing account status.
          // Revoke all previously issued tokens.
          // ==================================

          return modifyAccount({
            target: admin,

            session,

            changes: {
              role:
                "listener",

              roleAssignedAt:
                new Date(),

              roleAssignedBy:
                currentActor._id,
            },
          });
        }
      );

    return res.status(200).json({
      success: true,

      message:
        "Admin privileges removed successfully.",

      user:
        userResponse(user),

      sessionsRevoked:
        true,
    });

  } catch (error) {
    return serverError(
      res,

      "Remove administrator role error:",

      error
    );
  }
};

// ==========================================
// DASHBOARD STATISTICS
//
// SUPER ADMIN ONLY
// ==========================================

const getDashboardStats = async (
  req,
  res
) => {
  try {
    requireAdministrativeRequest(
      req,

      true
    );

    const [
      userStatistics,

      totalSongs,

      totalReleases,

      totalVideos,

      publishedSongs,

      publishedReleases,

      publishedVideos,

      pendingArtists,

      approvedArtists,

      verifiedArtists,

      hiddenSongs,

      hiddenReleases,

      hiddenVideos,

      songStreamStatistics,

    ] = await Promise.all([
      // ====================================
      // USER STATISTICS
      // ====================================

      User.aggregate([
        {
          $group: {
            _id: null,

            totalUsers: {
              $sum: 1,
            },

            listeners: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$role",
                      "listener",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            artists: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$role",
                      "artist",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            distributors: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$role",
                      "distributor",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            admins: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$role",
                      "admin",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            superadmins: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$role",
                      "superadmin",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            activeUsers: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$accountStatus",
                      "active",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            suspendedUsers: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$accountStatus",
                      "suspended",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },

            disabledUsers: {
              $sum: {
                $cond: [
                  {
                    $eq: [
                      "$accountStatus",
                      "disabled",
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),

      // ====================================
      // ALL CONTENT
      // ====================================

      Song.countDocuments(),

      Release.countDocuments(),

      Video.countDocuments(),

      // ====================================
      // PUBLISHED CONTENT
      // ====================================

      Song.countDocuments({
        status: "approved",

        visibilityStatus: "visible",
      }),

      Release.countDocuments({
        status: "approved",

        visibilityStatus: "visible",
      }),

      Video.countDocuments({
        status: "approved",

        visibilityStatus: "visible",
      }),

      // ====================================
      // ARTIST STATISTICS
      // ====================================

      Artist.countDocuments({
        approvalStatus: "pending",
      }),

      Artist.countDocuments({
        approvalStatus: "approved",
      }),

      Artist.countDocuments({
        approvalStatus: "approved",

        verified: true,
      }),

      // ====================================
      // MODERATED CONTENT
      // ====================================

      Song.countDocuments({
        visibilityStatus: "hidden",
      }),

      Release.countDocuments({
        visibilityStatus: "hidden",
      }),

      Video.countDocuments({
        visibilityStatus: "hidden",
      }),

      // ====================================
      // RECORDED SONG STREAMS
      // ====================================

      Song.aggregate([
        {
          $group: {
            _id: null,

            totalStreams: {
              $sum: {
                $ifNull: [
                  "$playCount",

                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    // ======================================
    // DEFAULT EMPTY DATABASE STATISTICS
    // ======================================

    const users =
      userStatistics[0] || {
        totalUsers: 0,

        listeners: 0,

        artists: 0,

        distributors: 0,

        admins: 0,

        superadmins: 0,

        activeUsers: 0,

        suspendedUsers: 0,

        disabledUsers: 0,
      };

    // ======================================
    // DASHBOARD RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      stats: {
        totalUsers:
          users.totalUsers,

        listeners:
          users.listeners,

        artists:
          users.artists,

        distributors:
          users.distributors,

        admins:
          users.admins,

        superadmins:
          users.superadmins,

        activeUsers:
          users.activeUsers,

        suspendedUsers:
          users.suspendedUsers,

        disabledUsers:
          users.disabledUsers,

        totalSongs,

        totalReleases,

        totalVideos,

        publishedSongs,

        publishedReleases,

        publishedVideos,

        pendingArtists,

        approvedArtists,

        verifiedArtists,

        hiddenSongs,

        hiddenReleases,

        hiddenVideos,

        totalStreams:
          songStreamStatistics[0]
            ?.totalStreams || 0,
      },

      generatedAt:
        new Date(),
    });

  } catch (error) {
    return serverError(
      res,

      "Dashboard statistics error:",

      error
    );
  }
};

// ==========================================
// GET PLATFORM USERS
//
// ADMIN AND SUPER ADMIN
// ==========================================

const getUsers = async (
  req,
  res
) => {
  try {
    requireAdministrativeRequest(
      req
    );

    const pagination =
      getPagination(req.query);

    const filter =
      buildAccountFilter(
        req.query,

        platformRoles
      );

    // ======================================
    // GET MATCHING PLATFORM USERS
    // ======================================

    const [
      users,

      total,
    ] = await Promise.all([
      User.find(filter)

        .select(PUBLIC_USER_FIELDS)

        .sort({
          createdAt: -1,

          _id: -1,
        })

        .skip(pagination.skip)

        .limit(pagination.limit)

        .lean(),

      User.countDocuments(
        filter
      ),
    ]);

    return res.status(200).json({
      success: true,

      count: users.length,

      users:
        users.map(userResponse),

      pagination: {
        page:
          pagination.page,

        limit:
          pagination.limit,

        total,

        totalPages:
          Math.ceil(
            total / pagination.limit
          ),
      },
    });

  } catch (error) {
    return serverError(
      res,

      "Get platform users error:",

      error
    );
  }
};

// ==========================================
// SUSPEND PLATFORM USER
//
// ADMIN AND SUPER ADMIN
// ==========================================

const suspendUser = async (
  req,
  res
) => {
  try {
    const user =
      await changeAccountStatus({
        req,

        targetId:
          req.params.userId,

        allowedRoles:
          platformRoles,

        expectedStatus:
          "active",

        newStatus:
          "suspended",

        superAdminOnly:
          false,

        defaultReason:
          "Account suspended by platform administration.",
      });

    return res.status(200).json({
      success: true,

      message:
        "User suspended successfully.",

      user:
        userResponse(user),

      sessionsRevoked:
        true,
    });

  } catch (error) {
    return serverError(
      res,

      "Suspend platform user error:",

      error
    );
  }
};

// ==========================================
// REACTIVATE PLATFORM USER
//
// ADMIN AND SUPER ADMIN
// ==========================================

const reactivateUser = async (
  req,
  res
) => {
  try {
    const user =
      await changeAccountStatus({
        req,

        targetId:
          req.params.userId,

        allowedRoles:
          platformRoles,

        expectedStatus:
          "suspended",

        newStatus:
          "active",

        superAdminOnly:
          false,

        defaultReason:
          "Account reactivated by platform administration.",
      });

    return res.status(200).json({
      success: true,

      message:
        "User reactivated successfully.",

      user:
        userResponse(user),

      sessionsRevoked:
        true,
    });

  } catch (error) {
    return serverError(
      res,

      "Reactivate platform user error:",

      error
    );
  }
};

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

module.exports = {
  getAdmins,

  promoteToAdmin,

  suspendAdmin,

  reactivateAdmin,

  removeAdminRole,

  getDashboardStats,

  getUsers,

  suspendUser,

  reactivateUser,
};