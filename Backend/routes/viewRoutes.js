
const express = require("express");
const router = express.Router();

const {
  startVideoView,
  recordVideoView,
} = require("../controllers/viewController");

const {
  optionalAuth,
} = require("../middleware/authMiddleware");

// Start a server-issued viewing session.
router.post(
  "/videos/:videoId/start",
  optionalAuth,
  startVideoView
);

// Complete a qualifying viewing session.
router.post(
  "/videos/:videoId",
  optionalAuth,
  recordVideoView
);

module.exports = router;
