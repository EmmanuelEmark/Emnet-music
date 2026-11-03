const Like = require("../models/Like");
const Follow = require("../models/follow");
const Song = require("../models/song");
const Artist = require("../models/Artist");
const Notification = require("../models/Notification");


const likeSong = async (req, res) => {
  try {
    const { songId } = req.params;

    const song = await Song.findOne({
      _id: songId,
      status: "approved",
    });

    if (!song) {
      return res.status(404).json({
        success: false,
        message: "Song not found.",
      });
    }

    const existingLike = await Like.findOne({
      userId: req.user._id,
      songId,
    });

    if (existingLike) {
      return res.status(400).json({
        success: false,
        message: "You already liked this song.",
      });
    }

    const like = await Like.create({
      userId: req.user._id,
      songId,
    });

    return res.status(201).json({
      success: true,
      message: "Song liked successfully.",
      like,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const unlikeSong = async (req, res) => {
  try {
    const { songId } = req.params;

    const like = await Like.findOneAndDelete({
      userId: req.user._id,
      songId,
    });

    if (!like) {
      return res.status(404).json({
        success: false,
        message: "Like not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Song unliked successfully.",
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const followArtist = async (req, res) => {
  try {
    const { artistId } = req.params;

    const artist = await Artist.findOne({
      _id: artistId,
      approvalStatus: "approved",
    });

    if (!artist) {
      return res.status(404).json({
        success: false,
        message: "Artist not found.",
      });
    }

    // Prevent an artist from following themselves
    if (
      artist.userId.toString() ===
      req.user._id.toString()
    ) {
      return res.status(400).json({
        success: false,
        message: "You cannot follow yourself.",
      });
    }

    const existingFollow = await Follow.findOne({
      userId: req.user._id,
      artistId,
    });

    if (existingFollow) {
      return res.status(400).json({
        success: false,
        message: "You already follow this artist.",
      });
    }

    await Follow.create({
      userId: req.user._id,
      artistId,
    });

    artist.followersCount += 1;

    await artist.save();

    await Notification.create({
      userId: artist.userId,
      type: "artist_follow",
      title: "New Follower",
      message: `${req.user.fullName} started following you.`,
      link: `/artists/${artist._id}`,
    });

    return res.status(201).json({
      success: true,
      message: "Artist followed successfully.",
      followersCount: artist.followersCount,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

const unfollowArtist = async (req, res) => {
  try {
    const { artistId } = req.params;

    const follow = await Follow.findOneAndDelete({
      userId: req.user._id,
      artistId,
    });

    if (!follow) {
      return res.status(404).json({
        success: false,
        message: "Follow not found.",
      });
    }

    const artist = await Artist.findById(artistId);

    if (artist) {
      artist.followersCount = Math.max(
        0,
        artist.followersCount - 1
      );

      await artist.save();
    }

    return res.status(200).json({
      success: true,
      message: "Artist unfollowed successfully.",
      followersCount: artist
        ? artist.followersCount
        : 0,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const getLikedSongs = async (req, res) => {
  try {
    const likes = await Like.find({
      userId: req.user._id,
    })
      .sort({ createdAt: -1 })
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

    const songs = likes
      .filter((like) => like.songId)
      .filter(
        (like) =>
          like.songId.releaseId &&
          like.songId.releaseId.status ===
            "approved"
      )
      .map((like) => like.songId);

    return res.status(200).json({
      success: true,
      songs,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const getFollowedArtists = async (req, res) => {
  try {
    const follows = await Follow.find({
      userId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .populate({
        path: "artistId",
        match: {
          approvalStatus: "approved",
        },
        select:
          "stageName profileImage coverImage verified followersCount",
      });

    const artists = follows
      .filter((follow) => follow.artistId)
      .map((follow) => follow.artistId);

    return res.status(200).json({
      success: true,
      artists,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const toggleArtistNotifications = async (req, res) => {
  try {
    const { artistId } = req.params;

    const follow = await Follow.findOne({
      userId: req.user._id,
      artistId,
    });

    if (!follow) {
      return res.status(404).json({
        success: false,
        message:
          "You must follow this artist before turning on notifications.",
      });
    }

    follow.notificationsEnabled =
      !follow.notificationsEnabled;

    await follow.save();

    return res.status(200).json({
      success: true,
      message: follow.notificationsEnabled
        ? "Artist notifications turned on."
        : "Artist notifications turned off.",
      notificationsEnabled:
        follow.notificationsEnabled,
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
  likeSong,
  unlikeSong,
  followArtist,
  unfollowArtist,
  getLikedSongs,
  getFollowedArtists,
  toggleArtistNotifications,
};