
const express = require("express");
const router = express.Router();

const {
  getVideoLikeCount,
  getMyVideoLike,
  likeVideo,
  unlikeVideo,
} = require("../controllers/videoLikeController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

// Anyone can see the number of likes.
router.get("/:videoId", getVideoLikeCount);

// Only listeners can manage their own likes.
router.get(
  "/:videoId/me",
  protect,
  authorize("listener"),
  getMyVideoLike
);

router.post(
  "/:videoId",
  protect,
  authorize("listener"),
  likeVideo
);

router.delete(
  "/:videoId",
  protect,
  authorize("listener"),
  unlikeVideo
);

module.exports = router;
