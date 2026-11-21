
const mongoose = require("mongoose");

// ==========================================
// ADMINISTRATOR INVITATION SCHEMA
// ==========================================

const adminInviteSchema = new mongoose.Schema(
  {
    // ======================================
    // INVITED ADMINISTRATOR FULL NAME
    // ======================================

    fullName: {
      type: String,

      required: true,

      trim: true,

      maxlength: 100,
    },

    // ======================================
    // INVITED ADMINISTRATOR EMAIL
    // ======================================

    email: {
      type: String,

      required: true,

      lowercase: true,

      trim: true,

      maxlength: 254,

      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

        "Please enter a valid email address.",
      ],
    },

    // ======================================
    // HASHED INVITATION TOKEN
    //
    // Only the SHA-256 hash is stored.
    // Never store the raw invitation token.
    // ======================================

    tokenHash: {
      type: String,

      required: true,

      unique: true,

      immutable: true,

      match: [
        /^[a-f0-9]{64}$/,

        "Invalid invitation token hash.",
      ],
    },

    // ======================================
    // INVITATION EXPIRATION DATE
    // ======================================

    expiresAt: {
      type: Date,

      required: true,

      immutable: true,

      validate: {
        validator: function (value) {
          return (
            value instanceof Date &&

            Number.isFinite(
              value.getTime()
            )
          );
        },

        message:
          "Invalid invitation expiration date.",
      },
    },

    // ======================================
    // INVITATION CONSUMPTION STATUS
    //
    // false = Not yet accepted
    // true  = Already accepted
    // ======================================

    used: {
      type: Boolean,

      default: false,

      required: true,
    },

    // ======================================
    // DATE INVITATION WAS ACCEPTED
    // ======================================

    usedAt: {
      type: Date,

      default: null,
    },

    // ======================================
    // SUPER ADMIN WHO CREATED INVITATION
    // ======================================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,

      immutable: true,
    },
  },

  // ======================================
  // AUTOMATIC TIMESTAMPS
  // ======================================

  {
    timestamps: true,
  }
);

// ==========================================
// DATABASE INDEXES
// ==========================================

// ==========================================
// INDEX 1 — PREVENT DUPLICATE UNUSED INVITES
//
// Only one unused invitation can exist
// for a particular email address.
//
// Previously accepted invitations are
// excluded from this unique index.
// ==========================================

adminInviteSchema.index(
  {
    email: 1,
  },

  {
    unique: true,

    partialFilterExpression: {
      used: false,
    },

    name: "unique_unused_admin_invitation",
  }
);

// ==========================================
// INDEX 2 — INVITATION EXPIRATION MANAGEMENT
//
// Helps retrieve pending and expired
// administrator invitations efficiently.
// ==========================================

adminInviteSchema.index({
  used: 1,

  expiresAt: 1,
});

// ==========================================
// INDEX 3 — INVITATION CREATOR HISTORY
//
// Helps retrieve invitations created
// by a particular Super Admin.
// ==========================================

adminInviteSchema.index({
  createdBy: 1,

  createdAt: -1,
});

// ==========================================
// INDEX 4 — INVITATION HISTORY
//
// Supports retrieving recent invitations.
// ==========================================

adminInviteSchema.index({
  createdAt: -1,
});

// ==========================================
// PROTECT PRIVATE TOKEN INFORMATION
// ==========================================

adminInviteSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.tokenHash;

    delete ret.__v;

    return ret;
  },
});

// ==========================================
// CREATE ADMIN INVITATION MODEL
// ==========================================

const AdminInvite =
  mongoose.models.AdminInvite ||
  mongoose.model(
    "AdminInvite",

    adminInviteSchema
  );

// ==========================================
// EXPORT MODEL
// ==========================================

module.exports = AdminInvite;