const mongoose = require("mongoose");

const User = require("../models/User");
const Artist = require("../models/Artist");
const Song = require("../models/song");
const Release = require("../models/Release");
const Video = require("../models/video");

const {
  recordAdminActivity,
} = require("./adminActivityService");

// ==========================================
// CONFIGURATION
// ==========================================

const CONTENT_MODELS = {
  artist: Artist,
  song: Song,
  release: Release,
  video: Video,
};

const ALLOWED_TARGET_TYPES = [
  "artist",
  "song",
  "release",
  "video",
];

const ALLOWED_ACTIONS = [
  "hide",
  "restore",
  "takedown",
  "reverse-takedown",
];

const ADMINISTRATIVE_ROLES = [
  "admin",
  "superadmin",
];

const VISIBILITY_STATUSES = [
  "visible",
  "hidden",
  "takedown",
];

// ==========================================
// CUSTOM MODERATION ERROR
// ==========================================

class ContentModerationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);

    this.name = "ContentModerationError";
    this.statusCode = statusCode;
    this.status = statusCode;
  }
}

// ==========================================
// VALIDATE MONGODB OBJECT ID
// ==========================================

function isValidId(value) {
  if (
    typeof value !== "string" &&
    !(value instanceof mongoose.Types.ObjectId)
  ) {
    return false;
  }

  return /^[a-f0-9]{24}$/i.test(
    String(value)
  );
}

// ==========================================
// VALIDATE CONTENT TYPE
// ==========================================

function validateTargetType(targetType) {
  if (
    !ALLOWED_TARGET_TYPES.includes(targetType)
  ) {
    throw new ContentModerationError(
      "Invalid content target type.",
      400
    );
  }

  return targetType;
}

// ==========================================
// VALIDATE MODERATION ACTION
// ==========================================

function validateAction(action) {
  if (!ALLOWED_ACTIONS.includes(action)) {
    throw new ContentModerationError(
      "Invalid moderation action.",
      400
    );
  }

  return action;
}

// ==========================================
// VALIDATE MODERATION REASON
//
// Every administrative content moderation
// operation requires a reason.
// ==========================================

function validateReason(reason) {
  if (typeof reason !== "string") {
    throw new ContentModerationError(
      "A moderation reason is required.",
      400
    );
  }

  const cleanReason = reason
    .replace(
      /[\u0000-\u001f\u007f]/g,
      " "
    )
    .trim();

  if (!cleanReason) {
    throw new ContentModerationError(
      "A moderation reason is required.",
      400
    );
  }

  if (cleanReason.length > 1000) {
    throw new ContentModerationError(
      "Moderation reason cannot exceed 1000 characters.",
      400
    );
  }

  return cleanReason;
}

// ==========================================
// VERIFY AUTHENTICATED ADMINISTRATOR
// ==========================================

function requireAdministrator(req) {
  if (!req?.user?._id || !req.auth) {
    throw new ContentModerationError(
      "Authentication is required.",
      401
    );
  }

  if (
    !ADMINISTRATIVE_ROLES.includes(
      req.user.role
    )
  ) {
    throw new ContentModerationError(
      "Administrative access is required.",
      403
    );
  }

  if (
    req.user.accountStatus !== "active"
  ) {
    throw new ContentModerationError(
      "Your administrative account is unavailable.",
      403
    );
  }

  if (req.user.emailVerified !== true) {
    throw new ContentModerationError(
      "Verified administrative access is required.",
      403
    );
  }

  // Verify authentication session.

  if (
    String(req.auth.userId) !==
      String(req.user._id) ||

    req.auth.role !== req.user.role ||

    !Number.isSafeInteger(
      req.auth.tokenVersion
    ) ||

    req.auth.tokenVersion < 0
  ) {
    throw new ContentModerationError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// VERIFY ADMINISTRATIVE PERMISSIONS
//
// Admin and Super Admin can:
// - Hide content.
// - Restore hidden content.
// - Take down content.
//
// Only Super Admin can:
// - Reverse a takedown.
// ==========================================

function validateActionPermission(
  administrator,
  action
) {
  if (
    action === "reverse-takedown" &&
    administrator.role !== "superadmin"
  ) {
    throw new ContentModerationError(
      "Only a Super Admin can reverse a content takedown.",
      403
    );
  }
}

// ==========================================
// LOCK ADMINISTRATOR ACCOUNT
//
// Recheck the administrator's permissions
// inside the database transaction.
//
// Prevent suspended or unauthorized
// administrators from modifying content.
// ==========================================

async function lockModeratorAccount(
  req,
  session
) {
  const administrator =
    requireAdministrator(req);

  const tokenVersion =
    req.auth.tokenVersion;

  const filter = {
    _id: administrator._id,

    role: administrator.role,

    accountStatus: "active",

    emailVerified: true,
  };

  // Support older user accounts.

  if (tokenVersion === 0) {
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
    filter.tokenVersion =
      tokenVersion;
  }

  const lockedAdministrator =
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

        timestamps: false,
      }
    )
      .select(
        "_id fullName role accountStatus emailVerified tokenVersion"
      )
      .lean();

  if (!lockedAdministrator) {
    throw new ContentModerationError(
      "Your administrative permissions or authentication session have changed.",
      403
    );
  }

  return lockedAdministrator;
}

// ==========================================
// NORMALIZE VISIBILITY STATUS
//
// Older MongoDB records without an explicit
// visibility status are treated as visible.
// ==========================================

function getVisibilityStatus(content) {
  const status =
    content.visibilityStatus;

  if (
    status === undefined ||
    status === null
  ) {
    return "visible";
  }

  if (!VISIBILITY_STATUSES.includes(status)) {
    throw new ContentModerationError(
      "This content has an invalid visibility status and requires manual review.",
      409
    );
  }

  return status;
}

// ==========================================
// VERIFY CONTENT ELIGIBILITY
//
// Draft, pending and rejected content
// cannot be moderated through published
// content moderation endpoints.
// ==========================================

function validateContentEligibility(
  targetType,
  content
) {
  if (targetType === "artist") {
    if (
      ![
        "approved",
        "suspended",
      ].includes(
        content.approvalStatus
      )
    ) {
      throw new ContentModerationError(
        "Only approved or suspended artist profiles can be moderated through this endpoint.",
        409
      );
    }

    return;
  }

  if (content.status !== "approved") {
    throw new ContentModerationError(
      "Only published content can be moderated through this endpoint.",
      409
    );
  }
}

// ==========================================
// DETERMINE NEXT VISIBILITY STATUS
//
// visible -> hidden
// hidden -> visible
// visible -> takedown
// hidden -> takedown
// takedown -> hidden (Super Admin only)
// ==========================================

function determineNextVisibility(
  currentStatus,
  action
) {
  // ========================================
  // HIDE CONTENT
  // ========================================

  if (action === "hide") {
    if (currentStatus === "takedown") {
      throw new ContentModerationError(
        "Content under takedown cannot be changed to hidden through this action.",
        403
      );
    }

    return "hidden";
  }

  // ========================================
  // RESTORE HIDDEN CONTENT
  // ========================================

  if (action === "restore") {
    if (currentStatus === "takedown") {
      throw new ContentModerationError(
        "Content under takedown must first be reversed by a Super Admin.",
        403
      );
    }

    return "visible";
  }

  // ========================================
  // CONTENT TAKEDOWN
  // ========================================

  if (action === "takedown") {
    return "takedown";
  }

  // ========================================
  // REVERSE CONTENT TAKEDOWN
  //
  // Reversal changes the status to hidden.
  // It does not immediately publish content.
  // ========================================

  if (action === "reverse-takedown") {
    if (currentStatus !== "takedown") {
      throw new ContentModerationError(
        "This content is not currently under takedown.",
        409
      );
    }

    return "hidden";
  }

  throw new ContentModerationError(
    "Unsupported moderation action.",
    400
  );
}

// ==========================================
// GET CONTENT DISPLAY NAME
// ==========================================

function getContentName(
  targetType,
  content
) {
  if (targetType === "artist") {
    return (
      content.stageName ||
      "Unknown artist"
    );
  }

  return (
    content.title ||
    `Untitled ${targetType}`
  );
}

// ==========================================
// CREATE ADMINISTRATIVE ACTIVITY SNAPSHOT
//
// Record administrative changes without
// exposing unnecessary media information.
// ==========================================

function createContentSnapshot(
  targetType,
  content
) {
  const snapshot = {
    visibilityStatus:
      getVisibilityStatus(content),
  };

  if (targetType === "artist") {
    snapshot.approvalStatus =
      content.approvalStatus;

    snapshot.verified =
      Boolean(content.verified);

    snapshot.featured =
      Boolean(content.featured);

  } else {
    snapshot.status =
      content.status;
  }

  return snapshot;
}

// ==========================================
// GET ADMINISTRATIVE ACTIVITY ACTION
//
// Matches the action names defined
// in the AdminActivity model.
// ==========================================

function getActivityAction(
  targetType,
  action
) {
  if (action === "hide") {
    return `${targetType}_hidden`;
  }

  if (action === "restore") {
    if (targetType === "artist") {
      return "artist_unhidden";
    }

    return `${targetType}_restored`;
  }

  if (action === "takedown") {
    return `${targetType}_takedown`;
  }

  if (action === "reverse-takedown") {
    return `${targetType}_takedown_reversed`;
  }

  throw new ContentModerationError(
    "Invalid administrative activity action.",
    400
  );
}

// ==========================================
// GET SUCCESS MESSAGE
// ==========================================

function getSuccessMessage(
  targetType,
  action
) {
  const label =
    targetType === "artist"
      ? "Artist profile"
      : targetType.charAt(0).toUpperCase() +
        targetType.slice(1);

  switch (action) {
    case "hide":
      return `${label} hidden successfully.`;

    case "restore":
      return `${label} restored successfully.`;

    case "takedown":
      return `${label} taken down successfully.`;

    case "reverse-takedown":
      return `${label} takedown reversed successfully. The content remains hidden.`;

    default:
      return "Content moderated successfully.";
  }
}

// ==========================================
// BUILD CONDITIONAL CONTENT UPDATE FILTER
//
// Prevent moderation from overwriting
// changes made by another request.
// ==========================================

function buildContentUpdateFilter(
  targetType,
  content
) {
  const filter = {
    _id: content._id,
  };

  // Verify approval or publication status.

  if (targetType === "artist") {
    filter.approvalStatus =
      content.approvalStatus;

  } else {
    filter.status =
      content.status;
  }

  // Verify existing visibility status.

  if (
    content.visibilityStatus === undefined
  ) {
    filter.visibilityStatus = {
      $exists: false,
    };

  } else if (
    content.visibilityStatus === null
  ) {
    filter.visibilityStatus = {
      $type: "null",
    };

  } else {
    filter.visibilityStatus =
      content.visibilityStatus;
  }

  // Verify document version.

  if (content.__v === undefined) {
    filter.__v = {
      $exists: false,
    };

  } else {
    filter.__v =
      content.__v;
  }

  // Verify last modification time.

  if (content.updatedAt === undefined) {
    filter.updatedAt = {
      $exists: false,
    };

  } else {
    filter.updatedAt =
      content.updatedAt;
  }

  return filter;
}

// ==========================================
// BUILD MODERATION UPDATE
//
// Moderation changes content visibility.
//
// It does not delete:
// - Songs.
// - Music videos.
// - Releases.
// - Artist accounts.
// - Cloudflare R2 files.
// - Listening history.
// - Likes.
// - Followers.
// - Play counts.
// - View counts.
// ==========================================

function buildModerationUpdate({
  targetType,

  nextStatus,

  reason,

  administrator,
}) {
  const changes = {
    visibilityStatus:
      nextStatus,

    moderationReason:
      nextStatus === "visible"
        ? ""
        : reason,

    moderatedBy:
      administrator._id,

    moderatedAt:
      new Date(),
  };

  // Restricted artist profiles must not
  // remain featured on the homepage.

  if (
    targetType === "artist" &&

    nextStatus !== "visible"
  ) {
    changes.featured =
      false;
  }

  return changes;
}

// ==========================================
// CENTRALIZED CONTENT MODERATION SERVICE
//
// Shared by:
// - moderationController.js
// - reportController.js
//
// Supports:
// - Artist profile moderation.
// - Song moderation.
// - Release moderation.
// - Video moderation.
//
// Every successful content modification
// and administrative activity record is
// committed in the same transaction.
// ==========================================

async function moderatePlatformContent({
  req,

  targetType,

  targetId,

  action,

  reason,
}) {
  // ========================================
  // VERIFY ADMINISTRATOR
  // ========================================

  const administrator =
    requireAdministrator(req);

  // ========================================
  // VALIDATE REQUEST INFORMATION
  // ========================================

  const validatedTargetType =
    validateTargetType(
      targetType
    );

  const validatedAction =
    validateAction(
      action
    );

  const validatedReason =
    validateReason(
      reason
    );

  if (!isValidId(targetId)) {
    throw new ContentModerationError(
      "Invalid content ID.",
      400
    );
  }

  // ========================================
  // VERIFY MODERATION PERMISSIONS
  // ========================================

  validateActionPermission(
    administrator,
    validatedAction
  );

  // ========================================
  // SELECT CONTENT MODEL
  // ========================================

  const Model =
    CONTENT_MODELS[
      validatedTargetType
    ];

  // ========================================
  // START DATABASE SESSION
  // ========================================

  const session =
    await mongoose.startSession();

  let result;

  try {
    // ======================================
    // START ATOMIC MODERATION TRANSACTION
    // ======================================

    await session.withTransaction(
      async () => {
        // ==================================
        // RECHECK ADMINISTRATOR PERMISSIONS
        // ==================================

        const lockedAdministrator =
          await lockModeratorAccount(
            req,
            session
          );

        validateActionPermission(
          lockedAdministrator,

          validatedAction
        );

        // ==================================
        // FIND TARGET CONTENT
        // ==================================

        const content =
          await Model.findById(
            targetId
          )
            .session(session)
            .lean();

        if (!content) {
          throw new ContentModerationError(
            `${validatedTargetType} not found.`,
            404
          );
        }

        // ==================================
        // VERIFY CONTENT ELIGIBILITY
        // ==================================

        validateContentEligibility(
          validatedTargetType,

          content
        );

        // ==================================
        // GET CURRENT VISIBILITY
        // ==================================

        const currentStatus =
          getVisibilityStatus(
            content
          );

        // ==================================
        // DETERMINE NEXT VISIBILITY
        // ==================================

        const nextStatus =
          determineNextVisibility(
            currentStatus,

            validatedAction
          );

        // ==================================
        // HANDLE REPEATED MODERATION ACTION
        //
        // Avoid duplicate administrative
        // records when nothing has changed.
        // ==================================

        if (
          currentStatus === nextStatus
        ) {
          result = {
            success: true,

            changed: false,

            alreadyUpdated: true,

            message:
              `This ${validatedTargetType} already has the requested visibility status.`,

            content,
          };

          return;
        }

        // ==================================
        // RECORD PREVIOUS CONTENT STATUS
        // ==================================

        const previousValues =
          createContentSnapshot(
            validatedTargetType,

            content
          );

        // ==================================
        // BUILD CONTENT UPDATE
        // ==================================

        const changes =
          buildModerationUpdate({
            targetType:
              validatedTargetType,

            nextStatus,

            reason:
              validatedReason,

            administrator:
              lockedAdministrator,
          });

        // ==================================
        // BUILD SAFE UPDATE FILTER
        // ==================================

        const updateFilter =
          buildContentUpdateFilter(
            validatedTargetType,

            content
          );

        // ==================================
        // UPDATE CONTENT VISIBILITY
        // ==================================

        const updatedContent =
          await Model.findOneAndUpdate(
            updateFilter,

            {
              $set: changes,

              $inc: {
                __v: 1,
              },
            },

            {
              new: true,

              runValidators: true,

              session,
            }
          ).lean();

        if (!updatedContent) {
          throw new ContentModerationError(
            "This content changed in another request. Refresh and try again.",
            409
          );
        }

        // ==================================
        // CREATE UPDATED CONTENT SNAPSHOT
        // ==================================

        const newValues =
          createContentSnapshot(
            validatedTargetType,

            updatedContent
          );

        // ==================================
        // RECORD ADMINISTRATIVE ACTIVITY
        //
        // If activity logging fails, the
        // content update is also rolled back.
        // ==================================

        await recordAdminActivity({
          req,

          actor:
            lockedAdministrator,

          action:
            getActivityAction(
              validatedTargetType,

              validatedAction
            ),

          targetType:
            validatedTargetType,

          targetId:
            updatedContent._id,

          targetName:
            getContentName(
              validatedTargetType,

              updatedContent
            ),

          previousValues,

          newValues,

          reason:
            validatedReason,

          outcome:
            "success",

          session,
        });

        // ==================================
        // PREPARE SUCCESSFUL RESULT
        // ==================================

        result = {
          success: true,

          changed: true,

          alreadyUpdated: false,

          message:
            getSuccessMessage(
              validatedTargetType,

              validatedAction
            ),

          content:
            updatedContent,
        };
      },

      {
        readPreference:
          "primary",

        readConcern: {
          level: "snapshot",
        },

        writeConcern: {
          w: "majority",
        },
      }
    );

    // ======================================
    // TRANSACTION COMMITTED SUCCESSFULLY
    // ======================================

    return result;

  } finally {
    await session.endSession();
  }
}

// ==========================================
// EXPORT CENTRALIZED MODERATION SERVICE
// ==========================================

module.exports = {
  ContentModerationError,

  moderatePlatformContent,
};