
const mongoose = require("mongoose");

// ==========================================
// EMNET MUSIC — VIDEO MODEL
//
// Incomplete drafts are allowed.
// Completed videos publish immediately.
// ==========================================

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },

    genre: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
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

    // ======================================
    // VIDEO MEDIA
    // ======================================

    // Legacy URL-based videos remain supported.
    videoUrl: {
      type: String,
      default: "",
    },

    // Verified Cloudflare R2 video upload.
    videoUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaUpload",
      default: null,
    },

    // ======================================
    // VIDEO THUMBNAIL
    // ======================================

    // Legacy thumbnail URLs.
    thumbnailUrl: {
      type: String,
      default: "",
    },

    // Verified Cloudflare R2 thumbnail.
    thumbnailUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaUpload",
      default: null,
    },

    // Duration in seconds.
    // Zero means duration is not yet available.
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ======================================
    // ARTIST INFORMATION
    // ======================================

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

    // ======================================
    // LINKED MUSIC
    // ======================================

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

    // ======================================
    // DUPLICATE MEDIA DETECTION
    // ======================================

    videoHash: {
      type: String,
      default: "",
    },

    thumbnailHash: {
      type: String,
      default: "",
    },

    // ======================================
    // VIDEO ANALYTICS
    // ======================================

    viewCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ======================================
    // COPYRIGHT CONFIRMATION
    // ======================================

    rightsConfirmed: {
      type: Boolean,
      default: false,
    },

    rightsConfirmedAt: {
      type: Date,
      default: null,
    },

    // ======================================
    // PUBLISHING STATUS
    // ======================================

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

    publishedAt: {
      type: Date,
      default: null,
    },

    // ======================================
    // CONTENT VISIBILITY
    // ======================================

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

    // ======================================
    // VIDEO OWNERSHIP
    // ======================================

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

// ==========================================
// VALIDATE COMPLETED VIDEOS
//
// Draft videos can contain incomplete
// information.
//
// Published videos must be complete.
// ==========================================

videoSchema.pre("validate", function () {
  if (this.status !== "approved") {
    return;
  }

  // VIDEO TITLE

  if (
    typeof this.title !== "string" ||
    !this.title.trim()
  ) {
    this.invalidate(
      "title",
      "A published video requires a title."
    );
  }

  // VIDEO GENRE

  // Require genre for newly published videos.
  // Previously approved videos remain compatible.
  if (
    this.isModified("status") ||
    this.isNew
  ) {
    if (
      typeof this.genre !== "string" ||
      !this.genre.trim()
    ) {
      this.invalidate(
        "genre",
        "Select a genre before publishing."
      );
    }
  }

  // VIDEO TYPE

  if (
    ![
      "music_video",
      "live_performance",
      "interview",
      "other",
    ].includes(this.videoType)
  ) {
    this.invalidate(
      "videoType",
      "Invalid video type."
    );
  }

  // VIDEO FILE

  if (
    !this.videoUploadId &&
    !(
      typeof this.videoUrl === "string" &&
      this.videoUrl.trim()
    )
  ) {
    this.invalidate(
      "videoUrl",
      "Upload a video before publishing."
    );
  }

  // VIDEO THUMBNAIL

  if (
    !this.thumbnailUploadId &&
    !(
      typeof this.thumbnailUrl === "string" &&
      this.thumbnailUrl.trim()
    )
  ) {
    this.invalidate(
      "thumbnailUrl",
      "Upload a thumbnail before publishing."
    );
  }

  // VIDEO DURATION

  if (
    !Number.isFinite(this.duration) ||
    this.duration < 1
  ) {
    this.invalidate(
      "duration",
      "A published video requires a valid duration."
    );
  }

  // PRIMARY ARTISTS

  if (
    !Array.isArray(this.primaryArtists) ||
    this.primaryArtists.length === 0
  ) {
    this.invalidate(
      "primaryArtists",
      "A published video requires a primary artist."
    );
  }

  // COPYRIGHT CONFIRMATION

  if (
    this.isModified("status") ||
    this.isNew
  ) {
    if (this.rightsConfirmed !== true) {
      this.invalidate(
        "rightsConfirmed",
        "Confirm your publishing rights before publishing."
      );
    }
  }
});

// ==========================================
// PREVENT REUSING VIDEO UPLOADS
// ==========================================

videoSchema.index(
  { videoUploadId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      videoUploadId: {
        $type: "objectId",
      },
    },
  }
);

// ==========================================
// PREVENT REUSING THUMBNAIL UPLOADS
// ==========================================

videoSchema.index(
  { thumbnailUploadId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      thumbnailUploadId: {
        $type: "objectId",
      },
    },
  }
);

// ==========================================
// ARTIST VIDEO MANAGEMENT INDEX
// ==========================================

videoSchema.index({
  submittedBy: 1,
  status: 1,
  updatedAt: -1,
});

// ==========================================
// PUBLIC VIDEO CATALOGUE INDEX
// ==========================================

videoSchema.index({
  status: 1,
  visibilityStatus: 1,
  publishedAt: -1,
});

// ==========================================
// EXPORT MODEL
// ==========================================

const Video =
  mongoose.models.Video ||
  mongoose.model(
    "Video",
    videoSchema
  );

module.exports = Video;
