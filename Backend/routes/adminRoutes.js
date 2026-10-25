const express = require("express");

const router = express.Router();


/* ========================================
   ADMIN CONTROLLER
======================================== */

const {
  getAdmins,
  promoteToAdmin,
  suspendAdmin,
  reactivateAdmin,
  removeAdminRole,
  getDashboardStats,

  // Platform user management
  getUsers,
  suspendUser,
  reactivateUser,
} = require("../controllers/adminController");


/* ========================================
   ADMIN INVITATION CONTROLLER
======================================== */

const {
  createAdminInvitation,
  getAdminInvitations,
} = require(
  "../controllers/adminInviteController"
);


/* ========================================
   MIDDLEWARE
======================================== */

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");



/* ========================================
   SUPERADMIN DASHBOARD
======================================== */

router.get(
  "/dashboard/stats",
  protect,
  authorize("superadmin"),
  getDashboardStats
);



/* ========================================
   PLATFORM USERS

   Available to:
   - admin
   - superadmin
======================================== */


/*
  Get listeners, artists
  and distributors.
*/

router.get(
  "/users",
  protect,
  authorize(
    "admin",
    "superadmin"
  ),
  getUsers
);


/*
  Suspend ordinary platform user.
*/

router.patch(
  "/users/:userId/suspend",
  protect,
  authorize(
    "admin",
    "superadmin"
  ),
  suspendUser
);


/*
  Reactivate ordinary platform user.
*/

router.patch(
  "/users/:userId/reactivate",
  protect,
  authorize(
    "admin",
    "superadmin"
  ),
  reactivateUser
);



/* ========================================
   ADMIN MANAGEMENT

   SUPERADMIN ONLY
======================================== */


/*
  Get all admins.
*/

router.get(
  "/",
  protect,
  authorize("superadmin"),
  getAdmins
);


/*
  OLD promotion route.

  We are keeping it for now so we
  do not accidentally break anything.

  We will not use this from the frontend
  because admins are now created through
  invitation links.
*/

router.patch(
  "/users/:userId/promote",
  protect,
  authorize("superadmin"),
  promoteToAdmin
);


/*
  Suspend an admin.
*/

router.patch(
  "/:adminId/suspend",
  protect,
  authorize("superadmin"),
  suspendAdmin
);


/*
  Reactivate an admin.
*/

router.patch(
  "/:adminId/reactivate",
  protect,
  authorize("superadmin"),
  reactivateAdmin
);


/*
  Remove admin privileges.
*/

router.patch(
  "/:adminId/remove-role",
  protect,
  authorize("superadmin"),
  removeAdminRole
);



/* ========================================
   ADMIN INVITATIONS

   SUPERADMIN ONLY
======================================== */

router.post(
  "/invitations",
  protect,
  authorize("superadmin"),
  createAdminInvitation
);


router.get(
  "/invitations",
  protect,
  authorize("superadmin"),
  getAdminInvitations
);



module.exports = router;