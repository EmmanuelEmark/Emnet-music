const mongoose = require("mongoose");

// ==========================================
// REPORT SCHEMA
// ==========================================

const reportSchema = new mongoose.Schema(
  {
    // ======================================
    // REPORTER INFORMATION
    // ======================================

    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    // ======================================
    // REPORTED CONTENT
    // ======================================

    targetType: {
      type: String,

      enum: [
        "artist",
        "release",
        "song",
        "video",
      ],

      required: true,
      immutable: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },

    // ======================================
    // REPORT REASON
    // ======================================

    reason: {
      type: String,

      enum: [
        "copyright",
        "impersonation",
        "inappropriate_content",
        "spam",
        "misleading",
        "other",
      ],

      required: true,
      immutable: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
      immutable: true,
    },

    // ======================================
    // REPORT STATUS
    // ======================================

    status: {
      type: String,

      enum: [
        "pending",
        "reviewing",
        "resolved",
        "dismissed",
      ],

      default: "pending",
      required: true,
    },

    // ======================================
    // ADMINISTRATIVE REVIEW
    // ======================================

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    // ======================================
    // ADMINISTRATIVE RESOLUTION
    // ======================================

    resolutionReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    closedAt: {
      type: Date,
      default: null,
    },
  },

  {
    timestamps: true,
  }
);

// ==========================================
// DATABASE INDEXES
// ==========================================

// Filter reports by status and date.

reportSchema.index({
  status: 1,
  createdAt: -1,
});

// Retrieve reports concerning specific content.

reportSchema.index({
  targetType: 1,
  targetId: 1,
});

// Retrieve reports submitted by a user.

reportSchema.index({
  reportedBy: 1,
  createdAt: -1,
});

// Retrieve reports reviewed by an administrator.

reportSchema.index({
  reviewedBy: 1,
  reviewedAt: -1,
});

// Retrieve reports according to their reasons.

reportSchema.index({
  reason: 1,
  status: 1,
  createdAt: -1,
});

// ==========================================
// PREVENT DUPLICATE ACTIVE REPORTS
//
// This index prevents a user from submitting
// multiple active reports for the same content.
//
// Resolved and dismissed reports are excluded
// from this restriction.
//
// Enable this index after checking existing
// database records for duplicate active reports.
// ==========================================

if (
  process.env.ENABLE_REPORT_UNIQUE_INDEX === "true"
) {
  reportSchema.index(
    {
      reportedBy: 1,
      targetType: 1,
      targetId: 1,
    },

    {
      unique: true,

      partialFilterExpression: {
        status: {
          $in: [
            "pending",
            "reviewing",
          ],
        },
      },

      name: "unique_active_content_report",
    }
  );
}

// ==========================================
// CREATE REPORT MODEL
// ==========================================

const Report =
  mongoose.models.Report ||
  mongoose.model(
    "Report",
    reportSchema
  );

// ==========================================
// EXPORT MODEL
// ==========================================

module.exports = Report;