const express = require("express");
const router = express.Router();

const {
  addSongToRelease,
  getPublicSongs,
  getPublicSongById,
} = require("../controllers/songController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");


// Public - get all approved songs
router.get(
  "/",
  getPublicSongs
);


// Artist - add song to release
router.post(
  "/release/:releaseId",
  protect,
  authorize("artist"),
  addSongToRelease
);

router.get(
  "/release/:releaseId",
  protect,
  authorize("artist"),
  getSongsByReleaseForArtist
);

// Public - get one approved song
router.get(
  "/:songId",
  getPublicSongById
);


module.exports = router;