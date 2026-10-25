const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
    },

    dateOfBirth: {
      type: Date,
      required: true,
    },

    profileImage: {
      type: String,
      default: "",
    },

    role: {
      type: String,
      enum: [
        "listener",
        "artist",
        "distributor",
        "admin",
        "superadmin",
      ],
      default: "listener",
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    accountStatus: {
      type: String,
      enum: [
        "active",
        "suspended",
        "disabled",
      ],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  const salt = await bcrypt.genSalt(10);

  this.password = await bcrypt.hash(
    this.password,
    salt
  );
});

const User =
  mongoose.models.User ||
  mongoose.model("User", userSchema);

module.exports = User;