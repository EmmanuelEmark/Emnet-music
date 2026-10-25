const express = require("express");
const router = express.Router();

const {
  createReport,
  getReports,
  markReportReviewing,
  closeReport,
  moderateContent,
} = require("../controllers/reportController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");


router.post(
  "/",
  protect,
  authorize("listener", "artist"),
  createReport
);

router.get(
  "/",
  protect,
  authorize("admin", "superadmin"),
  getReports
);

router.patch(
  "/:reportId/review",
  protect,
  authorize("admin", "superadmin"),
  markReportReviewing
);

router.patch(
  "/:reportId/close",
  protect,
  authorize("admin", "superadmin"),
  closeReport
);

router.patch(
  "/moderate/:targetType/:targetId",
  protect,
  authorize("admin", "superadmin"),
  moderateContent
);

module.exports = router;