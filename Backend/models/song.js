
const mongoose = require("mongoose");

const songSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    releaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Release",
      required: true,
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

    genre: {
      type: String,
      required: true,
      trim: true,
    },

    // Legacy audio URLs remain supported.
    // R2 songs use audioUploadId instead.
    audioUrl: {
      type: String,
      default: "",
    },

    audioUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaUpload",
      default: null,
    },

    duration: {
      type: Number,
      required: true,
      min: 1,
    },

    trackNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    isrc: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
    },

    audioHash: {
      type: String,
      default: "",
    },

    playCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"],
      default: "draft",
    },

    visibilityStatus: {
      type: String,
      enum: ["visible", "hidden", "takedown"],
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
  },
  {
    timestamps: true,
  }
);

// Prevent the same R2 upload from being
// attached to multiple songs.
songSchema.index(
  { audioUploadId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      audioUploadId: { $type: "objectId" },
    },
  }
);

const Song =
  mongoose.models.Song ||
  mongoose.model("Song", songSchema);

module.exports = Song;
