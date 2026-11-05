const express = require("express");

const router = express.Router();

const {
  applyAsArtist,
  getPendingArtists,
  approveArtist,
  rejectArtist,
  getMyArtistProfile,
  updateMyArtistProfile,
  getPublicArtistProfile,
  featureArtist,
  unfeatureArtist,
} = require("../controllers/artistController");


const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

router.post(
  "/apply",
  protect,
  applyAsArtist
);

router.get(
  "/me",
  protect,
  authorize("artist"),
  getMyArtistProfile
);


router.patch(
  "/me",
  protect,
  authorize("artist"),
  updateMyArtistProfile
);


router.get(
  "/pending",
  protect,
  authorize("admin", "superadmin"),
  getPendingArtists
);

router.patch(
  "/:id/approve",
  protect,
  authorize("admin", "superadmin"),
  approveArtist
);

router.patch(
  "/:id/reject",
  protect,
  authorize("admin", "superadmin"),
  rejectArtist
);

router.patch(
  "/:artistId/feature",
  protect,
  authorize("admin", "superadmin"),
  featureArtist
);

router.patch(
  "/:artistId/unfeature",
  protect,
  authorize("admin", "superadmin"),
  unfeatureArtist
);

router.get(
  "/profile/:artistId",
  getPublicArtistProfile
);

module.exports = router;