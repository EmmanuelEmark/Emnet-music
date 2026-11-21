
const mongoose = require("mongoose");

// ==========================================
// EMNET MUSIC — SONG MODEL
// Supports incomplete drafts and
// completed published songs.
// ==========================================

const songSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
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
      default: "",
      trim: true,
      maxlength: 100,
    },

    // Legacy audio URL support.
    audioUrl: {
      type: String,
      default: "",
    },

    // Cloudflare R2 audio reference.
    audioUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaUpload",
      default: null,
    },

    // Zero means duration has not yet
    // been supplied for a draft.
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Null means no track number has
    // been assigned to the draft.
    trackNumber: {
      type: Number,
      default: null,
      min: 1,
      validate: {
        validator(value) {
          return (
            value === null ||
            (
              Number.isSafeInteger(value) &&
              value >= 1
            )
          );
        },
        message:
          "Track number must be a positive integer.",
      },
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
  },
  {
    timestamps: true,
  }
);

// ==========================================
// VALIDATE COMPLETE SONGS
//
// Drafts can be incomplete.
// Approved songs must have the
// required information.
// ==========================================

songSchema.pre("validate", function () {
  if (this.status !== "approved") {
    return;
  }

  if (
    typeof this.title !== "string" ||
    !this.title.trim()
  ) {
    this.invalidate(
      "title",
      "A published song requires a title."
    );
  }

  if (
    typeof this.genre !== "string" ||
    !this.genre.trim()
  ) {
    this.invalidate(
      "genre",
      "A published song requires a genre."
    );
  }

  if (
    !Number.isFinite(this.duration) ||
    this.duration < 1
  ) {
    this.invalidate(
      "duration",
      "A published song requires a valid duration."
    );
  }

  if (
    !Number.isSafeInteger(this.trackNumber) ||
    this.trackNumber < 1
  ) {
    this.invalidate(
      "trackNumber",
      "A published song requires a track number."
    );
  }

  if (
    !this.audioUploadId &&
    (
      typeof this.audioUrl !== "string" ||
      !this.audioUrl.trim()
    )
  ) {
    this.invalidate(
      "audioUrl",
      "A published song requires an audio file."
    );
  }

  if (
    !Array.isArray(this.primaryArtists) ||
    this.primaryArtists.length === 0
  ) {
    this.invalidate(
      "primaryArtists",
      "A published song requires a primary artist."
    );
  }
});

// ==========================================
// PREVENT REUSING AN R2 AUDIO UPLOAD
// ==========================================

songSchema.index(
  { audioUploadId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      audioUploadId: {
        $type: "objectId",
      },
    },
  }
);

// ==========================================
// PREVENT DUPLICATE ASSIGNED TRACK NUMBERS
//
// Unnumbered draft tracks are excluded.
// ==========================================

songSchema.index(
  {
    releaseId: 1,
    trackNumber: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      trackNumber: {
        $type: "number",
      },
    },
  }
);

// ==========================================
// EXPORT
// ==========================================

const Song =
  mongoose.models.Song ||
  mongoose.model(
    "Song",
    songSchema
  );

module.exports = Song;
