const Song = require("../models/song");
const Release = require("../models/Release");
const Artist = require("../models/Artist");

const addSongToRelease = async (req, res) => {
  try {
    const { releaseId } = req.params;

    const {
      title,
      genre,
      audioUrl,
      duration,
      trackNumber,
      primaryArtists,
      featuredArtists,
      isrc,
    } = req.body;

    // Check required fields
    if (
      !title ||
      !genre ||
      !audioUrl ||
      !duration ||
      !trackNumber
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Title, genre, audio URL, duration and track number are required.",
      });
    }

    // Find the release
    const release = await Release.findById(releaseId);

    if (!release) {
      return res.status(404).json({
        success: false,
        message: "Release not found.",
      });
    }

    // Make sure the logged-in user owns this release
    if (
      release.submittedBy.toString() !==
      req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to add songs to this release.",
      });
    }

    // Only allow editing while the release is still a draft
    if (release.status !== "draft") {
      return res.status(400).json({
        success: false,
        message:
          "Songs can only be added while the release is in draft.",
      });
    }

    // Find the logged-in artist profile
    const artist = await Artist.findOne({
      userId: req.user._id,
      approvalStatus: "approved",
    });

    if (!artist) {
      return res.status(403).json({
        success: false,
        message:
          "You must be an approved artist to add songs.",
      });
    }

    // A single release can contain only one song
    if (release.releaseType === "single") {
      const existingSong = await Song.findOne({
        releaseId: release._id,
      });

      if (existingSong) {
        return res.status(400).json({
          success: false,
          message:
            "A single release can only contain one song.",
        });
      }
    }

    // Prevent duplicate track numbers in the same release
    const existingTrackNumber = await Song.findOne({
      releaseId: release._id,
      trackNumber,
    });

    if (existingTrackNumber) {
      return res.status(400).json({
        success: false,
        message:
          `Track number ${trackNumber} already exists in this release.`,
      });
    }

    // If no primary artist is supplied,
    // use the logged-in artist
    let finalPrimaryArtists = primaryArtists;

    if (
      !finalPrimaryArtists ||
      finalPrimaryArtists.length === 0
    ) {
      finalPrimaryArtists = [artist._id];
    }

    const song = new Song({
      title: title.trim(),

      releaseId: release._id,

      primaryArtists: finalPrimaryArtists,

      featuredArtists: featuredArtists || [],

      genre: genre.trim(),

      audioUrl,

      duration,

      trackNumber,

      isrc: isrc || "",

      status: "draft",
    });

    await song.save();

    const populatedSong = await Song.findById(song._id)
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
        "title releaseType coverImage releaseDate"
      );

    return res.status(201).json({
      success: true,
      message: "Song added successfully.",
      song: populatedSong,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const getPublicSongs = async (req, res) => {
  try {
    const songs = await Song.find({
      status: "approved",
      visibilityStatus: "visible",
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

    // Extra safety:
    // only return songs whose release is also approved
    const publicSongs = songs.filter(
      (song) =>
        song.releaseId &&
        song.releaseId.status === "approved"
    );

    return res.status(200).json({
      success: true,
      songs: publicSongs,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const getPublicSongById = async (req, res) => {
  try {
    const { songId } = req.params;

    const song = await Song.findOne({
      _id: songId,
      status: "approved",
      visibilityStatus: "visible",
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
        "releaseId",
        "title releaseType coverImage releaseDate status"
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

    return res.status(200).json({
      success: true,
      song,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

const getSongsByReleaseForArtist = async (req, res, next) => {
  try {
    const { releaseId } = req.params;

    // Confirm that this release belongs to the logged-in artist.
    const release = await Release.findOne({
      _id: releaseId,
      submittedBy: req.user._id,
    });

    if (!release) {
      return res.status(404).json({
        success: false,
        message: "Release not found or access denied.",
      });
    }

    // Get all tracks in their correct order.
    const songs = await Song.find({ releaseId }).sort({
      trackNumber: 1,
    });

    return res.status(200).json({
      success: true,
      release: {
        _id: release._id,
        title: release.title,
        releaseType: release.releaseType,
        coverImage: release.coverImage,
        releaseDate: release.releaseDate,
        status: release.status,
      },
      songs,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addSongToRelease,
  getPublicSongs,
  getPublicSongById,
  getSongsByReleaseForArtist,
};