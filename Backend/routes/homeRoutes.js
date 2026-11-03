
const express = require("express");
const router = express.Router();

const {
  getHomeFeed,
} = require("../controllers/homeController");

const {
  optionalAuth,
} = require("../middleware/authMiddleware");

router.get("/", optionalAuth, getHomeFeed);

module.exports = router;
