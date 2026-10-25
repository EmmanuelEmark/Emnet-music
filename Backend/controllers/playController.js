const Play = require("../models/Play");
const Song = require("../models/Song");

const REPEAT_PLAY_COOLDOWN_MINUTES = 5;

const recordSongPlay = async (req, res) => {
  try {
    const { songId } = req.params;

    const song = await Song.findOne({
      _id: songId,
      status: "approved",
    }).populate(
      "releaseId",
      "status"
    );

    if (
      !song ||
      !song.releaseId ||
      song.releaseId.status !== "approved"
    ) {
      return res.status(404).json({
        success: false,
        message: "Song not found.",
      });
    }

    const cooldownTime = new Date(
      Date.now() -
        REPEAT_PLAY_COOLDOWN_MINUTES *
          60 *
          1000
    );

    const recentPlay = await Play.findOne({
      userId: req.user._id,
      songId: song._id,
      countedAt: {
        $gte: cooldownTime,
      },
    });

    if (recentPlay) {
      return res.status(200).json({
        success: true,
        counted: false,
        message:
          "This song was already counted recently.",
        playCount: song.playCount,
      });
    }

    await Play.create({
      userId: req.user._id,
      songId: song._id,
      countedAt: new Date(),
    });

    song.playCount += 1;

    await song.save();

    return res.status(201).json({
      success: true,
      counted: true,
      message: "Song play counted successfully.",
      playCount: song.playCount,
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
  recordSongPlay,
};