const mongoose = require("mongoose");

const Video = require("../models/video");
const VideoLike = require("../models/VideoLike");
const User = require("../models/User");

// ==========================================
// CONFIGURATION
// ==========================================

const ALLOWED_ROLES = ["listener", "artist"];

// ==========================================
// CUSTOM VIDEO LIKE ERROR
// ==========================================

class VideoLikeError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "VideoLikeError";
    this.status = status;
  }
}

// ==========================================
// VALIDATE MONGODB ID
// ==========================================

function isValidId(value) {
  if (
    typeof value !== "string" &&
    !(value instanceof mongoose.Types.ObjectId)
  ) {
    return false;
  }

  return /^[a-f0-9]{24}$/i.test(String(value));
}

function validateVideoId(videoId) {
  if (!isValidId(videoId)) {
    throw new VideoLikeError(
      "Invalid video ID."
    );
  }
}

// ==========================================
// PUBLIC VISIBILITY FILTER
//
// Exclude hidden and taken-down videos.
// Support older database records.
// ==========================================

function publicVisibilityFilter() {
  return {
    $or: [
      { visibilityStatus: "visible" },

      {
        visibilityStatus: {
          $exists: false,
        },
      },

      { visibilityStatus: null },
    ],
  };
}

// ==========================================
// CHECK VIDEO VISIBILITY
// ==========================================

function isPublicVideo(video) {
  if (!video) {
    return false;
  }

  return (
    video.status === "approved" &&

    (
      video.visibilityStatus === "visible" ||
      video.visibilityStatus === undefined ||
      video.visibilityStatus === null
    )
  );
}

// ==========================================
// PREVENT RESPONSE CACHING
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
// REQUIRE AUTHENTICATED LISTENER OR ARTIST
//
// Admin, Super Admin and Distributor
// accounts cannot like videos.
// ==========================================

function requireVideoLikeUser(req) {
  if (!req.user?._id || !req.auth) {
    throw new VideoLikeError(
      "Please sign in to continue.",
      401
    );
  }

  if (!ALLOWED_ROLES.includes(req.user.role)) {
    throw new VideoLikeError(
      "This account cannot like videos.",
      403
    );
  }

  if (req.user.accountStatus !== "active") {
    throw new VideoLikeError(
      "Your account is unavailable.",
      403
    );
  }

  if (
    !isValidId(req.user._id) ||

    String(req.auth.userId) !==
      String(req.user._id) ||

    req.auth.role !== req.user.role ||

    !Number.isSafeInteger(
      req.auth.tokenVersion
    ) ||

    req.auth.tokenVersion < 0
  ) {
    throw new VideoLikeError(
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

  if (error instanceof VideoLikeError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
    });
  }

  // Unknown database transaction result.

  if (
    error.hasErrorLabel?.(
      "UnknownTransactionCommitResult"
    )
  ) {
    return res.status(503).json({
      success: false,

      message:
        "The operation result could not be confirmed. Refresh the video before trying again.",
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
        "Video likes are being updated. Please try again.",
    });
  }

  // Invalid database information.

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,

      message: "Invalid video like information.",
    });
  }

  // Duplicate record conflict.

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,

      message:
        "A video like record conflict occurred. Refresh and try again.",
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
      "Unable to complete the video like operation.",
  });
}

// ==========================================
// RUN VIDEO LIKE TRANSACTION
// ==========================================

async function runVideoLikeTransaction(
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
// LOCK AUTHENTICATED USER
//
// Recheck account permissions inside
// the database transaction.
//
// Serialize simultaneous like operations
// belonging to the same user.
// ==========================================

async function lockVideoLikeUser(
  req,
  session
) {
  const currentUser =
    requireVideoLikeUser(req);

  const version =
    req.auth.tokenVersion;

  const filter = {
    _id: currentUser._id,

    role: currentUser.role,

    accountStatus: "active",
  };

  // Support older account records.

  if (version === 0) {
    filter.$or = [
      { tokenVersion: 0 },

      { tokenVersion: null },

      {
        tokenVersion: {
          $exists: false,
        },
      },
    ];

  } else {
    filter.tokenVersion = version;
  }

  const user =
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
    ).select("_id role accountStatus");

  if (!user) {
    throw new VideoLikeError(
      "Your account or authentication session has changed.",
      403
    );
  }

  return user;
}

// ==========================================
// FIND PUBLIC VIDEO
//
// Only approved and publicly visible
// videos can receive new likes.
// ==========================================

async function findPublicVideo(
  videoId,
  session
) {
  validateVideoId(videoId);

  const query = Video.findOne({
    _id: videoId,

    status: "approved",

    ...publicVisibilityFilter(),
  }).select(
    "_id status visibilityStatus"
  );

  if (session) {
    query.session(session);
  }

  return query.lean();
}

// ==========================================
// REQUIRE PUBLIC VIDEO
// ==========================================

async function requirePublicVideo(
  videoId,
  session
) {
  const video =
    await findPublicVideo(
      videoId,
      session
    );

  if (!video) {
    throw new VideoLikeError(
      "This video is unavailable.",
      404
    );
  }

  return video;
}

// ==========================================
// LOCK PUBLIC VIDEO
//
// Coordinate new likes with administrative
// moderation.
//
// Prevent simultaneous moderation from
// being bypassed by a new like request.
// ==========================================

async function lockPublicVideo(
  videoId,
  session
) {
  const video =
    await Video.findOneAndUpdate(
      {
        _id: videoId,

        status: "approved",

        ...publicVisibilityFilter(),
      },

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
        "_id status visibilityStatus"
      )
      .lean();

  if (!video) {
    throw new VideoLikeError(
      "This video is unavailable.",
      404
    );
  }

  return video;
}

// ==========================================
// COUNT VIDEO LIKES
//
// Count stored like records.
//
// The VideoLike model remains the
// source of truth for video likes.
// ==========================================

async function countVideoLikes(
  videoId,
  session
) {
  const query =
    VideoLike.countDocuments({
      videoId,
    });

  if (session) {
    query.session(session);
  }

  return query;
}

// ==========================================
// GET VIDEO LIKE COUNT
//
// Available to public visitors.
//
// Restricted videos do not expose
// their like statistics.
// ==========================================

const getVideoLikeCount =
  async (req, res) => {
    try {
      preventCaching(res);

      const { videoId } = req.params;

      validateVideoId(videoId);

      // Verify public video.

      const video =
        await requirePublicVideo(
          videoId
        );

      // Retrieve official like count.

      const likeCount =
        await countVideoLikes(
          video._id
        );

      // Recheck video availability.

      await requirePublicVideo(
        videoId
      );

      return res.status(200).json({
        success: true,

        likeCount,
      });

    } catch (error) {
      return sendError(
        res,
        error,
        "Get video like count error:"
      );
    }
  };

// ==========================================
// GET MY VIDEO LIKE
//
// Check whether the authenticated
// listener or artist likes a video.
// ==========================================

const getMyVideoLike =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireVideoLikeUser(req);

      const { videoId } = req.params;

      validateVideoId(videoId);

      // Verify that the video is public.

      await requirePublicVideo(
        videoId
      );

      // Check user's existing like.

      const existingLike =
        await VideoLike.exists({
          userId: user._id,

          videoId,
        });

      // Recheck video availability.

      await requirePublicVideo(
        videoId
      );

      return res.status(200).json({
        success: true,

        liked:
          Boolean(existingLike),
      });

    } catch (error) {
      return sendError(
        res,
        error,
        "Get my video like error:"
      );
    }
  };

// ==========================================
// LIKE VIDEO
//
// ACCESS:
// - Listener
// - Artist
//
// Repeated requests will not create
// additional likes.
// ==========================================

const likeVideo =
  async (req, res) => {
    try {
      preventCaching(res);

      requireVideoLikeUser(req);

      const { videoId } = req.params;

      validateVideoId(videoId);

      // ====================================
      // START VIDEO LIKE TRANSACTION
      // ====================================

      const result =
        await runVideoLikeTransaction(
          async (session) => {
            // Verify active listener account.

            const user =
              await lockVideoLikeUser(
                req,
                session
              );

            // Verify and lock public video.

            const video =
              await lockPublicVideo(
                videoId,
                session
              );

            // =================================
            // CHECK EXISTING LIKE
            // =================================

            const existingLike =
              await VideoLike.exists({
                userId: user._id,

                videoId: video._id,
              }).session(session);

            // Return success if the user
            // has already liked the video.

            if (existingLike) {
              const likeCount =
                await countVideoLikes(
                  video._id,
                  session
                );

              return {
                alreadyLiked: true,

                likeCount,
              };
            }

            // =================================
            // CREATE VIDEO LIKE
            // =================================

            await VideoLike.updateOne(
              {
                userId: user._id,

                videoId: video._id,
              },

              {
                $setOnInsert: {
                  userId: user._id,

                  videoId: video._id,
                },
              },

              {
                upsert: true,

                runValidators: true,

                setDefaultsOnInsert: true,

                session,
              }
            );

            // =================================
            // GET UPDATED LIKE COUNT
            // =================================

            const likeCount =
              await countVideoLikes(
                video._id,
                session
              );

            return {
              alreadyLiked: false,

              likeCount,
            };
          }
        );

      // ====================================
      // RETURN SUCCESSFUL LIKE RESULT
      // ====================================

      return res.status(200).json({
        success: true,

        message:
          result.alreadyLiked

            ? "You have already liked this video."

            : "Video liked successfully.",

        liked: true,

        likeCount:
          result.likeCount,
      });

    } catch (error) {

      // ====================================
      // HANDLE DUPLICATE LIKE RECORD
      // ====================================

      if (error.code === 11000) {
        try {
          const user =
            requireVideoLikeUser(req);

          const { videoId } = req.params;

          const video =
            await requirePublicVideo(
              videoId
            );

          const existingLike =
            await VideoLike.exists({
              userId: user._id,

              videoId: video._id,
            });

          if (!existingLike) {
            throw new VideoLikeError(
              "A video like record conflict occurred.",
              409
            );
          }

          const likeCount =
            await countVideoLikes(
              video._id
            );

          await requirePublicVideo(
            videoId
          );

          return res.status(200).json({
            success: true,

            message:
              "You have already liked this video.",

            liked: true,

            likeCount,
          });

        } catch (lookupError) {
          return sendError(
            res,

            lookupError,

            "Duplicate video like lookup error:"
          );
        }
      }

      return sendError(
        res,

        error,

        "Like video error:"
      );
    }
  };

// ==========================================
// UNLIKE VIDEO
//
// Users can remove their own likes even
// when a video has subsequently been
// hidden, taken down or deleted.
//
// Restricted video statistics will
// not be exposed.
// ==========================================

const unlikeVideo =
  async (req, res) => {
    try {
      preventCaching(res);

      requireVideoLikeUser(req);

      const { videoId } = req.params;

      validateVideoId(videoId);

      // ====================================
      // START VIDEO UNLIKE TRANSACTION
      // ====================================

      const result =
        await runVideoLikeTransaction(
          async (session) => {
            const user =
              await lockVideoLikeUser(
                req,
                session
              );

            // =================================
            // REMOVE USER'S OWN VIDEO LIKE
            //
            // Remove historical duplicates
            // belonging to the same user.
            // =================================

            await VideoLike.deleteMany(
              {
                userId: user._id,

                videoId,
              },

              {
                session,
              }
            );

            // =================================
            // CHECK VIDEO AVAILABILITY
            // =================================

            const video =
              await Video.findById(
                videoId
              )
                .select(
                  "_id status visibilityStatus"
                )
                .session(session)
                .lean();

            // Do not expose statistics for
            // hidden or taken-down videos.

            if (!isPublicVideo(video)) {
              return {
                likeCount: 0,
              };
            }

            // =================================
            // GET UPDATED PUBLIC LIKE COUNT
            // =================================

            const likeCount =
              await countVideoLikes(
                videoId,
                session
              );

            return {
              likeCount,
            };
          }
        );

      // Recheck visibility before returning
      // public statistics.

      const publicVideo =
        await findPublicVideo(
          videoId
        );

      return res.status(200).json({
        success: true,

        message:
          "Video unliked successfully.",

        liked: false,

        likeCount:
          publicVideo
            ? result.likeCount
            : 0,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Unlike video error:"
      );
    }
  };

// ==========================================
// EXPORT VIDEO LIKE CONTROLLERS
// ==========================================

module.exports = {
  getVideoLikeCount,

  getMyVideoLike,

  likeVideo,

  unlikeVideo,
};