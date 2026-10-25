const mongoose = require("mongoose");

const releaseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    releaseType: {
      type: String,
      enum: ["single", "ep", "album"],
      required: true,
    },

    coverImage: {
      type: String,
      required: true,
    },

    coverHash: {
      type: String,
      default: "",
    },

    primaryArtists: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Artist",
        required: true,
      },
    ],

    collaboratingArtists: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Artist",
      },
    ],

    releaseDate: {
      type: Date,
      required: true,
    },

    sourceType: {
      type: String,
      enum: ["artist", "distributor", "label"],
      default: "artist",
    },

    distributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Distributor",
      default: null,
    },

    rightsConfirmed: {
  type: Boolean,
  default: false,
},

rightsConfirmedAt: {
  type: Date,
  default: null,
},

    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"],
      default: "draft",
    },


    visibilityStatus: {
  type: String,
  enum: ["visible", "hidden", "takedown"],
  default: "visible",
},

moderationReason: {
  type: String,
  default: "",
  trim: true,
},

moderatedBy: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  default: null,
},

moderatedAt: {
  type: Date,
  default: null,
},


    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const Release = mongoose.model("Release", releaseSchema);

module.exports = Release;