
const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    videoType: {
      type: String,
      enum: [
        "music_video",
        "live_performance",
        "interview",
        "other",
      ],
      default: "music_video",
    },

    // Existing URL-based videos remain supported.
    videoUrl: {
      type: String,
      default: "",
    },

    // Verified R2 video upload.
    videoUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaUpload",
      default: null,
    },

    // Existing thumbnail URLs remain supported.
    thumbnailUrl: {
      type: String,
      default: "",
    },

    // Verified R2 thumbnail upload.
    thumbnailUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaUpload",
      default: null,
    },

    duration: {
      type: Number,
      required: true,
      min: 1,
    },

    primaryArtists: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Artist",
        required: true,
      },
    ],

    featuredArtists: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Artist",
      },
    ],

    linkedSong: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Song",
      default: null,
    },

    linkedRelease: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Release",
      default: null,
    },

    videoHash: {
      type: String,
      default: "",
    },

    thumbnailHash: {
      type: String,
      default: "",
    },

    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    rightsConfirmed: {
      type: Boolean,
      default: false,
    },

    rightsConfirmedAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "draft",
        "pending",
        "approved",
        "rejected",
      ],
      default: "draft",
    },

    visibilityStatus: {
      type: String,
      enum: [
        "visible",
        "hidden",
        "takedown",
      ],
      default: "visible",
    },

    moderationReason: {
      type: String,
      default: "",
      trim: true,
    },

    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    moderatedAt: {
      type: Date,
      default: null,
    },

    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent an R2 video upload from being
// attached to multiple video records.
videoSchema.index(
  { videoUploadId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      videoUploadId: { $type: "objectId" },
    },
  }
);

const Video =
  mongoose.models.Video ||
  mongoose.model("Video", videoSchema);

module.exports = Video;
