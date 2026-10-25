const express = require("express");
const router = express.Router();

const {
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} = require(
  "../controllers/notificationController"
);

const {
  protect,
} = require(
  "../middleware/authMiddleware"
);


router.get(
  "/",
  protect,
  getMyNotifications
);


router.patch(
  "/read-all",
  protect,
  markAllNotificationsAsRead
);


router.patch(
  "/:notificationId/read",
  protect,
  markNotificationAsRead
);


module.exports = router;