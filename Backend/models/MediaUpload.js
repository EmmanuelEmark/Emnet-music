
const mongoose = require("mongoose");

const mediaUploadSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    kind: {
      type: String,
      enum: ["audio", "artwork", "video"],
      required: true,
    },

    objectKey: {
      type: String,
      required: true,
      unique: true,
    },

    originalName: {
      type: String,
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
    },

    expectedSize: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "ready", "rejected"],
      default: "pending",
      index: true,
    },

    uploadedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "MediaUpload",
  mediaUploadSchema
);
