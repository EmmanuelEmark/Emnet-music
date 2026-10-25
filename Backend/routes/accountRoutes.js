const express = require("express");
const router = express.Router();

const {
  getMyAccount,
  updateProfile,
  changePassword,
} = require("../controllers/accountController");

const {
  protect,
} = require("../middleware/authMiddleware");


router.get(
  "/me",
  protect,
  getMyAccount
);


router.patch(
  "/profile",
  protect,
  updateProfile
);


router.patch(
  "/password",
  protect,
  changePassword
);


module.exports = router;