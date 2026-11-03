
const express = require("express");
const router = express.Router();

const {
  getMyAccount,
  updateProfile,
  changePassword,
  updateEmailPreferences,
  unsubscribeFromGreetings,
} = require("../controllers/accountController");

const {
  protect,
} = require("../middleware/authMiddleware");

// GET MY ACCOUNT
router.get(
  "/me",
  protect,
  getMyAccount
);

// UPDATE PROFILE
router.patch(
  "/profile",
  protect,
  updateProfile
);

// CHANGE PASSWORD
router.patch(
  "/password",
  protect,
  changePassword
);

// UPDATE EMAIL PREFERENCES
router.patch(
  "/email-preferences",
  protect,
  updateEmailPreferences
);

// UNSUBSCRIBE FROM GREETING EMAILS
// No login required: controller validates
// the signed unsubscribe token.
router.post(
  "/email-preferences/unsubscribe",
  unsubscribeFromGreetings
);

module.exports = router;
