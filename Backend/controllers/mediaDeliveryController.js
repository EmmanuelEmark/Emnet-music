
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

const {
  getR2Client,
  getR2BucketName,
} = require("../config/r2");

// ========================================
// CONFIGURATION
// ========================================

// Audio: 5 minutes
const AUDIO_EXPIRY = 300;

// Artwork and thumbnails: 15 minutes
const IMAGE_EXPIRY = 900;

const visibleFilter = {
  $or: [
    { visibilityStatus: "visible" },
    { visibilityStatus: { $exists: false } },
    { visibilityStatus: null },
  ],
};

// ========================================
// HELPER: GENERATE SIGNED R2 URL
// ========================================

const generateMediaUrl = async ({
  uploadId,
  kind,
  expiresIn,
}) => {
  const upload = await MediaUpload.findOne({
    _id: uploadId,
    kind,
    status: "ready",
  });

  if (!upload || !upload.objectKey) {
    return null;
  }

  const command = new GetObjectCommand({
    Bucket: getR2BucketName(),
    Key: upload.objectKey,
  });

  const url = await getSignedUrl(
    getR2Client(),
    command,
    { expiresIn }
  );

  return url;
};

// ========================================
// HELPER: SEND RESPONSE
// ========================================

const sendMediaResponse = (
  res,
  {
    source,
    mediaUrl,
    expiresIn,
  }
) => {
  res.set("Cache-Control", "no-store");

  return res.status(200).json({
    success: true,
    source,
    mediaUrl,
    expiresIn,
  });
};

// ========================================
// SECURE AUDIO PLAYBACK
// GET /api/media/songs/:songId/play
// ========================================

const getSongPlaybackUrl = async (req, res) => {
  try {
    const { songId } = req.params;

    if (!mongoose.isValidObjectId(songId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid song ID.",
      });
    }

    const song = await Song.findOne({
      _id: songId,
      status: "approved",
      ...visibleFilter,
    });

    if (!song) {
      return res.status(404).json({
        success: false,
        message: "Song is unavailable.",
      });
    }

    const release = await Release.findOne({
      _id: song.releaseId,
      status: "approved",
      ...visibleFilter,
    });

    if (!release) {
      return res.status(404).json({
        success: false,
        message: "Song is unavailable.",
      });
    }

    if (song.audioUploadId) {
      const mediaUrl = await generateMediaUrl({
        uploadId: song.audioUploadId,
        kind: "audio",
        expiresIn: AUDIO_EXPIRY,
      });

      if (!mediaUrl) {
        return res.status(404).json({
          success: false,
          message: "Audio file is unavailable.",
        });
      }

      res.set("Cache-Control", "no-store");

      return res.status(200).json({
        success: true,
        source: "r2",
        songId: song._id,
        playbackUrl: mediaUrl,
        mediaUrl,
        expiresIn: AUDIO_EXPIRY,
      });
    }

    if (song.audioUrl) {
      res.set("Cache-Control", "no-store");

      return res.status(200).json({
        success: true,
        source: "legacy",
        songId: song._id,
        playbackUrl: song.audioUrl,
        mediaUrl: song.audioUrl,
        expiresIn: null,
      });
    }

    return res.status(404).json({
      success: false,
      message: "Audio file is unavailable.",
    });
  } catch (error) {
    console.error(
      "Audio playback error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to prepare audio playback.",
    });
  }
};

// ========================================
// SECURE RELEASE ARTWORK
// GET /api/media/releases/:releaseId/artwork
// ========================================

const getReleaseArtworkUrl = async (req, res) => {
  try {
    const { releaseId } = req.params;

    if (!mongoose.isValidObjectId(releaseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid release ID.",
      });
    }

    const release = await Release.findOne({
      _id: releaseId,
      status: "approved",
      ...visibleFilter,
    });

    if (!release) {
      return res.status(404).json({
        success: false,
        message: "Release artwork is unavailable.",
      });
    }

    if (release.coverUploadId) {
      const mediaUrl = await generateMediaUrl({
        uploadId: release.coverUploadId,
        kind: "artwork",
        expiresIn: IMAGE_EXPIRY,
      });

      if (!mediaUrl) {
        return res.status(404).json({
          success: false,
          message: "Release artwork is unavailable.",
        });
      }

      return sendMediaResponse(res, {
        source: "r2",
        mediaUrl,
        expiresIn: IMAGE_EXPIRY,
      });
    }

    if (release.coverImage) {
      return sendMediaResponse(res, {
        source: "legacy",
        mediaUrl: release.coverImage,
        expiresIn: null,
      });
    }

    return res.status(404).json({
      success: false,
      message: "Release artwork is unavailable.",
    });
  } catch (error) {
    console.error(
      "Release artwork error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve artwork.",
    });
  }
};

// ========================================
// SECURE VIDEO THUMBNAIL
// GET /api/media/videos/:videoId/thumbnail
// ========================================

const getVideoThumbnailUrl = async (req, res) => {
  try {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid video ID.",
      });
    }

    const video = await Video.findOne({
      _id: videoId,
      status: "approved",
      ...visibleFilter,
    });

    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video thumbnail is unavailable.",
      });
    }

    if (video.thumbnailUploadId) {
      const mediaUrl = await generateMediaUrl({
        uploadId: video.thumbnailUploadId,
        kind: "artwork",
        expiresIn: IMAGE_EXPIRY,
      });

      if (!mediaUrl) {
        return res.status(404).json({
          success: false,
          message: "Video thumbnail is unavailable.",
        });
      }

      return sendMediaResponse(res, {
        source: "r2",
        mediaUrl,
        expiresIn: IMAGE_EXPIRY,
      });
    }

    if (video.thumbnailUrl) {
      return sendMediaResponse(res, {
        source: "legacy",
        mediaUrl: video.thumbnailUrl,
        expiresIn: null,
      });
    }

    return res.status(404).json({
      success: false,
      message: "Video thumbnail is unavailable.",
    });
  } catch (error) {
    console.error(
      "Video thumbnail error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve thumbnail.",
    });
  }
};




 // ========================================
 // SECURE VIDEO PLAYBACK
 // GET /api/media/videos/:videoId/play
 // ========================================

const getVideoPlaybackUrl = async (req, res) => {
  try {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid video ID.",
      });
    }

    // Only approved, publicly visible videos.
    const video = await Video.findOne({
      _id: videoId,
      status: "approved",
      ...visibleFilter,
    });

    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video is unavailable.",
      });
    }

    // Support existing legacy video URLs.
    if (!video.videoUploadId) {
      if (!video.videoUrl) {
        return res.status(404).json({
          success: false,
          message: "Video file is unavailable.",
        });
      }

      res.set("Cache-Control", "no-store");

      return res.status(200).json({
        success: true,
        source: "legacy",
        videoId: video._id,
        playbackUrl: video.videoUrl,
        expiresIn: null,
      });
    }

    // Confirm that the R2 upload is ready.
    const mediaUrl = await generateMediaUrl({
      uploadId: video.videoUploadId,
      kind: "video",
      expiresIn: 900,
    });

    if (!mediaUrl) {
      return res.status(404).json({
        success: false,
        message: "Video file is unavailable.",
      });
    }

    res.set("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,
      source: "r2",
      videoId: video._id,
      playbackUrl: mediaUrl,
      expiresIn: 900,
    });
  } catch (error) {
    console.error("Video playback error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to prepare video playback.",
    });
  }
};





// ========================================
// EXPORTS
// ========================================

module.exports = {
  getSongPlaybackUrl,
  getReleaseArtworkUrl,
  getVideoThumbnailUrl,
  getVideoPlaybackUrl,
};
