
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

    // Used to invalidate existing sessions
    // after important security changes.

    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,

      validate: {
        validator: function (value) {
          return (
            Number.isSafeInteger(value) &&
            value >= 0
          );
        },

        message:
          "Invalid account token version.",
      },
    },

    // Most recent successful authentication.

    lastLoginAt: {
      type: Date,
      default: null,
    },

    // Most recent password change.

    passwordChangedAt: {
      type: Date,
      default: null,
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

            !Number.isNaN(
              value.getTime()
            ) &&

            value.getTime() <= Date.now()
          );
        },

        message:
          "Date of birth cannot be in the future.",
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

      required: true,
    },

    // ====================================
    // ADMINISTRATOR INFORMATION
    // ====================================

    // Identifies the Super Admin who
    // created or invited an administrator.

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Date the administrator received
    // administrative access.

    roleAssignedAt: {
      type: Date,
      default: null,
    },

    // Identifies who assigned or
    // last modified the user's role.

    roleAssignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
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

      required: true,
    },

    // ====================================
    // ACCOUNT MODERATION INFORMATION
    // ====================================

    accountStatusReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    // Date the account status was changed.

    accountStatusUpdatedAt: {
      type: Date,
      default: null,
    },

    // Administrator responsible for
    // changing the account status.

    accountStatusUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },

  // ======================================
  // AUTOMATIC TIMESTAMPS
  // ======================================

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

  // ======================================
  // VALIDATE PASSWORD
  // ======================================

  if (
    typeof this.password !== "string" ||

    this.password.length < 8
  ) {
    throw new Error(
      "Password must contain at least 8 characters."
    );
  }

  // bcrypt only processes the first 72 bytes.

  if (
    Buffer.byteLength(
      this.password,
      "utf8"
    ) > 72
  ) {
    throw new Error(
      "Password must be 72 bytes or fewer."
    );
  }

  // ======================================
  // HASH PASSWORD
  // ======================================

  const salt =
    await bcrypt.genSalt(10);

  this.password =
    await bcrypt.hash(
      this.password,
      salt
    );

  // ======================================
  // RECORD PASSWORD CHANGE
  // ======================================

  if (!this.isNew) {
    this.passwordChangedAt =
      new Date();
  }
});

// ========================================
// REMOVE PRIVATE INFORMATION FROM JSON
// ========================================

userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;

    delete ret.tokenVersion;

    delete ret.__v;

    return ret;
  },
});

// ========================================
// DATABASE INDEXES
// ========================================

// Supports administrator dashboard queries,
// user management and role-based statistics.

userSchema.index({
  role: 1,
  accountStatus: 1,
  createdAt: -1,
});

// Supports account status management.

userSchema.index({
  accountStatus: 1,
  createdAt: -1,
});

// Supports administrator creation tracking.

userSchema.index({
  createdBy: 1,
  createdAt: -1,
});

// ========================================
// CREATE USER MODEL
// ========================================

const User =
  mongoose.models.User ||
  mongoose.model(
    "User",
    userSchema
  );

// ========================================
// EXPORT USER MODEL
// ========================================

module.exports = User;