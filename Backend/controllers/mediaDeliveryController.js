const mongoose = require("mongoose");

const {
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

const {
  getSignedUrl,
} = require("@aws-sdk/s3-request-presigner");

const Song = require("../models/song");
const Release = require("../models/Release");
const Video = require("../models/video");
const MediaUpload = require("../models/MediaUpload");
const Artist = require("../models/Artist");

const {
  getR2Client,
  getR2BucketName,
} = require("../config/r2");

// ==========================================
// CONFIGURATION
// ==========================================

// Public audio URL: 5 minutes.

const AUDIO_EXPIRY = 300;

// Public image URL: 15 minutes.

const IMAGE_EXPIRY = 900;

// Public video URL: 15 minutes.

const VIDEO_EXPIRY = 900;

// Private artist preview URL: 5 minutes.

const PREVIEW_EXPIRY = 300;

// ==========================================
// PUBLIC VISIBILITY FILTER
//
// Older records without visibilityStatus
// remain supported.
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
// CUSTOM MEDIA DELIVERY ERROR
// ==========================================

class MediaDeliveryError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "MediaDeliveryError";

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
// VERIFY REQUEST RESOURCE ID
// ==========================================

function validateResourceId(
  value,
  resourceName
) {
  if (!isValidId(value)) {
    throw new MediaDeliveryError(
      `Invalid ${resourceName} ID.`,
      400
    );
  }
}

// ==========================================
// VALIDATE LEGACY MEDIA URL
//
// Preserve valid HTTP and HTTPS URLs.
//
// Reject malformed URLs, embedded
// credentials and unsafe URL protocols.
// ==========================================

function isValidLegacyUrl(value) {
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
// PREVENT RESPONSE CACHING
// ==========================================

function preventCaching(res) {
  res.set(
    "Cache-Control",
    "private, no-store, max-age=0"
  );

  res.set(
    "Pragma",
    "no-cache"
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
  context,
  fallbackMessage
) {
  preventCaching(res);

  if (
    error instanceof MediaDeliveryError
  ) {
    return res.status(error.status).json({
      success: false,

      message: error.message,
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,

      message:
        "Invalid media reference.",
    });
  }

  console.error(
    context,
    error.name,
    error.code || ""
  );

  return res.status(500).json({
    success: false,

    message:
      fallbackMessage ||
      "Unable to retrieve media.",
  });
}

// ==========================================
// GENERATE SIGNED CLOUDFLARE R2 URL
//
// Requirements:
// - Valid upload ID
// - Confirmed upload
// - Correct media kind
// - Correct media owner
// - Available object key
// ==========================================

async function generateMediaUrl({
  uploadId,

  kind,

  expiresIn,

  userId,
}) {
  // ========================================
  // VALIDATE MEDIA UPLOAD ID
  // ========================================

  if (
    !uploadId ||

    !mongoose.isValidObjectId(
      uploadId
    )
  ) {
    return null;
  }

  // ========================================
  // VALIDATE MEDIA OWNER
  // ========================================

  if (
  !userId ||
  !mongoose.isValidObjectId(userId)
) {
  console.warn(
    "[MediaDelivery] Invalid or missing media owner",
    { kind }
  );

  return null;
}
  // ========================================
  // VALIDATE MEDIA KIND
  // ========================================

  const kindFilter =
    Array.isArray(kind)
      ? {
          $in: kind,
        }
      : kind;

  // ========================================
  // FIND CONFIRMED MEDIA UPLOAD
  //
  // Public and private media must belong
  // to the appropriate content owner.
  // ========================================

  const upload =
    await MediaUpload.findOne({
      _id: uploadId,

      userId,

      kind: kindFilter,

      status: "ready",
    })
      .select(
        "_id objectKey userId kind status"
      )
      .lean();

  if (!upload) {
  console.warn(
    "[MediaDelivery] Confirmed media lookup failed",
    {
      kind,
      hasUploadId: Boolean(uploadId),
      hasUserId: Boolean(userId),
    }
  );

  return null;
}

if (
  typeof upload.objectKey !== "string" ||
  !upload.objectKey.trim()
) {
  console.warn(
    "[MediaDelivery] Media object key is missing",
    { kind }
  );

  return null;
}

  // ========================================
  // PREVENT DELIVERY OF TEMPORARY FILES
  // ========================================

  if (
    upload.objectKey.startsWith(
      "temporary/"
    )
  ) {
    return null;
  }

  // ========================================
  // CREATE R2 GET OBJECT COMMAND
  // ========================================

  const command =
    new GetObjectCommand({
      Bucket:
        getR2BucketName(),

      Key:
        upload.objectKey,

      ResponseCacheControl:
        "private, no-store",
    });

  // ========================================
  // GENERATE SIGNED MEDIA URL
  // ========================================

  const mediaUrl =
    await getSignedUrl(
      getR2Client(),

      command,

      {
        expiresIn,
      }
    );

  return mediaUrl;
}

// ==========================================
// SEND MEDIA RESPONSE
//
// Preserve existing response structure.
// ==========================================

function sendMediaResponse(
  res,
  {
    source,

    mediaUrl,

    expiresIn,

    extra = {},
  }
) {
  preventCaching(res);

  return res.status(200).json({
    success: true,

    source,

    mediaUrl,

    expiresIn,

    ...extra,
  });
}

// ==========================================
// FIND PUBLIC SONG
// ==========================================

async function findPublicSong(songId) {
  const song =
    await Song.findOne({
      _id: songId,

      status: "approved",

      ...publicVisibilityFilter(),
    }).lean();

  if (!song) {
    throw new MediaDeliveryError(
      "Song is unavailable.",
      404
    );
  }

  return song;
}

// ==========================================
// FIND PUBLIC RELEASE
// ==========================================

async function findPublicRelease(
  releaseId,
  unavailableMessage =
    "Release is unavailable."
) {
  const release =
    await Release.findOne({
      _id: releaseId,

      status: "approved",

      ...publicVisibilityFilter(),
    }).lean();

  if (!release) {
    throw new MediaDeliveryError(
      unavailableMessage,
      404
    );
  }

  return release;
}

// ==========================================
// FIND PUBLIC VIDEO
// ==========================================

async function findPublicVideo(
  videoId,
  unavailableMessage =
    "Video is unavailable."
) {
  const video =
    await Video.findOne({
      _id: videoId,

      status: "approved",

      ...publicVisibilityFilter(),
    }).lean();

  if (!video) {
    throw new MediaDeliveryError(
      unavailableMessage,
      404
    );
  }

  return video;
}

// ==========================================
// FIND PUBLIC ARTIST
// ==========================================

async function findPublicArtist(
  artistId
) {
  const artist =
    await Artist.findOne({
      _id: artistId,

      approvalStatus:
        "approved",

      ...publicVisibilityFilter(),
    }).lean();

  if (!artist) {
    throw new MediaDeliveryError(
      "Artist is unavailable.",
      404
    );
  }

  return artist;
}

// ==========================================
// PREPARE PUBLIC MEDIA
//
// Prefer confirmed R2 media.
//
// Legacy media is accepted only when
// no R2 upload is attached.
//
// Never fall back to an older URL when
// an attached R2 upload fails validation.
// ==========================================

async function preparePublicMedia({
  uploadId,

  legacyUrl,

  kind,

  userId,

  expiresIn,

  unavailableMessage,
}) {
  // ========================================
  // CLOUDFLARE R2 MEDIA
  // ========================================

  if (uploadId) {
    const mediaUrl =
      await generateMediaUrl({
        uploadId,

        kind,

        userId,

        expiresIn,
      });

    if (!mediaUrl) {
      throw new MediaDeliveryError(
        unavailableMessage,
        404
      );
    }

    return {
      source: "r2",

      mediaUrl,

      expiresIn,
    };
  }

  // ========================================
  // LEGACY MEDIA
  // ========================================

  if (isValidLegacyUrl(legacyUrl)) {
    return {
      source: "legacy",

      mediaUrl:
        legacyUrl,

      expiresIn:
        null,
    };
  }

  throw new MediaDeliveryError(
    unavailableMessage,
    404
  );
}

// ==========================================
// PUBLIC AUDIO PLAYBACK
//
// GET /api/media/songs/:songId/play
//
// Both the song and parent release must
// be published and publicly visible.
// ==========================================

const getSongPlaybackUrl =
  async (req, res) => {
    try {
      preventCaching(res);

      const { songId } =
        req.params;

      validateResourceId(
        songId,
        "song"
      );

      // ====================================
      // VERIFY SONG
      // ====================================

      const song =
        await findPublicSong(
          songId
        );

      // ====================================
      // VERIFY PARENT RELEASE
      // ====================================

      const release =
        await findPublicRelease(
          song.releaseId,

          "Song is unavailable."
        );

      // ====================================
      // PREPARE AUDIO PLAYBACK
      //
      // The audio upload must belong
      // to the release submitter.
      // ====================================

      const media =
        await preparePublicMedia({
          uploadId:
            song.audioUploadId,

          legacyUrl:
            song.audioUrl,

          kind:
            "audio",

          userId:
            release.submittedBy,

          expiresIn:
            AUDIO_EXPIRY,

          unavailableMessage:
            "Audio file is unavailable.",
        });

      return sendMediaResponse(
        res,

        {
          ...media,

          extra: {
            songId:
              song._id,

            playbackUrl:
              media.mediaUrl,
          },
        }
      );

    } catch (error) {
      return sendError(
        res,

        error,

        "Audio playback error:",

        "Unable to prepare audio playback."
      );
    }
  };

// ==========================================
// PUBLIC RELEASE ARTWORK
//
// GET /api/media/releases/:releaseId/artwork
// ==========================================

const getReleaseArtworkUrl =
  async (req, res) => {
    try {
      preventCaching(res);

      const { releaseId } =
        req.params;

      validateResourceId(
        releaseId,

        "release"
      );

      const release =
        await findPublicRelease(
          releaseId,

          "Release artwork is unavailable."
        );

      const media =
        await preparePublicMedia({
          uploadId:
            release.coverUploadId,

          legacyUrl:
            release.coverImage,

          kind:
            "artwork",

          userId:
            release.submittedBy,

          expiresIn:
            IMAGE_EXPIRY,

          unavailableMessage:
            "Release artwork is unavailable.",
        });

      return sendMediaResponse(
        res,
        media
      );

    } catch (error) {
      return sendError(
        res,

        error,

        "Release artwork error:",

        "Unable to retrieve artwork."
      );
    }
  };

// ==========================================
// PUBLIC VIDEO THUMBNAIL
//
// GET /api/media/videos/:videoId/thumbnail
// ==========================================

const getVideoThumbnailUrl =
  async (req, res) => {
    try {
      preventCaching(res);

      const { videoId } =
        req.params;

      validateResourceId(
        videoId,

        "video"
      );

      const video =
        await findPublicVideo(
          videoId,

          "Video thumbnail is unavailable."
        );

      const media =
        await preparePublicMedia({
          uploadId:
            video.thumbnailUploadId,

          legacyUrl:
            video.thumbnailUrl,

          kind: [
            "thumbnail",

            "artwork",
          ],

          userId:
            video.submittedBy,

          expiresIn:
            IMAGE_EXPIRY,

          unavailableMessage:
            "Video thumbnail is unavailable.",
        });

      return sendMediaResponse(
        res,
        media
      );

    } catch (error) {
      return sendError(
        res,

        error,

        "Video thumbnail error:",

        "Unable to retrieve thumbnail."
      );
    }
  };

// ==========================================
// PUBLIC VIDEO PLAYBACK
//
// GET /api/media/videos/:videoId/play
// ==========================================

const getVideoPlaybackUrl =
  async (req, res) => {
    try {
      preventCaching(res);

      const { videoId } =
        req.params;

      validateResourceId(
        videoId,

        "video"
      );

      const video =
        await findPublicVideo(
          videoId
        );

      const media =
        await preparePublicMedia({
          uploadId:
            video.videoUploadId,

          legacyUrl:
            video.videoUrl,

          kind:
            "video",

          userId:
            video.submittedBy,

          expiresIn:
            VIDEO_EXPIRY,

          unavailableMessage:
            "Video file is unavailable.",
        });

      return sendMediaResponse(
        res,

        {
          ...media,

          extra: {
            videoId:
              video._id,

            playbackUrl:
              media.mediaUrl,
          },
        }
      );

    } catch (error) {
      return sendError(
        res,

        error,

        "Video playback error:",

        "Unable to prepare video playback."
      );
    }
  };

// ==========================================
// PUBLIC ARTIST IMAGE DELIVERY
//
// Handles both artist profile and cover
// image delivery.
// ==========================================

async function getArtistImageUrl(
  req,

  res,

  imageType
) {
  try {
    preventCaching(res);

    const { artistId } =
      req.params;

    validateResourceId(
      artistId,

      "artist"
    );

    const artist =
      await findPublicArtist(
        artistId
      );

    const isProfile =
      imageType === "profile";

    // ======================================
    // SELECT IMAGE UPLOAD
    // ======================================

    const uploadId =
      isProfile
        ? artist.profileImageUploadId
        : artist.coverImageUploadId;

    // ======================================
    // SELECT LEGACY IMAGE
    // ======================================

    const legacyUrl =
      isProfile
        ? artist.profileImage
        : artist.coverImage;

    // ======================================
    // SELECT MEDIA KIND
    // ======================================

    const kind =
      isProfile
        ? "artistProfile"
        : "artistCover";

    const media =
      await preparePublicMedia({
        uploadId,

        legacyUrl,

        kind,

        userId:
          artist.userId,

        expiresIn:
          IMAGE_EXPIRY,

        unavailableMessage:
          "Artist image is unavailable.",
      });

    return sendMediaResponse(
      res,
      media
    );

  } catch (error) {
    return sendError(
      res,

      error,

      "Artist image delivery error:",

      "Unable to retrieve artist image."
    );
  }
}

// ==========================================
// PUBLIC ARTIST PROFILE IMAGE
// ==========================================

const getArtistProfileImageUrl =
  (req, res) =>
    getArtistImageUrl(
      req,

      res,

      "profile"
    );

// ==========================================
// PUBLIC ARTIST COVER IMAGE
// ==========================================

const getArtistCoverImageUrl =
  (req, res) =>
    getArtistImageUrl(
      req,

      res,

      "cover"
    );

// ==========================================
// VERIFY AUTHENTICATED ARTIST
//
// Private previews are only available to
// active, approved and visible artists.
// ==========================================

async function requireApprovedArtist(
  req
) {
  const userId =
    req.user?._id;

  if (!userId) {
    throw new MediaDeliveryError(
      "Please sign in to preview your media.",

      401
    );
  }

  if (
    req.user.role !==
    "artist"
  ) {
    throw new MediaDeliveryError(
      "Only artists can access private media previews.",

      403
    );
  }

  if (
    req.user.accountStatus !==
    "active"
  ) {
    throw new MediaDeliveryError(
      "Your account is unavailable.",

      403
    );
  }

  const artist =
    await Artist.findOne({
      userId,

      approvalStatus:
        "approved",

      visibilityStatus:
        "visible",
    })
      .select(
        "_id userId approvalStatus visibilityStatus"
      )
      .lean();

  if (!artist) {
    throw new MediaDeliveryError(
      "Your artist account is not eligible to access private previews.",

      403
    );
  }

  return {
    userId,

    artistId:
      artist._id,
  };
}

// ==========================================
// VERIFY OWNED PREVIEW RELEASE
//
// Allows:
// - Visible drafts
// - Visible published releases
//
// Blocks:
// - Hidden releases
// - Releases under takedown
// - Pending releases
// - Rejected releases
// - Releases belonging to other artists
// ==========================================

async function findOwnedPreviewRelease({
  releaseId,

  userId,
}) {
  const release =
    await Release.findOne({
      _id: releaseId,

      submittedBy:
        userId,

      status: {
        $in: [
          "draft",

          "approved",
        ],
      },

      visibilityStatus:
        "visible",
    }).lean();

  if (!release) {
    throw new MediaDeliveryError(
      "Release not found or access denied.",

      404
    );
  }

  return release;
}

// ==========================================
// VERIFY OWNED PREVIEW VIDEO
// ==========================================

async function findOwnedPreviewVideo({
  videoId,

  userId,
}) {
  const video =
    await Video.findOne({
      _id: videoId,

      submittedBy:
        userId,

      status: {
        $in: [
          "draft",

          "approved",
        ],
      },

      visibilityStatus:
        "visible",
    }).lean();

  if (!video) {
    throw new MediaDeliveryError(
      "Video not found or access denied.",

      404
    );
  }

  return video;
}

// ==========================================
// GENERATE PRIVATE ARTIST MEDIA PREVIEW
//
// Never return arbitrary legacy URLs
// through private preview endpoints.
// ==========================================

async function generatePrivatePreview({
  uploadId,

  kind,

  userId,
}) {
  if (!uploadId) {
    throw new MediaDeliveryError(
      "No confirmed media file is attached.",

      404
    );
  }

  const mediaUrl =
    await generateMediaUrl({
      uploadId,

      kind,

      userId,

      expiresIn:
        PREVIEW_EXPIRY,
    });

  if (!mediaUrl) {
    throw new MediaDeliveryError(
      "Media file is unavailable or access is denied.",

      404
    );
  }

  return mediaUrl;
}

// ==========================================
// PRIVATE ARTIST SONG PREVIEW
//
// GET /api/media/artist/songs/:songId/preview
// ==========================================

const getArtistSongPreviewUrl =
  async (req, res) => {
    try {
      preventCaching(res);

      const { songId } =
        req.params;

      validateResourceId(
        songId,

        "song"
      );

      // ====================================
      // VERIFY ARTIST ACCOUNT
      // ====================================

      const { userId } =
        await requireApprovedArtist(
          req
        );

      // ====================================
      // FIND ELIGIBLE SONG
      // ====================================

      const song =
        await Song.findOne({
          _id: songId,

          status: {
            $in: [
              "draft",

              "approved",
            ],
          },

          visibilityStatus:
            "visible",
        }).lean();

      if (!song) {
        throw new MediaDeliveryError(
          "Song not found or access denied.",

          404
        );
      }

      // ====================================
      // VERIFY PARENT RELEASE
      //
      // The parent release must belong
      // to the authenticated artist.
      // ====================================

      await findOwnedPreviewRelease({
        releaseId:
          song.releaseId,

        userId,
      });

      // ====================================
      // GENERATE PRIVATE AUDIO URL
      // ====================================

      const mediaUrl =
        await generatePrivatePreview({
          uploadId:
            song.audioUploadId,

          kind:
            "audio",

          userId,
        });

      return sendMediaResponse(
        res,

        {
          source:
            "r2",

          mediaUrl,

          expiresIn:
            PREVIEW_EXPIRY,

          extra: {
            songId:
              song._id,

            preview:
              true,

            previewUrl:
              mediaUrl,

            playbackUrl:
              mediaUrl,
          },
        }
      );

    } catch (error) {
      return sendError(
        res,

        error,

        "Private song preview error:",

        "Unable to prepare your audio preview."
      );
    }
  };

// ==========================================
// PRIVATE RELEASE ARTWORK PREVIEW
//
// GET /api/media/artist/releases/
//     :releaseId/artwork
// ==========================================

const getArtistReleaseArtworkPreviewUrl =
  async (req, res) => {
    try {
      preventCaching(res);

      const { releaseId } =
        req.params;

      validateResourceId(
        releaseId,

        "release"
      );

      const { userId } =
        await requireApprovedArtist(
          req
        );

      const release =
        await findOwnedPreviewRelease({
          releaseId,

          userId,
        });

      const mediaUrl =
        await generatePrivatePreview({
          uploadId:
            release.coverUploadId,

          kind:
            "artwork",

          userId,
        });

      return sendMediaResponse(
        res,

        {
          source:
            "r2",

          mediaUrl,

          expiresIn:
            PREVIEW_EXPIRY,

          extra: {
            releaseId:
              release._id,

            preview:
              true,

            previewUrl:
              mediaUrl,
          },
        }
      );

    } catch (error) {
      return sendError(
        res,

        error,

        "Private artwork preview error:",

        "Unable to retrieve your artwork preview."
      );
    }
  };

// ==========================================
// PRIVATE ARTIST VIDEO PREVIEW
//
// GET /api/media/artist/videos/:videoId/preview
// ==========================================

const getArtistVideoPreviewUrl =
  async (req, res) => {
    try {
      preventCaching(res);

      const { videoId } =
        req.params;

      validateResourceId(
        videoId,

        "video"
      );

      const { userId } =
        await requireApprovedArtist(
          req
        );

      const video =
        await findOwnedPreviewVideo({
          videoId,

          userId,
        });

      const mediaUrl =
        await generatePrivatePreview({
          uploadId:
            video.videoUploadId,

          kind:
            "video",

          userId,
        });

      return sendMediaResponse(
        res,

        {
          source:
            "r2",

          mediaUrl,

          expiresIn:
            PREVIEW_EXPIRY,

          extra: {
            videoId:
              video._id,

            preview:
              true,

            previewUrl:
              mediaUrl,

            playbackUrl:
              mediaUrl,
          },
        }
      );

    } catch (error) {
      return sendError(
        res,

        error,

        "Private video preview error:",

        "Unable to prepare your video preview."
      );
    }
  };

// ==========================================
// PRIVATE VIDEO THUMBNAIL PREVIEW
//
// GET /api/media/artist/videos/
//     :videoId/thumbnail
// ==========================================

const getArtistVideoThumbnailPreviewUrl =
  async (req, res) => {
    try {
      preventCaching(res);

      const { videoId } =
        req.params;

      validateResourceId(
        videoId,

        "video"
      );

      const { userId } =
        await requireApprovedArtist(
          req
        );

      const video =
        await findOwnedPreviewVideo({
          videoId,

          userId,
        });

      const mediaUrl =
        await generatePrivatePreview({
          uploadId:
            video.thumbnailUploadId,

          kind: [
            "thumbnail",

            "artwork",
          ],

          userId,
        });

      return sendMediaResponse(
        res,

        {
          source:
            "r2",

          mediaUrl,

          expiresIn:
            PREVIEW_EXPIRY,

          extra: {
            videoId:
              video._id,

            preview:
              true,

            previewUrl:
              mediaUrl,
          },
        }
      );

    } catch (error) {
      return sendError(
        res,

        error,

        "Private thumbnail preview error:",

        "Unable to retrieve your thumbnail preview."
      );
    }
  };

// ==========================================
// EXPORT ALL MEDIA DELIVERY CONTROLLERS
// ==========================================

module.exports = {
  // ========================================
  // PUBLIC MEDIA DELIVERY
  // ========================================

  getSongPlaybackUrl,

  getReleaseArtworkUrl,

  getVideoThumbnailUrl,

  getVideoPlaybackUrl,

  getArtistProfileImageUrl,

  getArtistCoverImageUrl,

  // ========================================
  // PRIVATE ARTIST MEDIA PREVIEWS
  // ========================================

  getArtistSongPreviewUrl,

  getArtistReleaseArtworkPreviewUrl,

  getArtistVideoPreviewUrl,

  getArtistVideoThumbnailPreviewUrl,
};