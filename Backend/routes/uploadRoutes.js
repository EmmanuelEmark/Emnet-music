
const express = require("express");

const router = express.Router();

const {
  createUploadUrl,
  confirmUpload,
} = require("../controllers/uploadController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

// ========================================
// REQUEST TEMPORARY R2 UPLOAD URL
// POST /api/uploads/request
// ========================================

router.post(
  "/request",
  protect,
  authorize("artist"),
  createUploadUrl
);

// ========================================
// CONFIRM UPLOADED MEDIA
// POST /api/uploads/:uploadId/confirm
// ========================================

router.post(
  "/:uploadId/confirm",
  protect,
  authorize("artist"),
  confirmUpload
);

module.exports = router;
