const View = require("../models/View");
const Video = require("../models/Video");

const REPEAT_VIEW_COOLDOWN_MINUTES = 5;

const recordVideoView = async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findOne({
      _id: videoId,
      status: "approved",
    });

    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video not found.",
      });
    }

    const cooldownTime = new Date(
      Date.now() -
        REPEAT_VIEW_COOLDOWN_MINUTES *
          60 *
          1000
    );

    const recentView = await View.findOne({
      userId: req.user._id,
      videoId: video._id,
      countedAt: {
        $gte: cooldownTime,
      },
    });

    if (recentView) {
      return res.status(200).json({
        success: true,
        counted: false,
        message:
          "This video was already counted recently.",
        viewCount: video.viewCount,
      });
    }

    await View.create({
      userId: req.user._id,
      videoId: video._id,
      countedAt: new Date(),
    });

    video.viewCount += 1;

    await video.save();

    return res.status(201).json({
      success: true,
      counted: true,
      message: "Video view counted successfully.",
      viewCount: video.viewCount,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

module.exports = {
  recordVideoView,
};