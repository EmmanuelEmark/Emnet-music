
const mongoose = require("mongoose");

const emailDeliverySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: ["birthday", "new_month"],
      required: true,
    },

    occasionKey: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["processing", "sent", "failed"],
      default: "processing",
    },

    sentAt: {
      type: Date,
      default: null,
    },

    errorMessage: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

emailDeliverySchema.index(
  {
    userId: 1,
    type: 1,
    occasionKey: 1,
  },
  { unique: true }
);

module.exports =
  mongoose.models.EmailDelivery ||
  mongoose.model(
    "EmailDelivery",
    emailDeliverySchema
  );
