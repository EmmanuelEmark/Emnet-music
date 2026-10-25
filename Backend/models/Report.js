const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    targetType: {
      type: String,
      enum: [
        "artist",
        "release",
        "song",
        "video",
      ],
      required: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    reason: {
      type: String,
      enum: [
        "copyright",
        "impersonation",
        "inappropriate_content",
        "spam",
        "misleading",
        "other",
      ],
      required: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "reviewing",
        "resolved",
        "dismissed",
      ],
      default: "pending",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

reportSchema.index({
  status: 1,
  createdAt: -1,
});

reportSchema.index({
  targetType: 1,
  targetId: 1,
});

const Report =
  mongoose.models.Report ||
  mongoose.model("Report", reportSchema);

module.exports = Report;