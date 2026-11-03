
const express = require("express");
const router = express.Router();

const {
  startSongPlay,
  recordSongPlay,
} = require("../controllers/playController");

const {
  optionalAuth,
} = require("../middleware/authMiddleware");

// Begin a playback session.
router.post(
  "/songs/:songId/start",
  optionalAuth,
  startSongPlay
);

// Complete a qualifying playback session.
router.post(
  "/songs/:songId",
  optionalAuth,
  recordSongPlay
);

module.exports = router;
