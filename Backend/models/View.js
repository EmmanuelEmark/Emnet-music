
const mongoose = require("mongoose");

const viewSchema = new mongoose.Schema(
  {
    // Logged-in viewer
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Anonymous viewer identifier
    // This will be generated and verified by the backend.
    guestId: {
      type: String,
      default: null,
    },

    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Video",
      required: true,
    },

    // Used to prevent duplicate counting
    // during the same cooldown window.
    dedupeKey: {
      type: String,
      default: undefined,
    },

    sessionId: {
    type: String,
    default: undefined,
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

// Every view must belong to a logged-in
// user or an anonymous visitor.
viewSchema.pre("validate", function () {
  if (!this.userId && !this.guestId) {
    this.invalidate(
      "userId",
      "A user or guest identifier is required."
    );
  }
});

// Preserve indexes for existing user views.
viewSchema.index({
  videoId: 1,
  countedAt: -1,
});

viewSchema.index({
  userId: 1,
  videoId: 1,
  countedAt: -1,
});

// Efficiently check recent anonymous views.
viewSchema.index({
  guestId: 1,
  videoId: 1,
  countedAt: -1,
});

// Prevent concurrent requests from inserting
// the same counted view within one time window.
// Existing documents without dedupeKey are excluded.
viewSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      dedupeKey: { $type: "string" },
    },
  }
);

viewSchema.index(
  { sessionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      sessionId: { $type: "string" },
    },
  }
);

const View =
  mongoose.models.View ||
  mongoose.model("View", viewSchema);

module.exports = View;
