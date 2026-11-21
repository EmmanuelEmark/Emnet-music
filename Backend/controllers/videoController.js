const mongoose = require("mongoose");

const Video = require("../models/video");
const Song = require("../models/song");
const Release = require("../models/Release");
const Artist = require("../models/Artist");
const User = require("../models/User");
const Notification = require("../models/Notification");
const MediaUpload = require("../models/MediaUpload");

const {
  notifyPublishedVideo,
} = require("../utils/videoNotificationService");

const {
  ArtistCreditError,
  validateArtistCredits,
} = require("../utils/artistCreditValidator");

const {
  recordAdminActivity,
} = require("../utils/adminActivityService");

// ==========================================
// CONFIGURATION
// ==========================================

const allowedVideoTypes = [
  "music_video",
  "live_performance",
  "interview",
  "other",
];

const administrativeRoles = [
  "admin",
  "superadmin",
];

const ARTIST_FIELDS =
  "stageName profileImage profileImageUploadId verified";

// ==========================================
// CUSTOM REQUEST ERROR
// ==========================================

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "RequestError";

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

function validateVideoId(videoId) {
  if (!isValidId(videoId)) {
    throw new RequestError(
      "Invalid video ID."
    );
  }
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
// VALIDATE REQUEST BODY
// ==========================================

function getRequestBody(req) {
  const body = req.body ?? {};

  if (
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new RequestError(
      "Invalid video information."
    );
  }

  return body;
}

// ==========================================
// PUBLIC VISIBILITY FILTER
//
// Supports older content without an
// explicit visibility status.
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

  if (error instanceof RequestError) {
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
        "This video or thumbnail upload is already in use.",
    });
  }

  // Artist credit errors.

  if (error instanceof ArtistCreditError) {
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
        "The operation result could not be confirmed. Refresh your video information before retrying.",
    });
  }

  // Conflicting database operations.

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
        "This video is being modified by another request. Refresh and try again.",
    });
  }

  // Schema validation errors.

  if (
    error.name === "ValidationError" ||

    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,

      message:
        "Invalid video information.",
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
      "Unable to complete the video operation.",
  });
}

// ==========================================
// VALIDATE LEGACY MEDIA URL
//
// Preserve HTTP and HTTPS legacy media.
//
// New video publication requires confirmed
// Cloudflare R2 uploads.
// ==========================================

function validUrl(value) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return false;
  }

  try {
    const url = new URL(value);

    return (
      ["http:", "https:"].includes(
        url.protocol
      ) &&

      Boolean(url.hostname) &&

      !url.username &&

      !url.password
    );

  } catch {
    return false;
  }
}

// ==========================================
// REQUIRE AUTHENTICATED ACCOUNT
// ==========================================

function requireAuthenticatedUser(
  req,
  allowedRoles
) {
  if (
    !req.user?._id ||
    !req.auth
  ) {
    throw new RequestError(
      "Authentication is required.",
      401
    );
  }

  if (
    !allowedRoles.includes(
      req.user.role
    )
  ) {
    throw new RequestError(
      "You do not have permission to perform this operation.",
      403
    );
  }

  if (
    req.user.accountStatus !== "active"
  ) {
    throw new RequestError(
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
    throw new RequestError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// REQUIRE ARTIST ACCOUNT
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
      administrativeRoles
    );

  if (
    administrator.emailVerified !== true
  ) {
    throw new RequestError(
      "Verified administrative access is required.",
      403
    );
  }

  return administrator;
}

// ==========================================
// RUN DATABASE TRANSACTION
// ==========================================

async function runVideoTransaction(
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
// LOCK AUTHENTICATED ARTIST USER
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
    ).select("_id role accountStatus");

  if (!user) {
    throw new RequestError(
      "Your account or authentication session has changed.",
      403
    );
  }

  return user;
}

// ==========================================
// LOCK ACTING ADMINISTRATOR
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
    throw new RequestError(
      "Your administrative permissions or session have changed.",
      403
    );
  }

  return administrator;
}

// ==========================================
// LOCK APPROVED ARTIST PROFILE
//
// Coordinate artist publishing with
// administrative suspension and moderation.
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
    throw new RequestError(
      "Only approved and visible artists can manage videos.",
      403
    );
  }

  return artist;
}

// ==========================================
// REQUIRE APPROVED ARTIST FOR MUTATION
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
// VERIFY ORIGINAL LEGACY VIDEO OWNER
// ==========================================

async function lockLegacyVideoOwner(
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
    throw new RequestError(
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
// CHECK OWNER PREVIEW ELIGIBILITY
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
// VERIFY MEDIA UPLOAD
// ==========================================

async function verifyMedia({
  uploadId,

  userId,

  kind,

  fieldName,

  session,
}) {
  if (!isValidId(uploadId)) {
    throw new RequestError(
      `Invalid ${fieldName} upload ID.`
    );
  }

  // Accept dedicated thumbnails and
  // existing artwork-based thumbnails.

  const mediaKind =
    kind === "thumbnail"
      ? {
          $in: [
            "thumbnail",
            "artwork",
          ],
        }
      : kind;

  const upload =
    await MediaUpload.findOne({
      _id: uploadId,

      userId,

      kind: mediaKind,

      status: "ready",
    }).session(session);

  if (!upload) {
    throw new RequestError(
      `${fieldName} upload is not confirmed or does not belong to you.`
    );
  }

  // Prevent temporary or unavailable
  // files from being published.

  if (
    typeof upload.objectKey !== "string" ||

    !upload.objectKey.trim() ||

    upload.objectKey.startsWith(
      "temporary/"
    )
  ) {
    throw new RequestError(
      `${fieldName} media file is unavailable.`
    );
  }

  return upload;
}

// ==========================================
// PREVENT MEDIA UPLOAD REUSE
// ==========================================

async function checkMediaAvailability({
  uploadId,

  field,

  videoId,

  fieldName,

  session,
}) {
  if (!uploadId) {
    return;
  }

  const filter = {
    [field]: uploadId,
  };

  if (videoId) {
    filter._id = {
      $ne: videoId,
    };
  }

  const existing =
    await Video.exists(
      filter
    ).session(session);

  if (existing) {
    throw new RequestError(
      `This ${fieldName} upload is already attached to another video.`,
      409
    );
  }
}

// ==========================================
// NORMALIZE OPTIONAL RELATIONSHIP ID
// ==========================================

function normalizeOptionalId(
  value,
  label
) {
  if (
    value === null ||

    value === undefined ||

    value === ""
  ) {
    return null;
  }

  if (!isValidId(value)) {
    throw new RequestError(
      `Invalid ${label} ID.`
    );
  }

  return String(value).toLowerCase();
}

// ==========================================
// VALIDATE LINKED SONG AND RELEASE
//
// Linked music must:
// - Belong to the uploading artist.
// - Be published.
// - Be publicly visible.
// - Have a valid parent release.
// ==========================================

async function validateLinkedContent({
  linkedSong,

  linkedRelease,

  userId,

  session,
}) {
  const songId =
    normalizeOptionalId(
      linkedSong,
      "linked song"
    );

  const releaseId =
    normalizeOptionalId(
      linkedRelease,
      "linked release"
    );

  if (!songId && !releaseId) {
    return {
      linkedSong: null,

      linkedRelease: null,
    };
  }

  let selectedRelease = null;

  // ========================================
  // VERIFY SELECTED RELEASE
  // ========================================

  if (releaseId) {
    selectedRelease =
      await Release.findOne({
        _id: releaseId,

        submittedBy: userId,

        status: "approved",

        ...publicVisibilityFilter(),
      })
        .select(
          "_id title status visibilityStatus submittedBy"
        )
        .session(session);

    if (!selectedRelease) {
      throw new RequestError(
        "The linked release must belong to you and must be published and visible."
      );
    }
  }

  // ========================================
  // VERIFY SELECTED SONG
  // ========================================

  if (songId) {
    const song =
      await Song.findOne({
        _id: songId,

        status: "approved",

        ...publicVisibilityFilter(),
      })
        .select(
          "_id title releaseId status visibilityStatus"
        )
        .session(session);

    if (!song) {
      throw new RequestError(
        "The linked song must be published and visible."
      );
    }

    let owningRelease;

    // Reuse the validated release when
    // both references identify it.

    if (
      selectedRelease &&

      String(selectedRelease._id) ===
        String(song.releaseId)
    ) {
      owningRelease =
        selectedRelease;

    } else {
      owningRelease =
        await Release.findOne({
          _id: song.releaseId,

          submittedBy:
            userId,

          status:
            "approved",

          ...publicVisibilityFilter(),
        })
          .select(
            "_id status visibilityStatus submittedBy"
          )
          .session(session);
    }

    if (!owningRelease) {
      throw new RequestError(
        "You can only link songs belonging to your own published and visible releases."
      );
    }

    // Prevent incorrect song and
    // release combinations.

    if (
      releaseId &&

      String(song.releaseId) !==
        releaseId
    ) {
      throw new RequestError(
        "The selected song does not belong to the selected release."
      );
    }
  }

  return {
    linkedSong:
      songId,

    linkedRelease:
      releaseId,
  };
}

// ==========================================
// VALIDATE ARTIST CREDITS
// ==========================================

async function validateArtists({
  primaryArtists,

  featuredArtists,

  artist,

  videoTitle,

  session,
}) {
  const credits =
    await validateArtistCredits({
      ownerArtistId:
        artist._id,

      primaryArtists,

      additionalArtists:
        featuredArtists,

      additionalLabel:
        "Featured artists",

      context:
        `Video "${videoTitle || "Untitled video"}"`,

      session,
    });

  return {
    primaryArtists:
      credits.primaryArtists,

    featuredArtists:
      credits.additionalArtists,
  };
}

// ==========================================
// APPLY MEDIA FIELD
//
// Only supplied fields are modified.
// ==========================================

async function applyMediaField({
  video,

  input,

  userId,

  uploadField,

  urlField,

  kind,

  fieldName,

  session,
}) {
  const uploadSupplied =
    hasField(
      input,
      uploadField
    );

  const urlSupplied =
    hasField(
      input,
      urlField
    );

  if (
    !uploadSupplied &&
    !urlSupplied
  ) {
    return;
  }

  const uploadId =
    input[uploadField];

  const url =
    input[urlField];

  // ========================================
  // VALIDATE LEGACY URL INPUT
  // ========================================

  if (
    urlSupplied &&

    typeof url !== "string"
  ) {
    throw new RequestError(
      `${fieldName} URL must be text.`
    );
  }

  // ========================================
  // VALIDATE UPLOAD ID
  // ========================================

  if (
    uploadSupplied &&

    uploadId !== null &&

    uploadId !== "" &&

    !isValidId(uploadId)
  ) {
    throw new RequestError(
      `Invalid ${fieldName} upload ID.`
    );
  }

  // Prevent two simultaneous sources.

  if (
    uploadId &&

    urlSupplied &&

    url.trim()
  ) {
    throw new RequestError(
      `Provide either ${fieldName} upload ID or URL, not both.`
    );
  }

  // ========================================
  // ATTACH CONFIRMED R2 UPLOAD
  // ========================================

  if (
    uploadSupplied &&
    uploadId
  ) {
    const upload =
      await verifyMedia({
        uploadId,

        userId,

        kind,

        fieldName,

        session,
      });

    await checkMediaAvailability({
      uploadId:
        upload._id,

      field:
        uploadField,

      videoId:
        video._id,

      fieldName,

      session,
    });

    video[uploadField] =
      upload._id;

    video[urlField] =
      "";

    return;
  }

  // ========================================
  // LEGACY URL SUPPORT
  // ========================================

  if (urlSupplied) {
    const cleanUrl =
      url.trim();

    if (
      cleanUrl &&

      !validUrl(cleanUrl)
    ) {
      throw new RequestError(
        `Invalid ${fieldName} URL.`
      );
    }

    video[urlField] =
      cleanUrl;

    video[uploadField] =
      null;

    return;
  }

  // ========================================
  // REMOVE DRAFT MEDIA ATTACHMENT
  // ========================================

  if (uploadSupplied) {
    video[uploadField] =
      null;

    video[urlField] =
      "";
  }
}

// ==========================================
// APPLY VIDEO DRAFT INFORMATION
//
// Only approved input fields can be
// modified.
//
// Artists cannot directly change moderation
// status or publication status.
// ==========================================

async function applyVideoDraftFields({
  video,

  input,

  userId,

  artist,

  session,
}) {
  // ========================================
  // VIDEO TEXT FIELDS
  // ========================================

  const textFields = [
    {
      field: "title",

      maxLength: 200,

      label: "Video title",
    },

    {
      field: "description",

      maxLength: 5000,

      label: "Description",
    },

    {
      field: "genre",

      maxLength: 100,

      label: "Genre",
    },
  ];

  for (const item of textFields) {
    if (
      !hasField(
        input,
        item.field
      )
    ) {
      continue;
    }

    const value =
      input[item.field];

    if (
      typeof value !== "string" ||

      value.trim().length >
        item.maxLength
    ) {
      throw new RequestError(
        `${item.label} must be text with at most ${item.maxLength} characters.`
      );
    }

    video[item.field] =
      value.trim();
  }

  // ========================================
  // VIDEO TYPE
  // ========================================

  if (
    hasField(
      input,
      "videoType"
    )
  ) {
    if (
      !allowedVideoTypes.includes(
        input.videoType
      )
    ) {
      throw new RequestError(
        "Invalid video type."
      );
    }

    video.videoType =
      input.videoType;
  }

  // ========================================
  // VIDEO DURATION
  // ========================================

  if (
    hasField(
      input,
      "duration"
    )
  ) {
    const duration =
      input.duration;

    if (
      typeof duration !== "number" ||

      !Number.isFinite(duration) ||

      duration < 0
    ) {
      throw new RequestError(
        "Duration must be a valid number of seconds."
      );
    }

    video.duration =
      duration;
  }

  // ========================================
  // PRIMARY AND FEATURED ARTISTS
  // ========================================

  if (
    video.isNew ||

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
      await validateArtists({
        primaryArtists:
          hasField(
            input,
            "primaryArtists"
          )
            ? input.primaryArtists
            : video.primaryArtists,

        featuredArtists:
          hasField(
            input,
            "featuredArtists"
          )
            ? input.featuredArtists
            : video.featuredArtists || [],

        artist,

        videoTitle:
          video.title,

        session,
      });

    video.primaryArtists =
      credits.primaryArtists;

    video.featuredArtists =
      credits.featuredArtists;
  }

  // ========================================
  // LINKED SONG AND RELEASE
  // ========================================

  if (
    hasField(
      input,
      "linkedSong"
    ) ||

    hasField(
      input,
      "linkedRelease"
    )
  ) {
    const links =
      await validateLinkedContent({
        linkedSong:
          hasField(
            input,
            "linkedSong"
          )
            ? input.linkedSong
            : video.linkedSong,

        linkedRelease:
          hasField(
            input,
            "linkedRelease"
          )
            ? input.linkedRelease
            : video.linkedRelease,

        userId,

        session,
      });

    video.linkedSong =
      links.linkedSong;

    video.linkedRelease =
      links.linkedRelease;
  }

  // ========================================
  // VIDEO MEDIA
  // ========================================

  await applyMediaField({
    video,

    input,

    userId,

    uploadField:
      "videoUploadId",

    urlField:
      "videoUrl",

    kind:
      "video",

    fieldName:
      "video",

    session,
  });

  // ========================================
  // THUMBNAIL MEDIA
  // ========================================

  await applyMediaField({
    video,

    input,

    userId,

    uploadField:
      "thumbnailUploadId",

    urlField:
      "thumbnailUrl",

    kind:
      "thumbnail",

    fieldName:
      "thumbnail",

    session,
  });
}

// ==========================================
// BUILD CONDITIONAL VIDEO UPDATE FILTER
//
// Prevent conflicting administrative and
// artist modifications.
// ==========================================

function buildVideoUpdateFilter(video) {
  const filter = {
    _id: video._id,

    submittedBy:
      video.submittedBy,

    status:
      video.status,
  };

  if (
    video.visibilityStatus === undefined
  ) {
    filter.visibilityStatus = {
      $exists: false,
    };

  } else {
    filter.visibilityStatus =
      video.visibilityStatus;
  }

  if (video.updatedAt === undefined) {
    filter.updatedAt = {
      $exists: false,
    };

  } else {
    filter.updatedAt =
      video.updatedAt;
  }

  if (video.__v === undefined) {
    filter.__v = {
      $exists: false,
    };

  } else {
    filter.__v =
      video.__v;
  }

  return filter;
}

// ==========================================
// CONDITIONAL VIDEO UPDATE
// ==========================================

async function saveVideoChanges(
  original,

  changes,

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

  const updated =
    await Video.findOneAndUpdate(
      buildVideoUpdateFilter(
        original
      ),

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
    throw new RequestError(
      "This video changed in another request. Refresh and try again.",
      409
    );
  }

  return updated;
}

// ==========================================
// POPULATE ARTIST VIDEO INFORMATION
//
// Used for private owner information and
// legacy administrative pending videos.
// ==========================================

function populateVideo(query) {
  return query.populate([
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

    {
      path:
        "linkedSong",

      select:
        "title genre duration releaseId status visibilityStatus",

      populate: {
        path:
          "releaseId",

        select:
          "_id status visibilityStatus",
      },
    },

    {
      path:
        "linkedRelease",

      select:
        "title releaseType coverImage coverUploadId status visibilityStatus",
    },
  ]);
}

// ==========================================
// POPULATE PUBLIC VIDEO INFORMATION
//
// Restricted linked music and artist
// profiles must not leak through videos.
// ==========================================

function populatePublicVideo(query) {
  return query.populate([
    {
      path:
        "primaryArtists",

      select:
        ARTIST_FIELDS,

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
        ARTIST_FIELDS,

      match: {
        approvalStatus:
          "approved",

        ...publicVisibilityFilter(),
      },
    },

    {
      path:
        "linkedSong",

      select:
        "title genre duration releaseId",

      match: {
        status:
          "approved",

        ...publicVisibilityFilter(),
      },

      populate: {
        path:
          "releaseId",

        select:
          "_id",

        match: {
          status:
            "approved",

          ...publicVisibilityFilter(),
        },
      },
    },

    {
      path:
        "linkedRelease",

      select:
        "title releaseType coverImage coverUploadId",

      match: {
        status:
          "approved",

        ...publicVisibilityFilter(),
      },
    },
  ]);
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
// SANITIZE PUBLIC VIDEO INFORMATION
// ==========================================

function sanitizePublicVideo(video) {
  const result =
    toPlainObject(video);

  // Remove linked songs whose parent
  // releases are no longer available.

  if (
    result.linkedSong &&

    !result.linkedSong.releaseId
  ) {
    result.linkedSong =
      null;
  }

  // Prevent incorrect song/release
  // relationships in public responses.

  if (
    result.linkedSong &&

    result.linkedRelease &&

    String(
      result.linkedSong.releaseId._id
    ) !==

    String(
      result.linkedRelease._id
    )
  ) {
    result.linkedSong =
      null;
  }

  // Remove internal administrative data.

  delete result.moderationReason;

  delete result.moderatedBy;

  delete result.moderatedAt;

  delete result.submittedBy;

  delete result.videoHash;

  delete result.thumbnailHash;

  delete result.rightsConfirmed;

  delete result.rightsConfirmedAt;

  delete result.__v;

  return result;
}

// ==========================================
// SANITIZE OWNED VIDEO INFORMATION
//
// Artists may inspect moderation status
// without receiving restricted media.
// ==========================================

function sanitizeOwnedVideo(
  video,

  artistCanPreview
) {
  const result =
    toPlainObject(video);

  const previewAllowed =
    artistCanPreview &&

    isVisible(result) &&

    ["draft", "approved"].includes(
      result.status
    );

  if (!previewAllowed) {
    result.videoUrl =
      "";

    result.videoUploadId =
      null;

    result.thumbnailUrl =
      "";

    result.thumbnailUploadId =
      null;
  }

  // Preserve linked release metadata
  // but remove restricted artwork.

  if (
    result.linkedRelease &&

    typeof result.linkedRelease === "object" &&

    result.linkedRelease.status &&

    (
      !artistCanPreview ||

      !isVisible(
        result.linkedRelease
      ) ||

      result.linkedRelease.status !==
        "approved"
    )
  ) {
    result.linkedRelease.coverImage =
      "";

    result.linkedRelease.coverUploadId =
      null;
  }

  delete result.videoHash;

  delete result.thumbnailHash;

  return result;
}

// ==========================================
// VALIDATE MODERATION REASON
// ==========================================

function getModerationReason(
  req,

  defaultReason = "",

  required = false
) {
  const value =
    req.body?.reason;

  if (
    value === undefined ||
    value === null
  ) {
    if (required) {
      throw new RequestError(
        "A moderation reason is required."
      );
    }

    return defaultReason;
  }

  if (
    typeof value !== "string"
  ) {
    throw new RequestError(
      "Moderation reason must be text."
    );
  }

  const reason =
    value
      .replace(
        /[\u0000-\u001f\u007f]/g,
        " "
      )
      .trim();

  if (
    reason.length > 1000
  ) {
    throw new RequestError(
      "Moderation reason cannot exceed 1000 characters."
    );
  }

  if (required && !reason) {
    throw new RequestError(
      "A moderation reason is required."
    );
  }

  return reason || defaultReason;
}

// ==========================================
// CREATE VIDEO ACTIVITY SNAPSHOT
// ==========================================

function videoSnapshot(video) {
  return {
    status:
      video.status,

    visibilityStatus:
      video.visibilityStatus ??
      "visible",
  };
}

// ==========================================
// VALIDATE COMPLETE VIDEO
//
// New videos require confirmed R2 media.
//
// Legacy pending videos may still use
// valid older media URLs.
// ==========================================

async function validateCompleteVideo({
  video,

  userId,

  artist,

  session,

  allowLegacyMedia = false,
}) {
  // ========================================
  // VERIFY VISIBILITY
  // ========================================

  if (!isVisible(video)) {
    throw new RequestError(
      "Restricted videos cannot be published.",
      403
    );
  }

  // ========================================
  // VIDEO TITLE
  // ========================================

  if (
    typeof video.title !== "string" ||

    !video.title.trim() ||

    video.title.trim().length > 200
  ) {
    throw new RequestError(
      "Enter a valid video title before publishing."
    );
  }

  // ========================================
  // VIDEO DESCRIPTION
  // ========================================

  if (
    typeof video.description !== "string" ||

    video.description.length > 5000
  ) {
    throw new RequestError(
      "Video description cannot exceed 5000 characters."
    );
  }

  // ========================================
  // GENRE
  // ========================================

  if (
    typeof video.genre !== "string" ||

    !video.genre.trim() ||

    video.genre.trim().length > 100
  ) {
    throw new RequestError(
      "Select a valid genre before publishing."
    );
  }

  // ========================================
  // VIDEO TYPE
  // ========================================

  if (
    !allowedVideoTypes.includes(
      video.videoType
    )
  ) {
    throw new RequestError(
      "Select a valid video type."
    );
  }

  // ========================================
  // VIDEO DURATION
  // ========================================

  if (
    !Number.isFinite(video.duration) ||

    video.duration < 1
  ) {
    throw new RequestError(
      "The video must have a valid duration."
    );
  }

  // ========================================
  // REVALIDATE ARTIST CREDITS
  // ========================================

  await validateArtists({
    primaryArtists:
      video.primaryArtists,

    featuredArtists:
      video.featuredArtists || [],

    artist,

    videoTitle:
      video.title,

    session,
  });

  // ========================================
  // VERIFY VIDEO MEDIA
  // ========================================

  if (video.videoUploadId) {
    await verifyMedia({
      uploadId:
        video.videoUploadId,

      userId,

      kind:
        "video",

      fieldName:
        "Video",

      session,
    });

    await checkMediaAvailability({
      uploadId:
        video.videoUploadId,

      field:
        "videoUploadId",

      videoId:
        video._id,

      fieldName:
        "video",

      session,
    });

  } else if (
    !allowLegacyMedia ||

    !validUrl(
      video.videoUrl
    )
  ) {
    throw new RequestError(
      "Upload your video file before publishing."
    );
  }

  // ========================================
  // VERIFY THUMBNAIL MEDIA
  // ========================================

  if (video.thumbnailUploadId) {
    await verifyMedia({
      uploadId:
        video.thumbnailUploadId,

      userId,

      kind:
        "thumbnail",

      fieldName:
        "Thumbnail",

      session,
    });

    await checkMediaAvailability({
      uploadId:
        video.thumbnailUploadId,

      field:
        "thumbnailUploadId",

      videoId:
        video._id,

      fieldName:
        "thumbnail",

      session,
    });

  } else if (
    !allowLegacyMedia ||

    !validUrl(
      video.thumbnailUrl
    )
  ) {
    throw new RequestError(
      "Upload a thumbnail before publishing."
    );
  }

  // ========================================
  // REVALIDATE LINKED MUSIC
  // ========================================

  await validateLinkedContent({
    linkedSong:
      video.linkedSong,

    linkedRelease:
      video.linkedRelease,

    userId,

    session,
  });
}

// ==========================================
// PUBLISH VIDEO DOCUMENT
//
// Run document-level validation before
// making the video publicly available.
// ==========================================

async function publishVideoDocument({
  video,

  session,

  administrator = null,

  reason = "",
}) {
  if (!isVisible(video)) {
    throw new RequestError(
      "Restricted videos cannot be published.",
      403
    );
  }

  const original =
    video.toObject();

  const now =
    new Date();

  video.status =
    "approved";

  video.visibilityStatus =
    "visible";

  video.rightsConfirmed =
    true;

  video.rightsConfirmedAt =
    video.rightsConfirmedAt || now;

  video.publishedAt =
    now;

  // Prefer confirmed R2 media over
  // legacy media when both are present.

  if (video.videoUploadId) {
    video.videoUrl =
      "";
  }

  if (video.thumbnailUploadId) {
    video.thumbnailUrl =
      "";
  }

  if (administrator) {
    video.moderationReason =
      reason;

    video.moderatedBy =
      administrator._id;

    video.moderatedAt =
      now;
  }

  // Run document validation middleware.

  await video.validate();

  const changes = {
    status:
      video.status,

    visibilityStatus:
      video.visibilityStatus,

    rightsConfirmed:
      video.rightsConfirmed,

    rightsConfirmedAt:
      video.rightsConfirmedAt,

    publishedAt:
      video.publishedAt,

    videoUrl:
      video.videoUrl,

    thumbnailUrl:
      video.thumbnailUrl,
  };

  if (administrator) {
    changes.moderationReason =
      reason;

    changes.moderatedBy =
      administrator._id;

    changes.moderatedAt =
      now;
  }

  return saveVideoChanges(
    original,

    changes,

    session
  );
}

// ==========================================
// SAFE POST-PUBLICATION NOTIFICATIONS
//
// Notification errors must never turn a
// committed publication into a failed
// publishing response.
// ==========================================

async function sendPublishedNotifications(
  videoId
) {
  try {
    const result =
      await notifyPublishedVideo(
        videoId
      );

    return {
      artistNotified:
        Boolean(
          result?.artistNotified
        ),

      notifiedFollowers:
        result?.notifiedFollowers || 0,
    };

  } catch (error) {
    console.error(
      "Video published, but notifications failed:",

      error.name,

      error.message
    );

    return {
      artistNotified:
        false,

      notifiedFollowers:
        0,
    };
  }
}

// ==========================================
// CREATE VIDEO DRAFT
//
// POST /api/videos
// ==========================================

const createVideo =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const input =
        getRequestBody(req);

      const video =
        await runVideoTransaction(
          async (session) => {
            const artist =
              await requireApprovedArtist(
                req,
                session
              );

            // Create a private draft.

            const newVideo =
              new Video({
                title:
                  "",

                description:
                  "",

                genre:
                  "",

                videoType:
                  "music_video",

                videoUrl:
                  "",

                videoUploadId:
                  null,

                thumbnailUrl:
                  "",

                thumbnailUploadId:
                  null,

                duration:
                  0,

                primaryArtists: [
                  artist._id,
                ],

                featuredArtists:
                  [],

                linkedSong:
                  null,

                linkedRelease:
                  null,

                rightsConfirmed:
                  false,

                rightsConfirmedAt:
                  null,

                submittedBy:
                  user._id,

                status:
                  "draft",

                visibilityStatus:
                  "visible",
              });

            // Apply validated draft fields.

            await applyVideoDraftFields({
              video:
                newVideo,

              input,

              userId:
                user._id,

              artist,

              session,
            });

            await newVideo.save({
              session,
            });

            return newVideo;
          }
        );

      return res.status(201).json({
        success: true,

        message:
          "Video draft created successfully.",

        video,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Create video draft error:"
      );
    }
  };

// ==========================================
// GET MY VIDEOS
//
// GET /api/videos/mine
// ==========================================

const getMyVideos =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const artistCanPreview =
        await canPreviewMedia(
          user._id
        );

      const videos =
        await populateVideo(
          Video.find({
            submittedBy:
              user._id,
          })
            .sort({
              updatedAt: -1,

              _id: -1,
            })
        ).lean();

      return res.status(200).json({
        success: true,

        count:
          videos.length,

        videos:
          videos.map(
            (video) =>
              sanitizeOwnedVideo(
                video,

                artistCanPreview
              )
          ),
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get my videos error:"
      );
    }
  };

// ==========================================
// GET ONE OWN VIDEO
//
// GET /api/videos/mine/:videoId
// ==========================================

const getMyVideoById =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const { videoId } =
        req.params;

      validateVideoId(
        videoId
      );

      const video =
        await populateVideo(
          Video.findOne({
            _id: videoId,

            submittedBy:
              user._id,
          })
        ).lean();

      if (!video) {
        throw new RequestError(
          "Video not found or access denied.",
          404
        );
      }

      const artistCanPreview =
        await canPreviewMedia(
          user._id
        );

      return res.status(200).json({
        success: true,

        video:
          sanitizeOwnedVideo(
            video,

            artistCanPreview
          ),
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get my video error:"
      );
    }
  };

// ==========================================
// UPDATE VIDEO DRAFT
//
// PATCH /api/videos/:videoId
// ==========================================

const updateMyVideo =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const { videoId } =
        req.params;

      validateVideoId(
        videoId
      );

      const input =
        getRequestBody(req);

      const updated =
        await runVideoTransaction(
          async (session) => {
            // Lock approved artist.

            const artist =
              await requireApprovedArtist(
                req,
                session
              );

            // Find editable owned draft.

            const video =
              await Video.findOne({
                _id: videoId,

                submittedBy:
                  user._id,

                status:
                  "draft",

                visibilityStatus:
                  "visible",
              }).session(session);

            if (!video) {
              throw new RequestError(
                "Editable video draft not found or access denied.",
                404
              );
            }

            const original =
              video.toObject();

            // Apply validated changes.

            await applyVideoDraftFields({
              video,

              input,

              userId:
                user._id,

              artist,

              session,
            });

            await video.validate();

            // Save permitted fields only.

            return saveVideoChanges(
              original,

              {
                title:
                  video.title,

                description:
                  video.description,

                genre:
                  video.genre,

                videoType:
                  video.videoType,

                duration:
                  video.duration,

                videoUrl:
                  video.videoUrl,

                videoUploadId:
                  video.videoUploadId,

                thumbnailUrl:
                  video.thumbnailUrl,

                thumbnailUploadId:
                  video.thumbnailUploadId,

                primaryArtists:
                  video.primaryArtists,

                featuredArtists:
                  video.featuredArtists,

                linkedSong:
                  video.linkedSong,

                linkedRelease:
                  video.linkedRelease,

                rightsConfirmed:
                  false,

                rightsConfirmedAt:
                  null,
              },

              session
            );
          }
        );

      return res.status(200).json({
        success: true,

        message:
          "Video draft saved successfully.",

        video:
          updated,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Update video draft error:"
      );
    }
  };

// ==========================================
// DELETE VIDEO DRAFT
//
// DELETE /api/videos/:videoId
//
// Published or restricted videos cannot
// be deleted through the artist endpoint.
// ==========================================

const deleteVideoDraft =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const { videoId } =
        req.params;

      validateVideoId(
        videoId
      );

      await runVideoTransaction(
        async (session) => {
          await requireApprovedArtist(
            req,
            session
          );

          const deleted =
            await Video.findOneAndDelete(
              {
                _id: videoId,

                submittedBy:
                  user._id,

                status:
                  "draft",

                visibilityStatus:
                  "visible",
              },

              {
                session,
              }
            );

          if (!deleted) {
            throw new RequestError(
              "Video draft not found or access denied.",
              404
            );
          }

          // Do not delete R2 objects
          // inside database transactions.

          return {
            videoId:
              deleted._id,
          };
        }
      );

      return res.status(200).json({
        success: true,

        message:
          "Video draft deleted successfully.",
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Delete video draft error:"
      );
    }
  };

// ==========================================
// PUBLISH VIDEO IMMEDIATELY
//
// PATCH /api/videos/:videoId/publish
// PATCH /api/videos/:videoId/submit
//
// Administrator approval is not required.
// ==========================================

const submitVideoForReview =
  async (req, res) => {
    try {
      preventCaching(res);

      const user =
        requireArtistUser(req);

      const { videoId } =
        req.params;

      validateVideoId(
        videoId
      );

      const {
        rightsConfirmed,
      } = getRequestBody(req);

      const result =
        await runVideoTransaction(
          async (session) => {
            // Verify the artist inside
            // the transaction.

            const artist =
              await requireApprovedArtist(
                req,
                session
              );

            // Verify video ownership.

            const video =
              await Video.findOne({
                _id: videoId,

                submittedBy:
                  user._id,
              }).session(session);

            if (!video) {
              throw new RequestError(
                "Video not found or access denied.",
                404
              );
            }

            // Prevent restricted publication.

            if (!isVisible(video)) {
              throw new RequestError(
                "Hidden or restricted videos cannot be published.",
                403
              );
            }

            // Prevent duplicate publication.

            if (
              video.status === "approved"
            ) {
              return {
                video,

                alreadyPublished:
                  true,
              };
            }

            if (
              video.status !== "draft"
            ) {
              throw new RequestError(
                "Only visible, unrestricted drafts can be published.",
                409
              );
            }

            // Copyright confirmation.

            if (
              rightsConfirmed !== true
            ) {
              throw new RequestError(
                "Confirm that you own this video or have permission to publish it."
              );
            }

            // Validate complete video.

            await validateCompleteVideo({
              video,

              userId:
                user._id,

              artist,

              session,
            });

            // Publish inside transaction.

            const published =
              await publishVideoDocument({
                video,

                session,
              });

            return {
              video:
                published,

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
            "This video is already published.",

          alreadyPublished:
            true,

          artistNotified:
            false,

          notifiedFollowers:
            0,

          video:
            result.video,
        });
      }

      // Notify artist and followers
      // only after successful publication.

      const notificationResult =
        await sendPublishedNotifications(
          result.video._id
        );

      return res.status(200).json({
        success: true,

        message:
          "Your video is now live on Emnet Music.",

        alreadyPublished:
          false,

        artistNotified:
          notificationResult.artistNotified,

        notifiedFollowers:
          notificationResult.notifiedFollowers,

        video:
          result.video,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Publish video error:"
      );
    }
  };

// ==========================================
// GET ALL PUBLIC VIDEOS
//
// GET /api/videos
//
// Only published and publicly visible
// videos are returned.
// ==========================================

const getPublicVideos =
  async (req, res) => {
    try {
      preventCaching(res);

      const videos =
        await populatePublicVideo(
          Video.find({
            status:
              "approved",

            ...publicVisibilityFilter(),
          })
            .sort({
              publishedAt: -1,

              createdAt: -1,

              _id: -1,
            })
        ).lean();

      const publicVideos =
        videos.map(
          sanitizePublicVideo
        );

      return res.status(200).json({
        success: true,

        count:
          publicVideos.length,

        videos:
          publicVideos,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get public videos error:"
      );
    }
  };

// ==========================================
// GET ONE PUBLIC VIDEO
//
// GET /api/videos/:videoId
// ==========================================

const getPublicVideoById =
  async (req, res) => {
    try {
      preventCaching(res);

      const { videoId } =
        req.params;

      validateVideoId(
        videoId
      );

      const video =
        await populatePublicVideo(
          Video.findOne({
            _id: videoId,

            status:
              "approved",

            ...publicVisibilityFilter(),
          })
        ).lean();

      if (!video) {
        throw new RequestError(
          "Video not found.",
          404
        );
      }

      return res.status(200).json({
        success: true,

        video:
          sanitizePublicVideo(
            video
          ),
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get public video error:"
      );
    }
  };

// ==========================================
// ADMIN: GET LEGACY PENDING VIDEOS
//
// Retained for older video records.
//
// New videos publish immediately.
// ==========================================

const getPendingVideos =
  async (req, res) => {
    try {
      preventCaching(res);

      requireAdministrator(req);

      const videos =
        await populateVideo(
          Video.find({
            status:
              "pending",

            ...publicVisibilityFilter(),
          })
            .sort({
              createdAt: 1,
            })
        )
          .populate(
            "submittedBy",

            "fullName email"
          )
          .lean();

      return res.status(200).json({
        success: true,

        videos,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Get pending videos error:"
      );
    }
  };

// ==========================================
// ADMIN: APPROVE LEGACY PENDING VIDEO
//
// New videos do not require approval.
//
// This function supports older pending
// video records.
// ==========================================

const approveVideo =
  async (req, res) => {
    try {
      preventCaching(res);

      requireAdministrator(req);

      const { videoId } =
        req.params;

      validateVideoId(
        videoId
      );

      const reason =
        getModerationReason(
          req,

          "Legacy pending video approved."
        );

      const result =
        await runVideoTransaction(
          async (session) => {
            const administrator =
              await lockAdministrator(
                req,
                session
              );

            const video =
              await Video.findById(
                videoId
              ).session(session);

            if (!video) {
              throw new RequestError(
                "Video not found.",
                404
              );
            }

            // Do not bypass moderation.

            if (!isVisible(video)) {
              throw new RequestError(
                "Restricted videos cannot be approved.",
                403
              );
            }

            // Prevent duplicate approval.

            if (
              video.status === "approved"
            ) {
              return {
                video,

                alreadyPublished:
                  true,
              };
            }

            if (
              video.status !== "pending"
            ) {
              throw new RequestError(
                "Only pending videos can be approved.",
                409
              );
            }

            // Verify original video owner.

            const artist =
              await lockLegacyVideoOwner(
                video.submittedBy,

                session
              );

            // Verify copyright confirmation.

            if (
              video.rightsConfirmed !== true
            ) {
              throw new RequestError(
                "This video does not contain the required copyright confirmation."
              );
            }

            // Validate legacy video.

            await validateCompleteVideo({
              video,

              userId:
                video.submittedBy,

              artist,

              session,

              allowLegacyMedia:
                true,
            });

            const previousValues =
              videoSnapshot(
                video
              );

            // Publish legacy pending video.

            const published =
              await publishVideoDocument({
                video,

                session,

                administrator,

                reason,
              });

            // Record administrative activity.

            await recordAdminActivity({
              req,

              actor:
                administrator,

              action:
                "video_approved",

              targetType:
                "video",

              targetId:
                published._id,

              targetName:
                published.title,

              previousValues,

              newValues:
                videoSnapshot(
                  published
                ),

              reason,

              outcome:
                "success",

              session,
            });

            return {
              video:
                published,

              alreadyPublished:
                false,
            };
          }
        );

      // ====================================
      // NOTIFICATIONS AFTER COMMIT
      // ====================================

      const notificationResult =
        result.alreadyPublished
          ? {
              artistNotified:
                false,

              notifiedFollowers:
                0,
            }

          : await sendPublishedNotifications(
              result.video._id
            );

      return res.status(200).json({
        success: true,

        message:
          result.alreadyPublished
            ? "This video is already published."
            : "Legacy pending video published successfully.",

        alreadyPublished:
          result.alreadyPublished,

        artistNotified:
          notificationResult.artistNotified,

        notifiedFollowers:
          notificationResult.notifiedFollowers,

        video:
          result.video,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Approve video error:"
      );
    }
  };

// ==========================================
// ADMIN: REJECT LEGACY PENDING VIDEO
//
// Published videos must be moderated
// through the centralized moderation service.
// ==========================================

const rejectVideo =
  async (req, res) => {
    try {
      preventCaching(res);

      requireAdministrator(req);

      const { videoId } =
        req.params;

      validateVideoId(
        videoId
      );

      const reason =
        getModerationReason(
          req,

          "",

          true
        );

      const result =
        await runVideoTransaction(
          async (session) => {
            const administrator =
              await lockAdministrator(
                req,
                session
              );

            const video =
              await Video.findById(
                videoId
              ).session(session);

            if (!video) {
              throw new RequestError(
                "Video not found.",
                404
              );
            }

            // Prevent duplicate rejection.

            if (
              video.status === "rejected"
            ) {
              return {
                video,

                alreadyRejected:
                  true,
              };
            }

            // Reject only legacy pending videos.

            if (
              video.status !== "pending"
            ) {
              throw new RequestError(
                "Only pending videos can be rejected. Use content moderation for published videos.",
                409
              );
            }

            const previousValues =
              videoSnapshot(
                video
              );

            const changes = {
              status:
                "rejected",
            };

            // Preserve existing takedown
            // or hidden-content information.

            if (isVisible(video)) {
              changes.moderationReason =
                reason;

              changes.moderatedBy =
                administrator._id;

              changes.moderatedAt =
                new Date();
            }

            const rejected =
              await saveVideoChanges(
                video,

                changes,

                session
              );

            // Record administrative activity.

            await recordAdminActivity({
              req,

              actor:
                administrator,

              action:
                "video_rejected",

              targetType:
                "video",

              targetId:
                rejected._id,

              targetName:
                rejected.title,

              previousValues,

              newValues:
                videoSnapshot(
                  rejected
                ),

              reason,

              outcome:
                "success",

              session,
            });

            return {
              video:
                rejected,

              alreadyRejected:
                false,
            };
          }
        );

      // ====================================
      // NOTIFY ARTIST AFTER COMMIT
      // ====================================

      if (
        !result.alreadyRejected &&

        result.video.submittedBy
      ) {
        try {
          await Notification.create({
            userId:
              result.video.submittedBy,

            type:
              "video_rejected",

            title:
              "Video Rejected",

            message:
              `Your video "${result.video.title}" was rejected. Reason: ${reason}`,

            link:
              "/artist/studio/videos",
          });

        } catch (error) {
          console.error(
            "Video rejection notification failed:",

            error.name,

            error.message
          );
        }
      }

      return res.status(200).json({
        success: true,

        message:
          result.alreadyRejected
            ? "This video is already rejected."
            : "Video rejected successfully.",

        alreadyRejected:
          result.alreadyRejected,

        video:
          result.video,
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Reject video error:"
      );
    }
  };

// ==========================================
// EXPORT ALL VIDEO CONTROLLERS
// ==========================================

module.exports = {
  // Artist video management.

  createVideo,

  getMyVideos,

  getMyVideoById,

  updateMyVideo,

  deleteVideoDraft,

  // Immediate artist publication.

  submitVideoForReview,

  // Legacy administrative management.

  getPendingVideos,

  approveVideo,

  rejectVideo,

  // Public video discovery.

  getPublicVideos,

  getPublicVideoById,
};