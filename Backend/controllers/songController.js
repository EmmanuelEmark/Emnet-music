
const mongoose = require("mongoose");

const Song = require("../models/song");
const Release = require("../models/Release");
const Artist = require("../models/Artist");
const MediaUpload = require("../models/MediaUpload");

// ========================================
// ADD SONG TO RELEASE
// ========================================

const addSongToRelease = async (req, res) => {
  try {
    const { releaseId } = req.params;

    const {
      title,
      genre,
      audioUrl,
      audioUploadId,
      duration,
      trackNumber,
      primaryArtists,
      featuredArtists,
      isrc,
    } = req.body || {};

    if (!mongoose.isValidObjectId(releaseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid release ID.",
      });
    }

    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof genre !== "string" ||
      !genre.trim() ||
      !Number.isFinite(duration) ||
      duration < 1 ||
      !Number.isSafeInteger(trackNumber) ||
      trackNumber < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid title, genre, duration and track number are required.",
      });
    }

    const hasUpload =
      audioUploadId !== undefined &&
      audioUploadId !== null &&
      audioUploadId !== "";

    const hasUrl =
      typeof audioUrl === "string" &&
      audioUrl.trim().length > 0;

    if (hasUpload === hasUrl) {
      return res.status(400).json({
        success: false,
        message:
          "Provide either audioUploadId or audioUrl, but not both.",
      });
    }

    // ========================================
    // FIND RELEASE
    // ========================================

    const release = await Release.findById(releaseId);

    if (!release) {
      return res.status(404).json({
        success: false,
        message: "Release not found.",
      });
    }

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

    if (release.status !== "draft") {
      return res.status(400).json({
        success: false,
        message:
          "Songs can only be added while the release is in draft.",
      });
    }

    // ========================================
    // CHECK APPROVED ARTIST
    // ========================================

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

    // ========================================
    // CHECK R2 UPLOAD OWNERSHIP
    // ========================================

    let verifiedUpload = null;

    if (hasUpload) {
      if (!mongoose.isValidObjectId(audioUploadId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid audio upload ID.",
        });
      }

      verifiedUpload = await MediaUpload.findOne({
        _id: audioUploadId,
        userId: req.user._id,
        kind: "audio",
        status: "ready",
      });

      if (!verifiedUpload) {
        return res.status(400).json({
          success: false,
          message:
            "Audio upload is not confirmed or does not belong to you.",
        });
      }

      const alreadyUsed = await Song.exists({
        audioUploadId: verifiedUpload._id,
      });

      if (alreadyUsed) {
        return res.status(409).json({
          success: false,
          message:
            "This audio upload is already attached to a song.",
        });
      }
    }

    // ========================================
    // SINGLE RELEASE RULE
    // ========================================

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

    // ========================================
    // TRACK NUMBER RULE
    // ========================================

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

    // ========================================
    // ARTIST INFORMATION
    // ========================================

    let finalPrimaryArtists = primaryArtists;

    if (
      !Array.isArray(finalPrimaryArtists) ||
      finalPrimaryArtists.length === 0
    ) {
      finalPrimaryArtists = [artist._id];
    }

    if (
      !Array.isArray(featuredArtists) &&
      featuredArtists !== undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Featured artists must be an array.",
      });
    }

    const finalFeaturedArtists =
      featuredArtists || [];

    const allArtistIds = [
      ...finalPrimaryArtists,
      ...finalFeaturedArtists,
    ];

    if (
      allArtistIds.some(
        (id) => !mongoose.isValidObjectId(id)
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid artist ID.",
      });
    }

    // ========================================
    // CREATE SONG
    // ========================================

    const song = new Song({
      title: title.trim(),

      releaseId: release._id,

      primaryArtists: finalPrimaryArtists,

      featuredArtists: finalFeaturedArtists,

      genre: genre.trim(),

      audioUrl: hasUrl ? audioUrl.trim() : "",

      audioUploadId: verifiedUpload
        ? verifiedUpload._id
        : null,

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
    console.error("Add song error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "Duplicate audio upload detected.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

// ========================================
// GET PUBLIC SONGS
// ========================================

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
        "title releaseType coverImage releaseDate status visibilityStatus"
      );

    const publicSongs = songs.filter(
      (song) =>
        song.releaseId &&
        song.releaseId.status === "approved" &&
        song.releaseId.visibilityStatus === "visible"
    );

    return res.status(200).json({
      success: true,
      songs: publicSongs,
    });
  } catch (error) {
    console.error("Get public songs error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

// ========================================
// GET PUBLIC SONG BY ID
// ========================================

const getPublicSongById = async (req, res) => {
  try {
    const { songId } = req.params;

    if (!mongoose.isValidObjectId(songId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid song ID.",
      });
    }

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
        "title releaseType coverImage releaseDate status visibilityStatus"
      );

    if (
      !song ||
      !song.releaseId ||
      song.releaseId.status !== "approved" ||
      song.releaseId.visibilityStatus !== "visible"
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
    console.error("Get song error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

// ========================================
// GET SONGS IN ARTIST RELEASE
// ========================================

const getSongsByReleaseForArtist = async (
  req,
  res,
  next
) => {
  try {
    const { releaseId } = req.params;

    if (!mongoose.isValidObjectId(releaseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid release ID.",
      });
    }

    const release = await Release.findOne({
      _id: releaseId,
      submittedBy: req.user._id,
    });

    if (!release) {
      return res.status(404).json({
        success: false,
        message:
          "Release not found or access denied.",
      });
    }

    const songs = await Song.find({
      releaseId,
    }).sort({
      trackNumber: 1,
    });

    return res.status(200).json({
      success: true,
      release: {
        _id: release._id,
        title: release.title,
        releaseType: release.releaseType,
        coverImage: release.coverImage,
        coverUploadId: release.coverUploadId,
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
