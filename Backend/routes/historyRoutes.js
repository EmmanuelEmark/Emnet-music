const express = require("express");
const router = express.Router();

const {
  recordListeningHistory,
  getRecentlyPlayed,
} = require("../controllers/historyController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");


router.post(
  "/songs/:songId",
  protect,
  authorize("listener", "artist"),
  recordListeningHistory
);


router.get(
  "/recent",
  protect,
  authorize("listener", "artist"),
  getRecentlyPlayed
);


module.exports = router;