const mongoose = require("mongoose");

const Song = require("../models/song");
const Release = require("../models/Release");
const Artist = require("../models/Artist");
const MediaUpload = require("../models/MediaUpload");
const User = require("../models/User");

const {
  ArtistCreditError,
  validateArtistCredits,
} = require("../utils/artistCreditValidator");

const {
  ReleaseTransactionError,
  runReleaseTransaction,
  lockRelease,
} = require("../utils/releaseTransaction");

// ==========================================
// CONFIGURATION
// ==========================================

const ARTIST_POPULATION_FIELDS =
  "stageName profileImage profileImageUploadId verified";

const RELEASE_POPULATION_FIELDS =
  "title releaseType coverImage coverUploadId releaseDate status visibilityStatus";

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
// Supports older content without an
// explicit visibility status.
//
// Hidden and takedown content are excluded.
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
// CHECK DOCUMENT VISIBILITY
// ==========================================

function isPubliclyVisible(content) {
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
// CHECK PUBLIC RELEASE
// ==========================================

function isPublicRelease(release) {
  return (
    Boolean(release) &&

    release.status === "approved" &&

    isPubliclyVisible(release)
  );
}

// ==========================================
// CHECK INPUT FIELD
// ==========================================

function hasField(object, field) {
  return Object.prototype.hasOwnProperty.call(
    object,
    field
  );
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
    throw new ReleaseTransactionError(
      "Invalid song information.",
      400
    );
  }

  return body;
}

// ==========================================
// VALIDATE LEGACY HTTPS MEDIA URL
// ==========================================

function validHttpsUrl(value) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&

      Boolean(url.hostname) &&

      !url.username &&

      !url.password
    );

  } catch {
    return false;
  }
}

// ==========================================
// PREVENT RESPONSE CACHING
// ==========================================

function preventCaching(res) {
  res.set(
    "Cache-Control",
    "private, no-store, max-age=0"
  );
}

// ==========================================
// CENTRALIZED ERROR HANDLING
// ==========================================

function sendError(res, error, context) {
  preventCaching(res);

  // Expected release transaction error.

  if (
    error instanceof ReleaseTransactionError
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
        "This audio upload or track number is already in use.",
    });
  }

  // Artist credit validation.

  if (
    error instanceof ArtistCreditError
  ) {
    return res.status(400).json({
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
        "The final operation status could not be confirmed. Refresh your release before trying again.",
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
        "This release is being modified by another request. Refresh the page and try again.",
    });
  }

  // Validation and database ID errors.

  if (
    error.name === "ValidationError" ||

    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,

      message:
        "Invalid song information.",
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
      "Unable to complete the song operation.",
  });
}

// ==========================================
// VERIFY AUTHENTICATED ARTIST USER
// ==========================================

function requireArtistUser(req) {
  if (
    !req.user?._id ||
    !req.auth
  ) {
    throw new ReleaseTransactionError(
      "Authentication is required.",
      401
    );
  }

  if (
    req.user.role !== "artist"
  ) {
    throw new ReleaseTransactionError(
      "Only artists can access this operation.",
      403
    );
  }

  if (
    req.user.accountStatus !== "active"
  ) {
    throw new ReleaseTransactionError(
      "Your account is unavailable.",
      403
    );
  }

  if (
    String(req.auth.userId) !==
      String(req.user._id) ||

    req.auth.role !== "artist" ||

    !Number.isSafeInteger(
      req.auth.tokenVersion
    ) ||

    req.auth.tokenVersion < 0
  ) {
    throw new ReleaseTransactionError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// LOCK AUTHENTICATED ARTIST ACCOUNT
//
// Prevent suspended users from modifying
// song drafts through an existing request.
// ==========================================

async function lockArtistUser(
  req,
  session
) {
  const user =
    requireArtistUser(req);

  const version =
    req.auth.tokenVersion;

  const filter = {
    _id: user._id,

    role: "artist",

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

  const activeUser =
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

  if (!activeUser) {
    throw new ReleaseTransactionError(
      "Your account or authentication session has changed.",
      403
    );
  }

  return activeUser;
}

// ==========================================
// LOCK APPROVED AND VISIBLE ARTIST
//
// Serialize song mutations against
// administrative artist moderation.
// ==========================================

async function requireApprovedArtist(
  req,
  session
) {
  if (
    !session ||
    !session.inTransaction()
  ) {
    throw new Error(
      "An active transaction is required."
    );
  }

  const user =
    await lockArtistUser(
      req,
      session
    );

  const artist =
    await Artist.findOneAndUpdate(
      {
        userId: user._id,

        approvalStatus: "approved",

        visibilityStatus: "visible",
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
    ).select(
      "_id userId approvalStatus visibilityStatus"
    );

  if (!artist) {
    throw new ReleaseTransactionError(
      "Only approved and visible artists can manage song drafts.",
      403
    );
  }

  return artist;
}

// ==========================================
// ACQUIRE OWNED DRAFT RELEASE LOCK
//
// All song modifications coordinate with
// release editing and publication.
// ==========================================

async function lockOwnedDraftRelease({
  releaseId,

  userId,

  session,
}) {
  return lockRelease({
    releaseId,

    userId,

    session,

    allowedStatuses: [
      "draft",
    ],

    requireVisible: true,
  });
}

// ==========================================
// VERIFY OWNED SONG DRAFT
//
// Parent release ownership must already
// have been established.
// ==========================================

async function getOwnedDraftSong({
  songId,

  releaseId,

  session,
}) {
  const song =
    await Song.findOne({
      _id: songId,

      releaseId,

      status: "draft",

      ...publicVisibilityFilter(),
    }).session(session);

  if (!song) {
    throw new ReleaseTransactionError(
      "Song draft not found, restricted or access denied.",
      404
    );
  }

  return song;
}

// ==========================================
// VERIFY AUDIO UPLOAD
//
// Requirements:
//
// 1. Valid media upload ID.
// 2. Upload belongs to the artist.
// 3. Upload is confirmed.
// 4. Upload has the correct media kind.
// 5. Upload is not attached to another song.
// ==========================================

async function verifyAudioUpload({
  uploadId,

  userId,

  excludeSongId = null,

  session,
}) {
  if (!isValidId(uploadId)) {
    throw new ArtistCreditError(
      "Invalid audio upload ID."
    );
  }

  const upload =
    await MediaUpload.findOne({
      _id: uploadId,

      userId,

      kind: "audio",

      status: "ready",
    }).session(session);

  if (!upload) {
    throw new ArtistCreditError(
      "Audio upload is not confirmed or does not belong to you."
    );
  }

  // Reject unavailable or temporary media.

  if (
    typeof upload.objectKey !== "string" ||

    !upload.objectKey.trim() ||

    upload.objectKey.startsWith(
      "temporary/"
    )
  ) {
    throw new ArtistCreditError(
      "The confirmed audio file is unavailable."
    );
  }

  // Prevent reuse of the same upload.

  const filter = {
    audioUploadId: upload._id,
  };

  if (excludeSongId) {
    filter._id = {
      $ne: excludeSongId,
    };
  }

  const existingSong =
    await Song.exists(
      filter
    ).session(session);

  if (existingSong) {
    throw new ArtistCreditError(
      "This audio upload is already attached to another song."
    );
  }

  return upload;
}

// ==========================================
// APPLY OPTIONAL DRAFT FIELDS
//
// Only explicitly allowed fields may
// be modified by an artist.
//
// Publication status and moderation fields
// cannot be changed through draft inputs.
// ==========================================

async function applyDraftFields({
  song,

  input,

  userId,

  artistId,

  session,
}) {
  if (
    !session ||
    !session.inTransaction()
  ) {
    throw new Error(
      "An active transaction is required to modify a song draft."
    );
  }

  // ========================================
  // SONG TITLE
  // ========================================

  if (hasField(input, "title")) {
    if (
      typeof input.title !== "string" ||

      input.title.trim().length > 200
    ) {
      throw new ArtistCreditError(
        "Song title must be text with at most 200 characters."
      );
    }

    song.title =
      input.title.trim();
  }

  // ========================================
  // GENRE
  // ========================================

  if (hasField(input, "genre")) {
    if (
      typeof input.genre !== "string" ||

      input.genre.trim().length > 100
    ) {
      throw new ArtistCreditError(
        "Genre must be text with at most 100 characters."
      );
    }

    song.genre =
      input.genre.trim();
  }

  // ========================================
  // AUDIO DURATION
  // ========================================

  if (hasField(input, "duration")) {
    const value =
      input.duration;

    if (
      typeof value !== "number" ||

      !Number.isFinite(value) ||

      value < 0
    ) {
      throw new ArtistCreditError(
        "Duration must be a valid number of seconds."
      );
    }

    song.duration =
      value;
  }

  // ========================================
  // TRACK NUMBER
  // ========================================

  if (hasField(input, "trackNumber")) {
    const value =
      input.trackNumber;

    if (
      value !== null &&

      (
        !Number.isSafeInteger(value) ||

        value < 1
      )
    ) {
      throw new ArtistCreditError(
        "Track number must be a positive integer."
      );
    }

    // Prevent duplicate track numbers.

    if (value !== null) {
      const existingTrack =
        await Song.exists({
          releaseId:
            song.releaseId,

          trackNumber:
            value,

          _id: {
            $ne: song._id,
          },
        }).session(session);

      if (existingTrack) {
        throw new ArtistCreditError(
          `Track number ${value} already exists in this release.`
        );
      }
    }

    song.trackNumber =
      value;
  }

  // ========================================
  // ISRC
  // ========================================

  if (hasField(input, "isrc")) {
    if (
      typeof input.isrc !== "string" ||

      input.isrc.trim().length > 20
    ) {
      throw new ArtistCreditError(
        "ISRC must be text with at most 20 characters."
      );
    }

    song.isrc =
      input.isrc
        .trim()
        .toUpperCase();
  }

  // ========================================
  // ARTIST CREDIT VALIDATION
  //
  // Preserve primary artists and
  // featured artists.
  // ========================================

  if (
    song.isNew ||

    hasField(
      input,
      "primaryArtists"
    ) ||

    hasField(
      input,
      "featuredArtists"
    )
  ) {
    const credits =
      await validateArtistCredits({
        ownerArtistId:
          artistId,

        primaryArtists:
          hasField(
            input,
            "primaryArtists"
          )
            ? input.primaryArtists
            : song.primaryArtists,

        additionalArtists:
          hasField(
            input,
            "featuredArtists"
          )
            ? input.featuredArtists
            : song.featuredArtists || [],

        additionalLabel:
          "Featured artists",

        context:
          `Song "${song.title || "Untitled song"}"`,

        session,
      });

    song.primaryArtists =
      credits.primaryArtists;

    song.featuredArtists =
      credits.additionalArtists;
  }

  // ========================================
  // AUDIO MEDIA INPUT
  // ========================================

  const hasAudioUploadId =
    hasField(
      input,
      "audioUploadId"
    );

  const hasAudioUrl =
    hasField(
      input,
      "audioUrl"
    );

  // Prevent multiple media sources.

  if (
    hasAudioUploadId &&

    hasAudioUrl &&

    input.audioUploadId &&

    input.audioUrl
  ) {
    throw new ArtistCreditError(
      "Provide either audioUploadId or audioUrl, not both."
    );
  }

  // ========================================
  // CLOUDFLARE R2 AUDIO ATTACHMENT
  // ========================================

  if (hasAudioUploadId) {
    const uploadId =
      input.audioUploadId;

    // Remove an audio attachment.

    if (
      uploadId === null ||
      uploadId === ""
    ) {
      song.audioUploadId =
        null;

      if (!hasAudioUrl) {
        song.audioUrl = "";
      }

    } else {
      const upload =
        await verifyAudioUpload({
          uploadId,

          userId,

          excludeSongId:
            song._id,

          session,
        });

      song.audioUploadId =
        upload._id;

      // Clear legacy audio source.

      song.audioUrl = "";
    }
  }

  // ========================================
  // PRESERVE LEGACY HTTPS AUDIO SUPPORT
  // ========================================

  if (
    hasAudioUrl &&

    !input.audioUploadId
  ) {
    if (
      typeof input.audioUrl !== "string"
    ) {
      throw new ArtistCreditError(
        "Audio URL must be text."
      );
    }

    const audioUrl =
      input.audioUrl.trim();

    if (
      audioUrl &&

      !validHttpsUrl(audioUrl)
    ) {
      throw new ArtistCreditError(
        "Audio URL must be a valid HTTPS URL."
      );
    }

    song.audioUrl =
      audioUrl;

    song.audioUploadId =
      null;
  }
}

// ==========================================
// POPULATE PUBLIC SONG INFORMATION
//
// Public artist information is filtered
// according to approval and visibility.
//
// Parent releases must also be published
// and publicly visible.
// ==========================================

function populatePublicSong(query) {
  return query.populate([
    {
      path:
        "primaryArtists",

      select:
        ARTIST_POPULATION_FIELDS,

      match: {
        approvalStatus:
          "approved",

        ...publicVisibilityFilter(),
      },
    },

    {
      path:
        "featuredArtists",

      select:
        ARTIST_POPULATION_FIELDS,

      match: {
        approvalStatus:
          "approved",

        ...publicVisibilityFilter(),
      },
    },

    {
      path:
        "releaseId",

      select:
        RELEASE_POPULATION_FIELDS,

      match: {
        status:
          "approved",

        ...publicVisibilityFilter(),
      },
    },
  ]);
}

// ==========================================
// SANITIZE PUBLIC SONG RESPONSE
//
// Do not expose internal moderation reasons,
// administrator IDs or audio hashes.
//
// Preserve audio URLs for legacy playback
// compatibility.
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
// CREATE SONG DRAFT
//
// POST /api/songs/release/:releaseId
// ==========================================

const addSongToRelease =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const { releaseId } =
        req.params;

      const input =
        getRequestBody(req);

      // Validate release ID.

      if (!isValidId(releaseId)) {
        throw new ReleaseTransactionError(
          "Invalid release ID."
        );
      }

      // ====================================
      // START SONG CREATION TRANSACTION
      // ====================================

      const createdSong =
        await runReleaseTransaction(
          async (session) => {
            // Verify active artist.

            const artist =
              await requireApprovedArtist(
                req,
                session
              );

            // Acquire parent release lock.

            const release =
              await lockOwnedDraftRelease({
                releaseId,

                userId:
                  user._id,

                session,
              });

            // =================================
            // SINGLE RELEASE RULE
            //
            // A single can contain one song.
            // =================================

            if (
              release.releaseType ===
              "single"
            ) {
              const existingSong =
                await Song.exists({
                  releaseId:
                    release._id,
                }).session(session);

              if (existingSong) {
                throw new ReleaseTransactionError(
                  "A single release can only contain one song.",
                  409
                );
              }
            }

            // =================================
            // CREATE INCOMPLETE SONG DRAFT
            // =================================

            const song =
              new Song({
                releaseId:
                  release._id,

                primaryArtists: [
                  artist._id,
                ],

                featuredArtists: [],

                title: "",

                genre: "",

                duration: 0,

                trackNumber: null,

                isrc: "",

                audioUrl: "",

                audioUploadId: null,

                status: "draft",

                visibilityStatus:
                  "visible",
              });

            // Validate supplied draft fields.

            await applyDraftFields({
              song,

              input,

              userId:
                user._id,

              artistId:
                artist._id,

              session,
            });

            // Save song inside transaction.

            await song.save({
              session,
            });

            return song;
          }
        );

      return res.status(201).json({
        success: true,

        message:
          "Song draft saved.",

        song:
          createdSong,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Create song draft transaction error:"
      );
    }
  };

// ==========================================
// UPDATE SONG DRAFT
//
// PATCH /api/songs/release/
//       :releaseId/:songId
// ==========================================

const updateSongDraft =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const {
        releaseId,

        songId,
      } = req.params;

      const input =
        getRequestBody(req);

      // Validate resource IDs.

      if (
        !isValidId(releaseId) ||

        !isValidId(songId)
      ) {
        throw new ReleaseTransactionError(
          "Invalid release or song ID."
        );
      }

      // ====================================
      // START SONG UPDATE TRANSACTION
      // ====================================

      const updatedSong =
        await runReleaseTransaction(
          async (session) => {
            // Verify active approved artist.

            const artist =
              await requireApprovedArtist(
                req,
                session
              );

            // Lock parent release.

            const release =
              await lockOwnedDraftRelease({
                releaseId,

                userId:
                  user._id,

                session,
              });

            // Verify owned visible draft.

            const song =
              await getOwnedDraftSong({
                songId,

                releaseId:
                  release._id,

                session,
              });

            // Apply validated draft changes.

            await applyDraftFields({
              song,

              input,

              userId:
                user._id,

              artistId:
                artist._id,

              session,
            });

            // Save the updated draft.

            await song.save({
              session,
            });

            return song;
          }
        );

      return res.status(200).json({
        success: true,

        message:
          "Song draft updated successfully.",

        song:
          updatedSong,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Update song draft transaction error:"
      );
    }
  };

// ==========================================
// DELETE SONG DRAFT
//
// DELETE /api/songs/release/
//        :releaseId/:songId
//
// Published, hidden or taken-down songs
// cannot be deleted through this endpoint.
// ==========================================

const deleteSongDraft =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const {
        releaseId,

        songId,
      } = req.params;

      if (
        !isValidId(releaseId) ||

        !isValidId(songId)
      ) {
        throw new ReleaseTransactionError(
          "Invalid release or song ID."
        );
      }

      // ====================================
      // START SONG DELETION TRANSACTION
      // ====================================

      await runReleaseTransaction(
        async (session) => {
          // Verify approved artist.

          await requireApprovedArtist(
            req,
            session
          );

          // Lock owned draft release.

          const release =
            await lockOwnedDraftRelease({
              releaseId,

              userId:
                user._id,

              session,
            });

          // Delete owned visible song draft.

          const deletedSong =
            await Song.findOneAndDelete(
              {
                _id:
                  songId,

                releaseId:
                  release._id,

                status:
                  "draft",

                ...publicVisibilityFilter(),
              },

              {
                session,
              }
            );

          if (!deletedSong) {
            throw new ReleaseTransactionError(
              "Song draft not found, restricted or access denied.",
              404
            );
          }

          // Do not delete Cloudflare R2
          // files inside database transactions.

          return {
            songId:
              deletedSong._id,
          };
        }
      );

      return res.status(200).json({
        success: true,

        message:
          "Song draft deleted successfully.",
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Delete song draft transaction error:"
      );
    }
  };

// ==========================================
// GET PUBLIC SONGS
//
// GET /api/songs
//
// Both song and parent release must
// be approved and publicly visible.
// ==========================================

const getPublicSongs =
  async (req, res) => {
    try {
      preventCaching(res);

      const query =
        Song.find({
          status: "approved",

          ...publicVisibilityFilter(),
        })
          .sort({
            createdAt: -1,

            _id: -1,
          });

      const songs =
        await populatePublicSong(
          query
        ).lean();

      // Exclude songs belonging to
      // unavailable parent releases.

      const publicSongs =
        songs
          .filter(
            (song) =>
              isPublicRelease(
                song.releaseId
              )
          )
          .map(
            sanitizePublicSong
          );

      return res.status(200).json({
        success: true,

        songs:
          publicSongs,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get public songs error:"
      );
    }
  };

// ==========================================
// GET PUBLIC SONG BY ID
//
// GET /api/songs/:songId
// ==========================================

const getPublicSongById =
  async (req, res) => {
    try {
      preventCaching(res);

      const { songId } =
        req.params;

      if (!isValidId(songId)) {
        throw new ReleaseTransactionError(
          "Invalid song ID."
        );
      }

      const query =
        Song.findOne({
          _id: songId,

          status: "approved",

          ...publicVisibilityFilter(),
        });

      const song =
        await populatePublicSong(
          query
        ).lean();

      // Verify song and parent release.

      if (
        !song ||

        !isPublicRelease(
          song.releaseId
        )
      ) {
        throw new ReleaseTransactionError(
          "Song not found.",
          404
        );
      }

      return res.status(200).json({
        success: true,

        song:
          sanitizePublicSong(song),
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get public song error:"
      );
    }
  };

// ==========================================
// SANITIZE OWNED SONG INFORMATION
//
// Artists may see moderation statuses
// concerning their own music.
//
// Restricted songs cannot expose
// playback media references here.
// ==========================================

function sanitizeOwnedSong(
  song,

  release,

  artistCanPreview
) {
  const data =
    typeof song.toObject === "function"
      ? song.toObject()
      : { ...song };

  const previewAllowed =
    artistCanPreview &&

    isPubliclyVisible(release) &&

    isPubliclyVisible(song) &&

    ["draft", "approved"].includes(
      release.status
    ) &&

    ["draft", "approved"].includes(
      song.status
    );

  if (!previewAllowed) {
    data.audioUrl = "";

    data.audioUploadId =
      null;
  }

  delete data.audioHash;

  return data;
}

// ==========================================
// GET SONGS IN ARTIST'S OWN RELEASE
//
// GET /api/songs/release/:releaseId
//
// Used by:
// - Music upload editor
// - Persistent draft management
// - Published release management
// - Linked music selector
//
// Artists retain access to their own
// metadata and moderation information.
// ==========================================

const getSongsByReleaseForArtist =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const { releaseId } =
        req.params;

      if (!isValidId(releaseId)) {
        throw new ReleaseTransactionError(
          "Invalid release ID."
        );
      }

      // ====================================
      // VERIFY RELEASE OWNERSHIP
      // ====================================

      const release =
        await Release.findOne({
          _id: releaseId,

          submittedBy:
            user._id,
        }).lean();

      if (!release) {
        throw new ReleaseTransactionError(
          "Release not found or access denied.",
          404
        );
      }

      // ====================================
      // CHECK ARTIST PREVIEW ELIGIBILITY
      //
      // Suspended or restricted artists
      // may inspect their release metadata
      // without receiving playback media.
      // ====================================

      const approvedArtist =
        await Artist.exists({
          userId:
            user._id,

          approvalStatus:
            "approved",

          visibilityStatus:
            "visible",
        });

      const artistCanPreview =
        Boolean(approvedArtist);

      // ====================================
      // GET ALL OWNED SONGS
      // ====================================

      const songs =
        await Song.find({
          releaseId:
            release._id,
        })
          .sort({
            trackNumber: 1,

            createdAt: 1,
          })
          .lean();

      // ====================================
      // SANITIZE MEDIA REFERENCES
      // ====================================

      const availableSongs =
        songs.map(
          (song) =>
            sanitizeOwnedSong(
              song,

              release,

              artistCanPreview
            )
        );

      const releasePreviewAllowed =
        artistCanPreview &&

        isPubliclyVisible(
          release
        ) &&

        ["draft", "approved"].includes(
          release.status
        );

      // ====================================
      // RETURN RELEASE AND SONG INFORMATION
      // ====================================

      return res.status(200).json({
        success: true,

        release: {
          _id:
            release._id,

          title:
            release.title,

          releaseType:
            release.releaseType,

          coverImage:
            releasePreviewAllowed
              ? release.coverImage
              : "",

          coverUploadId:
            releasePreviewAllowed
              ? release.coverUploadId
              : null,

          releaseDate:
            release.releaseDate,

          status:
            release.status,

          visibilityStatus:
            release.visibilityStatus ??
            "visible",

          moderationReason:
            release.moderationReason || "",

          moderatedAt:
            release.moderatedAt || null,
        },

        songs:
          availableSongs,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get artist release songs error:"
      );
    }
  };

// ==========================================
// EXPORT SONG CONTROLLERS
// ==========================================

module.exports = {
  addSongToRelease,

  updateSongDraft,

  deleteSongDraft,

  getPublicSongs,

  getPublicSongById,

  getSongsByReleaseForArtist,
};