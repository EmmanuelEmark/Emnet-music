const express = require("express");
const router = express.Router();

const {
  search,
} = require("../controllers/searchController");

const {
  protect,
} = require("../middleware/authMiddleware");

// Search is available only to authenticated users.
router.get(
  "/",
  protect,
  search
);

module.exports = router;