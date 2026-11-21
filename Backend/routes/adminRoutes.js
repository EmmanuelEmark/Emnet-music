const express = require("express");

const router = express.Router();

// ==========================================
// ADMINISTRATIVE SUB-ROUTERS
// ==========================================

const moderationRoutes = require(
  "./moderationRoutes"
);

const adminActivityRoutes = require(
  "./adminActivityRoutes"
);

const adminContentRoutes = require("./adminContentRoutes");


// ==========================================
// ADMIN CONTROLLER
// ==========================================

const {
  // Administrator management.

  getAdmins,

  promoteToAdmin,

  suspendAdmin,

  reactivateAdmin,

  removeAdminRole,

  // Dashboard statistics.

  getDashboardStats,

  // Platform user management.

  getUsers,

  suspendUser,

  reactivateUser,

} = require("../controllers/adminController");

// ==========================================
// ADMIN INVITATION CONTROLLER
// ==========================================

const {
  createAdminInvitation,

  getAdminInvitations,

} = require(
  "../controllers/adminInviteController"
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


const {
  getAdminDashboardOverview,
} = require("../controllers/adminDashboardController");
// ==========================================
// PREVENT ADMINISTRATIVE RESPONSE CACHING
//
// Administrative responses may contain
// private and sensitive information.
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
// PROTECT ALL ADMINISTRATIVE ROUTES
//
// Only authenticated Admin and Super Admin
// accounts may access this router.
// ==========================================

router.use(
  protect,

  requireAdmin
);

// ==========================================
// SUPER ADMIN DASHBOARD
//
// GET /api/admin/dashboard/stats
//
// SUPER ADMIN ONLY
// ==========================================

router.get(
  "/dashboard/stats",

  requireSuperAdmin,

  getDashboardStats
);

// ==========================================
// ADMIN AND SUPER ADMIN DASHBOARD OVERVIEW
// ==========================================

router.get(
  "/dashboard/overview",

  requireAdmin,

  getAdminDashboardOverview
);

// ==========================================
// PLATFORM USER MANAGEMENT
//
// Available to:
// - Admin
// - Super Admin
//
// Ordinary user management controllers
// must exclude administrative accounts.
// ==========================================

// ==========================================
// GET PLATFORM USERS
//
// GET /api/admin/users
// ==========================================

router.get(
  "/users",

  getUsers
);

// ==========================================
// SUSPEND ORDINARY PLATFORM USER
//
// PATCH /api/admin/users/:userId/suspend
// ==========================================

router.patch(
  "/users/:userId/suspend",

  suspendUser
);

// ==========================================
// REACTIVATE ORDINARY PLATFORM USER
//
// PATCH /api/admin/users/:userId/reactivate
// ==========================================

router.patch(
  "/users/:userId/reactivate",

  reactivateUser
);

// ==========================================
// ADMINISTRATOR INVITATIONS
//
// SUPER ADMIN ONLY
// ==========================================

// ==========================================
// CREATE ADMINISTRATOR INVITATION
//
// POST /api/admin/invitations
// ==========================================

router.post(
  "/invitations",

  requireSuperAdmin,

  createAdminInvitation
);

// ==========================================
// GET ADMINISTRATOR INVITATIONS
//
// GET /api/admin/invitations
// ==========================================

router.get(
  "/invitations",

  requireSuperAdmin,

  getAdminInvitations
);

// ==========================================
// ADMINISTRATIVE ACTIVITY LOGS
//
// GET /api/admin/activity-logs
//
// GET /api/admin/activity-logs/:activityId
//
// SUPER ADMIN ONLY
//
// Ordinary administrators must not have
// access to administrative audit records.
// ==========================================

router.use(
  "/activity-logs",

  requireSuperAdmin,

  adminActivityRoutes
);

// ==========================================
// PLATFORM CONTENT MODERATION
//
// Available to:
// - Admin
// - Super Admin
//
// Includes:
// - Artist verification
// - Artist suspension and restoration
// - Artist profile moderation
// - Song moderation
// - Release moderation
// - Video moderation
//
// Takedown reversal requires Super Admin
// authorization inside the moderation router
// and centralized moderation service.
// ==========================================

router.use(
  "/moderation",

  moderationRoutes
);



// ==========================================
// ADMINISTRATIVE CONTENT MANAGEMENT
//
// Access:
// - Admin
// - Super Admin
// ==========================================

router.use(
  "/content",
  adminContentRoutes
);


// ==========================================
// ADMINISTRATOR ACCOUNT MANAGEMENT
//
// SUPER ADMIN ONLY
// ==========================================

// ==========================================
// GET ADMINISTRATORS
//
// GET /api/admin
// ==========================================

router.get(
  "/",

  requireSuperAdmin,

  getAdmins
);

// ==========================================
// LEGACY ADMIN PROMOTION
//
// PATCH /api/admin/users/:userId/promote
//
// Retained for compatibility.
//
// Secure administrator invitations remain
// the preferred method for creating admins.
// ==========================================

router.patch(
  "/users/:userId/promote",

  requireSuperAdmin,

  promoteToAdmin
);

// ==========================================
// SUSPEND ADMINISTRATOR
//
// PATCH /api/admin/:adminId/suspend
// ==========================================

router.patch(
  "/:adminId/suspend",

  requireSuperAdmin,

  suspendAdmin
);

// ==========================================
// REACTIVATE ADMINISTRATOR
//
// PATCH /api/admin/:adminId/reactivate
// ==========================================

router.patch(
  "/:adminId/reactivate",

  requireSuperAdmin,

  reactivateAdmin
);

// ==========================================
// REMOVE ADMINISTRATIVE PRIVILEGES
//
// PATCH /api/admin/:adminId/remove-role
// ==========================================

router.patch(
  "/:adminId/remove-role",

  requireSuperAdmin,

  removeAdminRole
);

// ==========================================
// EXPORT ADMIN ROUTER
// ==========================================

module.exports = router;