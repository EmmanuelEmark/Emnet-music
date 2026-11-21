const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const Play = require("../models/play");
const Song = require("../models/song");
const Release = require("../models/Release");
const User = require("../models/User");

// ==========================================
// CONFIGURATION
// ==========================================

const REPEAT_PLAY_COOLDOWN_MINUTES = 5;
const MINIMUM_PLAY_SECONDS = 30;
const PLAY_SESSION_EXPIRY_SECONDS = 900;

const ALLOWED_ROLES = ["listener", "artist"];

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ==========================================
// CUSTOM PLAY ERROR
// ==========================================

class PlayError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "PlayError";
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

// ==========================================
// PUBLIC VISIBILITY FILTER
//
// Exclude hidden and taken-down content.
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
// VERIFY JWT SECRET
// ==========================================

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (
    typeof secret !== "string" ||
    !secret.trim()
  ) {
    throw new PlayError(
      "Playback session configuration is unavailable.",
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
    throw new PlayError(
      "Invalid playback information."
    );
  }

  return body;
}

// ==========================================
// CENTRALIZED ERROR HANDLING
// ==========================================

function sendError(res, error, context) {
  preventCaching(res);

  if (error instanceof PlayError) {
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
        "The play result could not be confirmed. Retry using the same playback session.",
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
        "Playback statistics are being updated. Please try again.",
    });
  }

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,
      counted: false,
      message: "Invalid playback information.",
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
      "Unable to process the song play.",
  });
}

// ==========================================
// VERIFY AUTHENTICATED LISTENER
//
// Admin, Super Admin and Distributor
// accounts cannot generate listener plays.
// ==========================================

function verifyAuthenticatedUser(req) {
  if (!req.user?._id || !req.auth) {
    throw new PlayError(
      "Invalid authentication session.",
      401
    );
  }

  if (!ALLOWED_ROLES.includes(req.user.role)) {
    throw new PlayError(
      "This account cannot generate song plays.",
      403
    );
  }

  if (req.user.accountStatus !== "active") {
    throw new PlayError(
      "Your account is unavailable.",
      403
    );
  }

  if (
    !isValidId(req.user._id) ||

    String(req.auth.userId) !==
      String(req.user._id) ||

    req.auth.role !== req.user.role ||

    !Number.isSafeInteger(req.auth.tokenVersion) ||

    req.auth.tokenVersion < 0
  ) {
    throw new PlayError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// CREATE PRIVATE GUEST IDENTIFIER
//
// Raw IP addresses and browser information
// are not directly stored in play records.
// ==========================================

function createGuestIdentity(req, guestId) {
  if (
    typeof guestId !== "string" ||
    !UUID_V4_PATTERN.test(guestId)
  ) {
    throw new PlayError(
      "A valid guest ID is required.",
      400
    );
  }

  const ipAddress =
    req.ip || "";

  const userAgent =
    req.get("user-agent") || "";

  return crypto
    .createHmac(
      "sha256",
      getJwtSecret()
    )
    .update(
      `${guestId}|${ipAddress}|${userAgent}`
    )
    .digest("hex");
}

// ==========================================
// RESOLVE LISTENER IDENTITY
//
// Authenticated:
// user:<MongoDB user ID>
//
// Guest:
// guest:<Hashed guest identity>
// ==========================================

function resolveListenerIdentity(req) {
  const input = getRequestBody(req);

  if (req.user) {
    const user = verifyAuthenticatedUser(req);

    return {
      userId: user._id,

      guestId: null,

      identity:
        `user:${String(user._id)}`,
    };
  }

  // Do not downgrade an invalid authenticated
  // request into a guest request.

  if (
    req.auth ||
    req.get("authorization")
  ) {
    throw new PlayError(
      "Invalid or expired authentication session.",
      401
    );
  }

  const guestId = createGuestIdentity(
    req,
    input.guestId
  );

  return {
    userId: null,

    guestId,

    identity:
      `guest:${guestId}`,
  };
}

// ==========================================
// NORMALIZE SONG DURATION
//
// Supports numeric seconds and older
// minute:second duration formats.
// ==========================================

function normalizeDuration(duration) {
  if (
    typeof duration === "number"
  ) {
    return (
      Number.isFinite(duration) &&
      duration > 0
    )
      ? duration
      : 0;
  }

  if (typeof duration !== "string") {
    return 0;
  }

  const value = duration.trim();

  if (!value) return 0;

  // Support numeric strings.

  const numericDuration = Number(value);

  if (
    Number.isFinite(numericDuration) &&
    numericDuration > 0
  ) {
    return numericDuration;
  }

  // Support MM:SS format.

  if (/^\d+:[0-5]\d$/.test(value)) {
    const [minutes, seconds] =
      value.split(":").map(Number);

    const totalSeconds =
      minutes * 60 + seconds;

    return (
      Number.isFinite(totalSeconds) &&
      totalSeconds > 0
    )
      ? totalSeconds
      : 0;
  }

  return 0;
}

// ==========================================
// GET REQUIRED LISTENING DURATION
//
// Normal songs: 30 seconds.
// Short songs: Full song duration.
// ==========================================

function getMinimumSeconds(song) {
  const duration = normalizeDuration(
    song.duration
  );

  if (duration <= 0) {
    return MINIMUM_PLAY_SECONDS;
  }

  return Math.min(
    MINIMUM_PLAY_SECONDS,
    duration
  );
}

// ==========================================
// FIND PUBLIC SONG
//
// Both the song and its parent release
// must be approved and visible.
// ==========================================

async function findPublicSong(songId, session) {
  if (!isValidId(songId)) {
    throw new PlayError(
      "Invalid song ID."
    );
  }

  const songQuery = Song.findOne({
    _id: songId,

    status: "approved",

    ...publicVisibilityFilter(),
  })
    .select(
      "_id title duration releaseId playCount status visibilityStatus"
    );

  if (session) {
    songQuery.session(session);
  }

  const song = await songQuery.lean();

  if (!song || !song.releaseId) {
    throw new PlayError(
      "This song is unavailable.",
      404
    );
  }

  const releaseQuery = Release.exists({
    _id: song.releaseId,

    status: "approved",

    ...publicVisibilityFilter(),
  });

  if (session) {
    releaseQuery.session(session);
  }

  const release = await releaseQuery;

  if (!release) {
    throw new PlayError(
      "This song belongs to an unavailable release.",
      404
    );
  }

  return song;
}

// ==========================================
// RUN PLAY COUNT TRANSACTION
// ==========================================

async function runPlayTransaction(operation) {
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
// RECHECK AUTHENTICATED ACCOUNT
//
// Prevent play counting using an account
// that has been suspended or changed.
// ==========================================

async function lockListenerAccount(
  req,
  listener,
  session
) {
  // Guest listeners have no User record.

  if (!listener.userId) {
    return;
  }

  const currentUser =
    verifyAuthenticatedUser(req);

  const version =
    req.auth.tokenVersion;

  const filter = {
    _id: listener.userId,

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
    throw new PlayError(
      "Your account or authentication session has changed.",
      403
    );
  }
}

// ==========================================
// LOCK PUBLIC RELEASE
//
// Coordinate play counting with
// release moderation.
// ==========================================

async function lockPublicRelease(
  releaseId,
  session
) {
  const release =
    await Release.findOneAndUpdate(
      {
        _id: releaseId,

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

    ).select("_id");

  if (!release) {
    throw new PlayError(
      "The parent release is unavailable.",
      404
    );
  }
}

// ==========================================
// LOCK PUBLIC SONG
//
// Serialize concurrent play counting for
// the same song.
//
// This prevents simultaneous requests
// from bypassing the five-minute cooldown.
// ==========================================

async function lockPublicSong(
  songId,
  releaseId,
  session
) {
  const song =
    await Song.findOneAndUpdate(
      {
        _id: songId,

        releaseId,

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
        "_id duration releaseId playCount"
      )
      .lean();

  if (!song) {
    throw new PlayError(
      "This song is unavailable.",
      404
    );
  }

  return song;
}

// ==========================================
// CREATE LISTENER DATABASE FILTER
// ==========================================

function createListenerFilter(listener) {
  if (listener.userId) {
    return {
      userId: listener.userId,
    };
  }

  return {
    userId: null,

    guestId: listener.guestId,
  };
}

// ==========================================
// CREATE PLAY SESSION TOKEN
//
// Tokens are signed and expire after
// 15 minutes.
// ==========================================

function createPlaySessionToken({
  song,
  listener,
  minimumSeconds,
}) {
  return jwt.sign(
    {
      purpose: "song-play",

      songId: String(song._id),

      identity: listener.identity,

      sessionId: crypto.randomUUID(),

      startedAt: Date.now(),

      minimumSeconds,
    },

    getJwtSecret(),

    {
      algorithm: "HS256",

      expiresIn:
        PLAY_SESSION_EXPIRY_SECONDS,
    }
  );
}

// ==========================================
// VERIFY PLAY SESSION TOKEN
// ==========================================

function verifyPlaySessionToken({
  sessionToken,
  songId,
  listener,
}) {
  if (
    typeof sessionToken !== "string" ||
    !sessionToken ||
    sessionToken.length > 4096
  ) {
    throw new PlayError(
      "A valid playback session is required.",
      400
    );
  }

  let payload;

  try {
    payload = jwt.verify(
      sessionToken,

      getJwtSecret(),

      {
        algorithms: ["HS256"],

        maxAge:
          `${PLAY_SESSION_EXPIRY_SECONDS}s`,
      }
    );

  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new PlayError(
        "Your playback session has expired.",
        401
      );
    }

    if (error instanceof PlayError) {
      throw error;
    }

    throw new PlayError(
      "Invalid playback session.",
      401
    );
  }

  if (
    !payload ||
    typeof payload !== "object" ||

    payload.purpose !== "song-play" ||

    payload.songId !== String(songId).toLowerCase() ||

    payload.identity !== listener.identity ||

    typeof payload.sessionId !== "string" ||

    !UUID_V4_PATTERN.test(payload.sessionId) ||

    !Number.isSafeInteger(payload.startedAt) ||

    payload.startedAt <= 0 ||

    payload.startedAt > Date.now() ||

    !Number.isFinite(payload.minimumSeconds) ||

    payload.minimumSeconds <= 0 ||

    payload.minimumSeconds > MINIMUM_PLAY_SECONDS ||

    !Number.isSafeInteger(payload.exp)
  ) {
    throw new PlayError(
      "Invalid playback session information.",
      401
    );
  }

  return payload;
}

// ==========================================
// CHECK REQUIRED LISTENING TIME
//
// Server-side elapsed time protection.
//
// This prevents immediate submission of
// a newly created play session.
// ==========================================

function hasReachedMinimumTime(
  payload,
  minimumSeconds
) {
  const elapsedSeconds =
    (Date.now() - payload.startedAt) / 1000;

  return elapsedSeconds >= Math.max(
    payload.minimumSeconds,
    minimumSeconds
  );
}

// ==========================================
// NORMALIZE PLAY COUNT
// ==========================================

function getPlayCount(song) {
  const count = Number(song?.playCount);

  return (
    Number.isFinite(count) &&
    count >= 0
  )
    ? count
    : 0;
}

// ==========================================
// START SONG PLAY
//
// POST /api/plays/songs/:songId/start
//
// Returns a signed playback session.
// Does not increase the official play count.
// ==========================================

const startSongPlay = async (req, res) => {
  try {
    preventCaching(res);

    const { songId } = req.params;

    if (!isValidId(songId)) {
      throw new PlayError(
        "Invalid song ID."
      );
    }

    // Resolve guest or authenticated identity.

    const listener =
      resolveListenerIdentity(req);

    // Verify song and release availability.

    const song =
      await findPublicSong(songId);

    // Determine required listening duration.

    const minimumSeconds =
      getMinimumSeconds(song);

    // Create signed playback session.

    const sessionToken =
      createPlaySessionToken({
        song,

        listener,

        minimumSeconds,
      });

    return res.status(200).json({
      success: true,

      sessionToken,

      minimumSeconds,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Start song play error:"
    );
  }
};

// ==========================================
// RECORD OFFICIAL SONG PLAY
//
// POST /api/plays/songs/:songId
//
// Requires a valid playback session.
//
// Actual play record and official song
// counter are committed together.
// ==========================================

const recordSongPlay = async (req, res) => {
  try {
    preventCaching(res);

    const { songId } = req.params;

    if (!isValidId(songId)) {
      throw new PlayError(
        "Invalid song ID."
      );
    }

    const input =
      getRequestBody(req);

    // ======================================
    // VERIFY LISTENER IDENTITY
    // ======================================

    const listener =
      resolveListenerIdentity(req);

    // ======================================
    // VERIFY SIGNED PLAY SESSION
    // ======================================

    const payload =
      verifyPlaySessionToken({
        sessionToken:
          input.sessionToken,

        songId,

        listener,
      });

    // ======================================
    // VERIFY PUBLIC SONG
    // ======================================

    const publicSong =
      await findPublicSong(songId);

    const minimumSeconds =
      getMinimumSeconds(publicSong);

    // ======================================
    // CHECK REQUIRED LISTENING TIME
    // ======================================

    if (
      !hasReachedMinimumTime(
        payload,
        minimumSeconds
      )
    ) {
      return res.status(200).json({
        success: true,

        counted: false,

        message:
          "Minimum listening time has not been reached.",

        playCount:
          getPlayCount(publicSong),
      });
    }

    // ======================================
    // START OFFICIAL PLAY TRANSACTION
    // ======================================

    const result =
      await runPlayTransaction(
        async (session) => {
          // Recheck the authenticated account.

          await lockListenerAccount(
            req,
            listener,
            session
          );

          // Recheck song and parent release.

          const song =
            await findPublicSong(
              songId,
              session
            );

          // Lock parent release first.

          await lockPublicRelease(
            song.releaseId,
            session
          );

          // Lock song to serialize play counts.

          const lockedSong =
            await lockPublicSong(
              song._id,
              song.releaseId,
              session
            );

          // =================================
          // RECHECK SESSION EXPIRATION
          // =================================

          if (
            Date.now() >=
              payload.exp * 1000
          ) {
            throw new PlayError(
              "Your playback session has expired.",
              401
            );
          }

          // =================================
          // RECHECK LISTENING TIME
          // =================================

          if (
            !hasReachedMinimumTime(
              payload,
              getMinimumSeconds(lockedSong)
            )
          ) {
            return {
              counted: false,

              message:
                "Minimum listening time has not been reached.",

              playCount:
                getPlayCount(lockedSong),
            };
          }

          // =================================
          // PREVENT PLAY SESSION REUSE
          // =================================

          const existingSession =
            await Play.exists({
              sessionId:
                payload.sessionId,
            }).session(session);

          if (existingSession) {
            return {
              counted: false,

              message:
                "This playback session has already been counted.",

              playCount:
                getPlayCount(lockedSong),
            };
          }

          // =================================
          // FIVE-MINUTE PLAY COOLDOWN
          // =================================

          const now = new Date();

          const cooldownStart =
            new Date(
              now.getTime() -

              REPEAT_PLAY_COOLDOWN_MINUTES *
                60 *
                1000
            );

          const recentPlay =
            await Play.exists({
              songId: lockedSong._id,

              ...createListenerFilter(
                listener
              ),

              countedAt: {
                $gte: cooldownStart,
              },

            }).session(session);

          if (recentPlay) {
            return {
              counted: false,

              message:
                "A recent play has already been counted for this song.",

              playCount:
                getPlayCount(lockedSong),
            };
          }

          // =================================
          // CREATE OFFICIAL PLAY RECORD
          // =================================

          const play = new Play({
            userId:
              listener.userId,

            guestId:
              listener.guestId,

            songId:
              lockedSong._id,

            sessionId:
              payload.sessionId,

            countedAt:
              now,
          });

          await play.save({
            session,
          });

          // =================================
          // INCREASE OFFICIAL SONG PLAY COUNT
          // =================================

          const updatedSong =
            await Song.findOneAndUpdate(
              {
                _id: lockedSong._id,

                releaseId:
                  lockedSong.releaseId,

                status: "approved",

                ...publicVisibilityFilter(),
              },

              {
                $inc: {
                  playCount: 1,

                  __v: 1,
                },
              },

              {
                new: true,

                session,

                timestamps: false,
              }

            ).select("_id playCount");

          if (!updatedSong) {
            throw new PlayError(
              "The song is no longer available.",
              409
            );
          }

          // =================================
          // PREPARE TRANSACTION RESULT
          // =================================

          return {
            counted: true,

            message:
              "Song play counted successfully.",

            playCount:
              getPlayCount(updatedSong),
          };
        }
      );

    // ======================================
    // RETURN OFFICIAL PLAY RESULT
    // ======================================

    return res
      .status(result.counted ? 201 : 200)
      .json({
        success: true,

        counted:
          result.counted,

        message:
          result.message,

        playCount:
          result.playCount,
      });

  } catch (error) {
    // ======================================
    // HANDLE DUPLICATE PLAY SESSION
    // ======================================

    if (error.code === 11000) {
      try {
        const input = getRequestBody(req);

        const listener =
          resolveListenerIdentity(req);

        const payload =
          verifyPlaySessionToken({
            sessionToken:
              input.sessionToken,

            songId:
              req.params.songId,

            listener,
          });

        const existingSession =
          await Play.exists({
            sessionId:
              payload.sessionId,

            songId:
              req.params.songId,

            ...createListenerFilter(
              listener
            ),
          });

        if (!existingSession) {
          throw new PlayError(
            "A playback record conflict occurred.",
            409
          );
        }

        const song =
          await findPublicSong(
            req.params.songId
          );

        return res.status(200).json({
          success: true,

          counted: false,

          message:
            "This playback session has already been counted.",

          playCount:
            getPlayCount(song),
        });

      } catch (lookupError) {
        return sendError(
          res,
          lookupError,
          "Duplicate play lookup error:"
        );
      }
    }

    return sendError(
      res,
      error,
      "Record song play error:"
    );
  }
};

// ==========================================
// EXPORT PLAY CONTROLLERS
// ==========================================

module.exports = {
  startSongPlay,

  recordSongPlay,
};