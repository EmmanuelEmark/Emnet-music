const mongoose = require("mongoose");

const ListeningHistory = require("../models/ListeningHistory");
const Song = require("../models/song");
const Release = require("../models/Release");

// ==========================================
// CONFIGURATION
// ==========================================

const ALLOWED_ROLES = ["listener", "artist"];

const HISTORY_LIMIT = 50;

const ARTIST_FIELDS =
  "stageName profileImage profileImageUploadId verified";

const RELEASE_FIELDS =
  "title releaseType coverImage coverUploadId releaseDate status visibilityStatus";

// ==========================================
// CUSTOM HISTORY ERROR
// ==========================================

class HistoryError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "HistoryError";
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
// Hidden and taken-down content is excluded.
// Older records remain supported.
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
// CHECK CONTENT VISIBILITY
// ==========================================

function isVisible(content) {
  if (!content) return false;

  return (
    content.visibilityStatus === "visible" ||
    content.visibilityStatus === undefined ||
    content.visibilityStatus === null
  );
}

// ==========================================
// VERIFY PUBLIC RELEASE
// ==========================================

function isPublicRelease(release) {
  return (
    Boolean(release) &&
    release.status === "approved" &&
    isVisible(release)
  );
}

// ==========================================
// PREVENT PRIVATE RESPONSE CACHING
//
// Listening history belongs to the
// authenticated user.
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
// VERIFY AUTHENTICATED USER
//
// ACCESS:
// - Listener
// - Artist
//
// BLOCKED:
// - Guest
// - Admin
// - Super Admin
// - Distributor
// ==========================================

function requireHistoryUser(req) {
  if (!req.user?._id || !req.auth) {
    throw new HistoryError(
      "Please sign in to access listening history.",
      401
    );
  }

  if (!ALLOWED_ROLES.includes(req.user.role)) {
    throw new HistoryError(
      "This account cannot access listening history.",
      403
    );
  }

  if (req.user.accountStatus !== "active") {
    throw new HistoryError(
      "Your account is unavailable.",
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
    throw new HistoryError(
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

  if (error instanceof HistoryError) {
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
      message: "Invalid listening history information.",
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
      "Unable to complete the listening history operation.",
  });
}

// ==========================================
// VALIDATE PLAY DURATION
//
// Duration is measured in seconds.
//
// Prevent invalid, negative or inflated
// duration values from being recorded.
// ==========================================

function validatePlayDuration(value, songDuration) {
  if (value === undefined || value === null) {
    return 0;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new HistoryError(
      "Play duration must be a valid number of seconds."
    );
  }

  // Limit recorded duration to the
  // known duration of the song.

  if (
    Number.isFinite(songDuration) &&
    songDuration > 0
  ) {
    return Math.min(
      value,
      songDuration
    );
  }

  return 0;
}

// ==========================================
// FIND AVAILABLE SONG
//
// Both the song and its parent release
// must be published and visible.
// ==========================================

async function findPublicSong(songId) {
  const song = await Song.findOne({
    _id: songId,

    status: "approved",

    ...publicVisibilityFilter(),
  })
    .select(
      "_id title duration status visibilityStatus releaseId"
    )
    .lean();

  if (!song || !song.releaseId) {
    return null;
  }

  const release = await Release.exists({
    _id: song.releaseId,

    status: "approved",

    ...publicVisibilityFilter(),
  });

  if (!release) {
    return null;
  }

  return song;
}

// ==========================================
// POPULATE PUBLIC ARTIST INFORMATION
//
// Restricted artist profiles must not
// be exposed through listening history.
// ==========================================

function publicArtistPopulation(path) {
  return {
    path,

    select: ARTIST_FIELDS,

    match: {
      approvalStatus: "approved",

      ...publicVisibilityFilter(),
    },
  };
}

// ==========================================
// POPULATE PUBLIC SONG INFORMATION
//
// Includes Cloudflare R2 media references.
// ==========================================

function publicSongPopulation() {
  return {
    path: "songId",

    match: {
      status: "approved",

      ...publicVisibilityFilter(),
    },

    populate: [
      publicArtistPopulation(
        "primaryArtists"
      ),

      publicArtistPopulation(
        "featuredArtists"
      ),

      {
        path: "releaseId",

        select: RELEASE_FIELDS,

        match: {
          status: "approved",

          ...publicVisibilityFilter(),
        },
      },
    ],
  };
}

// ==========================================
// SANITIZE PUBLIC SONG INFORMATION
//
// Remove internal administrative fields
// while preserving playback information.
// ==========================================

function sanitizePublicSong(song) {
  const data =
    typeof song.toObject === "function"
      ? song.toObject()
      : { ...song };

  delete data.moderationReason;
  delete data.moderatedBy;
  delete data.moderatedAt;
  delete data.audioHash;
  delete data.__v;

  return data;
}

// ==========================================
// RECORD LISTENING HISTORY
//
// Records personal listening activity.
//
// This function does NOT directly increase
// the official song play count.
//
// Official play counting remains the
// responsibility of playController.js.
// ==========================================

const recordListeningHistory = async (req, res) => {
  try {
    preventCaching(res);

    const user = requireHistoryUser(req);

    const { songId } = req.params;

    // Validate song ID.

    if (!isValidId(songId)) {
      throw new HistoryError(
        "Invalid song ID."
      );
    }

    // Validate request body.

    const input = req.body ?? {};

    if (
      typeof input !== "object" ||
      Array.isArray(input)
    ) {
      throw new HistoryError(
        "Invalid listening history information."
      );
    }

    // Verify public song and parent release.

    const song = await findPublicSong(
      songId
    );

    if (!song) {
      throw new HistoryError(
        "This song is unavailable.",
        404
      );
    }

    // Validate supplied listening duration.

    const playDuration =
      validatePlayDuration(
        input.playDuration,
        song.duration
      );

    // Save personal listening history.
    //
    // User identity and playedAt are
    // determined by the backend.

    const history =
      await ListeningHistory.create({
        userId: user._id,

        songId: song._id,

        playDuration,

        playedAt: new Date(),
      });

    return res.status(201).json({
      success: true,

      message:
        "Listening history recorded successfully.",

      history,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Record listening history error:"
    );
  }
};

// ==========================================
// FIND RECENT AVAILABLE SONG HISTORY
//
// Group by song so that the same song
// does not appear multiple times.
//
// Check visibility before applying
// the recently played limit.
// ==========================================

async function findRecentHistory(userId) {
  const objectId =
    new mongoose.Types.ObjectId(
      String(userId)
    );

  return ListeningHistory.aggregate([
    // Find only this user's history.

    {
      $match: {
        userId: objectId,
      },
    },

    // Newest listening activity first.

    {
      $sort: {
        playedAt: -1,

        _id: -1,
      },
    },

    // Keep only the latest listening
    // activity for each unique song.

    {
      $group: {
        _id: "$songId",

        historyId: {
          $first: "$_id",
        },

        playedAt: {
          $first: "$playedAt",
        },
      },
    },

    // Retrieve associated song.

    {
      $lookup: {
        from: Song.collection.name,

        localField: "_id",

        foreignField: "_id",

        as: "song",
      },
    },

    {
      $unwind: "$song",
    },

    // Require approved and visible song.

    {
      $match: {
        "song.status": "approved",

        $or: [
          {
            "song.visibilityStatus": "visible",
          },

          {
            "song.visibilityStatus": {
              $exists: false,
            },
          },

          {
            "song.visibilityStatus": null,
          },
        ],
      },
    },

    // Retrieve parent release.

    {
      $lookup: {
        from: Release.collection.name,

        localField: "song.releaseId",

        foreignField: "_id",

        as: "parentRelease",
      },
    },

    // Require approved and visible
    // parent release.

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

    // Restore recently played order.

    {
      $sort: {
        playedAt: -1,

        historyId: -1,
      },
    },

    // Limit available unique songs.

    {
      $limit: HISTORY_LIMIT,
    },

    // Return necessary information only.

    {
      $project: {
        _id: 1,

        historyId: 1,

        playedAt: 1,
      },
    },
  ]);
}

// ==========================================
// GET RECENTLY PLAYED SONGS
//
// Restricted songs are excluded from
// the response without deleting their
// original listening history.
// ==========================================

const getRecentlyPlayed = async (req, res) => {
  try {
    preventCaching(res);

    const user = requireHistoryUser(req);

    // ======================================
    // GET RECENT AVAILABLE HISTORY
    // ======================================

    const recentHistory =
      await findRecentHistory(
        user._id
      );

    if (recentHistory.length === 0) {
      return res.status(200).json({
        success: true,

        recentlyPlayed: [],
      });
    }

    // ======================================
    // GET SELECTED HISTORY RECORD IDS
    // ======================================

    const historyIds =
      recentHistory.map(
        (item) => item.historyId
      );

    // ======================================
    // LOAD COMPLETE PUBLIC SONG INFORMATION
    // ======================================

    const history =
      await ListeningHistory.find({
        _id: {
          $in: historyIds,
        },

        userId: user._id,
      })
        .select(
          "songId playedAt"
        )
        .populate(
          publicSongPopulation()
        )
        .lean();

    // ======================================
    // BUILD HISTORY LOOKUP MAP
    // ======================================

    const historyMap = new Map(
      history.map(
        (item) => [
          String(item._id),
          item,
        ]
      )
    );

    const recentlyPlayed = [];

    const includedSongIds = new Set();

    // ======================================
    // PRESERVE RECENT LISTENING ORDER
    // ======================================

    for (const record of recentHistory) {
      const item = historyMap.get(
        String(record.historyId)
      );

      if (!item || !item.songId) {
        continue;
      }

      const song = item.songId;

      // Recheck song visibility.

      if (
        song.status !== "approved" ||
        !isVisible(song)
      ) {
        continue;
      }

      // Recheck parent release availability.

      if (
        !isPublicRelease(
          song.releaseId
        )
      ) {
        continue;
      }

      const songId = String(song._id);

      // Prevent duplicate songs.

      if (includedSongIds.has(songId)) {
        continue;
      }

      includedSongIds.add(songId);

      recentlyPlayed.push({
        song: sanitizePublicSong(song),

        playedAt: item.playedAt,
      });
    }

    // ======================================
    // RETURN RECENTLY PLAYED SONGS
    //
    // Existing response structure preserved.
    // ======================================

    return res.status(200).json({
      success: true,

      recentlyPlayed,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Get recently played songs error:"
    );
  }
};

// ==========================================
// EXPORT HISTORY CONTROLLERS
// ==========================================

module.exports = {
  recordListeningHistory,

  getRecentlyPlayed,
};