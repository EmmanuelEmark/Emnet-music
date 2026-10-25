const express = require("express");
const router = express.Router();

const {
  createPlaylist,
  getMyPlaylists,
  getMyPlaylistById,
  addSongToPlaylist,
  removeSongFromPlaylist,
  updatePlaylist,
  deletePlaylist,
} = require("../controllers/playlistController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");


router.post(
  "/",
  protect,
  authorize("listener", "artist"),
  createPlaylist
);


router.get(
  "/",
  protect,
  authorize("listener", "artist"),
  getMyPlaylists
);


router.get(
  "/:playlistId",
  protect,
  authorize("listener", "artist"),
  getMyPlaylistById
);


router.post(
  "/:playlistId/songs/:songId",
  protect,
  authorize("listener", "artist"),
  addSongToPlaylist
);


router.delete(
  "/:playlistId/songs/:songId",
  protect,
  authorize("listener", "artist"),
  removeSongFromPlaylist
);


router.patch(
  "/:playlistId",
  protect,
  authorize("listener", "artist"),
  updatePlaylist
);


router.delete(
  "/:playlistId",
  protect,
  authorize("listener", "artist"),
  deletePlaylist
);


module.exports = router;