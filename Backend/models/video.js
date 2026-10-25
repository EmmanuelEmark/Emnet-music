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

    videoUrl: {
      type: String,
      required: true,
    },

    thumbnailUrl: {
      type: String,
      required: true,
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

const Video =
  mongoose.models.Video ||
  mongoose.model("Video", videoSchema);

module.exports = Video;
