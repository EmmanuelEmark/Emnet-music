
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const artistRoutes = require("./routes/artistRoutes");
const releaseRoutes = require("./routes/releaseRoutes");
const songRoutes = require("./routes/songRoutes");
const searchRoutes = require("./routes/searchRoutes");
const homeRoutes = require("./routes/homeRoutes");
const videoRoutes = require("./routes/videoRoutes");
const listenerRoutes = require("./routes/listenerRoutes");
const playlistRoutes = require("./routes/playlistRoutes");
const historyRoutes = require("./routes/historyRoutes");
const playRoutes = require("./routes/playRoutes");
const viewRoutes = require("./routes/viewRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const accountRoutes = require("./routes/accountRoutes");
const adminRoutes = require("./routes/adminRoutes");
const reportRoutes = require("./routes/reportRoutes");
const videoLikeRoutes = require("./routes/videoLikeRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const mediaDeliveryRoutes = require("./routes/mediaDeliveryRoutes");

const {
  startGreetingJobs,
} = require("./jobs/greetingJobs");

const app = express();

/* ========================================
   1. PROXY CONFIGURATION
======================================== */

// Render uses a reverse proxy.
// Trust only the nearest proxy.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

/* ========================================
   2. SECURITY MIDDLEWARE
======================================== */

app.use(helmet());

/* ========================================
   3. CORS CONFIGURATION
======================================== */

// FRONTEND_URL can contain one URL or
// several comma-separated URLs.
//
// Example:
// https://emnetmusic.netlify.app

const productionOrigins = (
  process.env.FRONTEND_URL || ""
)
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  ...productionOrigins,
];

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header
      // include many server-to-server requests.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Origin not allowed by CORS")
      );
    },
  })
);

/* ========================================
   4. REQUEST BODY LIMIT
======================================== */

app.use(
  express.json({
    limit: "1mb",
  })
);

/* ========================================
   5. AUTH RATE LIMITING
======================================== */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 60,

  standardHeaders: "draft-8",

  legacyHeaders: false,

  message: {
    success: false,
    message:
      "Too many requests. Please try again later.",
  },
});

app.use("/api/auth", authLimiter);

/* ========================================
   6. API ROUTES
======================================== */

app.use("/api/auth", authRoutes);

app.use("/api/artists", artistRoutes);

app.use("/api/releases", releaseRoutes);

app.use("/api/songs", songRoutes);

app.use("/api/search", searchRoutes);

app.use("/api/home", homeRoutes);

app.use("/api/videos", videoRoutes);

app.use("/api/listener", listenerRoutes);

app.use("/api/playlists", playlistRoutes);

app.use("/api/history", historyRoutes);

app.use("/api/plays", playRoutes);

app.use("/api/views", viewRoutes);

app.use("/api/notifications", notificationRoutes);

app.use("/api/account", accountRoutes);

app.use("/api/admins", adminRoutes);

app.use("/api/reports", reportRoutes);

app.use("/api/video-likes", videoLikeRoutes);

app.use("/api/uploads", uploadRoutes);

app.use("/api/media", mediaDeliveryRoutes);

/* ========================================
   7. ROOT ENDPOINT
======================================== */

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Emnet Music API is running",
  });
});

/* ========================================
   8. HEALTH CHECK
======================================== */

app.get("/api/health", (req, res) => {
  const databaseConnected =
    mongoose.connection.readyState === 1;

  res.status(databaseConnected ? 200 : 503).json({
    success: databaseConnected,

    message: databaseConnected
      ? "Emnet Music API is healthy"
      : "Database connection unavailable",

    database: databaseConnected
      ? "connected"
      : "disconnected",
  });
});

/* ========================================
   9. DATABASE CONNECTION
======================================== */

mongoose.connection.once("open", () => {
  console.log(
    "MongoDB ready for greeting jobs."
  );

  startGreetingJobs();
});

connectDB();

/* ========================================
   10. START SERVER
======================================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Emnet Music server running on port ${PORT}`
  );
});
