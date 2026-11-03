
const express = require("express");

const router = express.Router();

const {
  getSongPlaybackUrl,
  getReleaseArtworkUrl,
  getVideoThumbnailUrl,
  getVideoPlaybackUrl,
} = require("../controllers/mediaDeliveryController");

// ========================================
// AUDIO PLAYBACK
// ========================================

router.get(
  "/songs/:songId/play",
  getSongPlaybackUrl
);

// ========================================
// RELEASE ARTWORK
// ========================================

router.get(
  "/releases/:releaseId/artwork",
  getReleaseArtworkUrl
);

// ========================================
// VIDEO THUMBNAIL
// ========================================

router.get(
  "/videos/:videoId/thumbnail",
  getVideoThumbnailUrl
);

// ========================================
// VIDEO PLAYBACK
// ========================================

router.get(
  "/videos/:videoId/play",
  getVideoPlaybackUrl
);

module.exports = router;
