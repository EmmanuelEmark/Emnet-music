
const mongoose = require("mongoose");

const videoLikeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Video",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// A listener can like the same video only once.
videoLikeSchema.index(
  { userId: 1, videoId: 1 },
  { unique: true }
);

const VideoLike =
  mongoose.models.VideoLike ||
  mongoose.model("VideoLike", videoLikeSchema);

module.exports = VideoLike;

