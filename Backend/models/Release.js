
const mongoose = require("mongoose");

// ========================================
// EMNET MUSIC — RELEASE MODEL
// Incomplete drafts are allowed.
// Published releases must be complete.
// ========================================

const releaseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },

    releaseType: {
      type: String,
      enum: ["single", "ep", "album"],
      default: null,
    },

    // Legacy cover-image URL.
    coverImage: {
      type: String,
      default: "",
    },

    // Cloudflare R2 artwork reference.
    coverUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaUpload",
      default: null,
    },

    coverHash: {
      type: String,
      default: "",
    },

    primaryArtists: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Artist",
      },
    ],

    collaboratingArtists: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Artist",
      },
    ],

    // A draft can have no release date.
    releaseDate: {
      type: Date,
      default: null,
    },

    sourceType: {
      type: String,
      enum: [
        "artist",
        "distributor",
        "label",
      ],
      default: "artist",
    },

    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Distributor",
      default: null,
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

// ========================================
// VALIDATION FOR PUBLISHED RELEASES
//
// Drafts may be incomplete.
// Approved releases must have
// complete release information.
//
// Songs and R2 files are validated
// by the publishing controller.
// ========================================

releaseSchema.pre("validate", function () {
  if (this.status !== "approved") {
    return;
  }

  if (
    typeof this.title !== "string" ||
    !this.title.trim()
  ) {
    this.invalidate(
      "title",
      "A published release requires a title."
    );
  }

  if (
    !["single", "ep", "album"].includes(
      this.releaseType
    )
  ) {
    this.invalidate(
      "releaseType",
      "A published release requires a valid release type."
    );
  }

  if (
    !(this.releaseDate instanceof Date) ||
    Number.isNaN(
      this.releaseDate.getTime()
    )
  ) {
    this.invalidate(
      "releaseDate",
      "A published release requires a release date."
    );
  }

  if (
    !this.coverUploadId &&
    !(
      typeof this.coverImage === "string" &&
      this.coverImage.trim()
    )
  ) {
    this.invalidate(
      "coverImage",
      "A published release requires cover artwork."
    );
  }

  if (
    !Array.isArray(this.primaryArtists) ||
    this.primaryArtists.length === 0
  ) {
    this.invalidate(
      "primaryArtists",
      "A published release requires a primary artist."
    );
  }
});

// ========================================
// PREVENT REUSING AN R2 COVER UPLOAD
// ========================================

releaseSchema.index(
  { coverUploadId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      coverUploadId: {
        $type: "objectId",
      },
    },
  }
);

const Release =
  mongoose.models.Release ||
  mongoose.model(
    "Release",
    releaseSchema
  );

module.exports = Release;