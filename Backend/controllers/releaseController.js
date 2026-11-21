const mongoose = require("mongoose");

const Release = require("../models/Release");
const Artist = require("../models/Artist");
const Song = require("../models/song");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Follow = require("../models/follow");
const MediaUpload = require("../models/MediaUpload");

const {
  ArtistCreditError,
  validateArtistCredits,
} = require("../utils/artistCreditValidator");

const {
  ReleaseTransactionError,
  runReleaseTransaction,
  lockRelease,
} = require("../utils/releaseTransaction");

const {
  recordAdminActivity,
} = require("../utils/adminActivityService");

// ==========================================
// CONFIGURATION
// ==========================================

const RELEASE_TYPES = [
  "single",
  "ep",
  "album",
];

const ADMIN_ROLES = [
  "admin",
  "superadmin",
];

const ARTIST_FIELDS =
  "stageName profileImage profileImageUploadId verified";

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

function validateReleaseId(releaseId) {
  if (!isValidId(releaseId)) {
    throw new ReleaseTransactionError(
      "Invalid release ID.",
      400
    );
  }
}

// ==========================================
// PUBLIC VISIBILITY FILTER
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
// CHECK CONTENT VISIBILITY
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
// VALIDATE REQUEST BODY
// ==========================================

function getRequestBody(req) {
  const body = req.body ?? {};

  if (
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new ReleaseTransactionError(
      "Invalid release information.",
      400
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

function sendError(
  res,
  error,
  context
) {
  preventCaching(res);

  if (
    error instanceof ReleaseTransactionError
  ) {
    return res.status(error.status).json({
      success: false,

      message: error.message,
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,

      message:
        "A duplicate artwork, audio upload or track number already exists.",
    });
  }

  if (
    error instanceof ArtistCreditError
  ) {
    return res.status(400).json({
      success: false,

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
        "The operation result could not be confirmed. Refresh your releases before retrying.",
    });
  }

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
        "This release is being modified by another request. Refresh and try again.",
    });
  }

  if (
    error.name === "ValidationError" ||

    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,

      message:
        "Invalid release information.",
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
      "Unable to complete the release operation.",
  });
}

// ==========================================
// VERIFY AUTHENTICATED ACCOUNT
// ==========================================

function requireAuthenticatedUser(
  req,
  allowedRoles
) {
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
    !allowedRoles.includes(
      req.user.role
    )
  ) {
    throw new ReleaseTransactionError(
      "You do not have permission to perform this operation.",
      403
    );
  }

  if (
    req.user.accountStatus !==
    "active"
  ) {
    throw new ReleaseTransactionError(
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
    throw new ReleaseTransactionError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// REQUIRE ARTIST USER
// ==========================================

function requireArtistUser(req) {
  return requireAuthenticatedUser(
    req,
    ["artist"]
  );
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
    throw new ReleaseTransactionError(
      "Verified administrative access is required.",
      403
    );
  }

  return administrator;
}

// ==========================================
// BUILD AUTHENTICATED ACCOUNT FILTER
// ==========================================

function buildAccountFilter(req) {
  const filter = {
    _id: req.user._id,

    role: req.user.role,

    accountStatus: "active",
  };

  const version =
    req.auth.tokenVersion;

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
// LOCK AUTHENTICATED ARTIST ACCOUNT
// ==========================================

async function lockArtistUser(
  req,
  session
) {
  requireArtistUser(req);

  const user =
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

        timestamps: false,
      }
    ).select(
      "_id role accountStatus"
    );

  if (!user) {
    throw new ReleaseTransactionError(
      "Your account or authentication session has changed.",
      403
    );
  }

  return user;
}

// ==========================================
// LOCK ACTING ADMINISTRATOR
//
// Prevent a suspended administrator from
// completing a release approval or rejection.
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

        timestamps: false,
      }
    ).select(
      "_id fullName role accountStatus"
    );

  if (!administrator) {
    throw new ReleaseTransactionError(
      "Your administrative permissions or session have changed.",
      403
    );
  }

  return administrator;
}

// ==========================================
// LOCK APPROVED ARTIST PROFILE
//
// Coordinate publication with artist
// suspension and visibility moderation.
// ==========================================

async function lockApprovedArtist(
  userId,
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

  const artist =
    await Artist.findOneAndUpdate(
      {
        userId,

        approvalStatus:
          "approved",

        visibilityStatus:
          "visible",
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
    );

  if (!artist) {
    throw new ReleaseTransactionError(
      "Only approved and visible artists can manage or publish music.",
      403
    );
  }

  return artist;
}

// ==========================================
// VERIFY ARTIST ELIGIBILITY FOR MUTATION
// ==========================================

async function requireApprovedArtist(
  req,
  session
) {
  const user =
    await lockArtistUser(
      req,
      session
    );

  return lockApprovedArtist(
    user._id,
    session
  );
}

// ==========================================
// VERIFY LEGACY RELEASE OWNER
//
// Used for administrator approval of
// older pending releases.
// ==========================================

async function lockLegacyArtistOwner(
  userId,
  session
) {
  const user =
    await User.findOneAndUpdate(
      {
        _id: userId,

        role: "artist",

        accountStatus:
          "active",
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

  if (!user) {
    throw new ReleaseTransactionError(
      "The uploading artist account is unavailable.",
      403
    );
  }

  return lockApprovedArtist(
    user._id,
    session
  );
}

// ==========================================
// CHECK ARTIST PREVIEW ELIGIBILITY
//
// Suspended artists can inspect their
// release metadata without media previews.
// ==========================================

async function canPreviewMedia(userId) {
  const artist =
    await Artist.exists({
      userId,

      approvalStatus:
        "approved",

      visibilityStatus:
        "visible",
    });

  return Boolean(artist);
}

// ==========================================
// VALIDATE ADMINISTRATIVE REASON
// ==========================================

function getModerationReason(
  req,
  defaultReason = ""
) {
  const value = req.body?.reason;

  if (
    value === undefined ||
    value === null
  ) {
    return defaultReason;
  }

  if (typeof value !== "string") {
    throw new ReleaseTransactionError(
      "Moderation reason must be text.",
      400
    );
  }

  const reason =
    value
      .replace(
        /[\u0000-\u001f\u007f]/g,
        " "
      )
      .trim();

  if (reason.length > 1000) {
    throw new ReleaseTransactionError(
      "Moderation reason cannot exceed 1000 characters.",
      400
    );
  }

  return reason || defaultReason;
}

// ==========================================
// VERIFY CONFIRMED MEDIA UPLOAD
//
// Checks:
// - Ownership
// - Media type
// - Confirmation status
// - Object key availability
// ==========================================

async function verifyPublishingMedia({
  uploadId,

  userId,

  kind,

  session,

  message,
}) {
  if (!isValidId(uploadId)) {
    throw new ReleaseTransactionError(
      message ||
        "Invalid media upload reference.",
      400
    );
  }

  const media =
    await MediaUpload.findOne({
      _id: uploadId,

      userId,

      kind,

      status: "ready",
    }).session(session);

  if (
    !media ||

    typeof media.objectKey !== "string" ||

    !media.objectKey.trim() ||

    media.objectKey.startsWith(
      "temporary/"
    )
  ) {
    throw new ReleaseTransactionError(
      message ||
        "The required media upload is unavailable.",
      400
    );
  }

  return media;
}

// ==========================================
// APPLY RELEASE DRAFT INFORMATION
//
// Only explicitly allowed fields may
// be changed by an artist.
// ==========================================

async function applyReleaseDraftFields(
  release,

  input,

  userId,

  artistId,

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

  // ========================================
  // RELEASE TITLE
  // ========================================

  if (hasField(input, "title")) {
    if (
      typeof input.title !== "string" ||

      input.title.trim().length > 200
    ) {
      throw new ArtistCreditError(
        "Release title must be text with at most 200 characters."
      );
    }

    release.title =
      input.title.trim();
  }

  // ========================================
  // RELEASE TYPE
  // ========================================

  if (
    hasField(
      input,
      "releaseType"
    )
  ) {
    const type =
      input.releaseType;

    if (
      type !== null &&

      type !== "" &&

      !RELEASE_TYPES.includes(type)
    ) {
      throw new ArtistCreditError(
        "Release type must be single, ep or album."
      );
    }

    // Singles cannot contain more
    // than one song.

    if (type === "single") {
      const songCount =
        await Song.countDocuments({
          releaseId:
            release._id,
        }).session(session);

      if (songCount > 1) {
        throw new ArtistCreditError(
          "A single can contain only one song."
        );
      }
    }

    release.releaseType =
      type || null;
  }

  // ========================================
  // RELEASE DATE
  // ========================================

  if (
    hasField(
      input,
      "releaseDate"
    )
  ) {
    const value =
      input.releaseDate;

    if (
      value === null ||
      value === ""
    ) {
      release.releaseDate =
        null;

    } else {
      if (typeof value !== "string") {
        throw new ArtistCreditError(
          "Release date must be a valid date string."
        );
      }

      const parsedDate =
        new Date(value);

      if (
        Number.isNaN(
          parsedDate.getTime()
        )
      ) {
        throw new ArtistCreditError(
          "Invalid release date."
        );
      }

      release.releaseDate =
        parsedDate;
    }
  }

  // ========================================
  // ARTIST COLLABORATION VALIDATION
  // ========================================

  if (
    release.isNew ||

    hasField(
      input,
      "primaryArtists"
    ) ||

    hasField(
      input,
      "collaboratingArtists"
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
            : release.primaryArtists,

        additionalArtists:
          hasField(
            input,
            "collaboratingArtists"
          )
            ? input.collaboratingArtists
            : release.collaboratingArtists || [],

        additionalLabel:
          "Release collaborators",

        context:
          "Release",

        session,
      });

    release.primaryArtists =
      credits.primaryArtists;

    release.collaboratingArtists =
      credits.additionalArtists;
  }

  // ========================================
  // COVER ARTWORK INPUT
  // ========================================

  const hasCoverUpload =
    hasField(
      input,
      "coverUploadId"
    );

  const hasCoverUrl =
    hasField(
      input,
      "coverImage"
    );

  // Prevent multiple media sources.

  if (
    hasCoverUpload &&

    hasCoverUrl &&

    input.coverUploadId &&

    input.coverImage
  ) {
    throw new ArtistCreditError(
      "Provide either coverUploadId or coverImage, not both."
    );
  }

  // ========================================
  // CONFIRMED CLOUDFLARE R2 ARTWORK
  // ========================================

  if (hasCoverUpload) {
    const uploadId =
      input.coverUploadId;

    if (
      uploadId === null ||
      uploadId === ""
    ) {
      release.coverUploadId =
        null;

      if (!hasCoverUrl) {
        release.coverImage = "";
      }

    } else {
      const media =
        await verifyPublishingMedia({
          uploadId,

          userId,

          kind: "artwork",

          session,

          message:
            "Cover artwork is not confirmed or does not belong to you.",
        });

      // Prevent artwork upload reuse.

      const alreadyUsed =
        await Release.exists({
          coverUploadId:
            media._id,

          _id: {
            $ne: release._id,
          },
        }).session(session);

      if (alreadyUsed) {
        throw new ArtistCreditError(
          "This artwork upload is already attached to another release."
        );
      }

      release.coverUploadId =
        media._id;

      release.coverImage =
        "";
    }
  }

  // ========================================
  // LEGACY HTTPS ARTWORK SUPPORT
  // ========================================

  if (
    hasCoverUrl &&

    !input.coverUploadId
  ) {
    if (
      typeof input.coverImage !==
      "string"
    ) {
      throw new ArtistCreditError(
        "Cover image URL must be text."
      );
    }

    const url =
      input.coverImage.trim();

    if (
      url &&
      !validHttpsUrl(url)
    ) {
      throw new ArtistCreditError(
        "Cover image URL must use HTTPS."
      );
    }

    release.coverImage =
      url;

    release.coverUploadId =
      null;
  }
}

// ==========================================
// VALIDATE COMPLETE RELEASE
//
// All release metadata and every song
// must pass validation before publishing.
// ==========================================

async function validateCompleteRelease({
  release,

  artist,

  userId,

  session,

  allowLegacyPending = false,
}) {
  // ========================================
  // CHECK RELEASE VISIBILITY
  // ========================================

  if (!isVisible(release)) {
    throw new ReleaseTransactionError(
      "Hidden or restricted releases cannot be published.",
      403
    );
  }

  // ========================================
  // VALIDATE RELEASE TITLE
  // ========================================

  if (
    typeof release.title !== "string" ||

    !release.title.trim() ||

    release.title.trim().length > 200
  ) {
    throw new ReleaseTransactionError(
      "Enter a valid release title before publishing."
    );
  }

  // ========================================
  // VALIDATE RELEASE TYPE
  // ========================================

  if (
    !RELEASE_TYPES.includes(
      release.releaseType
    )
  ) {
    throw new ReleaseTransactionError(
      "Choose Single, EP or Album before publishing."
    );
  }

  // ========================================
  // VALIDATE RELEASE DATE
  // ========================================

  if (
    !(release.releaseDate instanceof Date) ||

    Number.isNaN(
      release.releaseDate.getTime()
    )
  ) {
    throw new ReleaseTransactionError(
      "Select a valid release date before publishing."
    );
  }

  // ========================================
  // VERIFY RELEASE ARTIST CREDITS
  // ========================================

  await validateArtistCredits({
    ownerArtistId:
      artist._id,

    primaryArtists:
      release.primaryArtists,

    additionalArtists:
      release.collaboratingArtists || [],

    additionalLabel:
      "Release collaborators",

    context:
      "Release",

    session,
  });

  // ========================================
  // VALIDATE RELEASE COVER ARTWORK
  // ========================================

  if (release.coverUploadId) {
    await verifyPublishingMedia({
      uploadId:
        release.coverUploadId,

      userId,

      kind:
        "artwork",

      session,

      message:
        "Your release artwork upload has not been confirmed or does not belong to you.",
    });

    // Prevent artwork reuse.

    const duplicateArtwork =
      await Release.exists({
        coverUploadId:
          release.coverUploadId,

        _id: {
          $ne: release._id,
        },
      }).session(session);

    if (duplicateArtwork) {
      throw new ReleaseTransactionError(
        "This artwork upload belongs to another release.",
        409
      );
    }

    release.coverImage = "";

  } else if (
    !validHttpsUrl(
      release.coverImage
    )
  ) {
    throw new ReleaseTransactionError(
      "A valid release cover image is required."
    );
  }

  // ========================================
  // LOAD ALL RELEASE SONGS
  //
  // Restricted songs must be detected,
  // rather than silently excluded.
  // ========================================

  const songs =
    await Song.find({
      releaseId:
        release._id,
    })
      .sort({
        trackNumber: 1,
      })
      .session(session);

  if (songs.length === 0) {
    throw new ReleaseTransactionError(
      "Add at least one song before publishing."
    );
  }

  // ========================================
  // VALIDATE SINGLE TRACK COUNT
  // ========================================

  if (
    release.releaseType === "single" &&

    songs.length !== 1
  ) {
    throw new ReleaseTransactionError(
      "A single must contain exactly one song."
    );
  }

  const trackNumbers =
    new Set();

  const audioUploadIds =
    new Set();

  const allowedSongStatuses =
    allowLegacyPending
      ? [
          "draft",
          "pending",
        ]
      : [
          "draft",
        ];

  // ========================================
  // VALIDATE EVERY SONG SEQUENTIALLY
  // ========================================

  for (const song of songs) {
    // ======================================
    // CHECK SONG STATUS
    // ======================================

    if (
      !allowedSongStatuses.includes(
        song.status
      )
    ) {
      throw new ReleaseTransactionError(
        `Song "${song.title || "Untitled song"}" is not eligible for publication from this release.`,
        409
      );
    }

    // ======================================
    // CHECK SONG VISIBILITY
    // ======================================

    if (!isVisible(song)) {
      throw new ReleaseTransactionError(
        `Song "${song.title || "Untitled song"}" is restricted and cannot be published.`,
        403
      );
    }

    // ======================================
    // VALIDATE SONG TITLE
    // ======================================

    if (
      typeof song.title !== "string" ||

      !song.title.trim() ||

      song.title.trim().length > 200
    ) {
      throw new ReleaseTransactionError(
        "Every song must have a valid title before publishing."
      );
    }

    // ======================================
    // VALIDATE SONG GENRE
    // ======================================

    if (
      typeof song.genre !== "string" ||

      !song.genre.trim() ||

      song.genre.trim().length > 100
    ) {
      throw new ReleaseTransactionError(
        `Please add a valid genre to "${song.title}".`
      );
    }

    // ======================================
    // VALIDATE AUDIO DURATION
    // ======================================

    if (
      !Number.isFinite(
        song.duration
      ) ||

      song.duration < 1
    ) {
      throw new ReleaseTransactionError(
        `Please add a valid duration to "${song.title}".`
      );
    }

    // ======================================
    // VALIDATE TRACK NUMBER
    // ======================================

    if (
      !Number.isSafeInteger(
        song.trackNumber
      ) ||

      song.trackNumber < 1
    ) {
      throw new ReleaseTransactionError(
        `Please assign a valid track number to "${song.title}".`
      );
    }

    // Prevent duplicate track numbers.

    if (
      trackNumbers.has(
        song.trackNumber
      )
    ) {
      throw new ReleaseTransactionError(
        "Each song must have a unique track number."
      );
    }

    trackNumbers.add(
      song.trackNumber
    );

    // ======================================
    // VERIFY SONG ARTIST CREDITS
    // ======================================

    await validateArtistCredits({
      ownerArtistId:
        artist._id,

      primaryArtists:
        song.primaryArtists,

      additionalArtists:
        song.featuredArtists || [],

      additionalLabel:
        "Featured artists",

      context:
        `Song "${song.title}"`,

      session,
    });

    // ======================================
    // VERIFY AUDIO UPLOAD
    // ======================================

    if (song.audioUploadId) {
      const uploadId =
        String(song.audioUploadId);

      if (
        audioUploadIds.has(
          uploadId
        )
      ) {
        throw new ReleaseTransactionError(
          "Multiple songs cannot use the same audio upload."
        );
      }

      audioUploadIds.add(
        uploadId
      );

      await verifyPublishingMedia({
        uploadId:
          song.audioUploadId,

        userId,

        kind:
          "audio",

        session,

        message:
          `Audio upload for "${song.title}" is not confirmed or does not belong to you.`,
      });

      // Prevent audio reuse.

      const existingSong =
        await Song.exists({
          audioUploadId:
            song.audioUploadId,

          _id: {
            $ne: song._id,
          },
        }).session(session);

      if (existingSong) {
        throw new ReleaseTransactionError(
          `The audio upload for "${song.title}" is already attached to another song.`,
          409
        );
      }

      song.audioUrl = "";

    } else if (
      !validHttpsUrl(
        song.audioUrl
      )
    ) {
      throw new ReleaseTransactionError(
        `Song "${song.title}" does not have a valid audio file.`
      );
    }
  }

  return songs;
}

// ==========================================
// PUBLISH SONGS AND RELEASE ATOMICALLY
// ==========================================

async function publishReleaseDocuments({
  release,

  songs,

  session,
}) {
  if (
    !session ||
    !session.inTransaction()
  ) {
    throw new Error(
      "An active transaction is required to publish a release."
    );
  }

  // ========================================
  // FINAL RELEASE VISIBILITY CHECK
  // ========================================

  if (!isVisible(release)) {
    throw new ReleaseTransactionError(
      "Restricted releases cannot be published.",
      403
    );
  }

  // ========================================
  // PUBLISH EVERY VALIDATED SONG
  // ========================================

  for (const song of songs) {
    if (!isVisible(song)) {
      throw new ReleaseTransactionError(
        "Restricted songs cannot be published.",
        403
      );
    }

    song.status =
      "approved";

    if (
      song.visibilityStatus === undefined ||

      song.visibilityStatus === null
    ) {
      song.visibilityStatus =
        "visible";
    }

    await song.save({
      session,
    });
  }

  // ========================================
  // PUBLISH PARENT RELEASE
  // ========================================

  release.status =
    "approved";

  release.rightsConfirmed =
    true;

  if (!release.rightsConfirmedAt) {
    release.rightsConfirmedAt =
      new Date();
  }

  if (
    release.visibilityStatus === undefined ||

    release.visibilityStatus === null
  ) {
    release.visibilityStatus =
      "visible";
  }

  await release.save({
    session,
  });

  return release;
}

// ==========================================
// POPULATE RELEASE ARTISTS
// ==========================================

function populateReleaseArtists(
  query,
  publicOnly = false
) {
  const population = [
    {
      path:
        "primaryArtists",

      select:
        ARTIST_FIELDS,
    },

    {
      path:
        "collaboratingArtists",

      select:
        ARTIST_FIELDS,
    },
  ];

  if (publicOnly) {
    for (const item of population) {
      item.match = {
        approvalStatus:
          "approved",

        ...publicVisibilityFilter(),
      };
    }
  }

  return query.populate(
    population
  );
}

// ==========================================
// POPULATE SONG ARTISTS
// ==========================================

function populateSongArtists(
  query,
  publicOnly = false
) {
  const population = [
    {
      path:
        "primaryArtists",

      select:
        ARTIST_FIELDS,
    },

    {
      path:
        "featuredArtists",

      select:
        ARTIST_FIELDS,
    },
  ];

  if (publicOnly) {
    for (const item of population) {
      item.match = {
        approvalStatus:
          "approved",

        ...publicVisibilityFilter(),
      };
    }
  }

  return query.populate(
    population
  );
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
// SANITIZE PUBLIC RELEASE
//
// Prevent public exposure of private
// administrative and ownership information.
// ==========================================

function sanitizePublicRelease(release) {
  const data =
    toPlainObject(release);

  delete data.moderationReason;

  delete data.moderatedBy;

  delete data.moderatedAt;

  delete data.coverHash;

  delete data.submittedBy;

  delete data.distributorId;

  delete data.rightsConfirmed;

  delete data.rightsConfirmedAt;

  delete data.__v;

  return data;
}

// ==========================================
// SANITIZE PUBLIC SONG
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
// CHECK OWNED RELEASE PREVIEW ELIGIBILITY
// ==========================================

function releasePreviewAllowed(
  release,
  artistCanPreview
) {
  return (
    artistCanPreview &&

    isVisible(release) &&

    ["draft", "approved"].includes(
      release.status
    )
  );
}

// ==========================================
// SANITIZE OWNED RELEASE
//
// Preserve moderation information for
// the artist while blocking restricted media.
// ==========================================

function sanitizeOwnedRelease(
  release,
  artistCanPreview
) {
  const data =
    toPlainObject(release);

  if (
    !releasePreviewAllowed(
      release,
      artistCanPreview
    )
  ) {
    data.coverImage =
      "";

    data.coverUploadId =
      null;
  }

  delete data.coverHash;

  return data;
}

// ==========================================
// SANITIZE OWNED SONG
// ==========================================

function sanitizeOwnedSong(
  song,

  release,

  artistCanPreview
) {
  const data =
    toPlainObject(song);

  const previewAllowed =
    releasePreviewAllowed(
      release,
      artistCanPreview
    ) &&

    isVisible(song) &&

    ["draft", "approved"].includes(
      song.status
    );

  if (!previewAllowed) {
    data.audioUrl =
      "";

    data.audioUploadId =
      null;
  }

  delete data.audioHash;

  return data;
}

// ==========================================
// CREATE RELEASE AUDIT SNAPSHOT
// ==========================================

function releaseSnapshot(release) {
  return {
    status:
      release.status,

    visibilityStatus:
      release.visibilityStatus ??
      "visible",
  };
}

// ==========================================
// NOTIFY ARTIST AND FOLLOWERS
//
// Called only after successful publication.
// ==========================================

async function notifyPublishedRelease(
  releaseId
) {
  const release =
    await Release.findOne({
      _id: releaseId,

      status: "approved",

      ...publicVisibilityFilter(),
    })
      .populate({
        path:
          "primaryArtists",

        select:
          "stageName",

        match: {
          approvalStatus:
            "approved",

          ...publicVisibilityFilter(),
        },
      })
      .lean();

  if (!release) {
    return 0;
  }

  // ========================================
  // NOTIFY UPLOADING ARTIST
  // ========================================

  if (release.submittedBy) {
    try {
      await Notification.create({
        userId:
          release.submittedBy,

        type:
          "release_approved",

        title:
          "Release Published",

        message:
          `Your release "${release.title}" is now live on Emnet Music.`,

        link:
          `/release?id=${release._id}`,
      });

    } catch (error) {
      console.error(
        "Artist publication notification failed:",

        error.name
      );
    }
  }

  // ========================================
  // FIND ELIGIBLE PRIMARY ARTISTS
  // ========================================

  const primaryArtists =
    (release.primaryArtists || [])
      .filter(Boolean);

  const artistIds =
    primaryArtists.map(
      (artist) =>
        artist._id
    );

  if (artistIds.length === 0) {
    return 0;
  }

  // ========================================
  // FIND FOLLOWERS WHO ENABLED NOTIFICATIONS
  // ========================================

  const followers =
    await Follow.find({
      artistId: {
        $in: artistIds,
      },

      notificationsEnabled:
        true,
    })
      .select("userId")
      .lean();

  // ========================================
  // REMOVE DUPLICATE FOLLOWER IDS
  // ========================================

  const ownerUserId =
    String(
      release.submittedBy || ""
    );

  const followerIds = [
    ...new Set(
      followers
        .filter(
          (follow) =>
            Boolean(follow.userId)
        )
        .map(
          (follow) =>
            String(follow.userId)
        )
        .filter(
          (userId) =>
            userId !== ownerUserId
        )
    ),
  ];

  if (followerIds.length === 0) {
    return 0;
  }

  const artistNames =
    primaryArtists
      .map(
        (artist) =>
          artist.stageName
      )
      .filter(Boolean)
      .join(" & ") ||
    "An artist you follow";

  // ========================================
  // SEND NOTIFICATIONS IN BATCHES
  // ========================================

  const batchSize = 500;

  let notifiedFollowers = 0;

  for (
    let offset = 0;

    offset < followerIds.length;

    offset += batchSize
  ) {
    // Stop sending if the release has
    // subsequently been restricted.

    const stillPublic =
      await Release.exists({
        _id: release._id,

        status: "approved",

        ...publicVisibilityFilter(),
      });

    if (!stillPublic) {
      break;
    }

    const batch =
      followerIds.slice(
        offset,
        offset + batchSize
      );

    // Notify active listener accounts
    // and active artist accounts only.

    const activeUsers =
      await User.find({
        _id: {
          $in: batch,
        },

        role: {
          $in: [
            "listener",
            "artist",
          ],
        },

        accountStatus:
          "active",
      })
        .select("_id")
        .lean();

    const notifications =
      activeUsers.map(
        (user) => ({
          userId:
            user._id,

          type:
            "new_release",

          title:
            "New Release",

          message:
            `${artistNames} just released "${release.title}".`,

          link:
            `/release?id=${release._id}`,
        })
      );

    if (
      notifications.length === 0
    ) {
      continue;
    }

    await Notification.insertMany(
      notifications
    );

    notifiedFollowers +=
      notifications.length;
  }

  return notifiedFollowers;
}

// ==========================================
// SAFE POST-PUBLICATION NOTIFICATIONS
//
// Notification failure must not undo
// successful publication.
// ==========================================

async function sendPublishedNotifications(
  releaseId
) {
  try {
    return await notifyPublishedRelease(
      releaseId
    );

  } catch (error) {
    console.error(
      "Release published, but notifications failed:",

      error.name,

      error.message
    );

    return 0;
  }
}

// ==========================================
// CREATE RELEASE DRAFT
//
// POST /api/releases
// ==========================================

const createRelease =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const input =
        getRequestBody(req);

      const release =
        await runReleaseTransaction(
          async (session) => {
            // Verify active approved artist.

            const artist =
              await requireApprovedArtist(
                req,
                session
              );

            // Create an incomplete draft.

            const newRelease =
              new Release({
                title:
                  "",

                releaseType:
                  null,

                coverImage:
                  "",

                coverUploadId:
                  null,

                releaseDate:
                  null,

                primaryArtists: [
                  artist._id,
                ],

                collaboratingArtists:
                  [],

                sourceType:
                  "artist",

                submittedBy:
                  user._id,

                rightsConfirmed:
                  false,

                rightsConfirmedAt:
                  null,

                status:
                  "draft",

                visibilityStatus:
                  "visible",
              });

            // Apply supplied information.

            await applyReleaseDraftFields(
              newRelease,

              input,

              user._id,

              artist._id,

              session
            );

            await newRelease.save({
              session,
            });

            return newRelease;
          }
        );

      return res.status(201).json({
        success: true,

        message:
          "Release draft saved.",

        release,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Create release draft error:"
      );
    }
  };

// ==========================================
// UPDATE RELEASE DRAFT
//
// PATCH /api/releases/mine/:releaseId
// ==========================================

const updateReleaseDraft =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const { releaseId } =
        req.params;

      validateReleaseId(
        releaseId
      );

      const input =
        getRequestBody(req);

      const updatedRelease =
        await runReleaseTransaction(
          async (session) => {
            const artist =
              await requireApprovedArtist(
                req,
                session
              );

            // Lock owned visible draft.

            const release =
              await lockRelease({
                releaseId,

                userId:
                  user._id,

                session,

                allowedStatuses: [
                  "draft",
                ],

                requireVisible:
                  true,
              });

            if (!isVisible(release)) {
              throw new ReleaseTransactionError(
                "Restricted releases cannot be edited.",
                403
              );
            }

            // Apply validated draft fields.

            await applyReleaseDraftFields(
              release,

              input,

              user._id,

              artist._id,

              session
            );

            await release.save({
              session,
            });

            return release;
          }
        );

      return res.status(200).json({
        success: true,

        message:
          "Release draft saved successfully.",

        release:
          updatedRelease,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Update release draft error:"
      );
    }
  };

// ==========================================
// GET MY RELEASES
//
// GET /api/releases/mine
// ==========================================

const getMyReleases =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const artistCanPreview =
        await canPreviewMedia(
          user._id
        );

      const releases =
        await populateReleaseArtists(
          Release.find({
            submittedBy:
              user._id,
          })
            .sort({
              createdAt: -1,
            }),

          false
        ).lean();

      // Count release songs in a single
      // aggregation rather than performing
      // a separate query for every release.

      const releaseIds =
        releases.map(
          (release) =>
            release._id
        );

      const songCounts =
        await Song.aggregate([
          {
            $match: {
              releaseId: {
                $in:
                  releaseIds,
              },
            },
          },

          {
            $group: {
              _id:
                "$releaseId",

              count: {
                $sum: 1,
              },
            },
          },
        ]);

      const countMap =
        new Map(
          songCounts.map(
            (item) => [
              String(item._id),

              item.count,
            ]
          )
        );

      const releasesWithSongs =
        releases.map(
          (release) => ({
            ...sanitizeOwnedRelease(
              release,

              artistCanPreview
            ),

            songCount:
              countMap.get(
                String(release._id)
              ) || 0,
          })
        );

      return res.status(200).json({
        success: true,

        count:
          releasesWithSongs.length,

        releases:
          releasesWithSongs,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get my releases error:"
      );
    }
  };

// ==========================================
// GET ONE ARTIST'S OWN RELEASE
//
// GET /api/releases/mine/:releaseId
// ==========================================

const getMyReleaseById =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const { releaseId } =
        req.params;

      validateReleaseId(
        releaseId
      );

      // Verify release ownership.

      const release =
        await populateReleaseArtists(
          Release.findOne({
            _id: releaseId,

            submittedBy:
              user._id,
          }),

          false
        ).lean();

      if (!release) {
        throw new ReleaseTransactionError(
          "Release not found or access denied.",
          404
        );
      }

      const artistCanPreview =
        await canPreviewMedia(
          user._id
        );

      // Preserve all owned song metadata.

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

      return res.status(200).json({
        success: true,

        release:
          sanitizeOwnedRelease(
            release,

            artistCanPreview
          ),

        songs:
          songs.map(
            (song) =>
              sanitizeOwnedSong(
                song,

                release,

                artistCanPreview
              )
          ),
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get my release details error:"
      );
    }
  };

// ==========================================
// GET ALL PUBLIC RELEASES
//
// GET /api/releases
// ==========================================

const getPublicReleases =
  async (req, res) => {
    try {
      preventCaching(res);

      const releases =
        await populateReleaseArtists(
          Release.find({
            status:
              "approved",

            ...publicVisibilityFilter(),
          })
            .sort({
              releaseDate: -1,

              _id: -1,
            }),

          true
        ).lean();

      return res.status(200).json({
        success: true,

        releases:
          releases.map(
            sanitizePublicRelease
          ),
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get public releases error:"
      );
    }
  };

// ==========================================
// GET ONE PUBLIC RELEASE
//
// GET /api/releases/:releaseId
// ==========================================

const getReleaseById =
  async (req, res) => {
    try {
      preventCaching(res);

      const { releaseId } =
        req.params;

      validateReleaseId(
        releaseId
      );

      // Find approved and visible release.

      const release =
        await populateReleaseArtists(
          Release.findOne({
            _id: releaseId,

            status:
              "approved",

            ...publicVisibilityFilter(),
          }),

          true
        ).lean();

      if (!release) {
        throw new ReleaseTransactionError(
          "Release not found.",
          404
        );
      }

      // Find approved and visible songs.

      const songs =
        await populateSongArtists(
          Song.find({
            releaseId:
              release._id,

            status:
              "approved",

            ...publicVisibilityFilter(),
          })
            .sort({
              trackNumber: 1,

              createdAt: 1,
            }),

          true
        ).lean();

      // Recheck parent availability before
      // returning public release information.

      const stillPublic =
        await Release.exists({
          _id: release._id,

          status:
            "approved",

          ...publicVisibilityFilter(),
        });

      if (!stillPublic) {
        throw new ReleaseTransactionError(
          "Release not found.",
          404
        );
      }

      return res.status(200).json({
        success: true,

        release:
          sanitizePublicRelease(
            release
          ),

        songs:
          songs.map(
            sanitizePublicSong
          ),
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get public release error:"
      );
    }
  };

// ==========================================
// PUBLISH RELEASE IMMEDIATELY
//
// PATCH /api/releases/:releaseId/submit
//
// Administrator approval is NOT required.
// ==========================================

const submitReleaseForReview =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const { releaseId } =
        req.params;

      validateReleaseId(
        releaseId
      );

      const {
        rightsConfirmed,
      } = getRequestBody(req);

      // ====================================
      // START ATOMIC PUBLISHING TRANSACTION
      // ====================================

      const result =
        await runReleaseTransaction(
          async (session) => {
            // Verify artist eligibility
            // inside the transaction.

            const artist =
              await requireApprovedArtist(
                req,
                session
              );

            // Verify release ownership.

            const existingRelease =
              await Release.findOne({
                _id:
                  releaseId,

                submittedBy:
                  user._id,
              }).session(session);

            if (!existingRelease) {
              throw new ReleaseTransactionError(
                "Release not found or access denied.",
                404
              );
            }

            // =================================
            // PREVENT RESTRICTED PUBLICATION
            // =================================

            if (
              !isVisible(
                existingRelease
              )
            ) {
              throw new ReleaseTransactionError(
                "Hidden or restricted releases cannot be published.",
                403
              );
            }

            // =================================
            // PREVENT REPEATED PUBLICATION
            // =================================

            if (
              existingRelease.status ===
              "approved"
            ) {
              return {
                release:
                  existingRelease,

                alreadyPublished:
                  true,
              };
            }

            if (
              existingRelease.status !==
              "draft"
            ) {
              throw new ReleaseTransactionError(
                "Only draft releases can be published.",
                409
              );
            }

            // =================================
            // COPYRIGHT CONFIRMATION
            // =================================

            if (
              rightsConfirmed !== true
            ) {
              throw new ReleaseTransactionError(
                "You must confirm that you own this music or have permission to publish it."
              );
            }

            // =================================
            // LOCK RELEASE
            // =================================

            const release =
              await lockRelease({
                releaseId,

                userId:
                  user._id,

                session,

                allowedStatuses: [
                  "draft",
                ],

                requireVisible:
                  true,
              });

            // =================================
            // VALIDATE RELEASE AND ALL SONGS
            // =================================

            const songs =
              await validateCompleteRelease({
                release,

                artist,

                userId:
                  user._id,

                session,
              });

            // =================================
            // RECORD COPYRIGHT CONFIRMATION
            // =================================

            release.rightsConfirmed =
              true;

            release.rightsConfirmedAt =
              new Date();

            // =================================
            // PUBLISH RELEASE AND SONGS
            // =================================

            const publishedRelease =
              await publishReleaseDocuments({
                release,

                songs,

                session,
              });

            return {
              release:
                publishedRelease,

              alreadyPublished:
                false,
            };
          }
        );

      // ====================================
      // TRANSACTION COMMITTED
      // ====================================

      if (result.alreadyPublished) {
        return res.status(200).json({
          success: true,

          message:
            "This release is already published.",

          release:
            result.release,

          alreadyPublished:
            true,

          notifiedFollowers:
            0,
        });
      }

      // Notify followers after commit.

      const notifiedFollowers =
        await sendPublishedNotifications(
          result.release._id
        );

      return res.status(200).json({
        success: true,

        message:
          "Your music is now published on Emnet Music.",

        release:
          result.release,

        alreadyPublished:
          false,

        notifiedFollowers,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Publish release transaction error:"
      );
    }
  };

// ==========================================
// ADMIN: GET LEGACY PENDING RELEASES
//
// GET /api/releases/pending
// ==========================================

const getPendingReleases =
  async (req, res) => {
    try {
      preventCaching(res);

      requireAdministrator(req);

      const releases =
        await populateReleaseArtists(
          Release.find({
            status:
              "pending",
          })
            .sort({
              createdAt: 1,
            }),

          false
        )
          .populate(
            "submittedBy",

            "fullName email"
          )
          .lean();

      return res.status(200).json({
        success: true,

        releases,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get pending releases error:"
      );
    }
  };

// ==========================================
// ADMIN: APPROVE LEGACY PENDING RELEASE
//
// PATCH /api/releases/:releaseId/approve
//
// Only for previously pending releases.
// New artist releases publish immediately.
// ==========================================

const approveRelease =
  async (req, res) => {
    try {
      preventCaching(res);

      requireAdministrator(req);

      const { releaseId } =
        req.params;

      validateReleaseId(
        releaseId
      );

      const reason =
        getModerationReason(
          req,

          "Legacy pending release approved."
        );

      // ====================================
      // START LEGACY APPROVAL TRANSACTION
      // ====================================

      const result =
        await runReleaseTransaction(
          async (session) => {
            const administrator =
              await lockAdministrator(
                req,
                session
              );

            // Find existing release.

            const existingRelease =
              await Release.findById(
                releaseId
              ).session(session);

            if (!existingRelease) {
              throw new ReleaseTransactionError(
                "Release not found.",
                404
              );
            }

            // Prevent restricted approval.

            if (
              !isVisible(
                existingRelease
              )
            ) {
              throw new ReleaseTransactionError(
                "Restricted releases cannot be approved.",
                403
              );
            }

            // Prevent duplicate approval.

            if (
              existingRelease.status ===
              "approved"
            ) {
              return {
                release:
                  existingRelease,

                alreadyPublished:
                  true,
              };
            }

            if (
              existingRelease.status !==
              "pending"
            ) {
              throw new ReleaseTransactionError(
                "Only pending releases can be approved.",
                409
              );
            }

            // =================================
            // VERIFY ORIGINAL UPLOADING ARTIST
            // =================================

            const artist =
              await lockLegacyArtistOwner(
                existingRelease.submittedBy,

                session
              );

            // =================================
            // LOCK LEGACY RELEASE
            // =================================

            const release =
              await lockRelease({
                releaseId,

                session,

                allowedStatuses: [
                  "pending",
                ],

                requireVisible:
                  true,
              });

            // Verify ownership has not changed.

            if (
              String(release.submittedBy) !==
              String(existingRelease.submittedBy)
            ) {
              throw new ReleaseTransactionError(
                "Release ownership changed. Refresh and try again.",
                409
              );
            }

            // =================================
            // VERIFY COPYRIGHT CONFIRMATION
            // =================================

            if (
              release.rightsConfirmed !==
              true
            ) {
              throw new ReleaseTransactionError(
                "This release does not contain the required copyright confirmation."
              );
            }

            // =================================
            // VALIDATE LEGACY RELEASE
            // =================================

            const songs =
              await validateCompleteRelease({
                release,

                artist,

                userId:
                  release.submittedBy,

                session,

                allowLegacyPending:
                  true,
              });

            const previousValues =
              releaseSnapshot(
                release
              );

            // =================================
            // PUBLISH LEGACY RELEASE
            // =================================

            release.moderationReason =
              reason;

            release.moderatedBy =
              administrator._id;

            release.moderatedAt =
              new Date();

            const publishedRelease =
              await publishReleaseDocuments({
                release,

                songs,

                session,
              });

            // =================================
            // RECORD ADMINISTRATIVE ACTIVITY
            // =================================

            await recordAdminActivity({
              req,

              actor:
                administrator,

              action:
                "release_approved",

              targetType:
                "release",

              targetId:
                publishedRelease._id,

              targetName:
                publishedRelease.title,

              previousValues,

              newValues:
                releaseSnapshot(
                  publishedRelease
                ),

              reason,

              outcome:
                "success",

              session,
            });

            return {
              release:
                publishedRelease,

              alreadyPublished:
                false,
            };
          }
        );

      const notifiedFollowers =
        result.alreadyPublished
          ? 0
          : await sendPublishedNotifications(
              result.release._id
            );

      return res.status(200).json({
        success: true,

        message:
          result.alreadyPublished
            ? "This release is already published."
            : "Release approved successfully.",

        release:
          result.release,

        alreadyPublished:
          result.alreadyPublished,

        notifiedFollowers,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Approve release transaction error:"
      );
    }
  };

// ==========================================
// ADMIN: REJECT LEGACY PENDING RELEASE
//
// PATCH /api/releases/:releaseId/reject
//
// Published releases must be moderated
// through the centralized moderation service.
// ==========================================

const rejectRelease =
  async (req, res) => {
    try {
      preventCaching(res);

      requireAdministrator(req);

      const { releaseId } =
        req.params;

      validateReleaseId(
        releaseId
      );

      const reason =
        getModerationReason(
          req,

          "Legacy pending release rejected."
        );

      // ====================================
      // START REJECTION TRANSACTION
      // ====================================

      const result =
        await runReleaseTransaction(
          async (session) => {
            const administrator =
              await lockAdministrator(
                req,
                session
              );

            const existingRelease =
              await Release.findById(
                releaseId
              ).session(session);

            if (!existingRelease) {
              throw new ReleaseTransactionError(
                "Release not found.",
                404
              );
            }

            // Prevent duplicate rejection.

            if (
              existingRelease.status ===
              "rejected"
            ) {
              return {
                release:
                  existingRelease,

                alreadyRejected:
                  true,
              };
            }

            // Only pending releases.

            if (
              existingRelease.status !==
              "pending"
            ) {
              throw new ReleaseTransactionError(
                "Only pending releases can be rejected. Use content moderation for published releases.",
                409
              );
            }

            // =================================
            // ACQUIRE RELEASE LOCK
            // =================================

            const release =
              await lockRelease({
                releaseId,

                session,

                allowedStatuses: [
                  "pending",
                ],

                requireVisible:
                  false,
              });

            // =================================
            // CHECK FOR PUBLISHED SONGS
            // =================================

            const publishedSong =
              await Song.exists({
                releaseId:
                  release._id,

                status:
                  "approved",
              }).session(session);

            if (publishedSong) {
              throw new ReleaseTransactionError(
                "This pending release contains an already approved song and requires manual review.",
                409
              );
            }

            const previousValues =
              releaseSnapshot(
                release
              );

            // =================================
            // REJECT RELEASE SONGS
            //
            // Preserve their visibility status.
            // =================================

            await Song.updateMany(
              {
                releaseId:
                  release._id,
              },

              {
                $set: {
                  status:
                    "rejected",
                },

                $inc: {
                  __v: 1,
                },
              },

              {
                session,

                runValidators:
                  true,
              }
            );

            // =================================
            // REJECT PARENT RELEASE
            // =================================

            release.status =
              "rejected";

            // Preserve existing takedown
            // or hidden-content information.

            if (isVisible(release)) {
              release.moderationReason =
                reason;

              release.moderatedBy =
                administrator._id;

              release.moderatedAt =
                new Date();
            }

            await release.save({
              session,
            });

            // =================================
            // RECORD ADMINISTRATIVE ACTIVITY
            // =================================

            await recordAdminActivity({
              req,

              actor:
                administrator,

              action:
                "release_rejected",

              targetType:
                "release",

              targetId:
                release._id,

              targetName:
                release.title,

              previousValues,

              newValues:
                releaseSnapshot(release),

              reason,

              outcome:
                "success",

              session,
            });

            return {
              release,

              alreadyRejected:
                false,
            };
          }
        );

      // ====================================
      // NOTIFY UPLOADING ARTIST AFTER COMMIT
      // ====================================

      if (
        !result.alreadyRejected &&

        result.release.submittedBy
      ) {
        try {
          await Notification.create({
            userId:
              result.release.submittedBy,

            type:
              "release_rejected",

            title:
              "Release Rejected",

            message:
              `Your release "${result.release.title}" was not approved.`,

            link:
              `/release?id=${result.release._id}`,
          });

        } catch (error) {
          console.error(
            "Release rejected, notification failed:",

            error.name
          );
        }
      }

      return res.status(200).json({
        success: true,

        message:
          result.alreadyRejected
            ? "This release is already rejected."
            : "Release rejected successfully.",

        release:
          result.release,

        alreadyRejected:
          result.alreadyRejected,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Reject release transaction error:"
      );
    }
  };

// ==========================================
// EXPORT ALL RELEASE CONTROLLERS
// ==========================================

module.exports = {
  // Artist release management.

  createRelease,

  updateReleaseDraft,

  getMyReleases,

  getMyReleaseById,

  // Public release discovery.

  getReleaseById,

  getPublicReleases,

  // Immediate artist publication.

  submitReleaseForReview,

  // Legacy administrative management.

  getPendingReleases,

  approveRelease,

  rejectRelease,
};