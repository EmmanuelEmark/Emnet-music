const mongoose = require("mongoose");

const listeningHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    songId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Song",
      required: true,
    },

    playedAt: {
      type: Date,
      default: Date.now,
    },

    playDuration: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

const ListeningHistory =
  mongoose.models.ListeningHistory ||
  mongoose.model(
    "ListeningHistory",
    listeningHistorySchema
  );

module.exports = ListeningHistory;