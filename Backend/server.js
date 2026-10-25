const express = require("express");

const cors = require("cors");

const dotenv = require("dotenv");
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

const connectDB = require("./config/db");

dotenv.config();


connectDB();

const app = express();

app.use(cors());
app.use(express.json());
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
app.use("/api/notifications",notificationRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admins",adminRoutes);



app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Emnetmusic Api is running",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Emnetmusic server running on port ${PORT}`);
});
