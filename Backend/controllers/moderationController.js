const mongoose = require("mongoose");

const Artist = require("../models/Artist");
const User = require("../models/User");

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

const administrativeRoles = [
  "admin",
  "superadmin",
];

// ==========================================
// CUSTOM MODERATION ERROR
// ==========================================

class ModerationError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "ModerationError";
    this.status = status;
  }
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
// PREVENT RESPONSE CACHING
// ==========================================

function preventCaching(res) {
  res.set(
    "Cache-Control",
    "private, no-store"
  );
}

// ==========================================
// ERROR HANDLING
// ==========================================

function sendError(res, error, context) {
  preventCaching(res);

  // Expected artist moderation errors.

  if (error instanceof ModerationError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
    });
  }

  // Expected centralized content moderation
  // errors.

  if (
    error instanceof ContentModerationError
  ) {
    return res
      .status(error.statusCode)
      .json({
        success: false,
        message: error.message,
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
        "The operation result could not be confirmed. Refresh the content information before trying again.",
    });
  }

  // Conflicting database operations.

  if (
    error.code === 112 ||
    error.code === 11000 ||
    error.name === "VersionError" ||

    error.hasErrorLabel?.(
      "TransientTransactionError"
    )
  ) {
    return res.status(409).json({
      success: false,

      message:
        "The resource changed during this operation. Refresh and try again.",
    });
  }

  // Invalid input.

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,

      message:
        "Invalid moderation information.",
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
      "Unable to complete the moderation operation.",
  });
}

// ==========================================
// VERIFY ADMINISTRATIVE ACCESS
// ==========================================

function requireModerator(req) {
  if (
    !req.user?._id ||
    !req.auth
  ) {
    throw new ModerationError(
      "Authentication required.",

      401
    );
  }

  if (
    !administrativeRoles.includes(
      req.user.role
    ) ||

    req.user.accountStatus !==
      "active" ||

    req.user.emailVerified !== true
  ) {
    throw new ModerationError(
      "Administrative access is required.",

      403
    );
  }

  // Confirm that authenticated session
  // information matches the user account.

  if (
    String(req.auth.userId) !==
      String(req.user._id) ||

    req.auth.role !== req.user.role ||

    !Number.isSafeInteger(
      req.auth.tokenVersion
    ) ||

    req.auth.tokenVersion < 0
  ) {
    throw new ModerationError(
      "Invalid administrative session.",

      401
    );
  }

  return req.user;
}

// ==========================================
// VALIDATE MODERATION REASON
// ==========================================

function getModerationReason(
  req,

  defaultReason = "",

  required = false
) {
  const value = req.body?.reason;

  if (
    value === undefined ||
    value === null
  ) {
    if (required) {
      throw new ModerationError(
        "A moderation reason is required."
      );
    }

    return defaultReason;
  }

  if (typeof value !== "string") {
    throw new ModerationError(
      "Moderation reason must be text."
    );
  }

  const reason = value
    .replace(
      /[\u0000-\u001f\u007f]/g,
      " "
    )
    .trim();

  if (reason.length > 1000) {
    throw new ModerationError(
      "Moderation reason cannot exceed 1000 characters."
    );
  }

  if (required && !reason) {
    throw new ModerationError(
      "A moderation reason is required."
    );
  }

  return reason || defaultReason;
}

// ==========================================
// RUN MODERATION TRANSACTION
// ==========================================

async function runModerationTransaction(
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
// LOCK ACTING ADMINISTRATOR
//
// Revalidate the administrator inside
// the database transaction.
// ==========================================

async function lockModerator(
  req,

  session
) {
  const actor =
    requireModerator(req);

  const version =
    req.auth.tokenVersion;

  const filter = {
    _id: actor._id,

    role: actor.role,

    accountStatus: "active",

    emailVerified: true,
  };

  // Support existing legacy accounts.

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
    filter.tokenVersion = version;
  }

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
    throw new ModerationError(
      "Your administrative permissions or session have changed.",

      403
    );
  }

  return administrator;
}

// ==========================================
// GET ARTIST VISIBILITY
// ==========================================

function getArtistVisibility(artist) {
  return (
    artist.visibilityStatus ??
    "visible"
  );
}

// ==========================================
// CREATE ARTIST ACTIVITY SNAPSHOT
//
// Never include sensitive account data.
// ==========================================

function artistSnapshot(artist) {
  return {
    approvalStatus:
      artist.approvalStatus,

    visibilityStatus:
      getArtistVisibility(artist),

    verified:
      Boolean(artist.verified),

    featured:
      Boolean(artist.featured),
  };
}

// ==========================================
// VERIFY ASSOCIATED ARTIST ACCOUNT
//
// Used when verifying or restoring
// an artist.
// ==========================================

async function lockActiveArtistUser(
  artist,

  session
) {
  const user =
    await User.findOneAndUpdate(
      {
        _id: artist.userId,

        role: "artist",

        accountStatus: "active",
      },

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
      "_id role accountStatus"
    );

  if (!user) {
    throw new ModerationError(
      "The associated artist account must be active.",

      409
    );
  }

  return user;
}

// ==========================================
// FIND ARTIST INSIDE TRANSACTION
// ==========================================

async function findArtist(
  artistId,

  session
) {
  const artist =
    await Artist.findById(
      artistId
    )
      .session(session)
      .lean();

  if (!artist) {
    throw new ModerationError(
      "Artist not found.",

      404
    );
  }

  return artist;
}

// ==========================================
// BUILD CONDITIONAL ARTIST UPDATE FILTER
//
// Protect against conflicting updates.
// ==========================================

function buildArtistUpdateFilter(artist) {
  const filter = {
    _id: artist._id,

    approvalStatus:
      artist.approvalStatus,
  };

  if (
    artist.visibilityStatus === undefined
  ) {
    filter.visibilityStatus = {
      $exists: false,
    };

  } else {
    filter.visibilityStatus =
      artist.visibilityStatus;
  }

  if (artist.updatedAt === undefined) {
    filter.updatedAt = {
      $exists: false,
    };

  } else {
    filter.updatedAt =
      artist.updatedAt;
  }

  if (artist.__v === undefined) {
    filter.__v = {
      $exists: false,
    };

  } else {
    filter.__v = artist.__v;
  }

  return filter;
}

// ==========================================
// UPDATE ARTIST AND RECORD ACTIVITY
//
// Both operations must succeed together.
// ==========================================

async function updateArtistWithActivity({
  req,

  administrator,

  artist,

  changes,

  action,

  reason,

  session,
}) {
  const previousValues =
    artistSnapshot(artist);

  const updateFilter =
    buildArtistUpdateFilter(artist);

  // ========================================
  // PREPARE ARTIST UPDATE
  // ========================================

  const updates = {
    ...changes,
  };

  // Preserve the existing visibility
  // moderation information when an artist
  // is hidden or under copyright takedown.
  //
  // Verification, suspension and restoration
  // reasons will still appear in audit logs.

  if (
    getArtistVisibility(artist) ===
    "visible"
  ) {
    updates.moderationReason = reason;

    updates.moderatedBy =
      administrator._id;

    updates.moderatedAt =
      new Date();
  }

  // ========================================
  // UPDATE ARTIST
  // ========================================

  const updatedArtist =
    await Artist.findOneAndUpdate(
      updateFilter,

      {
        $set: updates,

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

  if (!updatedArtist) {
    throw new ModerationError(
      "The artist information has changed. Refresh and try again.",

      409
    );
  }

  // ========================================
  // RECORD ADMINISTRATIVE ACTIVITY
  // ========================================

  await recordAdminActivity({
    req,

    actor:
      administrator,

    action,

    targetType:
      "artist",

    targetId:
      updatedArtist._id,

    targetName:
      updatedArtist.stageName,

    previousValues,

    newValues:
      artistSnapshot(
        updatedArtist
      ),

    reason,

    outcome:
      "success",

    session,
  });

  return updatedArtist;
}

// ==========================================
// SHARED ARTIST VERIFICATION FUNCTION
// ==========================================

async function changeArtistVerification(
  req,

  verified
) {
  requireModerator(req);

  const { artistId } =
    req.params;

  if (!isValidId(artistId)) {
    throw new ModerationError(
      "Invalid artist ID."
    );
  }

  const reason =
    getModerationReason(
      req,

      verified
        ? "Artist verification granted."
        : "Artist verification removed.",

      !verified
    );

  return runModerationTransaction(
    async (session) => {
      // ====================================
      // VERIFY ADMINISTRATOR
      // ====================================

      const administrator =
        await lockModerator(
          req,

          session
        );

      // ====================================
      // FIND ARTIST
      // ====================================

      const artist =
        await findArtist(
          artistId,

          session
        );

      // ====================================
      // CHECK VERIFICATION ELIGIBILITY
      // ====================================

      if (verified) {
        if (
          artist.approvalStatus !==
            "approved" ||

          getArtistVisibility(
            artist
          ) !== "visible"
        ) {
          throw new ModerationError(
            "Only approved and visible artists can be verified.",

            409
          );
        }

        await lockActiveArtistUser(
          artist,

          session
        );
      }

      // ====================================
      // PREVENT DUPLICATE ACTIVITIES
      // ====================================

      if (
        Boolean(artist.verified) ===
        verified
      ) {
        return {
          artist,

          alreadyUpdated: true,
        };
      }

      // ====================================
      // UPDATE VERIFICATION STATUS
      // ====================================

      const updatedArtist =
        await updateArtistWithActivity({
          req,

          administrator,

          artist,

          changes: {
            verified,
          },

          action:
            verified
              ? "artist_verified"
              : "artist_unverified",

          reason,

          session,
        });

      return {
        artist:
          updatedArtist,

        alreadyUpdated:
          false,
      };
    }
  );
}

// ==========================================
// VERIFY ARTIST
//
// ADMIN AND SUPER ADMIN
// ==========================================

const verifyArtist =
  async (req, res) => {
    try {
      preventCaching(res);

      const result =
        await changeArtistVerification(
          req,

          true
        );

      return res.status(200).json({
        success: true,

        message:
          result.alreadyUpdated
            ? "This artist is already verified."
            : "Artist verified successfully.",

        artist:
          result.artist,

        alreadyUpdated:
          result.alreadyUpdated,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Verify artist error:"
      );
    }
  };

// ==========================================
// REMOVE ARTIST VERIFICATION
//
// ADMIN AND SUPER ADMIN
// ==========================================

const unverifyArtist =
  async (req, res) => {
    try {
      preventCaching(res);

      const result =
        await changeArtistVerification(
          req,

          false
        );

      return res.status(200).json({
        success: true,

        message:
          result.alreadyUpdated
            ? "This artist is not verified."
            : "Artist verification removed successfully.",

        artist:
          result.artist,

        alreadyUpdated:
          result.alreadyUpdated,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Unverify artist error:"
      );
    }
  };

// ==========================================
// SUSPEND ARTIST
//
// ADMIN AND SUPER ADMIN
//
// Suspends artist privileges without
// suspending the associated listening
// account.
// ==========================================

const suspendArtist =
  async (req, res) => {
    try {
      preventCaching(res);

      requireModerator(req);

      const { artistId } =
        req.params;

      if (!isValidId(artistId)) {
        throw new ModerationError(
          "Invalid artist ID."
        );
      }

      const reason =
        getModerationReason(
          req,

          "",

          true
        );

      // ====================================
      // START SUSPENSION TRANSACTION
      // ====================================

      const result =
        await runModerationTransaction(
          async (session) => {
            const administrator =
              await lockModerator(
                req,

                session
              );

            // ==============================
            // FIND ARTIST
            // ==============================

            const artist =
              await findArtist(
                artistId,

                session
              );

            // ==============================
            // PREVENT REPEATED SUSPENSION
            // ==============================

            if (
              artist.approvalStatus ===
              "suspended"
            ) {
              return {
                artist,

                alreadyUpdated: true,
              };
            }

            // ==============================
            // VALIDATE APPROVAL STATUS
            // ==============================

            if (
              artist.approvalStatus !==
              "approved"
            ) {
              throw new ModerationError(
                "Only approved artists can be suspended.",

                409
              );
            }

            // ==============================
            // SUSPEND ARTIST
            //
            // Preserve verification,
            // visibility and existing media.
            // ==============================

            const suspendedArtist =
              await updateArtistWithActivity({
                req,

                administrator,

                artist,

                changes: {
                  approvalStatus:
                    "suspended",

                  featured:
                    false,
                },

                action:
                  "artist_suspended",

                reason,

                session,
              });

            return {
              artist:
                suspendedArtist,

              alreadyUpdated:
                false,
            };
          }
        );

      return res.status(200).json({
        success: true,

        message:
          result.alreadyUpdated
            ? "This artist is already suspended."
            : "Artist suspended successfully.",

        artist:
          result.artist,

        alreadyUpdated:
          result.alreadyUpdated,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Suspend artist error:"
      );
    }
  };

// ==========================================
// RESTORE SUSPENDED ARTIST
//
// ADMIN AND SUPER ADMIN
//
// Does not automatically remove visibility
// restrictions or restore featured status.
// ==========================================

const restoreArtist =
  async (req, res) => {
    try {
      preventCaching(res);

      requireModerator(req);

      const { artistId } =
        req.params;

      if (!isValidId(artistId)) {
        throw new ModerationError(
          "Invalid artist ID."
        );
      }

      const reason =
        getModerationReason(
          req,

          "Artist privileges restored."
        );

      // ====================================
      // START RESTORATION TRANSACTION
      // ====================================

      const result =
        await runModerationTransaction(
          async (session) => {
            const administrator =
              await lockModerator(
                req,

                session
              );

            // ==============================
            // FIND ARTIST
            // ==============================

            const artist =
              await findArtist(
                artistId,

                session
              );

            // ==============================
            // PREVENT REPEATED RESTORATION
            // ==============================

            if (
              artist.approvalStatus ===
              "approved"
            ) {
              return {
                artist,

                alreadyUpdated: true,
              };
            }

            // ==============================
            // ONLY RESTORE SUSPENDED ARTISTS
            // ==============================

            if (
              artist.approvalStatus !==
              "suspended"
            ) {
              throw new ModerationError(
                "Only suspended artists can be restored.",

                409
              );
            }

            // ==============================
            // VERIFY ASSOCIATED ACCOUNT
            // ==============================

            await lockActiveArtistUser(
              artist,

              session
            );

            // ==============================
            // RESTORE ARTIST PRIVILEGES
            //
            // Existing visibility restrictions
            // remain unchanged.
            // ==============================

            const restoredArtist =
              await updateArtistWithActivity({
                req,

                administrator,

                artist,

                changes: {
                  approvalStatus:
                    "approved",

                  featured:
                    false,
                },

                action:
                  "artist_restored",

                reason,

                session,
              });

            return {
              artist:
                restoredArtist,

              alreadyUpdated:
                false,
            };
          }
        );

      return res.status(200).json({
        success: true,

        message:
          result.alreadyUpdated
            ? "This artist is already approved."
            : "Artist approval status restored successfully.",

        artist:
          result.artist,

        alreadyUpdated:
          result.alreadyUpdated,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Restore artist error:"
      );
    }
  };

// ==========================================
// CENTRALIZED CONTENT MODERATION HANDLER
//
// Used by all artist profile, song, release
// and video visibility moderation functions.
// ==========================================

function createContentModerationHandler(
  targetType,

  parameterName,

  action
) {
  return async (req, res) => {
    try {
      preventCaching(res);

      requireModerator(req);

      const targetId =
        req.params[parameterName];

      if (!isValidId(targetId)) {
        throw new ModerationError(
          "Invalid content ID."
        );
      }

      const { reason } =
        req.body || {};

      // ====================================
      // EXECUTE CENTRALIZED MODERATION
      // ====================================

      const result =
        await moderatePlatformContent({
          req,

          targetType,

          targetId,

          action,

          reason,
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

        `Content moderation error (${targetType}:${action}):`
      );
    }
  };
}

// ==========================================
// ARTIST PROFILE VISIBILITY MODERATION
//
// These functions do not change artist
// account approval or suspension status.
// ==========================================

// Hide artist profile.

const hideArtistProfile =
  createContentModerationHandler(
    "artist",

    "artistId",

    "hide"
  );

// Restore hidden artist profile.

const restoreArtistProfile =
  createContentModerationHandler(
    "artist",

    "artistId",

    "restore"
  );

// Take down artist profile.

const takedownArtistProfile =
  createContentModerationHandler(
    "artist",

    "artistId",

    "takedown"
  );

// Reverse artist profile takedown.
//
// SUPER ADMIN ONLY.

const reverseArtistTakedown =
  createContentModerationHandler(
    "artist",

    "artistId",

    "reverse-takedown"
  );

// ==========================================
// SONG MODERATION
// ==========================================

// Hide a published song.

const hideSong =
  createContentModerationHandler(
    "song",

    "songId",

    "hide"
  );

// Restore a hidden song.

const restoreSong =
  createContentModerationHandler(
    "song",

    "songId",

    "restore"
  );

// Take down a published song.

const takedownSong =
  createContentModerationHandler(
    "song",

    "songId",

    "takedown"
  );

// Reverse a song takedown.
//
// SUPER ADMIN ONLY.

const reverseSongTakedown =
  createContentModerationHandler(
    "song",

    "songId",

    "reverse-takedown"
  );

// ==========================================
// RELEASE MODERATION
//
// Applies to singles, EPs and albums.
//
// Release visibility restrictions will
// also restrict access to associated songs
// when enforced by the public controllers.
// ==========================================

// Hide a published release.

const hideRelease =
  createContentModerationHandler(
    "release",

    "releaseId",

    "hide"
  );

// Restore a hidden release.

const restoreRelease =
  createContentModerationHandler(
    "release",

    "releaseId",

    "restore"
  );

// Take down a published release.

const takedownRelease =
  createContentModerationHandler(
    "release",

    "releaseId",

    "takedown"
  );

// Reverse a release takedown.
//
// SUPER ADMIN ONLY.

const reverseReleaseTakedown =
  createContentModerationHandler(
    "release",

    "releaseId",

    "reverse-takedown"
  );

// ==========================================
// VIDEO MODERATION
// ==========================================

// Hide a published video.

const hideVideo =
  createContentModerationHandler(
    "video",

    "videoId",

    "hide"
  );

// Restore a hidden video.

const restoreVideo =
  createContentModerationHandler(
    "video",

    "videoId",

    "restore"
  );

// Take down a published video.

const takedownVideo =
  createContentModerationHandler(
    "video",

    "videoId",

    "takedown"
  );

// Reverse a video takedown.
//
// SUPER ADMIN ONLY.

const reverseVideoTakedown =
  createContentModerationHandler(
    "video",

    "videoId",

    "reverse-takedown"
  );

// ==========================================
// EXPORT MODERATION CONTROLLERS
// ==========================================

module.exports = {
  // ========================================
  // ARTIST ACCOUNT MANAGEMENT
  // ========================================

  verifyArtist,

  unverifyArtist,

  suspendArtist,

  restoreArtist,

  // ========================================
  // ARTIST PROFILE MODERATION
  // ========================================

  hideArtistProfile,

  restoreArtistProfile,

  takedownArtistProfile,

  reverseArtistTakedown,

  // ========================================
  // SONG MODERATION
  // ========================================

  hideSong,

  restoreSong,

  takedownSong,

  reverseSongTakedown,

  // ========================================
  // RELEASE MODERATION
  // ========================================

  hideRelease,

  restoreRelease,

  takedownRelease,

  reverseReleaseTakedown,

  // ========================================
  // VIDEO MODERATION
  // ========================================

  hideVideo,

  restoreVideo,

  takedownVideo,

  reverseVideoTakedown,
};