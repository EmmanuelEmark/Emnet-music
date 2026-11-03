const Artist = require("../models/Artist");
const User = require("../models/User");
const Release = require("../models/Release");
const Song = require("../models/song");
const Video = require("../models/video");


const applyAsArtist = async (req, res) => {
  try {
    const {
      stageName,
      bio,
      country,
      profileImage,
      coverImage,
    } = req.body;

    const existingArtist = await Artist.findOne({
      userId: req.user._id,
    });

    if (existingArtist) {
      return res.status(400).json({
        success: false,
        message: "You already have an artist application or profile",
      });
    }

    const normalizedStageName = stageName
      .trim()
      .toLowerCase();

    const stageNameExists = await Artist.findOne({
      stageNameNormalized: normalizedStageName,
    });

    if (stageNameExists) {
      return res.status(400).json({
        success: false,
        message: "This stage name is already in use",
      });
    }

    const artist = new Artist({
      userId: req.user._id,
      stageName: stageName.trim(),
      stageNameNormalized: normalizedStageName,
      bio,
      country,
      profileImage,
      coverImage,
    });

    await artist.save();

    res.status(201).json({
      success: true,
      message: "Artist application submitted successfully",
      artist,
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getPendingArtists = async (req, res) => {
  try {
    const artists = await Artist.find({
      approvalStatus: "pending",
    }).populate("userId", "fullName email");

    res.status(200).json({
      success: true,
      artists,
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const approveArtist = async (req, res) => {
  try {
    const artist = await Artist.findById(req.params.id);

    if (!artist) {
      return res.status(404).json({
        success: false,
        message: "Artist application not found",
      });
    }

    if (artist.approvalStatus === "approved") {
      return res.status(400).json({
        success: false,
        message: "Artist is already approved",
      });
    }

    artist.approvalStatus = "approved";

    await artist.save();

    await User.findByIdAndUpdate(
      artist.userId,
      {
        role: "artist",
      }
    );

    res.status(200).json({
      success: true,
      message: "Artist approved successfully",
      artist,
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const rejectArtist = async (req, res) => {
  try {
    const artist = await Artist.findById(req.params.id);

    if (!artist) {
      return res.status(404).json({
        success: false,
        message: "Artist application not found",
      });
    }

    artist.approvalStatus = "rejected";

    await artist.save();

    res.status(200).json({
      success: true,
      message: "Artist application rejected",
      artist,
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};



// return artist profile



const getMyArtistProfile = async (req, res) => {
  try {
    const artist = await Artist.findOne({
      userId: req.user._id,
    }).populate("userId", "fullName email");

    if (!artist) {
      return res.status(404).json({
        success: false,
        message: "Artist profile not found",
      });
    }

    res.status(200).json({
      success: true,
      artist,
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


const getPublicArtistProfile = async (req, res) => {
  try {
    const { artistId } = req.params;

    const artist = await Artist.findOne({
      _id: artistId,
      approvalStatus: "approved",
      visibilityStatus: "visible",
    }).populate(
      "userId",
      "fullName"
    );

    if (!artist) {
      return res.status(404).json({
        success: false,
        message: "Artist not found.",
      });
    }

    const releases = await Release.find({
      status: "approved",
      visibilityStatus: "visible",
      $or: [
        { primaryArtists: artist._id },
        { collaboratingArtists: artist._id },
      ],
    })
      .sort({ releaseDate: -1 })
      .populate(
        "primaryArtists",
        "stageName profileImage verified"
      )
      .populate(
        "collaboratingArtists",
        "stageName profileImage verified"
      );

    const songs = await Song.find({
      status: "approved",
      visibilityStatus: "visible",
      $or: [
        { primaryArtists: artist._id },
        { featuredArtists: artist._id },
      ],
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
        "releaseId",
        "title releaseType coverImage releaseDate status"
      );

    const publicSongs = songs.filter(
      (song) =>
        song.releaseId &&
        song.releaseId.status === "approved"
    );


    const videos = await Video.find({
  status: "approved",
  visibilityStatus: "visible",
  $or: [
    { primaryArtists: artist._id },
    { featuredArtists: artist._id },
  ],
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
    "title releaseType coverImage"
  );


    return res.status(200).json({
      success: true,
      artist,
      releases,
      songs: publicSongs,
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




const featureArtist = async (req, res) => {
  try {
    const { artistId } = req.params;

    const artist = await Artist.findById(artistId);

    if (!artist) {
      return res.status(404).json({
        success: false,
        message: "Artist not found.",
      });
    }

    if (artist.approvalStatus !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Only approved artists can be featured.",
      });
    }

    artist.featured = true;

    await artist.save();

    return res.status(200).json({
      success: true,
      message: "Artist added to featured artists.",
      artist,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const unfeatureArtist = async (req, res) => {
  try {
    const { artistId } = req.params;

    const artist = await Artist.findById(artistId);

    if (!artist) {
      return res.status(404).json({
        success: false,
        message: "Artist not found.",
      });
    }

    artist.featured = false;

    await artist.save();

    return res.status(200).json({
      success: true,
      message: "Artist removed from featured artists.",
      artist,
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
  applyAsArtist,
  getPendingArtists,
  approveArtist,
  rejectArtist,
  getMyArtistProfile,
  getPublicArtistProfile,
  featureArtist,
  unfeatureArtist,
};