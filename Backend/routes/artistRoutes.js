
const express = require("express");

const router = express.Router();

// ==========================================
// ARTIST MANAGEMENT CONTROLLERS
// ==========================================

const {
  getPendingArtists,

  approveArtist,

  rejectArtist,

  getMyArtistProfile,

  updateMyArtistProfile,

  getPublicArtistProfile,

  featureArtist,

  unfeatureArtist,

  getAdminArtists,

  searchArtistsForCollaboration,

  resolveSelectedArtists,

} = require("../controllers/artistController");

// ==========================================
// ARTIST APPLICATION CONTROLLERS
// ==========================================

const {
  applyAsArtist,

  getMyArtistApplication,

} = require(
  "../controllers/artistApplicationController"
);

// ==========================================
// AUTHENTICATION AND AUTHORIZATION
// ==========================================

const {
  protect,

  authorize,

  requireAdmin,

} = require("../middleware/authMiddleware");

// ==========================================
// PREVENT PRIVATE RESPONSE CACHING
// ==========================================

function preventPrivateCaching(
  req,
  res,
  next
) {
  res.set(
    "Cache-Control",
    "private, no-store"
  );

  next();
}

// ==========================================
// ARTIST APPLICATION
// ==========================================

// ==========================================
// APPLY TO BECOME AN ARTIST
//
// POST /api/artists/apply
//
// Active listener accounts only.
// ==========================================

router.post(
  "/apply",

  protect,

  authorize("listener"),

  preventPrivateCaching,

  applyAsArtist
);

// ==========================================
// CHECK MY ARTIST APPLICATION STATUS
//
// GET /api/artists/application-status
// ==========================================

router.get(
  "/application-status",

  protect,

  authorize("listener", "artist"),

  preventPrivateCaching,

  getMyArtistApplication
);

// ==========================================
// ARTIST COLLABORATION MANAGEMENT
// ==========================================

// ==========================================
// SEARCH ARTISTS FOR COLLABORATION
//
// GET /api/artists/search?q=stageName
//
// Artist accounts only.
// ==========================================

router.get(
  "/search",

  protect,

  authorize("artist"),

  preventPrivateCaching,

  searchArtistsForCollaboration
);

// ==========================================
// RESOLVE SAVED ARTIST SELECTIONS
//
// POST /api/artists/selection/resolve
// ==========================================

router.post(
  "/selection/resolve",

  protect,

  authorize("artist"),

  preventPrivateCaching,

  resolveSelectedArtists
);

// ==========================================
// ARTIST PROFILE MANAGEMENT
// ==========================================

// ==========================================
// GET MY ARTIST PROFILE
//
// GET /api/artists/me
// ==========================================

router.get(
  "/me",

  protect,

  authorize("artist"),

  preventPrivateCaching,

  getMyArtistProfile
);

// ==========================================
// UPDATE MY ARTIST PROFILE
//
// PATCH /api/artists/me
// ==========================================

router.patch(
  "/me",

  protect,

  authorize("artist"),

  preventPrivateCaching,

  updateMyArtistProfile
);

// ==========================================
// ADMINISTRATIVE ARTIST MANAGEMENT
//
// Available to:
// - Admin
// - Super Admin
// ==========================================

// ==========================================
// GET ALL ARTISTS
//
// GET /api/artists/admin
//
// Supports:
// - Search
// - Pagination
// - Approval status
// - Visibility status
// - Verification status
// - Featured status
// ==========================================

router.get(
  "/admin",

  protect,

  requireAdmin,

  preventPrivateCaching,

  getAdminArtists
);

// ==========================================
// GET PENDING ARTIST APPLICATIONS
//
// GET /api/artists/pending
// ==========================================

router.get(
  "/pending",

  protect,

  requireAdmin,

  preventPrivateCaching,

  getPendingArtists
);

// ==========================================
// APPROVE ARTIST APPLICATION
//
// PATCH /api/artists/:id/approve
//
// The controller handles:
// - Artist approval
// - User role assignment
// - Session revocation
// - Administrative activity logging
// ==========================================

router.patch(
  "/:id/approve",

  protect,

  requireAdmin,

  preventPrivateCaching,

  approveArtist
);

// ==========================================
// REJECT ARTIST APPLICATION
//
// PATCH /api/artists/:id/reject
// ==========================================

router.patch(
  "/:id/reject",

  protect,

  requireAdmin,

  preventPrivateCaching,

  rejectArtist
);

// ==========================================
// FEATURED ARTIST MANAGEMENT
// ==========================================

// ==========================================
// FEATURE ARTIST
//
// PATCH /api/artists/:artistId/feature
// ==========================================

router.patch(
  "/:artistId/feature",

  protect,

  requireAdmin,

  preventPrivateCaching,

  featureArtist
);

// ==========================================
// REMOVE ARTIST FROM FEATURED ARTISTS
//
// PATCH /api/artists/:artistId/unfeature
// ==========================================

router.patch(
  "/:artistId/unfeature",

  protect,

  requireAdmin,

  preventPrivateCaching,

  unfeatureArtist
);

// ==========================================
// PUBLIC ARTIST PROFILE
//
// GET /api/artists/profile/:artistId
//
// Available to both guests and
// authenticated platform users.
//
// The controller only returns approved
// and visible artist profiles.
// ==========================================

router.get(
  "/profile/:artistId",

  getPublicArtistProfile
);

// ==========================================
// EXPORT ARTIST ROUTER
// ==========================================

module.exports = router;
