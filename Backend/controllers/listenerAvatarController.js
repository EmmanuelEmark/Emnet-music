
const mongoose = require("mongoose");
const { randomUUID } = require("crypto");

const {
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

const {
  getSignedUrl,
} = require("@aws-sdk/s3-request-presigner");

const User = require("../models/User");
const MediaUpload = require("../models/MediaUpload");

const {
  getR2Client,
  getR2BucketName,
} = require("../config/r2");

// ========================================
// LISTENER AVATAR CONFIGURATION
// ========================================

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const AVATAR_FORMATS = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

const AVATAR_KIND = "listenerAvatar";

// ========================================
// HELPERS
// ========================================

const getAvatarPrefix = (userId) =>
  `listeners/${userId}/avatars/`;

const getAvatarPath = (uploadId) =>
  `/api/account/avatar/${uploadId}`;

function validAvatarDetails({
  fileName,
  mimeType,
  size,
}) {
  if (
    typeof fileName !== "string" ||
    !fileName.trim() ||
    typeof mimeType !== "string" ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > MAX_AVATAR_SIZE
  ) {
    return false;
  }

  const allowedExtensions =
    AVATAR_FORMATS[mimeType];

  if (!allowedExtensions) {
    return false;
  }

  const extension = fileName
    .split(".")
    .pop()
    .toLowerCase();

  return allowedExtensions.includes(extension);
}

// ========================================
// REQUEST AVATAR UPLOAD
// POST /api/account/avatar/request
// ========================================

const requestListenerAvatar = async (req, res) => {
  try {
    const {
      fileName,
      mimeType,
      size,
    } = req.body || {};

    if (
      !validAvatarDetails({
        fileName,
        mimeType,
        size,
      })
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Choose a valid JPG, PNG or WebP image, maximum 5 MB.",
      });
    }

    const user = await User.findById(
      req.user._id
    ).select("_id role");

    if (!user || user.role !== "listener") {
      return res.status(403).json({
        success: false,
        message:
          "Only listeners can upload listener profile pictures.",
      });
    }

    const extension = fileName
      .split(".")
      .pop()
      .toLowerCase();

    const objectKey =
      getAvatarPrefix(user._id) +
      `${randomUUID()}.${extension}`;

    // Create a pending upload record.
    const media = await MediaUpload.create({
      userId: user._id,
      kind: AVATAR_KIND,
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
          "Profile picture upload URL created.",
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
      "Request listener avatar error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to prepare profile picture upload.",
    });
  }
};

// ========================================
// CONFIRM AVATAR UPLOAD
// POST /api/account/avatar/:uploadId/confirm
// ========================================

const confirmListenerAvatar = async (req, res) => {
  try {
    const { uploadId } = req.params;

    if (!mongoose.isValidObjectId(uploadId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid upload ID.",
      });
    }

    // Only this listener's avatar uploads
    // can be confirmed.
    const media = await MediaUpload.findOne({
      _id: uploadId,
      userId: req.user._id,
      kind: AVATAR_KIND,
    });

    if (
      !media ||
      !media.objectKey.startsWith(
        getAvatarPrefix(req.user._id)
      )
    ) {
      return res.status(404).json({
        success: false,
        message:
          "Profile picture upload not found.",
      });
    }

    if (media.status === "rejected") {
      return res.status(400).json({
        success: false,
        message:
          "This profile picture upload was rejected.",
      });
    }

    if (media.status === "pending") {
      let object;

      try {
        object = await getR2Client().send(
          new HeadObjectCommand({
            Bucket: getR2BucketName(),
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
              "The image has not been uploaded to Cloudflare R2.",
          });
        }

        throw error;
      }

      // Verify the stored object's metadata.
      if (
        object.ContentLength !==
          media.expectedSize ||
        object.ContentType !==
          media.mimeType
      ) {
        media.status = "rejected";

        await media.save();

        return res.status(422).json({
          success: false,
          message:
            "Uploaded image does not match its expected size or type.",
        });
      }

      media.status = "ready";
      media.uploadedAt = new Date();

      await media.save();
    }

    if (media.status !== "ready") {
      return res.status(400).json({
        success: false,
        message:
          "Profile picture cannot be confirmed.",
      });
    }

    const user = await User.findById(
      req.user._id
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Account not found.",
      });
    }

    user.profileImage = getAvatarPath(
      media._id
    );

    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "Profile picture updated successfully.",
      profileImage: user.profileImage,
    });
  } catch (error) {
    console.error(
      "Confirm listener avatar error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to confirm profile picture.",
    });
  }
};

// ========================================
// DISPLAY PROFILE PICTURE
// GET /api/account/avatar/:uploadId
// ========================================

const getListenerAvatar = async (req, res) => {
  try {
    const { uploadId } = req.params;

    if (!mongoose.isValidObjectId(uploadId)) {
      return res.sendStatus(404);
    }

    const avatarPath = getAvatarPath(
      uploadId
    );

    // Only expose an avatar currently
    // attached to a user's profile.
    const user = await User.findOne({
      profileImage: avatarPath,
    }).select("_id");

    if (!user) {
      return res.sendStatus(404);
    }

    const media = await MediaUpload.findOne({
      _id: uploadId,
      userId: user._id,
      kind: AVATAR_KIND,
      status: "ready",
    });

    if (
      !media ||
      !media.objectKey.startsWith(
        getAvatarPrefix(user._id)
      )
    ) {
      return res.sendStatus(404);
    }

    const command = new GetObjectCommand({
      Bucket: getR2BucketName(),
      Key: media.objectKey,
    });

    const imageUrl = await getSignedUrl(
      getR2Client(),
      command,
      {
        expiresIn: 900,
      }
    );

    res.set(
      "Cache-Control",
      "no-store"
    );

    return res.redirect(
      302,
      imageUrl
    );
  } catch (error) {
    console.error(
      "Get listener avatar error:",
      error
    );

    return res.sendStatus(500);
  }
};

// ========================================
// EXPORT CONTROLLERS
// ========================================

module.exports = {
  requestListenerAvatar,
  confirmListenerAvatar,
  getListenerAvatar,
};
