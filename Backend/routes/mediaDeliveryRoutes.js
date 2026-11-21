
const express = require("express");

const router = express.Router();

// ========================================
// AUTHENTICATION AND AUTHORIZATION
// ========================================

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

// ========================================
// MEDIA DELIVERY CONTROLLERS
// ========================================

const {
  // PUBLIC MEDIA CONTROLLERS

  getSongPlaybackUrl,
  getReleaseArtworkUrl,
  getVideoThumbnailUrl,
  getVideoPlaybackUrl,
  getArtistProfileImageUrl,
  getArtistCoverImageUrl,

  // PRIVATE ARTIST PREVIEW CONTROLLERS

  getArtistSongPreviewUrl,
  getArtistReleaseArtworkPreviewUrl,
  getArtistVideoPreviewUrl,
  getArtistVideoThumbnailPreviewUrl,

} = require("../controllers/mediaDeliveryController");

// ========================================
// PRIVATE ARTIST MEDIA PREVIEWS
//
// All private preview endpoints require:
// 1. Authentication
// 2. Artist authorization
// 3. Content ownership verification
// 4. Media ownership verification
// ========================================

// ========================================
// PRIVATE SONG AUDIO PREVIEW
//
// GET /api/media/artist/songs/:songId/preview
// ========================================

router.get(
  "/artist/songs/:songId/preview",

  protect,

  authorize("artist"),

  getArtistSongPreviewUrl
);

// ========================================
// PRIVATE RELEASE ARTWORK PREVIEW
//
// GET /api/media/artist/releases/:releaseId/artwork
// ========================================

router.get(
  "/artist/releases/:releaseId/artwork",

  protect,

  authorize("artist"),

  getArtistReleaseArtworkPreviewUrl
);

// ========================================
// PRIVATE VIDEO PREVIEW
//
// GET /api/media/artist/videos/:videoId/preview
// ========================================

router.get(
  "/artist/videos/:videoId/preview",

  protect,

  authorize("artist"),

  getArtistVideoPreviewUrl
);

// ========================================
// PRIVATE VIDEO THUMBNAIL PREVIEW
//
// GET /api/media/artist/videos/:videoId/thumbnail
// ========================================

router.get(
  "/artist/videos/:videoId/thumbnail",

  protect,

  authorize("artist"),

  getArtistVideoThumbnailPreviewUrl
);

// ========================================
// PUBLIC MEDIA DELIVERY ROUTES
//
// Only published and visible content
// can be accessed through these routes.
// ========================================

// ========================================
// PUBLIC AUDIO PLAYBACK
//
// GET /api/media/songs/:songId/play
// ========================================

router.get(
  "/songs/:songId/play",

  getSongPlaybackUrl
);

// ========================================
// PUBLIC RELEASE ARTWORK
//
// GET /api/media/releases/:releaseId/artwork
// ========================================

router.get(
  "/releases/:releaseId/artwork",

  getReleaseArtworkUrl
);

// ========================================
// PUBLIC VIDEO THUMBNAIL
//
// GET /api/media/videos/:videoId/thumbnail
// ========================================

router.get(
  "/videos/:videoId/thumbnail",

  getVideoThumbnailUrl
);

// ========================================
// PUBLIC VIDEO PLAYBACK
//
// GET /api/media/videos/:videoId/play
// ========================================

router.get(
  "/videos/:videoId/play",

  getVideoPlaybackUrl
);

// ========================================
// PUBLIC ARTIST PROFILE PICTURE
//
// GET /api/media/artists/:artistId/profile
// ========================================

router.get(
  "/artists/:artistId/profile",

  getArtistProfileImageUrl
);

// ========================================
// PUBLIC ARTIST COVER PHOTO
//
// GET /api/media/artists/:artistId/cover
// ========================================

router.get(
  "/artists/:artistId/cover",

  getArtistCoverImageUrl
);

// ========================================
// EXPORT ROUTER
// ========================================

module.exports = router;