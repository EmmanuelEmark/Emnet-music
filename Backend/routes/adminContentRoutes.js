const express = require("express");

const router = express.Router();

// ==========================================
// ADMIN CONTENT CONTROLLERS
// ==========================================

const {
  getAdminSongs,
  getAdminReleases,
  getAdminVideos,
  getAdminContentArtists,
  getAdminContentStats,
} = require("../controllers/adminContentController");

// ==========================================
// AUTHENTICATION AND AUTHORIZATION
// ==========================================

const {
  protect,
  requireAdmin,
} = require("../middleware/authMiddleware");

// ==========================================
// SECURITY HEADERS
// ==========================================

router.use((req, res, next) => {
  res.set(
    "Cache-Control",
    "private, no-store, max-age=0"
  );

  res.set(
    "Referrer-Policy",
    "no-referrer"
  );

  next();
});

// ==========================================
// PROTECT ALL ADMIN CONTENT ROUTES
//
// Access:
// - Admin
// - Super Admin
// ==========================================

router.use(protect, requireAdmin);

// ==========================================
// CONTENT DASHBOARD STATISTICS
//
// GET /api/admin/content/stats
// ==========================================

router.get(
  "/stats",
  getAdminContentStats
);

// ==========================================
// ARTIST MANAGEMENT
//
// GET /api/admin/content/artists
// ==========================================

router.get(
  "/artists",
  getAdminContentArtists
);

// ==========================================
// SONG MANAGEMENT
//
// GET /api/admin/content/songs
// ==========================================

router.get(
  "/songs",
  getAdminSongs
);

// ==========================================
// RELEASE MANAGEMENT
//
// GET /api/admin/content/releases
// ==========================================

router.get(
  "/releases",
  getAdminReleases
);

// ==========================================
// VIDEO MANAGEMENT
//
// GET /api/admin/content/videos
// ==========================================

router.get(
  "/videos",
  getAdminVideos
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;