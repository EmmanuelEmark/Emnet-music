
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const View = require("../models/View");
const Video = require("../models/video");

const REPEAT_VIEW_COOLDOWN_MINUTES = 5;
const MINIMUM_VIEW_SECONDS = 30;

const COOLDOWN_MS =
  REPEAT_VIEW_COOLDOWN_MINUTES * 60 * 1000;

// Recognize a logged-in user or a signed guest.
function resolveViewer(req, allowNewGuest = false) {
  if (req.user) {
    if (!["listener", "artist"].includes(req.user.role)) {
      return {
        error: "This account cannot record video views.",
        status: 403,
      };
    }

    return {
      key: `user:${req.user._id}`,
      userId: req.user._id,
      guestId: null,
      guestToken: null,
    };
  }

  const existingToken = req.get("X-Emnet-Guest");

  if (existingToken) {
    try {
      const decoded = jwt.verify(
        existingToken,
        process.env.JWT_SECRET
      );

      if (
        decoded.purpose !== "video-guest" ||
        typeof decoded.guestId !== "string"
      ) {
        throw new Error("Invalid guest token.");
      }

      return {
        key: `guest:${decoded.guestId}`,
        userId: null,
        guestId: decoded.guestId,
        guestToken: null,
      };
    } catch {
      return {
        error: "Invalid or expired guest token.",
        status: 401,
      };
    }
  }

  if (!allowNewGuest) {
    return {
      error: "Guest identification is required.",
      status: 401,
    };
  }

  const guestId = crypto.randomUUID();

  const guestToken = jwt.sign(
    {
      purpose: "video-guest",
      guestId,
    },
    process.env.JWT_SECRET,
    { expiresIn: "90d" }
  );

  return {
    key: `guest:${guestId}`,
    userId: null,
    guestId,
    guestToken,
  };
}

function sendViewerError(res, viewer) {
  return res.status(viewer.status).json({
    success: false,
    message: viewer.error,
  });
}

async function findPublicVideo(videoId) {
  if (!mongoose.isValidObjectId(videoId)) {
    return null;
  }

  return Video.findOne({
    _id: videoId,
    status: "approved",
    visibilityStatus: "visible",
  });
}

function getRequiredWatchSeconds(video) {
  return Math.min(
    MINIMUM_VIEW_SECONDS,
    video.duration
  );
}

// POST /api/views/videos/:videoId/start
const startVideoView = async (req, res) => {
  try {
    const video = await findPublicVideo(
      req.params.videoId
    );

    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video not found or unavailable.",
      });
    }

    const viewer = resolveViewer(req, true);

    if (viewer.error) {
      return sendViewerError(res, viewer);
    }

    const startedAt = Date.now();

    const viewSessionToken = jwt.sign(
  {
    purpose: "video-view-session",
    sessionId: crypto.randomUUID(),
    videoId: String(video._id),
    viewerKey: viewer.key,
    startedAt,
  },
  process.env.JWT_SECRET,
  { expiresIn: "2h" }
);

    return res.status(200).json({
      success: true,
      viewSessionToken,
      guestToken: viewer.guestToken,
      requiredWatchSeconds:
        getRequiredWatchSeconds(video),
    });
  } catch (error) {
    console.error(
      "Start video view error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to start viewing session.",
    });
  }
};

// POST /api/views/videos/:videoId
const recordVideoView = async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await findPublicVideo(videoId);

    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video not found or unavailable.",
      });
    }

    const viewer = resolveViewer(req);

    if (viewer.error) {
      return sendViewerError(res, viewer);
    }

    const { viewSessionToken } = req.body || {};

    if (
      !viewSessionToken ||
      typeof viewSessionToken !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Viewing session token is required.",
      });
    }

    let session;

    try {
      session = jwt.verify(
        viewSessionToken,
        process.env.JWT_SECRET
      );
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired viewing session.",
      });
    }

   if (
  session.purpose !== "video-view-session" ||
  typeof session.sessionId !== "string" ||
  session.videoId !== String(video._id) ||
  session.viewerKey !== viewer.key ||
  !Number.isFinite(session.startedAt)
) {
  return res.status(403).json({
    success: false,
    message: "Viewing session does not match.",
  });
}


    const requiredMilliseconds =
      getRequiredWatchSeconds(video) * 1000;

    const elapsedMilliseconds =
      Date.now() - session.startedAt;

    if (elapsedMilliseconds < requiredMilliseconds) {
      return res.status(400).json({
        success: false,
        counted: false,
        message:
          "Minimum viewing time has not been reached.",
      });
    }

    const now = new Date();
    const cooldownTime = new Date(
      now.getTime() - COOLDOWN_MS
    );

    const viewerFilter = viewer.userId
      ? { userId: viewer.userId }
      : { guestId: viewer.guestId };

    const recentView = await View.findOne({
      ...viewerFilter,
      videoId: video._id,
      countedAt: { $gte: cooldownTime },
    });

    if (recentView) {
      return res.status(200).json({
        success: true,
        counted: false,
        message: "View already counted recently.",
        viewCount: video.viewCount,
      });
    }

    // A unique key for concurrent requests
    // within the same five-minute time bucket.
    const timeBucket = Math.floor(
      now.getTime() / COOLDOWN_MS
    );

    const dedupeKey = crypto
      .createHash("sha256")
      .update(
        `${video._id}:${viewer.key}:${timeBucket}`
      )
      .digest("hex");

    try {
      await View.create({
  userId: viewer.userId,
  guestId: viewer.guestId,
  videoId: video._id,
  sessionId: session.sessionId,
  dedupeKey,
  countedAt: now,
});
    } catch (error) {
      if (error.code === 11000) {
        const latestVideo = await Video.findById(
          video._id
        );

        return res.status(200).json({
          success: true,
          counted: false,
          message: "View already recorded.",
          viewCount:
            latestVideo?.viewCount ?? video.viewCount,
        });
      }

      throw error;
    }

    // Atomic increment: safer than
    // video.viewCount += 1; video.save().
    const updatedVideo = await Video.findByIdAndUpdate(
      video._id,
      { $inc: { viewCount: 1 } },
      { new: true }
    );

    return res.status(201).json({
      success: true,
      counted: true,
      message: "Video view counted successfully.",
      viewCount: updatedVideo.viewCount,
    });
  } catch (error) {
    console.error(
      "Record video view error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

module.exports = {
  startVideoView,
  recordVideoView,
};
