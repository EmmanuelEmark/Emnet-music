const express = require("express");
const router = express.Router();

const {
  likeSong,
  unlikeSong,
  followArtist,
  unfollowArtist,
  getLikedSongs,
  getFollowedArtists,
  toggleArtistNotifications,
} = require("../controllers/listenerController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");


// Get user's liked songs
router.get(
  "/likes",
  protect,
  authorize("listener", "artist"),
  getLikedSongs
);


// Like a song
router.post(
  "/likes/:songId",
  protect,
  authorize("listener", "artist"),
  likeSong
);


// Unlike a song
router.delete(
  "/likes/:songId",
  protect,
  authorize("listener", "artist"),
  unlikeSong
);


// Get artists the user follows
router.get(
  "/follows",
  protect,
  authorize("listener", "artist"),
  getFollowedArtists
);


// Follow an artist
router.post(
  "/follows/:artistId",
  protect,
  authorize("listener", "artist"),
  followArtist
);


// Unfollow an artist
router.delete(
  "/follows/:artistId",
  protect,
  authorize("listener", "artist"),
  unfollowArtist
);


router.patch(
  "/follows/:artistId/notifications",
  protect,
  authorize("listener", "artist"),
  toggleArtistNotifications
);

module.exports = router;