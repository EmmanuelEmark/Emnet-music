const mongoose = require("mongoose");

const Report = require("../models/Report");
const User = require("../models/User");
const Artist = require("../models/Artist");
const Release = require("../models/Release");
const Song = require("../models/song");
const Video = require("../models/video");

const {
  recordAdminActivity,
} = require("../utils/adminActivityService");

const {
  ContentModerationError,
  moderatePlatformContent,
} = require("../utils/contentModerationService");

// ==========================================
// CONFIGURATION
// ==========================================

const ALLOWED_TARGET_TYPES = [
  "artist",
  "release",
  "song",
  "video",
];

const ALLOWED_REPORT_REASONS = [
  "copyright",
  "impersonation",
  "inappropriate_content",
  "spam",
  "misleading",
  "other",
];

const ALLOWED_REPORT_STATUSES = [
  "pending",
  "reviewing",
  "resolved",
  "dismissed",
];

const ACTIVE_REPORT_STATUSES = [
  "pending",
  "reviewing",
];

const ADMIN_ROLES = [
  "admin",
  "superadmin",
];

const REPORTER_ROLES = [
  "listener",
  "artist",
];

const CONTENT_MODELS = {
  artist: Artist,
  release: Release,
  song: Song,
  video: Video,
};

// ==========================================
// CUSTOM REPORT ERROR
// ==========================================

class ReportError extends Error {
  constructor(message, statusCode = 400) {
    super(message);

    this.name = "ReportError";
    this.statusCode = statusCode;
  }
}

// ==========================================
// PREVENT RESPONSE CACHING
// ==========================================

function preventCaching(res) {
  res.set(
    "Cache-Control",
    "private, no-store"
  );

  res.set(
    "Referrer-Policy",
    "no-referrer"
  );
}

// ==========================================
// VALIDATE MONGODB ID
// ==========================================

function isValidId(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{24}$/i.test(value)
  );
}

// ==========================================
// VALIDATE AND SANITIZE TEXT
// ==========================================

function getSafeText(
  value,
  fieldName,
  required = false,
  maxLength = 1000
) {
  if (
    value === undefined ||
    value === null
  ) {
    if (required) {
      throw new ReportError(
        `${fieldName} is required.`
      );
    }

    return "";
  }

  if (typeof value !== "string") {
    throw new ReportError(
      `${fieldName} must be text.`
    );
  }

  const text = value
    .replace(
      /[\u0000-\u001f\u007f]/g,
      " "
    )
    .trim();

  if (required && !text) {
    throw new ReportError(
      `${fieldName} is required.`
    );
  }

  if (text.length > maxLength) {
    throw new ReportError(
      `${fieldName} cannot exceed ${maxLength} characters.`
    );
  }

  return text;
}

// ==========================================
// CENTRALIZED ERROR HANDLING
// ==========================================

function sendError(
  res,
  error,
  context
) {
  preventCaching(res);

  // Expected report errors.

  if (
    error instanceof ReportError ||
    error instanceof ContentModerationError
  ) {
    return res
      .status(error.statusCode)
      .json({
        success: false,
        message: error.message,
      });
  }

  // Duplicate active report.

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,

      message:
        "A conflicting or duplicate record already exists.",
    });
  }

  // Unknown transaction commit result.

  if (
    error.hasErrorLabel?.(
      "UnknownTransactionCommitResult"
    )
  ) {
    return res.status(503).json({
      success: false,

      message:
        "The operation result could not be confirmed. Refresh the report information before retrying.",
    });
  }

  // Concurrent database operations.

  if (
    error.code === 112 ||

    error.name === "VersionError" ||

    error.hasErrorLabel?.(
      "TransientTransactionError"
    )
  ) {
    return res.status(409).json({
      success: false,

      message:
        "The report changed during this operation. Refresh and try again.",
    });
  }

  // Invalid data.

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,

      message:
        "Invalid report information.",
    });
  }

  // Unexpected server error.

  console.error(
    context,
    error.name,
    error.code || "",
    error.message
  );

  return res.status(500).json({
    success: false,

    message:
      "Unable to complete the report operation.",
  });
}

// ==========================================
// REQUIRE AUTHENTICATED USER
// ==========================================

function requireAuthenticatedUser(
  req,
  allowedRoles
) {
  if (
    !req.user?._id ||
    !req.auth
  ) {
    throw new ReportError(
      "Authentication required.",
      401
    );
  }

  if (
    !allowedRoles.includes(
      req.user.role
    )
  ) {
    throw new ReportError(
      "You do not have permission to perform this operation.",
      403
    );
  }

  if (
    req.user.accountStatus !==
    "active"
  ) {
    throw new ReportError(
      "This account is unavailable.",
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
    throw new ReportError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// REQUIRE ADMINISTRATOR
// ==========================================

function requireAdministrator(req) {
  const administrator =
    requireAuthenticatedUser(
      req,
      ADMIN_ROLES
    );

  if (
    administrator.emailVerified !== true
  ) {
    throw new ReportError(
      "Verified administrative access is required.",
      403
    );
  }

  return administrator;
}

// ==========================================
// RUN DATABASE TRANSACTION
// ==========================================

async function runTransaction(
  operation
) {
  const session =
    await mongoose.startSession();

  let result;

  try {
    await session.withTransaction(
      async () => {
        result = await operation(session);
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
// BUILD AUTHENTICATED ACCOUNT FILTER
// ==========================================

function buildAccountFilter(req) {
  const version =
    req.auth.tokenVersion;

  const filter = {
    _id: req.user._id,

    role: req.user.role,

    accountStatus: "active",
  };

  // Support existing legacy accounts.

  if (version === 0) {
    filter.$or = [
      {
        tokenVersion: 0,
      },

      {
        tokenVersion: null,
      },

      {
        tokenVersion: {
          $exists: false,
        },
      },
    ];

  } else {
    filter.tokenVersion = version;
  }

  return filter;
}

// ==========================================
// LOCK REPORTER ACCOUNT
//
// Serialize simultaneous report submissions
// from the same user.
//
// This helps prevent duplicate active reports
// even before the unique index is enabled.
// ==========================================

async function lockReporter(
  req,
  session
) {
  requireAuthenticatedUser(
    req,
    REPORTER_ROLES
  );

  const reporter =
    await User.findOneAndUpdate(
      buildAccountFilter(req),

      {
        $inc: {
          __v: 1,
        },
      },

      {
        new: true,

        session,

        runValidators: true,

        timestamps: false,
      }
    ).select(
      "_id fullName role accountStatus"
    );

  if (!reporter) {
    throw new ReportError(
      "Your account or authentication session has changed.",
      403
    );
  }

  return reporter;
}

// ==========================================
// LOCK ADMINISTRATOR ACCOUNT
//
// Revalidate administrative permissions
// inside the database transaction.
// ==========================================

async function lockAdministrator(
  req,
  session
) {
  requireAdministrator(req);

  const filter =
    buildAccountFilter(req);

  filter.emailVerified = true;

  const administrator =
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

        timestamps: false,
      }
    ).select(
      "_id fullName role accountStatus emailVerified tokenVersion"
    );

  if (!administrator) {
    throw new ReportError(
      "Your administrative permissions or session have changed.",
      403
    );
  }

  return administrator;
}

// ==========================================
// PUBLIC VISIBILITY FILTER
//
// Supports older records without an
// explicit visibility status.
// ==========================================

function publicVisibilityFilter() {
  return {
    $or: [
      {
        visibilityStatus: "visible",
      },

      {
        visibilityStatus: {
          $exists: false,
        },
      },

      {
        visibilityStatus: null,
      },
    ],
  };
}

// ==========================================
// FIND REPORTABLE PUBLIC CONTENT
//
// Prevent ordinary users from reporting
// inaccessible private artist drafts.
// ==========================================

async function findReportableContent(
  targetType,
  targetId,
  session
) {
  const Model =
    CONTENT_MODELS[targetType];

  if (!Model) {
    throw new ReportError(
      "Invalid report target type."
    );
  }

  // ========================================
  // ARTIST REPORT
  // ========================================

  if (targetType === "artist") {
    return Artist.findOne({
      _id: targetId,

      approvalStatus: "approved",

      ...publicVisibilityFilter(),
    })
      .select("_id")
      .session(session)
      .lean();
  }

  // ========================================
  // SONG REPORT
  //
  // Both the song and its parent release
  // must be publicly available.
  // ========================================

  if (targetType === "song") {
    const song =
      await Song.findOne({
        _id: targetId,

        status: "approved",

        ...publicVisibilityFilter(),
      })
        .select("_id releaseId")
        .session(session)
        .lean();

    if (!song || !song.releaseId) {
      return null;
    }

    const release =
      await Release.findOne({
        _id: song.releaseId,

        status: "approved",

        ...publicVisibilityFilter(),
      })
        .select("_id")
        .session(session)
        .lean();

    if (!release) {
      return null;
    }

    return song;
  }

  // ========================================
  // RELEASE AND VIDEO REPORTS
  // ========================================

  return Model.findOne({
    _id: targetId,

    status: "approved",

    ...publicVisibilityFilter(),
  })
    .select("_id")
    .session(session)
    .lean();
}

// ==========================================
// CREATE REPORT ACTIVITY SNAPSHOT
// ==========================================

function reportSnapshot(report) {
  return {
    status: report.status,
  };
}

// ==========================================
// CREATE REPORT
//
// ACCESS:
// - Listener
// - Artist
//
// POST /api/reports
// ==========================================

const createReport =
  async (req, res) => {
    try {
      preventCaching(res);

      requireAuthenticatedUser(
        req,
        REPORTER_ROLES
      );

      const {
        targetType,
        targetId,
        reason,
        description,
      } = req.body || {};

      // ====================================
      // VALIDATE TARGET TYPE
      // ====================================

      if (
        !ALLOWED_TARGET_TYPES.includes(
          targetType
        )
      ) {
        throw new ReportError(
          "Invalid report target type."
        );
      }

      // ====================================
      // VALIDATE TARGET ID
      // ====================================

      if (!isValidId(targetId)) {
        throw new ReportError(
          "Invalid report target ID."
        );
      }

      // ====================================
      // VALIDATE REPORT REASON
      // ====================================

      if (
        !ALLOWED_REPORT_REASONS.includes(
          reason
        )
      ) {
        throw new ReportError(
          "Invalid report reason."
        );
      }

      const cleanDescription =
        getSafeText(
          description,
          "Report description"
        );

      // ====================================
      // START REPORT TRANSACTION
      // ====================================

      const report =
        await runTransaction(
          async (session) => {
            const reporter =
              await lockReporter(
                req,
                session
              );

            // ==============================
            // CHECK TARGET AVAILABILITY
            // ==============================

            const target =
              await findReportableContent(
                targetType,
                targetId,
                session
              );

            if (!target) {
              throw new ReportError(
                "Reported content was not found or is unavailable.",
                404
              );
            }

            // ==============================
            // PREVENT DUPLICATE REPORT
            // ==============================

            const existingReport =
              await Report.findOne({
                reportedBy:
                  reporter._id,

                targetType,

                targetId,

                status: {
                  $in:
                    ACTIVE_REPORT_STATUSES,
                },
              })
                .select("_id")
                .session(session)
                .lean();

            if (existingReport) {
              throw new ReportError(
                "You already have an active report for this content.",
                400
              );
            }

            // ==============================
            // CREATE REPORT
            // ==============================

            const newReport =
              new Report({
                reportedBy:
                  reporter._id,

                targetType,

                targetId,

                reason,

                description:
                  cleanDescription,

                status:
                  "pending",

                reviewedBy:
                  null,

                reviewedAt:
                  null,

                resolutionReason:
                  "",

                closedAt:
                  null,
              });

            await newReport.save({
              session,
            });

            return newReport;
          }
        );

      return res.status(201).json({
        success: true,

        message:
          "Report submitted successfully.",

        report,
      });

    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,

          message:
            "You already have an active report for this content.",
        });
      }

      return sendError(
        res,
        error,
        "Create report error:"
      );
    }
  };

// ==========================================
// VALIDATE PAGINATION
// ==========================================

function getPositiveInteger(
  value,
  defaultValue,
  maxValue,
  fieldName
) {
  if (value === undefined) {
    return defaultValue;
  }

  if (
    typeof value !== "string" ||
    !/^\d+$/.test(value)
  ) {
    throw new ReportError(
      `${fieldName} must be a positive integer.`
    );
  }

  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > maxValue
  ) {
    throw new ReportError(
      `${fieldName} must be between 1 and ${maxValue}.`
    );
  }

  return number;
}

// ==========================================
// GET REPORTS
//
// ACCESS:
// - Admin
// - Super Admin
//
// GET /api/reports
// ==========================================

const getReports =
  async (req, res) => {
    try {
      preventCaching(res);

      requireAdministrator(req);

      const {
        status,
        targetType,
        reason,
        targetId,
        reportedBy,
        reviewedBy,
      } = req.query;

      // ====================================
      // BUILD REPORT FILTER
      // ====================================

      const filter = {};

      if (
        status !== undefined &&
        status !== "all"
      ) {
        if (
          !ALLOWED_REPORT_STATUSES.includes(
            status
          )
        ) {
          throw new ReportError(
            "Invalid report status."
          );
        }

        filter.status = status;
      }

      if (
        targetType !== undefined &&
        targetType !== "all"
      ) {
        if (
          !ALLOWED_TARGET_TYPES.includes(
            targetType
          )
        ) {
          throw new ReportError(
            "Invalid report target type."
          );
        }

        filter.targetType =
          targetType;
      }

      if (
        reason !== undefined &&
        reason !== "all"
      ) {
        if (
          !ALLOWED_REPORT_REASONS.includes(
            reason
          )
        ) {
          throw new ReportError(
            "Invalid report reason."
          );
        }

        filter.reason = reason;
      }

      // ====================================
      // FILTER BY CONTENT ID
      // ====================================

      if (targetId !== undefined) {
        if (!isValidId(targetId)) {
          throw new ReportError(
            "Invalid target ID."
          );
        }

        filter.targetId = targetId;
      }

      // ====================================
      // FILTER BY REPORTER
      // ====================================

      if (reportedBy !== undefined) {
        if (!isValidId(reportedBy)) {
          throw new ReportError(
            "Invalid reporter ID."
          );
        }

        filter.reportedBy =
          reportedBy;
      }

      // ====================================
      // FILTER BY ADMINISTRATOR
      // ====================================

      if (reviewedBy !== undefined) {
        if (!isValidId(reviewedBy)) {
          throw new ReportError(
            "Invalid reviewer ID."
          );
        }

        filter.reviewedBy =
          reviewedBy;
      }

      // ====================================
      // PAGINATION
      // ====================================

      const page =
        getPositiveInteger(
          req.query.page,
          1,
          100000,
          "Page"
        );

      const limit =
        getPositiveInteger(
          req.query.limit,
          50,
          100,
          "Limit"
        );

      const skip =
        (page - 1) * limit;

      // ====================================
      // FETCH REPORTS AND TOTAL COUNT
      // ====================================

      const [
        reports,
        totalReports,
      ] = await Promise.all([
        Report.find(filter)
          .populate(
            "reportedBy",
            "fullName email role"
          )
          .populate(
            "reviewedBy",
            "fullName email role"
          )
          .sort({
            createdAt: -1,
            _id: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),

        Report.countDocuments(
          filter
        ),
      ]);

      const totalPages =
        Math.ceil(
          totalReports / limit
        );

      return res.status(200).json({
        success: true,

        count:
          reports.length,

        totalReports,

        page,

        limit,

        totalPages,

        hasNextPage:
          page < totalPages,

        hasPreviousPage:
          page > 1,

        reports,
      });

    } catch (error) {
      return sendError(
        res,
        error,
        "Get reports error:"
      );
    }
  };

// ==========================================
// MARK REPORT AS REVIEWING
//
// ACCESS:
// - Admin
// - Super Admin
//
// PATCH /api/reports/:reportId/review
// ==========================================

const markReportReviewing =
  async (req, res) => {
    try {
      preventCaching(res);

      requireAdministrator(req);

      const { reportId } =
        req.params;

      if (!isValidId(reportId)) {
        throw new ReportError(
          "Invalid report ID."
        );
      }

      const reason =
        getSafeText(
          req.body?.reason,
          "Review reason"
        ) ||
        "Report investigation started.";

      // ====================================
      // START REVIEW TRANSACTION
      // ====================================

      const result =
        await runTransaction(
          async (session) => {
            const administrator =
              await lockAdministrator(
                req,
                session
              );

            // ==============================
            // FIND REPORT
            // ==============================

            const report =
              await Report.findById(
                reportId
              )
                .session(session)
                .lean();

            if (!report) {
              throw new ReportError(
                "Report not found.",
                404
              );
            }

            // ==============================
            // PREVENT DUPLICATE REVIEW
            // ==============================

            if (
              report.status ===
              "reviewing"
            ) {
              return {
                report,

                alreadyUpdated:
                  true,
              };
            }

            if (
              report.status !==
              "pending"
            ) {
              throw new ReportError(
                "Only pending reports can be moved to reviewing.",
                409
              );
            }

            // ==============================
            // UPDATE REPORT STATUS
            // ==============================

            const updatedReport =
              await Report.findOneAndUpdate(
                {
                  _id: report._id,

                  status:
                    "pending",
                },

                {
                  $set: {
                    status:
                      "reviewing",

                    reviewedBy:
                      administrator._id,

                    reviewedAt:
                      new Date(),
                  },

                  $inc: {
                    __v: 1,
                  },
                },

                {
                  new: true,

                  session,

                  runValidators: true,
                }
              );

            if (!updatedReport) {
              throw new ReportError(
                "The report status changed. Refresh and try again.",
                409
              );
            }

            // ==============================
            // RECORD ADMIN ACTIVITY
            // ==============================

            await recordAdminActivity({
              req,

              actor:
                administrator,

              action:
                "report_reviewing",

              targetType:
                "report",

              targetId:
                updatedReport._id,

              targetName:
                `${report.targetType} report`,

              previousValues:
                reportSnapshot(report),

              newValues:
                reportSnapshot(
                  updatedReport
                ),

              reason,

              outcome:
                "success",

              session,
            });

            return {
              report:
                updatedReport,

              alreadyUpdated:
                false,
            };
          }
        );

      return res.status(200).json({
        success: true,

        message:
          result.alreadyUpdated
            ? "This report is already under review."
            : "Report is now under review.",

        report:
          result.report,

        alreadyUpdated:
          result.alreadyUpdated,
      });

    } catch (error) {
      return sendError(
        res,
        error,
        "Mark report reviewing error:"
      );
    }
  };

// ==========================================
// CLOSE REPORT
//
// ACCESS:
// - Admin
// - Super Admin
//
// PATCH /api/reports/:reportId/close
//
// Supported decisions:
// - resolved
// - dismissed
//
// Closing a report does NOT automatically
// change content visibility.
// ==========================================

const closeReport =
  async (req, res) => {
    try {
      preventCaching(res);

      requireAdministrator(req);

      const { reportId } =
        req.params;

      const {
        decision,
        reason,
        resolutionReason,
      } = req.body || {};

      // ====================================
      // VALIDATE REPORT ID
      // ====================================

      if (!isValidId(reportId)) {
        throw new ReportError(
          "Invalid report ID."
        );
      }

      // ====================================
      // VALIDATE DECISION
      // ====================================

      if (
        !["resolved", "dismissed"].includes(
          decision
        )
      ) {
        throw new ReportError(
          "Decision must be resolved or dismissed."
        );
      }

      // ====================================
      // REQUIRE RESOLUTION REASON
      // ====================================

      const cleanReason =
        getSafeText(
          resolutionReason ?? reason,

          "Resolution reason",

          true
        );

      // ====================================
      // START REPORT CLOSURE TRANSACTION
      // ====================================

      const result =
        await runTransaction(
          async (session) => {
            const administrator =
              await lockAdministrator(
                req,
                session
              );

            // ==============================
            // FIND REPORT
            // ==============================

            const report =
              await Report.findById(
                reportId
              )
                .session(session)
                .lean();

            if (!report) {
              throw new ReportError(
                "Report not found.",
                404
              );
            }

            // ==============================
            // PREVENT DUPLICATE CLOSURE
            // ==============================

            if (
              report.status ===
              decision
            ) {
              return {
                report,

                alreadyUpdated:
                  true,
              };
            }

            // ==============================
            // VALIDATE CURRENT STATUS
            // ==============================

            if (
              !ACTIVE_REPORT_STATUSES.includes(
                report.status
              )
            ) {
              throw new ReportError(
                "This report has already been closed.",
                409
              );
            }

            const now =
              new Date();

            // ==============================
            // CLOSE REPORT
            // ==============================

            const updatedReport =
              await Report.findOneAndUpdate(
                {
                  _id:
                    report._id,

                  status:
                    report.status,
                },

                {
                  $set: {
                    status:
                      decision,

                    reviewedBy:
                      administrator._id,

                    reviewedAt:
                      now,

                    resolutionReason:
                      cleanReason,

                    closedAt:
                      now,
                  },

                  $inc: {
                    __v: 1,
                  },
                },

                {
                  new: true,

                  session,

                  runValidators: true,
                }
              );

            if (!updatedReport) {
              throw new ReportError(
                "The report status changed. Refresh and try again.",
                409
              );
            }

            // ==============================
            // RECORD ADMIN ACTIVITY
            // ==============================

            await recordAdminActivity({
              req,

              actor:
                administrator,

              action:
                decision === "resolved"
                  ? "report_resolved"
                  : "report_dismissed",

              targetType:
                "report",

              targetId:
                updatedReport._id,

              targetName:
                `${report.targetType} report`,

              previousValues:
                reportSnapshot(report),

              newValues:
                reportSnapshot(
                  updatedReport
                ),

              reason:
                cleanReason,

              outcome:
                "success",

              session,
            });

            return {
              report:
                updatedReport,

              alreadyUpdated:
                false,
            };
          }
        );

      return res.status(200).json({
        success: true,

        message:
          result.alreadyUpdated
            ? `This report is already ${decision}.`
            : decision === "resolved"
              ? "Report resolved successfully."
              : "Report dismissed successfully.",

        report:
          result.report,

        alreadyUpdated:
          result.alreadyUpdated,
      });

    } catch (error) {
      return sendError(
        res,
        error,
        "Close report error:"
      );
    }
  };

// ==========================================
// NORMALIZE MODERATION ACTION
//
// Preserve compatibility with the old
// report moderation endpoint.
//
// Old:
// visible
// hidden
// takedown
//
// New:
// restore
// hide
// takedown
// reverse-takedown
// ==========================================

function normalizeModerationAction(action) {
  switch (action) {
    case "visible":
    case "restore":
      return "restore";

    case "hidden":
    case "hide":
      return "hide";

    case "takedown":
      return "takedown";

    case "reverse-takedown":
      return "reverse-takedown";

    default:
      throw new ReportError(
        "Invalid moderation action. Supported actions are hide, restore, takedown and reverse-takedown."
      );
  }
}

// ==========================================
// MODERATE REPORTED CONTENT
//
// PATCH /api/reports/moderate/
//       :targetType/:targetId
//
// All visibility operations must use
// the centralized moderation service.
//
// This prevents administrators from
// bypassing copyright takedown restrictions.
// ==========================================

const moderateContent =
  async (req, res) => {
    try {
      preventCaching(res);

      const administrator =
        requireAdministrator(req);

      const {
        targetType,
        targetId,
      } = req.params;

      const {
        action,
        reason,
      } = req.body || {};

      // ====================================
      // VALIDATE CONTENT TYPE
      // ====================================

      if (
        !ALLOWED_TARGET_TYPES.includes(
          targetType
        )
      ) {
        throw new ReportError(
          "Invalid content type."
        );
      }

      // ====================================
      // VALIDATE CONTENT ID
      // ====================================

      if (!isValidId(targetId)) {
        throw new ReportError(
          "Invalid content ID."
        );
      }

      // ====================================
      // NORMALIZE ACTION
      // ====================================

      const normalizedAction =
        normalizeModerationAction(
          action
        );

      // ====================================
      // SUPER ADMIN TAKEDOWN PROTECTION
      // ====================================

      if (
        normalizedAction ===
          "reverse-takedown" &&

        administrator.role !==
          "superadmin"
      ) {
        throw new ReportError(
          "Only a Super Admin can reverse a takedown.",
          403
        );
      }

      // ====================================
      // VALIDATE MODERATION REASON
      // ====================================

      const cleanReason =
        getSafeText(
          reason,

          "Moderation reason",

          true
        );

      // ====================================
      // EXECUTE CENTRALIZED MODERATION
      //
      // Never update visibilityStatus
      // directly in this controller.
      // ====================================

      const result =
        await moderatePlatformContent({
          req,

          targetType,

          targetId,

          action:
            normalizedAction,

          reason:
            cleanReason,
        });

      return res.status(200).json({
        ...result,

        [targetType]:
          result.content,
      });

    } catch (error) {
      return sendError(
        res,
        error,
        "Report content moderation error:"
      );
    }
  };

// ==========================================
// EXPORT REPORT CONTROLLERS
// ==========================================

module.exports = {
  createReport,

  getReports,

  markReportReviewing,

  closeReport,

  moderateContent,
};