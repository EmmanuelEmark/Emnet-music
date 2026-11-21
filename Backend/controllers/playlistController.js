const mongoose = require("mongoose");

const Playlist = require("../models/playlist");
const Song = require("../models/song");
const Release = require("../models/Release");
const User = require("../models/User");

// ==========================================
// CONFIGURATION
// ==========================================

const ALLOWED_ROLES = ["listener", "artist"];

const ARTIST_FIELDS =
  "stageName profileImage profileImageUploadId verified";

const RELEASE_FIELDS =
  "title releaseType coverImage coverUploadId releaseDate status visibilityStatus";

// ==========================================
// CUSTOM PLAYLIST ERROR
// ==========================================

class PlaylistError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "PlaylistError";
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

function validatePlaylistId(playlistId) {
  if (!isValidId(playlistId)) {
    throw new PlaylistError("Invalid playlist ID.");
  }
}

function validateSongId(songId) {
  if (!isValidId(songId)) {
    throw new PlaylistError("Invalid song ID.");
  }
}

// ==========================================
// PUBLIC VISIBILITY FILTER
//
// Hidden and taken-down content is excluded.
//
// Older records without explicit visibility
// statuses remain supported.
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
// VERIFY CONTENT VISIBILITY
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
// CENTRALIZED ERROR HANDLING
// ==========================================

function sendError(res, error, context) {
  preventCaching(res);

  if (error instanceof PlaylistError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
    });
  }

  // Unknown transaction result.

  if (
    error.hasErrorLabel?.(
      "UnknownTransactionCommitResult"
    )
  ) {
    return res.status(503).json({
      success: false,
      message:
        "The operation result could not be confirmed. Refresh your playlists before trying again.",
    });
  }

  // Database conflicts.

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
        "Your playlist is being modified by another request. Refresh and try again.",
    });
  }

  // Duplicate records.

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message:
        "A duplicate playlist record already exists.",
    });
  }

  // Invalid database information.

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid playlist information.",
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
      "Unable to complete the playlist operation.",
  });
}

// ==========================================
// REQUIRE AUTHENTICATED LISTENER OR ARTIST
// ==========================================

function requirePlaylistUser(req) {
  if (!req.user?._id || !req.auth) {
    throw new PlaylistError(
      "Please sign in to manage playlists.",
      401
    );
  }

  if (!ALLOWED_ROLES.includes(req.user.role)) {
    throw new PlaylistError(
      "This account cannot access listener playlists.",
      403
    );
  }

  if (req.user.accountStatus !== "active") {
    throw new PlaylistError(
      "Your account is unavailable.",
      403
    );
  }

  if (
    String(req.auth.userId) !==
      String(req.user._id) ||
    req.auth.role !== req.user.role ||
    !Number.isSafeInteger(req.auth.tokenVersion) ||
    req.auth.tokenVersion < 0
  ) {
    throw new PlaylistError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// RUN DATABASE TRANSACTION
// ==========================================

async function runPlaylistTransaction(operation) {
  const session = await mongoose.startSession();

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
// every playlist mutation transaction.
// ==========================================

async function lockPlaylistUser(req, session) {
  const currentUser = requirePlaylistUser(req);

  const filter = {
    _id: currentUser._id,
    role: currentUser.role,
    accountStatus: "active",
  };

  const version = req.auth.tokenVersion;

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

  const user = await User.findOneAndUpdate(
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
    throw new PlaylistError(
      "Your account or authentication session has changed.",
      403
    );
  }

  return user;
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
    throw new PlaylistError(
      "Invalid playlist information."
    );
  }

  return body;
}

// ==========================================
// CHECK SUPPLIED FIELD
// ==========================================

function hasField(object, field) {
  return Object.prototype.hasOwnProperty.call(
    object,
    field
  );
}

// ==========================================
// VALIDATE PLAYLIST NAME
// ==========================================

function validatePlaylistName(value) {
  if (typeof value !== "string") {
    throw new PlaylistError(
      "Playlist name must be text."
    );
  }

  const name = value.trim();

  if (!name) {
    throw new PlaylistError(
      "Playlist name is required."
    );
  }

  if (name.length > 100) {
    throw new PlaylistError(
      "Playlist name cannot exceed 100 characters."
    );
  }

  return name;
}

// ==========================================
// VALIDATE PLAYLIST DESCRIPTION
// ==========================================

function validatePlaylistDescription(value) {
  if (typeof value !== "string") {
    throw new PlaylistError(
      "Playlist description must be text."
    );
  }

  const description = value.trim();

  if (description.length > 500) {
    throw new PlaylistError(
      "Playlist description cannot exceed 500 characters."
    );
  }

  return description;
}

// ==========================================
// VALIDATE PLAYLIST PRIVACY
// ==========================================

function validatePlaylistPrivacy(value) {
  if (typeof value !== "boolean") {
    throw new PlaylistError(
      "isPublic must be true or false."
    );
  }

  return value;
}

// ==========================================
// FIND OWNED PLAYLIST
// ==========================================

async function findOwnedPlaylist({
  playlistId,
  userId,
  session,
}) {
  const query = Playlist.findOne({
    _id: playlistId,
    userId,
  });

  if (session) {
    query.session(session);
  }

  const playlist = await query;

  if (!playlist) {
    throw new PlaylistError(
      "Playlist not found or access denied.",
      404
    );
  }

  return playlist;
}

// ==========================================
// FIND AVAILABLE SONG
//
// Both the song and parent release must
// be published and publicly visible.
// ==========================================

async function findPublicSong(songId, session) {
  const song = await Song.findOne({
    _id: songId,

    status: "approved",

    ...publicVisibilityFilter(),

  })
    .select("_id releaseId status visibilityStatus")
    .session(session)
    .lean();

  if (!song || !song.releaseId) {
    throw new PlaylistError(
      "This song is unavailable.",
      404
    );
  }

  const release = await Release.exists({
    _id: song.releaseId,

    status: "approved",

    ...publicVisibilityFilter(),

  }).session(session);

  if (!release) {
    throw new PlaylistError(
      "This song belongs to an unavailable release.",
      404
    );
  }

  return song;
}

// ==========================================
// PUBLIC ARTIST POPULATION
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
// POPULATE AVAILABLE PLAYLIST SONGS
//
// This filters the returned data.
//
// It does not remove restricted song IDs
// from the stored playlist.
// ==========================================

function populatePlaylistSongs(query) {
  return query.populate({
    path: "songs",

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
  });
}

// ==========================================
// SANITIZE PUBLIC SONG INFORMATION
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
// SANITIZE PLAYLIST RESPONSE
//
// Do not expose restricted songs or songs
// belonging to restricted parent releases.
// ==========================================

function sanitizePlaylist(playlist) {
  const result =
    typeof playlist.toObject === "function"
      ? playlist.toObject()
      : { ...playlist };

  const availableSongs = [];

  const includedSongIds = new Set();

  for (const song of result.songs || []) {
    if (!song) continue;

    if (
      song.status !== "approved" ||
      !isVisible(song) ||
      !isPublicRelease(song.releaseId)
    ) {
      continue;
    }

    const songId = String(song._id);

    if (includedSongIds.has(songId)) {
      continue;
    }

    includedSongIds.add(songId);

    availableSongs.push(
      sanitizePublicSong(song)
    );
  }

  result.songs = availableSongs;

  result.songCount = availableSongs.length;

  delete result.__v;

  return result;
}

// ==========================================
// LOAD SAFE PLAYLIST RESPONSE
// ==========================================

async function loadPlaylistResponse({
  playlistId,
  userId,
  session,
}) {
  const query = populatePlaylistSongs(
    Playlist.findOne({
      _id: playlistId,
      userId,
    })
  );

  if (session) {
    query.session(session);
  }

  const playlist = await query.lean();

  if (!playlist) {
    throw new PlaylistError(
      "Playlist not found or access denied.",
      404
    );
  }

  return sanitizePlaylist(playlist);
}

// ==========================================
// CREATE PLAYLIST
//
// POST /api/playlists
// ==========================================

const createPlaylist = async (req, res) => {
  try {
    preventCaching(res);

    requirePlaylistUser(req);

    const input = getRequestBody(req);

    const name = validatePlaylistName(
      input.name
    );

    const description = hasField(
      input,
      "description"
    )
      ? validatePlaylistDescription(
          input.description
        )
      : "";

    const isPublic = hasField(
      input,
      "isPublic"
    )
      ? validatePlaylistPrivacy(
          input.isPublic
        )
      : false;

    // Create playlist inside transaction.

    const playlist = await runPlaylistTransaction(
      async (session) => {
        const user = await lockPlaylistUser(
          req,
          session
        );

        const newPlaylist = new Playlist({
          userId: user._id,

          name,

          description,

          isPublic,

          songs: [],
        });

        await newPlaylist.save({
          session,
        });

        return sanitizePlaylist(newPlaylist);
      }
    );

    return res.status(201).json({
      success: true,

      message:
        "Playlist created successfully.",

      playlist,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Create playlist error:"
    );
  }
};

// ==========================================
// GET MY PLAYLISTS
//
// GET /api/playlists
//
// Only the current user's playlists
// are returned.
// ==========================================

const getMyPlaylists = async (req, res) => {
  try {
    preventCaching(res);

    const user = requirePlaylistUser(req);

    const playlists = await populatePlaylistSongs(
      Playlist.find({
        userId: user._id,
      })
        .sort({
          createdAt: -1,
          _id: -1,
        })
    ).lean();

    const availablePlaylists = playlists.map(
      sanitizePlaylist
    );

    return res.status(200).json({
      success: true,

      count: availablePlaylists.length,

      playlists: availablePlaylists,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Get my playlists error:"
    );
  }
};

// ==========================================
// GET ONE OWNED PLAYLIST
//
// GET /api/playlists/:playlistId
// ==========================================

const getMyPlaylistById = async (req, res) => {
  try {
    preventCaching(res);

    const user = requirePlaylistUser(req);

    const { playlistId } = req.params;

    validatePlaylistId(playlistId);

    const playlist = await loadPlaylistResponse({
      playlistId,
      userId: user._id,
    });

    return res.status(200).json({
      success: true,
      playlist,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Get playlist details error:"
    );
  }
};

// ==========================================
// ADD SONG TO PLAYLIST
//
// POST /api/playlists/:playlistId/songs/:songId
//
// Only published and visible songs
// belonging to public releases can
// be added.
// ==========================================

const addSongToPlaylist = async (req, res) => {
  try {
    preventCaching(res);

    requirePlaylistUser(req);

    const {
      playlistId,
      songId,
    } = req.params;

    validatePlaylistId(playlistId);
    validateSongId(songId);

    const playlist = await runPlaylistTransaction(
      async (session) => {
        // Verify authenticated account.

        const user = await lockPlaylistUser(
          req,
          session
        );

        // Verify playlist ownership.

        const existingPlaylist =
          await findOwnedPlaylist({
            playlistId,
            userId: user._id,
            session,
          });

        // Verify song and parent release.

        const song = await findPublicSong(
          songId,
          session
        );

        // Prevent duplicate songs.

        const alreadyAdded = (
          existingPlaylist.songs || []
        ).some(
          (id) =>
            String(id) === String(song._id)
        );

        if (alreadyAdded) {
          throw new PlaylistError(
            "This song is already in your playlist.",
            400
          );
        }

        // Atomic addition.
        //
        // $addToSet prevents duplicate entries.

        const updated =
          await Playlist.findOneAndUpdate(
            {
              _id: playlistId,

              userId: user._id,

              songs: {
                $ne: song._id,
              },
            },

            {
              $addToSet: {
                songs: song._id,
              },

              $inc: {
                __v: 1,
              },
            },

            {
              new: true,
              runValidators: true,
              session,
            }
          );

        if (!updated) {
          throw new PlaylistError(
            "The playlist has changed. Refresh and try again.",
            409
          );
        }

        // Return only available songs.

        return loadPlaylistResponse({
          playlistId,
          userId: user._id,
          session,
        });
      }
    );

    return res.status(200).json({
      success: true,

      message:
        "Song added to playlist successfully.",

      playlist,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Add song to playlist error:"
    );
  }
};

// ==========================================
// REMOVE SONG FROM PLAYLIST
//
// DELETE /api/playlists/:playlistId/songs/:songId
//
// Removal is allowed even if a song has
// subsequently been restricted.
// ==========================================

const removeSongFromPlaylist = async (req, res) => {
  try {
    preventCaching(res);

    requirePlaylistUser(req);

    const {
      playlistId,
      songId,
    } = req.params;

    validatePlaylistId(playlistId);
    validateSongId(songId);

    const playlist = await runPlaylistTransaction(
      async (session) => {
        const user = await lockPlaylistUser(
          req,
          session
        );

        // Verify playlist ownership.

        await findOwnedPlaylist({
          playlistId,
          userId: user._id,
          session,
        });

        // Remove the stored song ID.
        //
        // This operation does not require
        // the song to remain publicly visible.

        await Playlist.updateOne(
          {
            _id: playlistId,
            userId: user._id,
          },

          {
            $pull: {
              songs: songId,
            },

            $inc: {
              __v: 1,
            },
          },

          {
            session,
            runValidators: true,
          }
        );

        return loadPlaylistResponse({
          playlistId,
          userId: user._id,
          session,
        });
      }
    );

    return res.status(200).json({
      success: true,

      message:
        "Song removed from playlist successfully.",

      playlist,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Remove song from playlist error:"
    );
  }
};

// ==========================================
// UPDATE PLAYLIST
//
// PATCH /api/playlists/:playlistId
//
// Users may change:
// - Playlist name.
// - Playlist description.
// - Playlist privacy.
//
// Ownership and song membership cannot
// be modified through this endpoint.
// ==========================================

const updatePlaylist = async (req, res) => {
  try {
    preventCaching(res);

    requirePlaylistUser(req);

    const { playlistId } = req.params;

    validatePlaylistId(playlistId);

    const input = getRequestBody(req);

    const changes = {};

    // Update name.

    if (hasField(input, "name")) {
      changes.name = validatePlaylistName(
        input.name
      );
    }

    // Update description.

    if (hasField(input, "description")) {
      changes.description =
        validatePlaylistDescription(
          input.description
        );
    }

    // Update privacy.

    if (hasField(input, "isPublic")) {
      changes.isPublic =
        validatePlaylistPrivacy(
          input.isPublic
        );
    }

    const playlist = await runPlaylistTransaction(
      async (session) => {
        const user = await lockPlaylistUser(
          req,
          session
        );

        await findOwnedPlaylist({
          playlistId,
          userId: user._id,
          session,
        });

        // Only update explicitly permitted fields.

        if (Object.keys(changes).length > 0) {
          const updated =
            await Playlist.findOneAndUpdate(
              {
                _id: playlistId,

                userId: user._id,
              },

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
            );

          if (!updated) {
            throw new PlaylistError(
              "Playlist not found or access denied.",
              404
            );
          }
        }

        return loadPlaylistResponse({
          playlistId,
          userId: user._id,
          session,
        });
      }
    );

    return res.status(200).json({
      success: true,

      message:
        "Playlist updated successfully.",

      playlist,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Update playlist error:"
    );
  }
};

// ==========================================
// DELETE PLAYLIST
//
// DELETE /api/playlists/:playlistId
//
// Deleting a playlist does not delete
// the songs or their associated files.
// ==========================================

const deletePlaylist = async (req, res) => {
  try {
    preventCaching(res);

    requirePlaylistUser(req);

    const { playlistId } = req.params;

    validatePlaylistId(playlistId);

    await runPlaylistTransaction(
      async (session) => {
        const user = await lockPlaylistUser(
          req,
          session
        );

        const playlist =
          await Playlist.findOneAndDelete(
            {
              _id: playlistId,

              userId: user._id,
            },

            {
              session,
            }
          );

        if (!playlist) {
          throw new PlaylistError(
            "Playlist not found or access denied.",
            404
          );
        }

        return playlist._id;
      }
    );

    return res.status(200).json({
      success: true,

      message:
        "Playlist deleted successfully.",
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Delete playlist error:"
    );
  }
};

// ==========================================
// EXPORT ALL PLAYLIST CONTROLLERS
// ==========================================

module.exports = {
  createPlaylist,

  getMyPlaylists,

  getMyPlaylistById,

  addSongToPlaylist,

  removeSongFromPlaylist,

  updatePlaylist,

  deletePlaylist,
};