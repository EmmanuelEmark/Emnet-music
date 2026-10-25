const express = require("express");
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


router.post(
  "/register",
  registerUser
);

router.post(
  "/login",
  loginUser
);

/* ========================================
   ADMIN INVITATION SIGNUP
======================================== */

router.get(
  "/admin-invite/:token",
  verifyAdminInvitation
);


router.post(
  "/admin-invite/:token/accept",
  acceptAdminInvitation
);

router.get(
  "/me",
  protect,
  (req, res) => {
    res.status(200).json({
      success: true,
      user: req.user,
    });
  }
);


module.exports = router;