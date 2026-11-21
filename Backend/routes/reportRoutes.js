const express = require("express");

const router = express.Router();

// ==========================================
// REPORT CONTROLLERS
// ==========================================

const {
  createReport,

  getReports,

  markReportReviewing,

  closeReport,

  moderateContent,

} = require("../controllers/reportController");

// ==========================================
// AUTHENTICATION AND AUTHORIZATION
// ==========================================

const {
  protect,

  authorize,

  requireAdmin,

} = require("../middleware/authMiddleware");

// ==========================================
// PREVENT RESPONSE CACHING
//
// Reports may contain private information
// and sensitive copyright complaints.
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
// AUTHENTICATE ALL REPORT REQUESTS
//
// Guest visitors cannot submit reports
// or access administrative reports.
// ==========================================

router.use(protect);

// ==========================================
// SUBMIT CONTENT REPORT
//
// POST /api/reports
//
// ACCESS:
// - Listener
// - Artist
//
// Supported targets:
// - Artist
// - Song
// - Release
// - Video
// ==========================================

router.post(
  "/",

  authorize(
    "listener",

    "artist"
  ),

  createReport
);

// ==========================================
// PROTECT ADMINISTRATIVE REPORT ROUTES
//
// All routes below this middleware
// require Admin or Super Admin access.
// ==========================================

router.use(requireAdmin);

// ==========================================
// GET REPORTS
//
// GET /api/reports
//
// Supported query parameters:
// - status
// - targetType
// - reason
// - targetId
// - reportedBy
// - reviewedBy
// - page
// - limit
//
// ACCESS:
// - Admin
// - Super Admin
// ==========================================

router.get(
  "/",

  getReports
);

// ==========================================
// MODERATE REPORTED CONTENT
//
// PATCH /api/reports/moderate/
//       :targetType/:targetId
//
// Supported actions:
// - hide
// - restore
// - takedown
// - reverse-takedown
//
// Legacy actions:
// - hidden
// - visible
//
// Copyright takedown reversal is restricted
// to Super Admin by the controller and
// centralized moderation service.
// ==========================================

router.patch(
  "/moderate/:targetType/:targetId",

  moderateContent
);

// ==========================================
// MARK REPORT AS REVIEWING
//
// PATCH /api/reports/:reportId/review
//
// ACCESS:
// - Admin
// - Super Admin
//
// Moves a pending report to reviewing.
// ==========================================

router.patch(
  "/:reportId/review",

  markReportReviewing
);

// ==========================================
// CLOSE REPORT
//
// PATCH /api/reports/:reportId/close
//
// ACCESS:
// - Admin
// - Super Admin
//
// Supported decisions:
// - resolved
// - dismissed
//
// A resolution reason is required.
//
// Closing a report does not automatically
// restore or restrict reported content.
// ==========================================

router.patch(
  "/:reportId/close",

  closeReport
);

// ==========================================
// EXPORT REPORT ROUTER
// ==========================================

module.exports = router;