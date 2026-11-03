const ListeningHistory = require("../models/ListeningHistory");
const Song = require("../models/song");


const recordListeningHistory = async (req, res) => {
  try {
    const { songId } = req.params;
    const { playDuration } = req.body;

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

    const history = await ListeningHistory.create({
      userId: req.user._id,
      songId,
      playDuration: playDuration || 0,
      playedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "Listening history recorded.",
      history,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const getRecentlyPlayed = async (req, res) => {
  try {
    const history = await ListeningHistory.find({
      userId: req.user._id,
    })
      .sort({ playedAt: -1 })
      .limit(50)
      .populate({
        path: "songId",
        match: {
          status: "approved",
        },
        populate: [
          {
            path: "primaryArtists",
            select:
              "stageName profileImage verified",
          },
          {
            path: "featuredArtists",
            select:
              "stageName profileImage verified",
          },
          {
            path: "releaseId",
            select:
              "title releaseType coverImage releaseDate status",
          },
        ],
      });

    const seenSongs = new Set();

    const recentlyPlayed = [];

    for (const item of history) {
      if (!item.songId) {
        continue;
      }

      if (
        !item.songId.releaseId ||
        item.songId.releaseId.status !== "approved"
      ) {
        continue;
      }

      const songId =
        item.songId._id.toString();

      if (seenSongs.has(songId)) {
        continue;
      }

      seenSongs.add(songId);

      recentlyPlayed.push({
        song: item.songId,
        playedAt: item.playedAt,
      });
    }

    return res.status(200).json({
      success: true,
      recentlyPlayed,
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
  recordListeningHistory,
  getRecentlyPlayed,
};