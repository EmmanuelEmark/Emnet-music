
const mongoose = require("mongoose");

// ==========================================
// NOTIFICATION SCHEMA
// ==========================================

const notificationSchema = new mongoose.Schema(
  {
    // ======================================
    // NOTIFICATION RECIPIENT
    // ======================================

    userId: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,
    },

    // ======================================
    // NOTIFICATION TYPE
    // ======================================

    type: {
      type: String,

      enum: [
        "artist_follow",
        "release_approved",
        "release_rejected",
        "video_approved",
        "video_rejected",
        "new_release",
        "new_video",
        "system",
      ],

      required: true,
    },

    // ======================================
    // NOTIFICATION TITLE
    // ======================================

    title: {
      type: String,

      required: true,

      trim: true,
    },

    // ======================================
    // NOTIFICATION MESSAGE
    // ======================================

    message: {
      type: String,

      required: true,

      trim: true,
    },

    // ======================================
    // NOTIFICATION DESTINATION
    //
    // Determines where the user is taken
    // after clicking the notification.
    // ======================================

    link: {
      type: String,

      default: "",

      trim: true,
    },

    // ======================================
    // UNIQUE NOTIFICATION EVENT
    //
    // Identifies the action that generated
    // this notification.
    //
    // Examples:
    // release:published:RELEASE_ID
    // video:published:VIDEO_ID
    // artist:follow:FOLLOW_ID
    //
    // Optional for compatibility with
    // historical notification records.
    // ======================================

    eventKey: {
      type: String,

      trim: true,

      immutable: true,
    },

    // ======================================
    // NOTIFICATION READ STATUS
    // ======================================

    read: {
      type: Boolean,

      default: false,
    },
  },

  // ========================================
  // AUTOMATIC TIMESTAMPS
  // ========================================

  {
    timestamps: true,
  }
);

// ==========================================
// DATABASE INDEXES
// ==========================================

// Retrieve a user's notifications,
// starting with the newest notification.

notificationSchema.index({
  userId: 1,

  createdAt: -1,
});

// Retrieve unread notifications efficiently.
//
// Also supports unread notification counts
// and marking notifications as read.

notificationSchema.index({
  userId: 1,

  read: 1,

  createdAt: -1,
});

// ==========================================
// DUPLICATE NOTIFICATION PROTECTION
//
// Each user can receive only one notification
// for the same eventKey.
//
// Different users can receive notifications
// for the same event.
//
// The partial index excludes old records
// without an eventKey.
// ==========================================

notificationSchema.index(
  {
    userId: 1,

    eventKey: 1,
  },

  {
    unique: true,

    name: "unique_notification_per_user_event",

    partialFilterExpression: {
      eventKey: {
        $type: "string",
      },
    },
  }
);

// ==========================================
// CREATE NOTIFICATION MODEL
// ==========================================

const Notification =
  mongoose.models.Notification ||
  mongoose.model(
    "Notification",

    notificationSchema
  );

// ==========================================
// EXPORT NOTIFICATION MODEL
// ==========================================

module.exports = Notification;
