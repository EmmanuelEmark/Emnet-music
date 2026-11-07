const mongoose = require("mongoose");

const artistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    stageName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    stageNameNormalized: {
  type: String,
  required: true,
  unique: true,
  lowercase: true,
  trim: true,
},

    bio: {
      type: String,
      default: "",
      maxlength: 500,
    },

    
    profileImage: {
      type: String,
      default: "",
    },

    profileImageUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaUpload",
      default: null,
    },

    coverImage: {
      type: String,
      default: "",
    },

    coverImageUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MediaUpload",
      default: null,
    },


    country: {
      type: String, 
      required: true,
      trim: true,
    },

    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
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

    verified: {
      type: Boolean,
      default: false,
    },

    featured: {
  type: Boolean,
  default: false,
   },

    followersCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

const Artist = mongoose.model("Artist", artistSchema);

module.exports = Artist;