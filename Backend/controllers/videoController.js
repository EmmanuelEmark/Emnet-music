const Video = require("../models/video");

const Song = require("../models/song");

const Release = require("../models/Release");
const Artist = require("../models/Artist");
const Notification = require("../models/Notification");


const createVideo = async (req, res) => {
  try {
    const {
      title,
      videoType,
      videoUrl,
      thumbnailUrl,
      duration,
      primaryArtists,
      featuredArtists,
      linkedSong,
      linkedRelease,
    } = req.body;

    // Required fields
    if (
      !title ||
      !videoUrl ||
      !thumbnailUrl ||
      !duration
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Title, video URL, thumbnail URL and duration are required.",
      });
    }

    // Find approved artist profile
    const artist = await Artist.findOne({
      userId: req.user._id,
      approvalStatus: "approved",
    });

    if (!artist) {
      return res.status(403).json({
        success: false,
        message:
          "You must be an approved artist to create a video.",
      });
    }

    // If no primary artist was provided,
    // automatically use the logged-in artist
    let finalPrimaryArtists = primaryArtists;

    if (
      !finalPrimaryArtists ||
      finalPrimaryArtists.length === 0
    ) {
      finalPrimaryArtists = [artist._id];
    }

    // Check linked song if supplied
    if (linkedSong) {
      const song = await Song.findById(linkedSong);

      if (!song) {
        return res.status(404).json({
          success: false,
          message: "Linked song not found.",
        });
      }
    }

    // Check linked release if supplied
    if (linkedRelease) {
      const release = await Release.findById(
        linkedRelease
      );

      if (!release) {
        return res.status(404).json({
          success: false,
          message: "Linked release not found.",
        });
      }
    }

    const video = new Video({
      title: title.trim(),

      videoType: videoType || "music_video",

      videoUrl,

      thumbnailUrl,

      duration,

      primaryArtists: finalPrimaryArtists,

      featuredArtists: featuredArtists || [],

      linkedSong: linkedSong || null,

      linkedRelease: linkedRelease || null,

      status: "draft",

      submittedBy: req.user._id,
    });

    await video.save();

    const populatedVideo = await Video.findById(
      video._id
    )
      .populate(
        "primaryArtists",
        "stageName profileImage verified"
      )
      .populate(
        "featuredArtists",
        "stageName profileImage verified"
      )
      .populate(
        "linkedSong",
        "title genre duration"
      )
      .populate(
        "linkedRelease",
        "title releaseType coverImage"
      );

    return res.status(201).json({
      success: true,
      message: "Video created successfully.",
      video: populatedVideo,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const submitVideoForReview = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { rightsConfirmed } = req.body;

    const video = await Video.findById(videoId);

    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video not found.",
      });
    }

    if (
      video.submittedBy.toString() !==
      req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to submit this video.",
      });
    }

    if (video.status !== "draft") {
      return res.status(400).json({
        success: false,
        message: "Only draft videos can be submitted.",
      });
    }

    if (rightsConfirmed !== true) {
  return res.status(400).json({
    success: false,
    message:
      "You must confirm that you own this video or have permission to distribute it.",
  });
}
    video.rightsConfirmed = true;
    video.rightsConfirmedAt = new Date();
    video.status = "pending";

    await video.save();

    return res.status(200).json({
      success: true,
      message: "Video submitted for review successfully.",
      video,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const getPendingVideos = async (req, res) => {
  try {
    const videos = await Video.find({
      status: "pending",
      visibilityStatus: "visible",
    })
      .sort({ createdAt: 1 })
      .populate(
        "primaryArtists",
        "stageName profileImage verified"
      )
      .populate(
        "featuredArtists",
        "stageName profileImage verified"
      )
      .populate(
        "linkedSong",
        "title genre duration"
      )
      .populate(
        "linkedRelease",
        "title releaseType coverImage"
      )
      .populate(
        "submittedBy",
        "fullName email"
      );

    return res.status(200).json({
      success: true,
      videos,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const approveVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findById(videoId);

    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video not found.",
      });
    }

    if (video.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending videos can be approved.",
      });
    }

    video.status = "approved";

    await video.save();


       await Notification.create({
  userId: video.submittedBy,
  type: "video_approved",
  title: "Video Approved",
  message: `Your video "${video.title}" has been approved.`,
  link: `/video?id=${video._id}`,
});


    return res.status(200).json({
      success: true,
      message: "Video approved successfully.",
      video,
    });

 

  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const rejectVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findById(videoId);

    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video not found.",
      });
    }

    if (video.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending videos can be rejected.",
      });
    }

    video.status = "rejected";

    await video.save();

    await Notification.create({
  userId: video.submittedBy,
  type: "video_rejected",
  title: "Video Rejected",
  message: `Your video "${video.title}" was not approved.`,
  link: `/videos/${video._id}`,
});

    return res.status(200).json({
      success: true,
      message: "Video rejected successfully.",
      video,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};



const getPublicVideos = async (req, res) => {
  try {
    const videos = await Video.find({
      status: "approved",
    })
      .sort({ createdAt: -1 })
      .populate(
        "primaryArtists",
        "stageName profileImage verified"
      )
      .populate(
        "featuredArtists",
        "stageName profileImage verified"
      )
      .populate(
        "linkedSong",
        "title genre duration"
      )
      .populate(
        "linkedRelease",
        "title releaseType coverImage releaseDate status"
      );

    return res.status(200).json({
      success: true,
      videos,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const getPublicVideoById = async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findOne({
      _id: videoId,
      status: "approved",

      $or: [
        {
          visibilityStatus: "visible",
        },
        {
          visibilityStatus: {
            $exists: false,
          },
        },
        {
          visibilityStatus: null,
        },
      ],
    })
      .populate(
        "primaryArtists",
        "stageName profileImage verified"
      )
      .populate(
        "featuredArtists",
        "stageName profileImage verified"
      )
      .populate(
        "linkedSong",
        "title genre duration"
      )
      .populate(
        "linkedRelease",
        "title releaseType coverImage releaseDate status"
      );

    if (!video) {
      return res.status(404).json({
        success: false,
        message: "Video not found.",
      });
    }

    return res.status(200).json({
      success: true,
      video,
    });

  } catch (error) {
    console.error(
      "Get public video error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


module.exports = {
  createVideo,
  submitVideoForReview,
  getPendingVideos,
  approveVideo,
  rejectVideo,
  getPublicVideos,
  getPublicVideoById,
};