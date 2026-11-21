
const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

const {
  registerUser,
  loginUser,
} = require("../controllers/authController");

const {
  verifyAdminInvitation,
  acceptAdminInvitation,
} = require(
  "../controllers/adminInviteController"
);

const {
  protect,
} = require("../middleware/authMiddleware");

// ========================================
// LOGIN RATE LIMIT
// ========================================

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 10,

  standardHeaders: true,

  legacyHeaders: false,

  skipSuccessfulRequests: true,

  message: {
    success: false,

    message:
      "Too many unsuccessful login attempts. Please try again later.",
  },
});

// ========================================
// REGISTRATION RATE LIMIT
// ========================================

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,

  max: 10,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    success: false,

    message:
      "Too many registration requests. Please try again later.",
  },
});

// ========================================
// ADMIN INVITATION RATE LIMIT
// ========================================

const invitationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 20,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    success: false,

    message:
      "Too many invitation requests. Please try again later.",
  },
});

// ========================================
// PREVENT AUTHENTICATION RESPONSE CACHING
// ========================================

router.use((req, res, next) => {
  res.set(
    "Cache-Control",
    "private, no-store"
  );

  res.set(
    "Referrer-Policy",
    "no-referrer"
  );

  next();
});

// ========================================
// PUBLIC LISTENER REGISTRATION
// ========================================

router.post(
  "/register",

  registrationLimiter,

  registerUser
);

// ========================================
// LOGIN
//
// Supports listener, artist, distributor,
// admin and superadmin accounts.
// ========================================

router.post(
  "/login",

  loginLimiter,

  loginUser
);

// ========================================
// VERIFY ADMIN INVITATION
// ========================================

router.get(
  "/admin-invite/:token",

  invitationLimiter,

  verifyAdminInvitation
);

// ========================================
// ACCEPT ADMIN INVITATION
// ========================================

router.post(
  "/admin-invite/:token/accept",

  invitationLimiter,

  acceptAdminInvitation
);

// ========================================
// GET AUTHENTICATED USER
//
// Return only the account information
// required by the frontend.
// ========================================

router.get(
  "/me",

  protect,

  (req, res) => {
    const user = req.user;

    return res.status(200).json({
      success: true,

      user: {
        _id: user._id,

        id: user._id,

        fullName: user.fullName,

        email: user.email,

        role: user.role,

        emailVerified: user.emailVerified,

        profileImage: user.profileImage,

        dateOfBirth: user.dateOfBirth,

        emailPreferences: user.emailPreferences,

        accountStatus: user.accountStatus,

        createdAt: user.createdAt,

        updatedAt: user.updatedAt,
      },
    });
  }
);

// ========================================
// EXPORT AUTHENTICATION ROUTES
// ========================================

module.exports = router;