const express = require("express");
const router = express.Router();

const {
  createVideo,
  submitVideoForReview,
  getMyVideos,
  updateMyVideo,
  getPendingVideos,
  approveVideo,
  rejectVideo,
  getPublicVideos,
  getPublicVideoById,
} = require("../controllers/videoController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");


// Public - all approved videos
router.get(
  "/",
  getPublicVideos
);


// Admin - pending videos
router.get(
  "/pending",
  protect,
  authorize("admin", "superadmin"),
  getPendingVideos
);


// Artist - create video
router.post(
  "/",
  protect,
  authorize("artist"),
  createVideo
);


// Artist - submit video
router.patch(
  "/:videoId/submit",
  protect,
  authorize("artist"),
  submitVideoForReview
);


// Admin - approve video
router.patch(
  "/:videoId/approve",
  protect,
  authorize("admin", "superadmin"),
  approveVideo
);


// Admin - reject video
router.patch(
  "/:videoId/reject",
  protect,
  authorize("admin", "superadmin"),
  rejectVideo
);

router.patch(
  "/:videoId",
  protect,
  authorize("artist"),
  updateMyVideo
);

// Artist - view own videos
router.get(
  "/mine",
  protect,
  authorize("artist"),
  getMyVideos
);

// Public - one approved video
router.get(
  "/:videoId",
  getPublicVideoById
);


module.exports = router;