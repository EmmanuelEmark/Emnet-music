const mongoose = require("mongoose");

const likeSchema = new mongoose.Schema(
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
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate likes
likeSchema.index(
  { userId: 1, songId: 1 },
  { unique: true }
);

const Like = mongoose.model("Like", likeSchema);

module.exports = Like;