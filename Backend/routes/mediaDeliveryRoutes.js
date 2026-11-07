
const express = require("express");

const router = express.Router();

const {
  getSongPlaybackUrl,
  getReleaseArtworkUrl,
  getVideoThumbnailUrl,
  getVideoPlaybackUrl,
  getArtistProfileImageUrl,
  getArtistCoverImageUrl,
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

// ========================================
// ARTIST PROFILE PICTURE
// GET /api/media/artists/:artistId/profile
// ========================================

router.get(
  "/artists/:artistId/profile",
  getArtistProfileImageUrl
);

// ========================================
// ARTIST COVER PHOTO
// GET /api/media/artists/:artistId/cover
// ========================================

router.get(
  "/artists/:artistId/cover",
  getArtistCoverImageUrl
);

module.exports = router;
