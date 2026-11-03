
const mongoose = require("mongoose");
const Video = require("../models/video");
const VideoLike = require("../models/VideoLike");

async function findPublicVideo(videoId) {
  if (!mongoose.isValidObjectId(videoId)) {
    return null;
  }

  return Video.exists({
    _id: videoId,
    status: "approved",
    $or: [
      { visibilityStatus: "visible" },
      { visibilityStatus: { $exists: false } },
      { visibilityStatus: null },
    ],
  });
}

// Public: get the number of likes on a video.
const getVideoLikeCount = async (req, res) => {
  try {
    const { videoId } = req.params;

    if (!(await findPublicVideo(videoId))) {
      return res.status(404).json({
        success: false,
        message: "Video not found.",
      });
    }

    const likeCount = await VideoLike.countDocuments({
      videoId,
    });

    return res.json({
      success: true,
      likeCount,
    });
  } catch (error) {
    console.error("Get video likes error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load video likes.",
    });
  }
};

// Listener: check whether they liked the video.
const getMyVideoLike = async (req, res) => {
  try {
    const { videoId } = req.params;

    if (!(await findPublicVideo(videoId))) {
      return res.status(404).json({
        success: false,
        message: "Video not found.",
      });
    }

    const existingLike = await VideoLike.exists({
      userId: req.user._id,
      videoId,
    });

    return res.json({
      success: true,
      liked: Boolean(existingLike),
    });
  } catch (error) {
    console.error("Check video like error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to check video like.",
    });
  }
};

// Listener: like a video.
const likeVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    if (!(await findPublicVideo(videoId))) {
      return res.status(404).json({
        success: false,
        message: "Video not found.",
      });
    }

    await VideoLike.updateOne(
      {
        userId: req.user._id,
        videoId,
      },
      {
        $setOnInsert: {
          userId: req.user._id,
          videoId,
        },
      },
      {
        upsert: true,
      }
    );

    const likeCount = await VideoLike.countDocuments({
      videoId,
    });

    return res.json({
      success: true,
      message: "Video liked successfully.",
      liked: true,
      likeCount,
    });
  } catch (error) {
    if (error.code === 11000) {
      const likeCount = await VideoLike.countDocuments({
        videoId: req.params.videoId,
      });

      return res.json({
        success: true,
        liked: true,
        likeCount,
      });
    }

    console.error("Like video error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to like video.",
    });
  }
};

// Listener: remove their like.
const unlikeVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    if (!(await findPublicVideo(videoId))) {
      return res.status(404).json({
        success: false,
        message: "Video not found.",
      });
    }

    await VideoLike.deleteOne({
      userId: req.user._id,
      videoId,
    });

    const likeCount = await VideoLike.countDocuments({
      videoId,
    });

    return res.json({
      success: true,
      message: "Video unliked successfully.",
      liked: false,
      likeCount,
    });
  } catch (error) {
    console.error("Unlike video error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to unlike video.",
    });
  }
};

module.exports = {
  getVideoLikeCount,
  getMyVideoLike,
  likeVideo,
  unlikeVideo,
};
