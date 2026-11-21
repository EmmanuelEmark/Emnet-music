
const mongoose = require("mongoose");

// ==========================================
// MEDIA UPLOAD SCHEMA
// ==========================================

const mediaUploadSchema = new mongoose.Schema(
  {
    // ======================================
    // USER WHO OWNS THE UPLOAD
    // ======================================

    userId: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,

      index: true,
    },

    // ======================================
    // MEDIA CATEGORY
    // ======================================

    kind: {
      type: String,

      enum: [
        "audio",
        "artwork",
        "thumbnail",
        "video",
        "artistProfile",
        "artistCover",
        "listenerAvatar",
      ],

      required: true,
    },

    // ======================================
    // CLOUDFLARE R2 STORAGE KEY
    //
    // Pending uploads reference temporary
    // objects.
    //
    // Ready uploads reference permanent
    // verified objects.
    //
    // The key must remain updateable because
    // confirmation moves media to permanent
    // storage.
    // ======================================

    objectKey: {
      type: String,

      required: true,

      unique: true,

      trim: true,

      maxlength: 1024,
    },

    // ======================================
    // ORIGINAL FILE NAME
    // ======================================

    originalName: {
      type: String,

      required: true,

      trim: true,

      maxlength: 255,
    },

    // ======================================
    // DECLARED MEDIA CONTENT TYPE
    // ======================================

    mimeType: {
      type: String,

      required: true,

      trim: true,

      lowercase: true,

      maxlength: 100,
    },

    // ======================================
    // EXPECTED FILE SIZE IN BYTES
    //
    // Only positive safe integers
    // are accepted.
    // ======================================

    expectedSize: {
      type: Number,

      required: true,

      min: 1,

      validate: {
        validator: function (value) {
          return (
            Number.isSafeInteger(value) &&

            value > 0
          );
        },

        message:
          "File size must be a positive safe integer.",
      },
    },

    // ======================================
    // UPLOAD STATUS
    //
    // pending  = awaiting confirmation
    // ready    = verified media
    // rejected = invalid or expired upload
    // ======================================

    status: {
      type: String,

      enum: [
        "pending",
        "ready",
        "rejected",
      ],

      default: "pending",

      required: true,

      index: true,
    },

    // ======================================
    // DATE UPLOAD WAS VERIFIED
    // ======================================

    uploadedAt: {
      type: Date,

      default: null,
    },
  },

  // ========================================
  // AUTOMATIC DOCUMENT TIMESTAMPS
  //
  // createdAt: upload request creation date.
  // updatedAt: most recent database update.
  // ========================================

  {
    timestamps: true,
  }
);

// ==========================================
// DATABASE INDEXES
// ==========================================

// ==========================================
// INDEX 1 — HOURLY UPLOAD REQUEST CHECKS
//
// Supports counting recent upload requests
// belonging to a particular user.
// ==========================================

mediaUploadSchema.index({
  userId: 1,

  createdAt: -1,
});

// ==========================================
// INDEX 2 — USER MEDIA MANAGEMENT
//
// Supports retrieving media based on
// ownership, category and upload status.
// ==========================================

mediaUploadSchema.index({
  userId: 1,

  kind: 1,

  status: 1,
});

// ==========================================
// INDEX 3 — EXPIRED UPLOAD MANAGEMENT
//
// Supports finding old pending and
// rejected upload records.
//
// This is NOT a TTL index.
// Records are not automatically deleted.
// ==========================================

mediaUploadSchema.index({
  status: 1,

  createdAt: 1,
});

// ==========================================
// EXPORT MEDIA UPLOAD MODEL
// ==========================================

module.exports = mongoose.model(
  "MediaUpload",

  mediaUploadSchema
);
