
const express = require("express");

const router = express.Router();

// ========================================
// ACCOUNT CONTROLLERS
// ========================================

const {
  getMyAccount,
  updateProfile,
  changePassword,
  updateEmailPreferences,
  unsubscribeFromGreetings,
} = require("../controllers/accountController");

// ========================================
// LISTENER PROFILE PICTURE CONTROLLERS
// ========================================

const {
  requestListenerAvatar,
  confirmListenerAvatar,
  getListenerAvatar,
} = require("../controllers/listenerAvatarController");

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

// ========================================
// GET MY ACCOUNT
// GET /api/account/me
// ========================================

router.get(
  "/me",
  protect,
  getMyAccount
);

// ========================================
// UPDATE PROFILE
// PATCH /api/account/profile
// ========================================

router.patch(
  "/profile",
  protect,
  updateProfile
);

// ========================================
// CHANGE PASSWORD
// PATCH /api/account/password
// ========================================

router.patch(
  "/password",
  protect,
  changePassword
);

// ========================================
// UPDATE EMAIL PREFERENCES
// PATCH /api/account/email-preferences
// ========================================

router.patch(
  "/email-preferences",
  protect,
  updateEmailPreferences
);

// ========================================
// UNSUBSCRIBE FROM GREETING EMAILS
// POST /api/account/email-preferences/unsubscribe
//
// No login required.
// The controller validates the signed token.
// ========================================

router.post(
  "/email-preferences/unsubscribe",
  unsubscribeFromGreetings
);

// ========================================
// REQUEST LISTENER PROFILE PICTURE UPLOAD
// POST /api/account/avatar/request
//
// Only logged-in listeners can upload.
// ========================================

router.post(
  "/avatar/request",
  protect,
  authorize("listener"),
  requestListenerAvatar
);

// ========================================
// CONFIRM LISTENER PROFILE PICTURE UPLOAD
// POST /api/account/avatar/:uploadId/confirm
//
// Verifies the uploaded image in Cloudflare R2.
// ========================================

router.post(
  "/avatar/:uploadId/confirm",
  protect,
  authorize("listener"),
  confirmListenerAvatar
);

// ========================================
// DISPLAY LISTENER PROFILE PICTURE
// GET /api/account/avatar/:uploadId
//
// Public access to an attached profile image.
// ========================================

router.get(
  "/avatar/:uploadId",
  getListenerAvatar
);

// ========================================
// EXPORT ROUTER
// ========================================

module.exports = router;
