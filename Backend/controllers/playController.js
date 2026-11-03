
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const Play = require("../models/Play");
const Song = require("../models/Song");

const REPEAT_PLAY_COOLDOWN_MINUTES = 5;
const MINIMUM_PLAY_SECONDS = 30;

function getGuestIdentity(req) {
  const guestId = req.body?.guestId;

  if (
    typeof guestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(guestId)
  ) {
    return null;
  }

  // Do not store the visitor's raw IP address.
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(
      `${guestId}|${req.ip}|${req.get("user-agent") || ""}`
    )
    .digest("hex");
}

function getIdentity(req) {
  if (req.user) {
    return {
      userId: req.user._id,
      guestId: null,
      key: `user:${req.user._id}`,
    };
  }

  const guestId = getGuestIdentity(req);

  if (!guestId) {
    return null;
  }

  return {
    userId: null,
    guestId,
    key: `guest:${guestId}`,
  };
}

function getMinimumSeconds(duration) {
  let seconds = Number(duration);

  if (
    !Number.isFinite(seconds) &&
    typeof duration === "string" &&
    /^\d+:\d{1,2}$/.test(duration)
  ) {
    const [minutes, remaining] =
      duration.split(":").map(Number);

    seconds = minutes * 60 + remaining;
  }

  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(MINIMUM_PLAY_SECONDS, seconds)
    : MINIMUM_PLAY_SECONDS;
}

async function findApprovedSong(songId) {
  if (!/^[0-9a-f]{24}$/i.test(songId)) {
    return null;
  }

  const song = await Song.findOne({
    _id: songId,
    status: "approved",
  }).populate("releaseId", "status");

  if (
    !song ||
    !song.releaseId ||
    song.releaseId.status !== "approved"
  ) {
    return null;
  }

  return song;
}

const startSongPlay = async (req, res) => {
  try {
    const song = await findApprovedSong(req.params.songId);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: "Song not found.",
      });
    }

    const identity = getIdentity(req);

    if (!identity) {
      return res.status(400).json({
        success: false,
        message: "Valid listener identification is required.",
      });
    }

    const sessionToken = jwt.sign(
      {
        purpose: "song-play",
        songId: String(song._id),
        identity: identity.key,
        sessionId: crypto.randomUUID(),
        startedAt: Date.now(),
        minimumSeconds: getMinimumSeconds(song.duration),
      },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

   return res.status(200).json({
  success: true,
  sessionToken,
  minimumSeconds: getMinimumSeconds(song.duration),
});
  } catch (error) {
    console.error("Start song play error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to start play session.",
    });
  }
};

const recordSongPlay = async (req, res) => {
  try {
    const { songId } = req.params;
    const { sessionToken } = req.body || {};

    if (!sessionToken || typeof sessionToken !== "string") {
      return res.status(400).json({
        success: false,
        message: "Playback session is required.",
      });
    }

    let session;

    try {
      session = jwt.verify(
        sessionToken,
        process.env.JWT_SECRET
      );
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired playback session.",
      });
    }

    const identity = getIdentity(req);

    if (
      !identity ||
      session.purpose !== "song-play" ||
      session.songId !== songId ||
      session.identity !== identity.key
    ) {
      return res.status(403).json({
        success: false,
        message: "Playback session does not match this listener.",
      });
    }

    const elapsed = Date.now() - session.startedAt;

    if (
      !Number.isFinite(session.minimumSeconds) ||
      elapsed < session.minimumSeconds * 1000
    ) {
      return res.status(400).json({
        success: false,
        message: "Minimum listening time has not been reached.",
      });
    }

    const song = await findApprovedSong(songId);

    if (!song) {
      return res.status(404).json({
        success: false,
        message: "Song not found.",
      });
    }

    const existingSession = await Play.findOne({
      sessionId: session.sessionId,
    });

    if (existingSession) {
      return res.status(200).json({
        success: true,
        counted: false,
        message: "This playback session was already counted.",
        playCount: song.playCount,
      });
    }

    const cooldownTime = new Date(
      Date.now() -
        REPEAT_PLAY_COOLDOWN_MINUTES * 60 * 1000
    );

    const listenerFilter = identity.userId
      ? { userId: identity.userId }
      : { guestId: identity.guestId };

    const recentPlay = await Play.findOne({
      ...listenerFilter,
      songId: song._id,
      countedAt: { $gte: cooldownTime },
    });

    if (recentPlay) {
      return res.status(200).json({
        success: true,
        counted: false,
        message: "This song was already counted recently.",
        playCount: song.playCount,
      });
    }

    await Play.create({
      userId: identity.userId,
      guestId: identity.guestId,
      songId: song._id,
      sessionId: session.sessionId,
      countedAt: new Date(),
    });

    const updatedSong = await Song.findByIdAndUpdate(
      song._id,
      { $inc: { playCount: 1 } },
      { new: true }
    );

    return res.status(201).json({
      success: true,
      counted: true,
      message: "Song play counted successfully.",
      playCount: updatedSong.playCount,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({
        success: true,
        counted: false,
        message: "Playback session already recorded.",
      });
    }

    console.error("Record song play error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

module.exports = {
  startSongPlay,
  recordSongPlay,
};
