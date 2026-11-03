const mongoose = require("mongoose");

const playSchema = new mongoose.Schema(
  {
    userId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
},

guestId: {
  type: String,
  default: null,
},

    songId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Song",
      required: true,
    },

    countedAt: {
      type: Date,
      default: Date.now,
    },

    sessionId: {
  type: String,
  unique: true,
  sparse: true,
},
  },
  {
    timestamps: true,
  }
);

playSchema.index({
  songId: 1,
  countedAt: -1,
});

playSchema.index({
  userId: 1,
  songId: 1,
  countedAt: -1,
});

playSchema.index({
  guestId: 1,
  songId: 1,
  countedAt: -1,
});

const Play =
  mongoose.models.Play ||
  mongoose.model("Play", playSchema);

module.exports = Play;