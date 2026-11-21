
const express = require("express");

const router = express.Router();

const {
  addSongToRelease,
  updateSongDraft,
  deleteSongDraft,
  getPublicSongs,
  getPublicSongById,
  getSongsByReleaseForArtist,
} = require("../controllers/songController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

// ========================================
// PUBLIC — ALL PUBLISHED SONGS
// ========================================

router.get(
  "/",
  getPublicSongs
);

// ========================================
// ARTIST — CREATE A SONG DRAFT
// ========================================

router.post(
  "/release/:releaseId",
  protect,
  authorize("artist"),
  addSongToRelease
);

// ========================================
// ARTIST — VIEW SONGS IN OWN RELEASE
// ========================================

router.get(
  "/release/:releaseId",
  protect,
  authorize("artist"),
  getSongsByReleaseForArtist
);

// ========================================
// ARTIST — UPDATE A SONG DRAFT
// ========================================

router.patch(
  "/release/:releaseId/:songId",
  protect,
  authorize("artist"),
  updateSongDraft
);

// ========================================
// ARTIST — DELETE A SONG DRAFT
// ========================================

router.delete(
  "/release/:releaseId/:songId",
  protect,
  authorize("artist"),
  deleteSongDraft
);

// ========================================
// PUBLIC — ONE PUBLISHED SONG
// ========================================

router.get(
  "/:songId",
  getPublicSongById
);

module.exports = router;
