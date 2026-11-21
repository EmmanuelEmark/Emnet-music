const express = require("express");

const router = express.Router();

// ==========================================
// AUTHENTICATION AND AUTHORIZATION
// ==========================================

const {
  protect,
  requireSuperAdmin,
} = require("../middleware/authMiddleware");

// ==========================================
// ADMIN ACTIVITY CONTROLLER
// ==========================================

const {
  getAdminActivities,
  getAdminActivityById,
} = require("../controllers/adminActivityController");

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
// PROTECT ALL ADMIN ACTIVITY ROUTES
//
// Only authenticated Super Admin accounts
// can access administrative activity logs.
// ==========================================

router.use(
  protect,
  requireSuperAdmin
);

// ==========================================
// GET ALL ADMINISTRATIVE ACTIVITY LOGS
//
// GET /api/admin/activity-logs
// ==========================================

router.get(
  "/",
  getAdminActivities
);

// ==========================================
// GET SINGLE ADMINISTRATIVE ACTIVITY LOG
//
// GET /api/admin/activity-logs/:activityId
// ==========================================

router.get(
  "/:activityId",
  getAdminActivityById
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;