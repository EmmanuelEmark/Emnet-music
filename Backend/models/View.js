const mongoose = require("mongoose");

const viewSchema = new mongoose.Schema(
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

    countedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

viewSchema.index({
  videoId: 1,
  countedAt: -1,
});

viewSchema.index({
  userId: 1,
  videoId: 1,
  countedAt: -1,
});

const View =
  mongoose.models.View ||
  mongoose.model("View", viewSchema);

module.exports = View;