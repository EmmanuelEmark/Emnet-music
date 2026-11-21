const express = require("express");

const router = express.Router();

// ==========================================
// MODERATION CONTROLLERS
// ==========================================

const {
  // Artist account management.

  verifyArtist,
  unverifyArtist,
  suspendArtist,
  restoreArtist,

  // Artist profile visibility.

  hideArtistProfile,
  restoreArtistProfile,
  takedownArtistProfile,
  reverseArtistTakedown,

  // Song moderation.

  hideSong,
  restoreSong,
  takedownSong,
  reverseSongTakedown,

  // Release moderation.

  hideRelease,
  restoreRelease,
  takedownRelease,
  reverseReleaseTakedown,

  // Video moderation.

  hideVideo,
  restoreVideo,
  takedownVideo,
  reverseVideoTakedown,

} = require(
  "../controllers/moderationController"
);

// ==========================================
// AUTHENTICATION AND AUTHORIZATION
// ==========================================

const {
  protect,

  requireAdmin,

  requireSuperAdmin,

} = require(
  "../middleware/authMiddleware"
);

// ==========================================
// PREVENT RESPONSE CACHING
// ==========================================

router.use((req, res, next) => {
  res.set(
    "Cache-Control",
    "private, no-store"
  );

  res.set(
    "Referrer-Policy",
    "no-referrer"
  );

  next();
});

// ==========================================
// PROTECT ALL MODERATION ROUTES
//
// Only Admin and Super Admin accounts
// can access this router.
// ==========================================

router.use(
  protect,

  requireAdmin
);

// ==========================================
// ARTIST ACCOUNT MANAGEMENT
//
// ADMIN AND SUPER ADMIN
// ==========================================

// Verify artist.

router.patch(
  "/artists/:artistId/verify",

  verifyArtist
);

// Remove artist verification.

router.patch(
  "/artists/:artistId/unverify",

  unverifyArtist
);

// Suspend artist privileges.

router.patch(
  "/artists/:artistId/suspend",

  suspendArtist
);

// Restore suspended artist privileges.

router.patch(
  "/artists/:artistId/restore",

  restoreArtist
);

// ==========================================
// ARTIST PROFILE VISIBILITY MODERATION
//
// Separate from artist account suspension
// and restoration.
// ==========================================

// Hide artist profile.

router.patch(
  "/artists/:artistId/hide",

  hideArtistProfile
);

// Restore hidden artist profile.
//
// The restore-profile endpoint is separate
// from the artist account restore endpoint.

router.patch(
  "/artists/:artistId/restore-profile",

  restoreArtistProfile
);

// Take down artist profile.

router.patch(
  "/artists/:artistId/takedown",

  takedownArtistProfile
);

// Reverse artist profile takedown.
//
// SUPER ADMIN ONLY.

router.patch(
  "/artists/:artistId/reverse-takedown",

  requireSuperAdmin,

  reverseArtistTakedown
);

// ==========================================
// SONG MODERATION
// ==========================================

// Hide published song.

router.patch(
  "/songs/:songId/hide",

  hideSong
);

// Restore hidden song.

router.patch(
  "/songs/:songId/restore",

  restoreSong
);

// Take down published song.

router.patch(
  "/songs/:songId/takedown",

  takedownSong
);

// Reverse song takedown.
//
// SUPER ADMIN ONLY.

router.patch(
  "/songs/:songId/reverse-takedown",

  requireSuperAdmin,

  reverseSongTakedown
);

// ==========================================
// RELEASE MODERATION
//
// Applies to singles, EPs and albums.
// ==========================================

// Hide published release.

router.patch(
  "/releases/:releaseId/hide",

  hideRelease
);

// Restore hidden release.

router.patch(
  "/releases/:releaseId/restore",

  restoreRelease
);

// Take down published release.

router.patch(
  "/releases/:releaseId/takedown",

  takedownRelease
);

// Reverse release takedown.
//
// SUPER ADMIN ONLY.

router.patch(
  "/releases/:releaseId/reverse-takedown",

  requireSuperAdmin,

  reverseReleaseTakedown
);

// ==========================================
// VIDEO MODERATION
// ==========================================

// Hide published video.

router.patch(
  "/videos/:videoId/hide",

  hideVideo
);

// Restore hidden video.

router.patch(
  "/videos/:videoId/restore",

  restoreVideo
);

// Take down published video.

router.patch(
  "/videos/:videoId/takedown",

  takedownVideo
);

// Reverse video takedown.
//
// SUPER ADMIN ONLY.

router.patch(
  "/videos/:videoId/reverse-takedown",

  requireSuperAdmin,

  reverseVideoTakedown
);

// ==========================================
// EXPORT MODERATION ROUTER
// ==========================================

module.exports = router;