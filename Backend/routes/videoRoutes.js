
const express = require("express");

const router = express.Router();

const {
  createVideo,

  getMyVideos,
  getMyVideoById,

  updateMyVideo,
  deleteVideoDraft,

  submitVideoForReview,

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

// ========================================
// PUBLIC — GET PUBLISHED VIDEOS
// ========================================

router.get(
  "/",
  getPublicVideos
);

// ========================================
// ARTIST — CREATE VIDEO DRAFT
// ========================================

router.post(
  "/",
  protect,
  authorize("artist"),
  createVideo
);

// ========================================
// ARTIST — GET OWN VIDEOS
// ========================================

router.get(
  "/mine",
  protect,
  authorize("artist"),
  getMyVideos
);

// ========================================
// ARTIST — GET ONE OWN VIDEO
// ========================================

router.get(
  "/mine/:videoId",
  protect,
  authorize("artist"),
  getMyVideoById
);

// ========================================
// ADMIN — LEGACY PENDING VIDEOS
// ========================================

router.get(
  "/pending",
  protect,
  authorize(
    "admin",
    "superadmin"
  ),
  getPendingVideos
);

// ========================================
// ARTIST — PUBLISH VIDEO IMMEDIATELY
// ========================================

router.patch(
  "/:videoId/publish",
  protect,
  authorize("artist"),
  submitVideoForReview
);

// ========================================
// LEGACY PUBLISH ENDPOINT
//
// Retained for existing integrations.
// Both routes now publish immediately.
// ========================================

router.patch(
  "/:videoId/submit",
  protect,
  authorize("artist"),
  submitVideoForReview
);

// ========================================
// ADMIN — APPROVE LEGACY PENDING VIDEO
// ========================================

router.patch(
  "/:videoId/approve",
  protect,
  authorize(
    "admin",
    "superadmin"
  ),
  approveVideo
);

// ========================================
// ADMIN — REJECT LEGACY PENDING VIDEO
// ========================================

router.patch(
  "/:videoId/reject",
  protect,
  authorize(
    "admin",
    "superadmin"
  ),
  rejectVideo
);

// ========================================
// ARTIST — UPDATE VIDEO DRAFT
// ========================================

router.patch(
  "/:videoId",
  protect,
  authorize("artist"),
  updateMyVideo
);

// ========================================
// ARTIST — DELETE VIDEO DRAFT
// ========================================

router.delete(
  "/:videoId",
  protect,
  authorize("artist"),
  deleteVideoDraft
);

// ========================================
// PUBLIC — GET ONE PUBLISHED VIDEO
// ========================================

router.get(
  "/:videoId",
  getPublicVideoById
);

module.exports = router;