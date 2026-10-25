const mongoose = require("mongoose");

const followSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    artistId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Artist",
      required: true,
    },

    notificationsEnabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

followSchema.index(
  { userId: 1, artistId: 1 },
  { unique: true }
);

const Follow =
  mongoose.models.Follow ||
  mongoose.model("Follow", followSchema);

module.exports = Follow;