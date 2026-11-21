const mongoose = require("mongoose");

const Like = require("../models/Like");
const Follow = require("../models/follow");
const Song = require("../models/song");
const Release = require("../models/Release");
const Artist = require("../models/Artist");
const User = require("../models/User");
const Notification = require("../models/Notification");

// ==========================================
// CONFIGURATION
// ==========================================

const ALLOWED_ROLES = [
  "listener",
  "artist",
];

const ARTIST_FIELDS =
  "stageName profileImage profileImageUploadId verified";

const RELEASE_FIELDS =
  "title releaseType coverImage coverUploadId releaseDate status visibilityStatus";

// ==========================================
// CUSTOM LISTENER ERROR
// ==========================================

class ListenerError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "ListenerError";
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
// Support existing older records without
// explicit visibility statuses.
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
// VERIFY DOCUMENT VISIBILITY
// ==========================================

function isVisible(content) {
  if (!content) {
    return false;
  }

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
// PREVENT RESPONSE CACHING
//
// Listener libraries contain private,
// account-specific information.
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

function sendError(
  res,
  error,
  context
) {
  preventCaching(res);

  // Expected listener errors.

  if (
    error instanceof ListenerError
  ) {
    return res.status(error.status).json({
      success: false,

      message: error.message,
    });
  }

  // Duplicate database records.

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,

      message:
        "This record already exists.",
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
        "The operation result could not be confirmed. Refresh your library before trying again.",
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
        "Your library is being modified by another request. Refresh and try again.",
    });
  }

  // Invalid database information.

  if (
    error.name === "ValidationError" ||

    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,

      message:
        "Invalid listener information.",
    });
  }

  // Unexpected server errors.

  console.error(
    context,

    error.name,

    error.code || "",

    error.message
  );

  return res.status(500).json({
    success: false,

    message:
      "Unable to complete the listener operation.",
  });
}

// ==========================================
// REQUIRE AUTHENTICATED LISTENER OR ARTIST
//
// Admin and Super Admin accounts cannot
// use personal listening functionality.
// ==========================================

function requireListenerUser(req) {
  if (
    !req.user?._id ||
    !req.auth
  ) {
    throw new ListenerError(
      "Please sign in to continue.",
      401
    );
  }

  if (
    !ALLOWED_ROLES.includes(
      req.user.role
    )
  ) {
    throw new ListenerError(
      "This account cannot access listener functionality.",
      403
    );
  }

  if (
    req.user.accountStatus !==
    "active"
  ) {
    throw new ListenerError(
      "Your account is unavailable.",
      403
    );
  }

  // Verify authenticated session.

  if (
    String(req.auth.userId) !==
      String(req.user._id) ||

    req.auth.role !== req.user.role ||

    !Number.isSafeInteger(
      req.auth.tokenVersion
    ) ||

    req.auth.tokenVersion < 0
  ) {
    throw new ListenerError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// RUN DATABASE TRANSACTION
// ==========================================

async function runListenerTransaction(
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
        readPreference:
          "primary",

        readConcern: {
          level:
            "snapshot",
        },

        writeConcern: {
          w:
            "majority",
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
// Serialize simultaneous library mutations
// from the same user.
//
// Also recheck account permissions inside
// the database transaction.
// ==========================================

async function lockListenerUser(
  req,
  session
) {
  const currentUser =
    requireListenerUser(req);

  const version =
    req.auth.tokenVersion;

  const filter = {
    _id:
      currentUser._id,

    role:
      currentUser.role,

    accountStatus:
      "active",
  };

  // Support older user accounts.

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
    filter.tokenVersion =
      version;
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
    ).select(
      "_id fullName role accountStatus"
    );

  if (!user) {
    throw new ListenerError(
      "Your account or authentication session has changed.",
      403
    );
  }

  return user;
}

// ==========================================
// FIND PUBLIC SONG
//
// A song must be published and visible.
//
// Its parent release must also be
// published and visible.
// ==========================================

async function findPublicSong(
  songId,
  session
) {
  const songQuery =
    Song.findOne({
      _id:
        songId,

      status:
        "approved",

      ...publicVisibilityFilter(),
    })
      .select(
        "_id releaseId title status visibilityStatus"
      );

  if (session) {
    songQuery.session(
      session
    );
  }

  const song =
    await songQuery.lean();

  if (
    !song ||
    !song.releaseId
  ) {
    return null;
  }

  const releaseQuery =
    Release.findOne({
      _id:
        song.releaseId,

      status:
        "approved",

      ...publicVisibilityFilter(),
    })
      .select("_id");

  if (session) {
    releaseQuery.session(
      session
    );
  }

  const release =
    await releaseQuery.lean();

  if (!release) {
    return null;
  }

  return song;
}

// ==========================================
// FIND PUBLIC ARTIST
//
// Suspended, rejected, pending, hidden
// and taken-down artists are excluded.
// ==========================================

async function findPublicArtist(
  artistId,
  session
) {
  const query =
    Artist.findOne({
      _id:
        artistId,

      approvalStatus:
        "approved",

      ...publicVisibilityFilter(),
    })
      .select(
        "_id userId stageName followersCount"
      );

  if (session) {
    query.session(session);
  }

  return query.lean();
}

// ==========================================
// PUBLIC ARTIST POPULATION
// ==========================================

function publicArtistPopulation(path) {
  return {
    path,

    select:
      ARTIST_FIELDS,

    match: {
      approvalStatus:
        "approved",

      ...publicVisibilityFilter(),
    },
  };
}

// ==========================================
// PUBLIC SONG POPULATION
// ==========================================

function publicSongPopulation() {
  return {
    path:
      "songId",

    match: {
      status:
        "approved",

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
        path:
          "releaseId",

        select:
          RELEASE_FIELDS,

        match: {
          status:
            "approved",

          ...publicVisibilityFilter(),
        },
      },
    ],
  };
}

// ==========================================
// CONVERT DOCUMENT TO PLAIN OBJECT
// ==========================================

function toPlainObject(document) {
  return (
    typeof document.toObject ===
    "function"
  )
    ? document.toObject()
    : { ...document };
}

// ==========================================
// SANITIZE PUBLIC SONG INFORMATION
//
// Remove internal administrative data.
//
// Preserve R2 and legacy media references
// for existing frontend compatibility.
// ==========================================

function sanitizePublicSong(song) {
  const data =
    toPlainObject(song);

  delete data.moderationReason;

  delete data.moderatedBy;

  delete data.moderatedAt;

  delete data.audioHash;

  delete data.__v;

  return data;
}

// ==========================================
// LIKE SONG
//
// POST /api/listener/likes/:songId
//
// ACCESS:
// - Listener
// - Artist
// ==========================================

const likeSong =
  async (req, res) => {
    try {
      preventCaching(res);

      requireListenerUser(req);

      const { songId } =
        req.params;

      // Validate song ID.

      if (!isValidId(songId)) {
        throw new ListenerError(
          "Invalid song ID."
        );
      }

      // ====================================
      // START LIKE TRANSACTION
      // ====================================

      const like =
        await runListenerTransaction(
          async (session) => {
            // Verify active account.

            const user =
              await lockListenerUser(
                req,
                session
              );

            // Verify song availability.

            const song =
              await findPublicSong(
                songId,
                session
              );

            if (!song) {
              throw new ListenerError(
                "Song is unavailable.",
                404
              );
            }

            // =================================
            // PREVENT DUPLICATE LIKES
            // =================================

            const existingLike =
              await Like.exists({
                userId:
                  user._id,

                songId:
                  song._id,
              }).session(session);

            if (existingLike) {
              throw new ListenerError(
                "You have already liked this song.",
                400
              );
            }

            // =================================
            // CREATE SONG LIKE
            // =================================

            const newLike =
              new Like({
                userId:
                  user._id,

                songId:
                  song._id,
              });

            await newLike.save({
              session,
            });

            return newLike;
          }
        );

      return res.status(201).json({
        success: true,

        message:
          "Song liked successfully.",

        like,
      });

    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,

          message:
            "You have already liked this song.",
        });
      }

      return sendError(
        res,

        error,

        "Like song error:"
      );
    }
  };

// ==========================================
// UNLIKE SONG
//
// DELETE /api/listener/likes/:songId
//
// Users can remove their own likes even
// if the song has subsequently been
// hidden or taken down.
// ==========================================

const unlikeSong =
  async (req, res) => {
    try {
      preventCaching(res);

      requireListenerUser(req);

      const { songId } =
        req.params;

      if (!isValidId(songId)) {
        throw new ListenerError(
          "Invalid song ID."
        );
      }

      await runListenerTransaction(
        async (session) => {
          const user =
            await lockListenerUser(
              req,
              session
            );

          // Delete only this user's like.

          const deletedLike =
            await Like.findOneAndDelete(
              {
                userId:
                  user._id,

                songId,
              },

              {
                session,
              }
            );

          if (!deletedLike) {
            throw new ListenerError(
              "Liked song not found.",
              404
            );
          }

          return deletedLike;
        }
      );

      return res.status(200).json({
        success: true,

        message:
          "Song removed from your liked songs.",
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Unlike song error:"
      );
    }
  };

// ==========================================
// GET LIKED SONGS
//
// GET /api/listener/likes
//
// Existing likes remain stored even when
// a song becomes restricted.
//
// Only public songs belonging to public
// releases are returned.
// ==========================================

const getLikedSongs =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireListenerUser(req);

      // ====================================
      // FIND USER'S LIKES
      // ====================================

      const likes =
        await Like.find({
          userId:
            user._id,
        })
          .sort({
            createdAt: -1,

            _id: -1,
          })

          .populate(
            publicSongPopulation()
          )

          .lean();

      // ====================================
      // FILTER UNAVAILABLE SONGS
      // ====================================

      const songs = [];

      const includedSongIds =
        new Set();

      for (const like of likes) {
        const song =
          like.songId;

        if (!song) {
          continue;
        }

        if (
          !isVisible(song) ||

          song.status !== "approved" ||

          !isPublicRelease(
            song.releaseId
          )
        ) {
          continue;
        }

        const songId =
          String(song._id);

        // Do not return duplicate songs
        // from older duplicate like records.

        if (
          includedSongIds.has(
            songId
          )
        ) {
          continue;
        }

        includedSongIds.add(
          songId
        );

        songs.push(
          sanitizePublicSong(song)
        );
      }

      return res.status(200).json({
        success: true,

        songs,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get liked songs error:"
      );
    }
  };

// ==========================================
// SEND NEW FOLLOWER NOTIFICATION
//
// Notifications are sent only after
// the follow transaction commits.
//
// Notification failure must not cause
// a successful follow operation to fail.
// ==========================================

async function notifyArtistOfFollow({
  artistId,

  artistUserId,

  followerId,

  followerName,
}) {
  try {
    if (
      !artistUserId ||

      String(artistUserId) ===
        String(followerId)
    ) {
      return false;
    }

    // Recheck artist availability.

    const artist =
      await findPublicArtist(
        artistId
      );

    if (!artist) {
      return false;
    }

    // Verify the follow still exists.

    const followExists =
      await Follow.exists({
        userId:
          followerId,

        artistId,
      });

    if (!followExists) {
      return false;
    }

    // Verify the artist account remains
    // active and eligible for notifications.

    const recipient =
      await User.exists({
        _id:
          artistUserId,

        role:
          "artist",

        accountStatus:
          "active",
      });

    if (!recipient) {
      return false;
    }

    await Notification.create({
      userId:
        artistUserId,

      type:
        "artist_follow",

      title:
        "New Follower",

      message:
        `${followerName || "A listener"} started following you.`,

      link:
        `/artists/${artistId}`,
    });

    return true;

  } catch (error) {
    console.error(
      "Artist follow notification failed:",

      error.name,

      error.message
    );

    return false;
  }
}

// ==========================================
// FOLLOW ARTIST
//
// POST /api/listener/follows/:artistId
//
// Only approved and publicly visible
// artists can receive new followers.
// ==========================================

const followArtist =
  async (req, res) => {
    try {
      preventCaching(res);

      requireListenerUser(req);

      const { artistId } =
        req.params;

      if (!isValidId(artistId)) {
        throw new ListenerError(
          "Invalid artist ID."
        );
      }

      // ====================================
      // START FOLLOW TRANSACTION
      // ====================================

      const result =
        await runListenerTransaction(
          async (session) => {
            const user =
              await lockListenerUser(
                req,
                session
              );

            // Verify public artist.

            const artist =
              await findPublicArtist(
                artistId,
                session
              );

            if (!artist) {
              throw new ListenerError(
                "Artist is unavailable.",
                404
              );
            }

            // =================================
            // PREVENT SELF-FOLLOWING
            // =================================

            if (
              String(artist.userId) ===
                String(user._id)
            ) {
              throw new ListenerError(
                "You cannot follow your own artist profile."
              );
            }

            // =================================
            // PREVENT DUPLICATE FOLLOWS
            // =================================

            const existingFollow =
              await Follow.exists({
                userId:
                  user._id,

                artistId:
                  artist._id,
              }).session(session);

            if (existingFollow) {
              throw new ListenerError(
                "You are already following this artist.",
                400
              );
            }

            // =================================
            // CREATE FOLLOW RECORD
            // =================================

            const follow =
              new Follow({
                userId:
                  user._id,

                artistId:
                  artist._id,

                notificationsEnabled:
                  true,
              });

            await follow.save({
              session,
            });

            // =================================
            // INCREMENT FOLLOWER COUNT
            //
            // Use an atomic increment.
            // Do not use followersCount += 1.
            // =================================

            const updatedArtist =
              await Artist.findOneAndUpdate(
                {
                  _id:
                    artist._id,

                  approvalStatus:
                    "approved",

                  ...publicVisibilityFilter(),
                },

                {
                  $inc: {
                    followersCount: 1,

                    __v: 1,
                  },
                },

                {
                  new: true,

                  session,

                  runValidators: true,
                }
              ).select(
                "_id userId followersCount"
              );

            if (!updatedArtist) {
              throw new ListenerError(
                "Artist availability has changed.",
                409
              );
            }

            return {
              artistId:
                updatedArtist._id,

              artistUserId:
                updatedArtist.userId,

              followersCount:
                updatedArtist.followersCount,

              followerId:
                user._id,

              followerName:
                user.fullName,
            };
          }
        );

      // ====================================
      // SEND NOTIFICATION AFTER COMMIT
      // ====================================

      await notifyArtistOfFollow({
        artistId:
          result.artistId,

        artistUserId:
          result.artistUserId,

        followerId:
          result.followerId,

        followerName:
          result.followerName,
      });

      return res.status(201).json({
        success: true,

        message:
          "Artist followed successfully.",

        followersCount:
          result.followersCount,
      });

    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,

          message:
            "You are already following this artist.",
        });
      }

      return sendError(
        res,

        error,

        "Follow artist error:"
      );
    }
  };

// ==========================================
// UNFOLLOW ARTIST
//
// DELETE /api/listener/follows/:artistId
//
// Users can unfollow an artist even if
// the profile has been restricted.
// ==========================================

const unfollowArtist =
  async (req, res) => {
    try {
      preventCaching(res);

      requireListenerUser(req);

      const { artistId } =
        req.params;

      if (!isValidId(artistId)) {
        throw new ListenerError(
          "Invalid artist ID."
        );
      }

      // ====================================
      // START UNFOLLOW TRANSACTION
      // ====================================

      const result =
        await runListenerTransaction(
          async (session) => {
            const user =
              await lockListenerUser(
                req,
                session
              );

            // =================================
            // REMOVE OWN FOLLOW RECORDS
            //
            // Delete any duplicate historical
            // records belonging to this user.
            // =================================

            const deleted =
              await Follow.deleteMany(
                {
                  userId:
                    user._id,

                  artistId,
                },

                {
                  session,
                }
              );

            if (
              deleted.deletedCount === 0
            ) {
              throw new ListenerError(
                "Followed artist not found.",
                404
              );
            }

            // =================================
            // UPDATE ARTIST FOLLOWER COUNT
            //
            // Prevent negative follower counts.
            //
            // Allow cleanup even when the
            // artist profile is restricted.
            // =================================

            const updatedArtist =
              await Artist.findOneAndUpdate(
                {
                  _id:
                    artistId,
                },

                [
                  {
                    $set: {
                      followersCount: {
                        $max: [
                          0,

                          {
                            $subtract: [
                              {
                                $ifNull: [
                                  "$followersCount",

                                  0,
                                ],
                              },

                              deleted.deletedCount,
                            ],
                          },
                        ],
                      },

                      __v: {
                        $add: [
                          {
                            $ifNull: [
                              "$__v",

                              0,
                            ],
                          },

                          1,
                        ],
                      },
                    },
                  },
                ],

                {
                  new: true,

                  session,
                }
              ).select(
                "_id approvalStatus visibilityStatus followersCount"
              );

            // A missing artist must not
            // prevent removal of an old follow.

            const publicArtist =
              updatedArtist &&

              updatedArtist.approvalStatus ===
                "approved" &&

              isVisible(
                updatedArtist
              );

            return {
              followersCount:
                publicArtist
                  ? updatedArtist.followersCount
                  : 0,
            };
          }
        );

      return res.status(200).json({
        success: true,

        message:
          "Artist unfollowed successfully.",

        followersCount:
          result.followersCount,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Unfollow artist error:"
      );
    }
  };

// ==========================================
// GET FOLLOWED ARTISTS
//
// GET /api/listener/follows
//
// Existing follows are preserved.
//
// Restricted artist profiles disappear
// from the listener's public library.
// ==========================================

const getFollowedArtists =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireListenerUser(req);

      // ====================================
      // FIND USER'S FOLLOW RECORDS
      // ====================================

      const follows =
        await Follow.find({
          userId:
            user._id,
        })
          .sort({
            createdAt: -1,

            _id: -1,
          })

          .populate({
            path:
              "artistId",

            select:
              "stageName profileImage profileImageUploadId coverImage coverImageUploadId verified followersCount",

            match: {
              approvalStatus:
                "approved",

              ...publicVisibilityFilter(),
            },
          })

          .lean();

      // ====================================
      // FILTER UNAVAILABLE ARTISTS
      // ====================================

      const artists = [];

      const includedArtistIds =
        new Set();

      for (const follow of follows) {
        const artist =
          follow.artistId;

        if (!artist) {
          continue;
        }

        const artistId =
          String(
            artist._id
          );

        if (
          includedArtistIds.has(
            artistId
          )
        ) {
          continue;
        }

        includedArtistIds.add(
          artistId
        );

        // Include the listener's individual
        // notification preference.

        artists.push({
          ...artist,

          notificationsEnabled:
            follow.notificationsEnabled === true,
        });
      }

      return res.status(200).json({
        success: true,

        artists,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get followed artists error:"
      );
    }
  };

// ==========================================
// TOGGLE ARTIST NOTIFICATIONS
//
// PATCH /api/listener/follows/
//       :artistId/notifications
//
// Supports existing toggle behaviour.
//
// Also accepts an explicit boolean value:
//
// {
//   "notificationsEnabled": true
// }
//
// Users cannot enable notifications
// for unavailable artist profiles.
// ==========================================

const toggleArtistNotifications =
  async (req, res) => {
    try {
      preventCaching(res);

      requireListenerUser(req);

      const { artistId } =
        req.params;

      if (!isValidId(artistId)) {
        throw new ListenerError(
          "Invalid artist ID."
        );
      }

      const input =
        req.body ?? {};

      if (
        typeof input !== "object" ||

        Array.isArray(input)
      ) {
        throw new ListenerError(
          "Invalid notification information."
        );
      }

      const hasExplicitPreference =
        Object.prototype.hasOwnProperty.call(
          input,

          "notificationsEnabled"
        );

      if (
        hasExplicitPreference &&

        typeof input.notificationsEnabled !==
          "boolean"
      ) {
        throw new ListenerError(
          "notificationsEnabled must be true or false."
        );
      }

      // ====================================
      // START NOTIFICATION TRANSACTION
      // ====================================

      const result =
        await runListenerTransaction(
          async (session) => {
            const user =
              await lockListenerUser(
                req,
                session
              );

            // =================================
            // VERIFY USER FOLLOWS ARTIST
            // =================================

            const follow =
              await Follow.findOne({
                userId:
                  user._id,

                artistId,
              })
                .sort({
                  createdAt: -1,

                  _id: -1,
                })
                .session(session);

            if (!follow) {
              throw new ListenerError(
                "You are not following this artist.",
                404
              );
            }

            // =================================
            // DETERMINE NEW PREFERENCE
            // =================================

            const notificationsEnabled =
              hasExplicitPreference

                ? input.notificationsEnabled

                : !Boolean(
                    follow.notificationsEnabled
                  );

            // =================================
            // REQUIRE PUBLIC ARTIST WHEN
            // ENABLING NOTIFICATIONS
            //
            // Disabling is always permitted
            // for an existing owned follow.
            // =================================

            if (notificationsEnabled) {
              const artist =
                await findPublicArtist(
                  artistId,
                  session
                );

              if (!artist) {
                throw new ListenerError(
                  "Artist notifications are currently unavailable.",
                  404
                );
              }
            }

            // =================================
            // UPDATE NOTIFICATION PREFERENCE
            // =================================

            await Follow.updateMany(
              {
                userId:
                  user._id,

                artistId,
              },

              {
                $set: {
                  notificationsEnabled,
                },
              },

              {
                session,

                runValidators: true,
              }
            );

            return {
              notificationsEnabled,
            };
          }
        );

      return res.status(200).json({
        success: true,

        message:
          result.notificationsEnabled

            ? "Artist notifications enabled."

            : "Artist notifications disabled.",

        notificationsEnabled:
          result.notificationsEnabled,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Toggle artist notifications error:"
      );
    }
  };

// ==========================================
// EXPORT ALL LISTENER CONTROLLERS
// ==========================================

module.exports = {
  likeSong,

  unlikeSong,

  followArtist,

  unfollowArtist,

  getLikedSongs,

  getFollowedArtists,

  toggleArtistNotifications,
};