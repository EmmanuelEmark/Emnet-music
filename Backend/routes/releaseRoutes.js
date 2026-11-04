const express =
  require("express");

const router =
  express.Router();


const {

  createRelease,

  getMyReleases,
  getMyReleaseById,
  getReleaseById,

  getPublicReleases,

  submitReleaseForReview,

  getPendingReleases,

  approveRelease,

  rejectRelease,

} = require(
  "../controllers/releaseController"
);


const {

  protect,

  authorize,

} = require(
  "../middleware/authMiddleware"
);


/* ========================================
   ARTIST - CREATE RELEASE
======================================== */

router.post(
  "/",
  protect,
  authorize("artist"),
  createRelease
);


/* ========================================
   PUBLIC - GET APPROVED RELEASES
======================================== */

router.get(
  "/",
  getPublicReleases
);


/* ========================================
   ARTIST - GET THEIR OWN RELEASES
======================================== */

router.get(
  "/mine",
  protect,
  authorize("artist"),
  getMyReleases
);



/* ========================================
   ARTIST - GET ONE OWN RELEASE
======================================== */

router.get(
  "/mine/:releaseId",
  protect,
  authorize("artist"),
  getMyReleaseById
);




/* ========================================
   ADMIN - GET PENDING RELEASES
======================================== */

router.get(
  "/pending",
  protect,
  authorize(
    "admin",
    "superadmin"
  ),
  getPendingReleases
);


/* ========================================
   ARTIST - SUBMIT RELEASE
======================================== */

router.patch(
  "/:releaseId/submit",
  protect,
  authorize("artist"),
  submitReleaseForReview
);


/* ========================================
   ADMIN - APPROVE RELEASE
======================================== */

router.patch(
  "/:releaseId/approve",
  protect,
  authorize(
    "admin",
    "superadmin"
  ),
  approveRelease
);


/* ========================================
   ADMIN - REJECT RELEASE
======================================== */

router.patch(
  "/:releaseId/reject",
  protect,
  authorize(
    "admin",
    "superadmin"
  ),
  rejectRelease
);


/* ========================================
   PUBLIC - GET ONE RELEASE
======================================== */

router.get(
  "/:releaseId",
  getReleaseById
);


module.exports =
  router;