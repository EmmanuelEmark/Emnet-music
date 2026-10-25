const express = require("express");
const router = express.Router();

const {
  getHomeFeed,
} = require("../controllers/homeController");

router.get(
  "/",
  getHomeFeed
);

module.exports = router;