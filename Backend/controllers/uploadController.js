
const mongoose = require("mongoose");
const { randomUUID } = require("crypto");

const {
  PutObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const {
  getSignedUrl,
} = require("@aws-sdk/s3-request-presigner");

const Artist = require("../models/Artist");
const MediaUpload = require("../models/MediaUpload");

const {
  getR2Client,
  getR2BucketName,
} = require("../config/r2");


// ========================================
// MEDIA CONFIGURATION
// ========================================

const MB = 1024 * 1024;

const MEDIA_TYPES = {
  audio: {
    maxSize: 100 * MB,
    formats: {
      "audio/mpeg": ["mp3"],
      "audio/wav": ["wav"],
      "audio/x-wav": ["wav"],
      "audio/flac": ["flac"],
      "audio/mp4": ["m4a"],
      "audio/x-m4a": ["m4a"],
    },
  },

  artwork: {
    maxSize: 10 * MB,
    formats: {
      "image/jpeg": ["jpg", "jpeg"],
      "image/png": ["png"],
      "image/webp": ["webp"],
    },
  },

  video: {
    maxSize: 500 * MB,
    formats: {
      "video/mp4": ["mp4"],
      "video/webm": ["webm"],
    },
  },
};


// ========================================
// CHECK APPROVED ARTIST
// ========================================

async function isApprovedArtist(userId) {
  const artist = await Artist.findOne({
    userId,
    approvalStatus: "approved",
  });

  return Boolean(artist);
}


// ========================================
// REQUEST UPLOAD URL
// POST /api/uploads/request
// ========================================

const createUploadUrl = async (req, res) => {
  try {
    const approved = await isApprovedArtist(
      req.user._id
    );

    if (!approved) {
      return res.status(403).json({
        success: false,
        message:
          "Only approved artists can upload media.",
      });
    }

    const {
      kind,
      fileName,
      mimeType,
      size,
    } = req.body;

    if (
      typeof kind !== "string" ||
      typeof fileName !== "string" ||
      !fileName.trim() ||
      typeof mimeType !== "string" ||
      !Number.isSafeInteger(size) ||
      size <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid file information is required.",
      });
    }

    const mediaType = MEDIA_TYPES[kind];

    if (!mediaType) {
      return res.status(400).json({
        success: false,
        message:
          "Unsupported media category.",
      });
    }

    const allowedExtensions =
      mediaType.formats[mimeType];

    if (!allowedExtensions) {
      return res.status(400).json({
        success: false,
        message:
          "Unsupported file format.",
      });
    }

    const fileExtension = fileName
      .split(".")
      .pop()
      .toLowerCase();

    if (
      !allowedExtensions.includes(fileExtension)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "File extension does not match its declared type.",
      });
    }

    if (size > mediaType.maxSize) {
      return res.status(400).json({
        success: false,
        message:
          "File exceeds the allowed size.",
      });
    }

    // Generate a unique storage key.
    // Never trust a browser-supplied key.

    const objectKey =
      `artists/${req.user._id}/${kind}/` +
      `${randomUUID()}.${fileExtension}`;

    const media = await MediaUpload.create({
      userId: req.user._id,
      kind,
      objectKey,
      originalName: fileName.trim().slice(0, 255),
      mimeType,
      expectedSize: size,
      status: "pending",
    });

    try {
      const command = new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: objectKey,
        ContentType: mimeType,
      });

      const uploadUrl = await getSignedUrl(
        getR2Client(),
        command,
        {
          expiresIn: 600,
        }
      );

      return res.status(201).json({
        success: true,
        message:
          "Temporary upload URL created.",

        uploadId: media._id,

        uploadUrl,

        method: "PUT",

        contentType: mimeType,

        expiresIn: 600,
      });
    } catch (error) {
      await MediaUpload.deleteOne({
        _id: media._id,
        status: "pending",
      });

      throw error;
    }
  } catch (error) {
    console.error(
      "Create upload URL error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to prepare media upload.",
    });
  }
};


// ========================================
// CONFIRM MEDIA UPLOAD
// POST /api/uploads/:uploadId/confirm
// ========================================

const confirmUpload = async (req, res) => {
  try {
    const approved = await isApprovedArtist(
      req.user._id
    );

    if (!approved) {
      return res.status(403).json({
        success: false,
        message:
          "Only approved artists can confirm uploads.",
      });
    }

    const { uploadId } = req.params;

    if (!mongoose.isValidObjectId(uploadId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid upload ID.",
      });
    }

    const media = await MediaUpload.findOne({
      _id: uploadId,
      userId: req.user._id,
    });

    if (!media) {
      return res.status(404).json({
        success: false,
        message:
          "Upload record not found.",
      });
    }

    if (media.status === "ready") {
      return res.status(200).json({
        success: true,
        message:
          "Upload already confirmed.",

        media: {
          uploadId: media._id,
          kind: media.kind,
          objectKey: media.objectKey,
          status: media.status,
        },
      });
    }

    if (media.status !== "pending") {
      return res.status(400).json({
        success: false,
        message:
          "Upload cannot be confirmed.",
      });
    }

    const client = getR2Client();

    const bucket = getR2BucketName();

    let object;

    try {
      object = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: media.objectKey,
        })
      );
    } catch (error) {
      if (
        error.name === "NotFound" ||
        error.name === "NoSuchKey" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return res.status(404).json({
          success: false,
          message:
            "File has not been uploaded to R2.",
        });
      }

      throw error;
    }

    // Verify object metadata.

    const validSize =
      object.ContentLength ===
      media.expectedSize;

    const validType =
      object.ContentType ===
      media.mimeType;

    if (!validSize || !validType) {
      media.status = "rejected";

      await media.save();

      return res.status(422).json({
        success: false,
        message:
          "Uploaded file does not match the expected size or content type.",
      });
    }

    media.status = "ready";

    media.uploadedAt = new Date();

    await media.save();

    return res.status(200).json({
      success: true,
      message:
        "Media upload verified successfully.",

      media: {
        uploadId: media._id,
        kind: media.kind,
        objectKey: media.objectKey,
        mimeType: media.mimeType,
        size: media.expectedSize,
        status: media.status,
      },
    });
  } catch (error) {
    console.error(
      "Confirm upload error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to confirm media upload.",
    });
  }
};


// ========================================
// EXPORT CONTROLLERS
// ========================================

module.exports = {
  createUploadUrl,
  confirmUpload,
};
