
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ========================================
// USER SCHEMA
// ========================================

const userSchema = new mongoose.Schema(
  {
    // ====================================
    // PERSONAL INFORMATION
    // ====================================

    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please enter a valid email address.",
      ],
    },

    // ====================================
    // ACCOUNT SECURITY
    // ====================================

    password: {
      type: String,
      required: true,
      minlength: 8,
    },

    // ====================================
    // PROFILE
    // ====================================

    dateOfBirth: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return (
            value instanceof Date &&
            !Number.isNaN(value.getTime()) &&
            value.getTime() <= Date.now()
          );
        },
        message: "Date of birth cannot be in the future.",
      },
    },

    profileImage: {
      type: String,
      default: "",
    },

    // ====================================
    // EMAIL PREFERENCES
    // ====================================

    emailPreferences: {
      birthdayGreetings: {
        type: Boolean,
        default: true,
      },

      monthlyGreetings: {
        type: Boolean,
        default: false,
      },
    },

    // ====================================
    // USER ROLE
    // ====================================

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

    // ====================================
    // EMAIL VERIFICATION
    // ====================================

    emailVerified: {
      type: Boolean,
      default: false,
    },

    // ====================================
    // ACCOUNT STATUS
    // ====================================

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

// ========================================
// HASH PASSWORD BEFORE SAVING
// ========================================

userSchema.pre("save", async function () {

  // Do not hash the password again
  // when updating unrelated fields.
  if (!this.isModified("password")) {
    return;
  }

  if (
    typeof this.password !== "string" ||
    this.password.length < 8
  ) {
    throw new Error(
      "Password must contain at least 8 characters."
    );
  }

  // bcrypt only processes the first 72 bytes.
  if (Buffer.byteLength(this.password, "utf8") > 72) {
    throw new Error(
      "Password must be 72 bytes or fewer."
    );
  }

  const salt = await bcrypt.genSalt(10);

  this.password = await bcrypt.hash(
    this.password,
    salt
  );
});

// ========================================
// REMOVE PASSWORD FROM JSON RESPONSES
// ========================================

userSchema.set("toJSON", {
  transform: function (doc, ret) {

    delete ret.password;
    delete ret.__v;

    return ret;
  },
});

// ========================================
// CREATE USER MODEL
// ========================================

const User =
  mongoose.models.User ||
  mongoose.model("User", userSchema);

module.exports = User;
