const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: [
        "artist_follow",
        "release_approved",
        "release_rejected",
        "video_approved",
        "video_rejected",
        "new_release",
        "system",
      ],
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    link: {
      type: String,
      default: "",
    },

    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({
  userId: 1,
  createdAt: -1,
});

const Notification =
  mongoose.models.Notification ||
  mongoose.model(
    "Notification",
    notificationSchema
  );

module.exports = Notification;