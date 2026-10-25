const express = require("express");
const router = express.Router();

const {
  recordSongPlay,
} = require("../controllers/playController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

router.post(
  "/songs/:songId",
  protect,
  authorize("listener", "artist"),
  recordSongPlay
);

module.exports = router;