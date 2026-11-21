const mongoose = require("mongoose");

// ==========================================
// SUPPORTED ADMINISTRATIVE ACTIONS
// ==========================================

const allowedActions = [
  // Administrator management

  "admin_invited",
  "admin_created",
  "admin_invitation_revoked",
  "admin_suspended",
  "admin_reactivated",
  "admin_role_removed",

  // Platform user management

  "user_suspended",
  "user_reactivated",
  "user_disabled",

  // Artist management

  "artist_approved",
  "artist_rejected",
  "artist_verified",
  "artist_unverified",
  "artist_suspended",
  "artist_restored",
  "artist_featured",
  "artist_unfeatured",

  // Artist profile moderation

  "artist_hidden",
  "artist_unhidden",
  "artist_takedown",
  "artist_takedown_reversed",

  // Song moderation

  "song_hidden",
  "song_restored",
  "song_deleted",
  "song_featured",
  "song_unfeatured",
  "song_takedown",
  "song_takedown_reversed",

  // Release moderation

  "release_hidden",
  "release_restored",
  "release_deleted",
  "release_featured",
  "release_unfeatured",
  "release_approved",
  "release_rejected",
  "release_takedown",
  "release_takedown_reversed",

  // Video moderation

  "video_hidden",
  "video_restored",
  "video_deleted",
  "video_approved",
  "video_rejected",
  "video_featured",
  "video_unfeatured",
  "video_takedown",
  "video_takedown_reversed",

  // Report management

  "report_reviewing",
  "report_resolved",
  "report_dismissed",

  // Platform announcements

  "announcement_created",
  "announcement_deleted",

  // Platform settings

  "settings_updated",
];

// ==========================================
// ADMINISTRATIVE ACTIVITY SCHEMA
// ==========================================

const adminActivitySchema = new mongoose.Schema(
  {
    // ======================================
    // ADMINISTRATOR INFORMATION
    // ======================================

    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    actorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      immutable: true,
    },

    actorRole: {
      type: String,
      enum: [
        "admin",
        "superadmin",
      ],
      required: true,
      immutable: true,
    },

    // ======================================
    // ADMINISTRATIVE ACTION
    // ======================================

    action: {
      type: String,
      enum: allowedActions,
      required: true,
      immutable: true,
    },

    // ======================================
    // AFFECTED RESOURCE
    // ======================================

    targetType: {
      type: String,

      enum: [
        "user",
        "admin",
        "artist",
        "song",
        "release",
        "video",
        "report",
        "invitation",
        "announcement",
        "settings",
      ],

      required: true,
      immutable: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      immutable: true,
    },

    targetName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
      immutable: true,
    },

    // ======================================
    // PREVIOUS AND NEW VALUES
    // ======================================

    previousValues: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
      immutable: true,
    },

    newValues: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
      immutable: true,
    },

    // ======================================
    // REASON FOR ADMINISTRATIVE ACTION
    // ======================================

    reason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
      immutable: true,
    },

    // ======================================
    // OPERATION OUTCOME
    // ======================================

    outcome: {
      type: String,

      enum: [
        "success",
        "failed",
        "denied",
      ],

      default: "success",
      required: true,
      immutable: true,
    },

    // ======================================
    // REQUEST INFORMATION
    // ======================================

    ipAddress: {
      type: String,
      maxlength: 100,
      default: "",
      immutable: true,
    },

    requestMethod: {
      type: String,
      maxlength: 10,
      default: "",
      immutable: true,
    },
  },

  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },

    versionKey: false,
  }
);

// ==========================================
// DATABASE INDEXES
// ==========================================

// Retrieve recent administrative activities.

adminActivitySchema.index({
  createdAt: -1,
  _id: -1,
});

// Retrieve activities by administrator.

adminActivitySchema.index({
  actorId: 1,
  createdAt: -1,
});

// Retrieve activities by action.

adminActivitySchema.index({
  action: 1,
  createdAt: -1,
});

// Retrieve activities affecting
// a particular account or resource.

adminActivitySchema.index({
  targetType: 1,
  targetId: 1,
  createdAt: -1,
});

// Filter activities by outcome.

adminActivitySchema.index({
  outcome: 1,
  createdAt: -1,
});

// ==========================================
// CREATE ADMIN ACTIVITY MODEL
// ==========================================

const AdminActivity =
  mongoose.models.AdminActivity ||
  mongoose.model(
    "AdminActivity",
    adminActivitySchema
  );

// ==========================================
// EXPORT MODEL
// ==========================================

module.exports = AdminActivity;