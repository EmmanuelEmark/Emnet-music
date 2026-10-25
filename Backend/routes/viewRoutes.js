const express = require("express");
const router = express.Router();

const {
  recordVideoView,
} = require("../controllers/viewController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

router.post(
  "/videos/:videoId",
  protect,
  authorize("listener", "artist"),
  recordVideoView
);

module.exports = router;