const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const View = require("../models/View");
const Video = require("../models/video");
const User = require("../models/User");

// ==========================================
// CONFIGURATION
// ==========================================

const MINIMUM_WATCH_SECONDS = 30;
const REPEAT_VIEW_COOLDOWN_MINUTES = 5;

const VIEW_SESSION_EXPIRY_SECONDS = 7200;
const GUEST_TOKEN_EXPIRY_DAYS = 90;

const ALLOWED_ROLES = ["listener", "artist"];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ==========================================
// CUSTOM VIEW ERROR
// ==========================================

class ViewError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "ViewError";
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

  return /^[a-f0-9]{24}$/i.test(
    String(value)
  );
}

// ==========================================
// PUBLIC VISIBILITY FILTER
//
// Support older records while excluding
// hidden and taken-down videos.
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
// GET JWT SECRET
// ==========================================

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (
    typeof secret !== "string" ||
    !secret.trim()
  ) {
    throw new ViewError(
      "Video session configuration is unavailable.",
      500
    );
  }

  return secret;
}

// ==========================================
// VALIDATE REQUEST BODY
// ==========================================

function getRequestBody(req) {
  const body = req.body ?? {};

  if (
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new ViewError(
      "Invalid video viewing information."
    );
  }

  return body;
}

// ==========================================
// CENTRALIZED ERROR HANDLING
// ==========================================

function sendError(res, error, context) {
  preventCaching(res);

  if (error instanceof ViewError) {
    return res.status(error.status).json({
      success: false,
      counted: false,
      message: error.message,
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
        "The view result could not be confirmed. Retry using the same viewing session.",
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
      counted: false,
      message:
        "Video statistics are being updated. Please try again.",
    });
  }

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,
      counted: false,
      message: "Invalid video viewing information.",
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
    message: "Unable to process the video view.",
  });
}

// ==========================================
// VERIFY AUTHENTICATED VIEWER
//
// Admin and Super Admin accounts cannot
// generate personal viewing statistics.
// ==========================================

function verifyAuthenticatedViewer(req) {
  if (!req.user?._id || !req.auth) {
    throw new ViewError(
      "Invalid authentication session.",
      401
    );
  }

  if (!ALLOWED_ROLES.includes(req.user.role)) {
    throw new ViewError(
      "This account cannot generate video views.",
      403
    );
  }

  if (req.user.accountStatus !== "active") {
    throw new ViewError(
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
    throw new ViewError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// CREATE GUEST TOKEN
//
// Guest identification remains compatible
// with the existing X-Emnet-Guest header.
// ==========================================

function createGuestToken() {
  const guestId = crypto.randomUUID();

  const guestToken = jwt.sign(
    {
      purpose: "video-guest",
      guestId,
    },

    getJwtSecret(),

    {
      algorithm: "HS256",

      expiresIn:
        `${GUEST_TOKEN_EXPIRY_DAYS}d`,
    }
  );

  return {
    guestId,
    guestToken,
  };
}

// ==========================================
// VERIFY GUEST TOKEN
// ==========================================

function verifyGuestToken(token) {
  if (
    typeof token !== "string" ||
    !token ||
    token.length > 4096
  ) {
    return null;
  }

  const secret = getJwtSecret();

  try {
    const payload = jwt.verify(
      token,

      secret,

      {
        algorithms: ["HS256"],

        maxAge:
          `${GUEST_TOKEN_EXPIRY_DAYS}d`,
      }
    );

    if (
      !payload ||
      typeof payload !== "object" ||

      payload.purpose !== "video-guest" ||

      typeof payload.guestId !== "string" ||

      !UUID_PATTERN.test(payload.guestId) ||

      !Number.isSafeInteger(payload.exp)
    ) {
      return null;
    }

    return {
      guestId: payload.guestId,
      guestToken: token,
    };

  } catch {
    return null;
  }
}

// ==========================================
// RESOLVE VIEWER IDENTITY
//
// Authenticated:
// user:<MongoDB user ID>
//
// Guest:
// guest:<Signed guest UUID>
// ==========================================

function resolveViewer(req, allowNewGuest = false) {
  // Authenticated listener or artist.

  if (req.user) {
    const user =
      verifyAuthenticatedViewer(req);

    return {
      userId: user._id,

      guestId: null,

      guestToken: null,

      viewerKey:
        `user:${String(user._id)}`,
    };
  }

  // Do not treat failed authentication
  // as an ordinary guest request.

  if (
    req.auth ||
    req.get("authorization")
  ) {
    throw new ViewError(
      "Invalid or expired authentication session.",
      401
    );
  }

  // Retrieve existing guest token.

  const suppliedToken =
    req.get("X-Emnet-Guest");

  let guest =
    verifyGuestToken(suppliedToken);

  // New guest tokens can only be issued
  // when starting a viewing session.

  if (!guest && allowNewGuest) {
    guest = createGuestToken();
  }

  if (!guest) {
    throw new ViewError(
      "A valid guest viewing session is required.",
      401
    );
  }

  return {
    userId: null,

    guestId: guest.guestId,

    guestToken: guest.guestToken,

    viewerKey:
      `guest:${guest.guestId}`,
  };
}

// ==========================================
// FIND PUBLIC VIDEO
//
// Only published and visible videos
// can generate official views.
// ==========================================

async function findPublicVideo(videoId, session) {
  if (!isValidId(videoId)) {
    throw new ViewError(
      "Invalid video ID."
    );
  }

  const query = Video.findOne({
    _id: videoId,

    status: "approved",

    ...publicVisibilityFilter(),
  })
    .select(
      "_id title duration viewCount status visibilityStatus"
    );

  if (session) {
    query.session(session);
  }

  const video = await query.lean();

  if (!video) {
    throw new ViewError(
      "This video is unavailable.",
      404
    );
  }

  return video;
}

// ==========================================
// GET REQUIRED WATCH TIME
//
// Videos longer than 30 seconds:
// Require 30 seconds.
//
// Videos shorter than 30 seconds:
// Require their complete duration.
// ==========================================

function getRequiredWatchSeconds(video) {
  const duration = Number(video.duration);

  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return MINIMUM_WATCH_SECONDS;
  }

  return Math.min(
    MINIMUM_WATCH_SECONDS,
    duration
  );
}

// ==========================================
// NORMALIZE VIDEO VIEW COUNT
// ==========================================

function getViewCount(video) {
  const count = Number(video?.viewCount);

  return (
    Number.isFinite(count) &&
    count >= 0
  )
    ? count
    : 0;
}

// ==========================================
// CREATE SIGNED VIDEO VIEW SESSION
//
// Sessions expire after two hours.
// ==========================================

function createViewSessionToken({
  video,
  viewer,
}) {
  return jwt.sign(
    {
      purpose: "video-view-session",

      sessionId: crypto.randomUUID(),

      videoId: String(video._id),

      viewerKey: viewer.viewerKey,

      startedAt: Date.now(),

      requiredWatchSeconds:
        getRequiredWatchSeconds(video),
    },

    getJwtSecret(),

    {
      algorithm: "HS256",

      expiresIn:
        VIEW_SESSION_EXPIRY_SECONDS,
    }
  );
}

// ==========================================
// VERIFY VIDEO VIEW SESSION TOKEN
// ==========================================

function verifyViewSessionToken({
  token,
  videoId,
  viewer,
}) {
  if (
    typeof token !== "string" ||
    !token ||
    token.length > 4096
  ) {
    throw new ViewError(
      "A valid video view session is required."
    );
  }

  const secret = getJwtSecret();

  let payload;

  try {
    payload = jwt.verify(
      token,

      secret,

      {
        algorithms: ["HS256"],

        maxAge:
          `${VIEW_SESSION_EXPIRY_SECONDS}s`,
      }
    );

  } catch (error) {
    if (
      error.name === "TokenExpiredError"
    ) {
      throw new ViewError(
        "Your video viewing session has expired.",
        401
      );
    }

    throw new ViewError(
      "Invalid video viewing session.",
      401
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||

    payload.purpose !== "video-view-session" ||

    payload.videoId !==
      String(videoId).toLowerCase() ||

    payload.viewerKey !== viewer.viewerKey ||

    typeof payload.sessionId !== "string" ||

    !UUID_PATTERN.test(payload.sessionId) ||

    !Number.isSafeInteger(payload.startedAt) ||

    payload.startedAt <= 0 ||

    payload.startedAt > Date.now() ||

    !Number.isSafeInteger(payload.exp)
  ) {
    throw new ViewError(
      "Invalid video viewing session information.",
      401
    );
  }

  // Support previously issued sessions
  // without the new watch-duration field.

  if (
    payload.requiredWatchSeconds !== undefined &&
    (
      !Number.isFinite(
        payload.requiredWatchSeconds
      ) ||

      payload.requiredWatchSeconds <= 0 ||

      payload.requiredWatchSeconds >
        MINIMUM_WATCH_SECONDS
    )
  ) {
    throw new ViewError(
      "Invalid watch duration information.",
      401
    );
  }

  return payload;
}

// ==========================================
// CHECK MINIMUM WATCH TIME
//
// Uses server-side elapsed time.
// ==========================================

function hasReachedMinimumWatchTime(
  payload,
  video
) {
  const elapsedSeconds =
    (Date.now() - payload.startedAt) / 1000;

  const requiredSeconds = Math.max(
    payload.requiredWatchSeconds || 0,

    getRequiredWatchSeconds(video)
  );

  return elapsedSeconds >= requiredSeconds;
}

// ==========================================
// RUN VIDEO VIEW TRANSACTION
// ==========================================

async function runViewTransaction(operation) {
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
// LOCK AUTHENTICATED VIEWER ACCOUNT
//
// Recheck account status and permissions
// inside the view transaction.
// ==========================================

async function lockViewerAccount(
  req,
  viewer,
  session
) {
  if (!viewer.userId) {
    return;
  }

  const currentUser =
    verifyAuthenticatedViewer(req);

  const version =
    req.auth.tokenVersion;

  const filter = {
    _id: viewer.userId,

    role: currentUser.role,

    accountStatus: "active",
  };

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

  const account =
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

    ).select("_id");

  if (!account) {
    throw new ViewError(
      "Your account or authentication session has changed.",
      403
    );
  }
}

// ==========================================
// LOCK PUBLIC VIDEO
//
// Serialize simultaneous requests
// targeting the same video.
//
// Coordinates view counting with
// administrative moderation.
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
        "_id duration viewCount status visibilityStatus"
      )
      .lean();

  if (!video) {
    throw new ViewError(
      "This video is unavailable.",
      404
    );
  }

  return video;
}

// ==========================================
// CREATE VIEWER DATABASE FILTER
// ==========================================

function createViewerFilter(viewer) {
  if (viewer.userId) {
    return {
      userId: viewer.userId,
    };
  }

  return {
    userId: null,

    guestId: viewer.guestId,
  };
}

// ==========================================
// CREATE VIEW DEDUPLICATION KEY
//
// Retains the existing five-minute
// deduplication bucket system.
//
// A separate rolling cooldown check
// prevents duplicates across buckets.
// ==========================================

function createDedupeKey({
  videoId,
  viewerKey,
  countedAt,
}) {
  const bucket = Math.floor(
    countedAt.getTime() /

    (
      REPEAT_VIEW_COOLDOWN_MINUTES *
      60 *
      1000
    )
  );

  return crypto
    .createHash("sha256")
    .update(
      `${videoId}:${viewerKey}:${bucket}`
    )
    .digest("hex");
}

// ==========================================
// START VIDEO VIEW SESSION
//
// POST /api/views/videos/:videoId/start
//
// Starting a viewing session does not
// increase the official view count.
// ==========================================

const startVideoView = async (req, res) => {
  try {
    preventCaching(res);

    const { videoId } = req.params;

    if (!isValidId(videoId)) {
      throw new ViewError(
        "Invalid video ID."
      );
    }

    // Verify video availability.

    const video =
      await findPublicVideo(videoId);

    // Resolve authenticated or guest viewer.

    const viewer =
      resolveViewer(req, true);

    // Determine the required watch time.

    const requiredWatchSeconds =
      getRequiredWatchSeconds(video);

    // Create signed video view session.

    const viewSessionToken =
      createViewSessionToken({
        video,
        viewer,
      });

    return res.status(200).json({
      success: true,

      viewSessionToken,

      guestToken:
        viewer.guestToken,

      requiredWatchSeconds,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Start video view error:"
    );
  }
};

// ==========================================
// RECORD OFFICIAL VIDEO VIEW
//
// POST /api/views/videos/:videoId
//
// A valid session and sufficient elapsed
// watch time are required.
//
// The view record and video counter
// are committed together.
// ==========================================

const recordVideoView = async (req, res) => {
  try {
    preventCaching(res);

    const { videoId } = req.params;

    if (!isValidId(videoId)) {
      throw new ViewError(
        "Invalid video ID."
      );
    }

    const input =
      getRequestBody(req);

    // ======================================
    // VERIFY VIEWER IDENTITY
    // ======================================

    const viewer =
      resolveViewer(req, false);

    // ======================================
    // VERIFY SIGNED VIEW SESSION
    // ======================================

    const payload =
      verifyViewSessionToken({
        token:
          input.viewSessionToken,

        videoId,

        viewer,
      });

    // ======================================
    // VERIFY PUBLIC VIDEO
    // ======================================

    const publicVideo =
      await findPublicVideo(videoId);

    // ======================================
    // CHECK MINIMUM WATCH TIME
    // ======================================

    if (
      !hasReachedMinimumWatchTime(
        payload,
        publicVideo
      )
    ) {
      return res.status(200).json({
        success: true,

        counted: false,

        message:
          "Minimum watch time has not been reached.",

        viewCount:
          getViewCount(publicVideo),
      });
    }

    // ======================================
    // START OFFICIAL VIEW TRANSACTION
    // ======================================

    const result =
      await runViewTransaction(
        async (session) => {
          // Recheck authenticated account.

          await lockViewerAccount(
            req,
            viewer,
            session
          );

          // Lock and recheck public video.

          const video =
            await lockPublicVideo(
              videoId,
              session
            );

          // =================================
          // RECHECK SESSION EXPIRATION
          // =================================

          if (
            Date.now() >=
              payload.exp * 1000
          ) {
            throw new ViewError(
              "Your video viewing session has expired.",
              401
            );
          }

          // =================================
          // RECHECK WATCH DURATION
          // =================================

          if (
            !hasReachedMinimumWatchTime(
              payload,
              video
            )
          ) {
            return {
              counted: false,

              message:
                "Minimum watch time has not been reached.",

              viewCount:
                getViewCount(video),
            };
          }

          // =================================
          // PREVENT SESSION REUSE
          // =================================

          const existingSession =
            await View.exists({
              sessionId:
                payload.sessionId,

            }).session(session);

          if (existingSession) {
            return {
              counted: false,

              message:
                "This viewing session has already been counted.",

              viewCount:
                getViewCount(video),
            };
          }

          // =================================
          // CHECK ROLLING FIVE-MINUTE
          // VIDEO VIEW COOLDOWN
          // =================================

          const now = new Date();

          const cooldownStart =
            new Date(
              now.getTime() -

              REPEAT_VIEW_COOLDOWN_MINUTES *
                60 *
                1000
            );

          const recentView =
            await View.exists({
              videoId: video._id,

              ...createViewerFilter(viewer),

              countedAt: {
                $gte: cooldownStart,
              },

            }).session(session);

          if (recentView) {
            return {
              counted: false,

              message:
                "A recent view has already been counted for this video.",

              viewCount:
                getViewCount(video),
            };
          }

          // =================================
          // GENERATE DEDUPLICATION KEY
          // =================================

          const dedupeKey =
            createDedupeKey({
              videoId:
                String(video._id),

              viewerKey:
                viewer.viewerKey,

              countedAt:
                now,
            });

          // =================================
          // CREATE OFFICIAL VIEW RECORD
          // =================================

          const view = new View({
            userId:
              viewer.userId,

            guestId:
              viewer.guestId,

            videoId:
              video._id,

            sessionId:
              payload.sessionId,

            dedupeKey,

            countedAt:
              now,
          });

          await view.save({
            session,
          });

          // =================================
          // INCREMENT OFFICIAL VIEW COUNT
          // =================================

          const updatedVideo =
            await Video.findOneAndUpdate(
              {
                _id: video._id,

                status: "approved",

                ...publicVisibilityFilter(),
              },

              {
                $inc: {
                  viewCount: 1,

                  __v: 1,
                },
              },

              {
                new: true,

                session,

                timestamps: false,
              }

            ).select("_id viewCount");

          if (!updatedVideo) {
            throw new ViewError(
              "The video is no longer available.",
              409
            );
          }

          // =================================
          // PREPARE SUCCESSFUL RESULT
          // =================================

          return {
            counted: true,

            message:
              "Video view counted successfully.",

            viewCount:
              getViewCount(updatedVideo),
          };
        }
      );

    // ======================================
    // RETURN COMMITTED VIEW RESULT
    // ======================================

    return res
      .status(result.counted ? 201 : 200)
      .json({
        success: true,

        counted:
          result.counted,

        message:
          result.message,

        viewCount:
          result.viewCount,
      });

  } catch (error) {
    // ======================================
    // HANDLE DUPLICATE VIEW RECORD
    // ======================================

    if (error.code === 11000) {
      try {
        const viewer =
          resolveViewer(req, false);

        const input =
          getRequestBody(req);

        const payload =
          verifyViewSessionToken({
            token:
              input.viewSessionToken,

            videoId:
              req.params.videoId,

            viewer,
          });

        const cooldownStart =
          new Date(
            Date.now() -

            REPEAT_VIEW_COOLDOWN_MINUTES *
              60 *
              1000
          );

        const existingView =
          await View.exists({
            videoId:
              req.params.videoId,

            ...createViewerFilter(viewer),

            $or: [
              {
                sessionId:
                  payload.sessionId,
              },

              {
                countedAt: {
                  $gte: cooldownStart,
                },
              },
            ],
          });

        if (!existingView) {
          throw new ViewError(
            "A video view record conflict occurred.",
            409
          );
        }

        const video =
          await findPublicVideo(
            req.params.videoId
          );

        return res.status(200).json({
          success: true,

          counted: false,

          message:
            "This video view has already been counted.",

          viewCount:
            getViewCount(video),
        });

      } catch (lookupError) {
        return sendError(
          res,
          lookupError,
          "Duplicate video view lookup error:"
        );
      }
    }

    return sendError(
      res,
      error,
      "Record video view error:"
    );
  }
};

// ==========================================
// EXPORT VIDEO VIEW CONTROLLERS
// ==========================================

module.exports = {
  startVideoView,

  recordVideoView,
};