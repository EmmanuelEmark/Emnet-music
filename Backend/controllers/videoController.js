
const mongoose = require("mongoose");

const Video = require("../models/video");
const Song = require("../models/song");
const Release = require("../models/Release");
const Artist = require("../models/Artist");
const Notification = require("../models/Notification");
const MediaUpload = require("../models/MediaUpload");

// ========================================
// HELPERS
// ========================================

const allowedVideoTypes = [
  "music_video",
  "live_performance",
  "interview",
  "other",
];

const validUrl = (value) => {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
};

const isVisible = {
  $or: [
    { visibilityStatus: "visible" },
    { visibilityStatus: { $exists: false } },
    { visibilityStatus: null },
  ],
};

const resolveMedia = async ({
  uploadId,
  url,
  existingUploadId = null,
  existingUrl = "",
  kind,
  userId,
  fieldName,
}) => {
  const hasUpload = Boolean(uploadId);
  const hasUrl =
    typeof url === "string" && url.trim().length > 0;

  if (hasUpload && hasUrl) {
    throw new Error(
      `Provide either ${fieldName} upload ID or URL, not both.`
    );
  }

  if (hasUpload) {
    if (!mongoose.isValidObjectId(uploadId)) {
      throw new Error(`Invalid ${fieldName} upload ID.`);
    }

    const upload = await MediaUpload.findOne({
      _id: uploadId,
      userId,
      kind,
      status: "ready",
    });

    if (!upload) {
      throw new Error(
        `${fieldName} upload is not confirmed or does not belong to you.`
      );
    }

    return {
      uploadId: upload._id,
      url: "",
    };
  }

  if (hasUrl) {
    if (!validUrl(url)) {
      throw new Error(`Invalid ${fieldName} URL.`);
    }

    return {
      uploadId: null,
      url: url.trim(),
    };
  }

  if (existingUploadId) {
    return {
      uploadId: existingUploadId,
      url: "",
    };
  }

  if (existingUrl) {
    return {
      uploadId: null,
      url: existingUrl,
    };
  }

  throw new Error(`${fieldName} is required.`);
};

const validateLinkedContent = async ({
  linkedSong,
  linkedRelease,
  userId,
}) => {
  if (linkedSong) {
    if (!mongoose.isValidObjectId(linkedSong)) {
      throw new Error("Invalid linked song ID.");
    }

    const song = await Song.findById(linkedSong);

    if (!song) {
      throw new Error("Linked song not found.");
    }

    const owningRelease = await Release.findById(
      song.releaseId
    );

    if (
      !owningRelease ||
      owningRelease.submittedBy.toString() !==
        userId.toString()
    ) {
      throw new Error(
        "You cannot link a song you do not own."
      );
    }

    if (
      linkedRelease &&
      song.releaseId.toString() !==
        linkedRelease.toString()
    ) {
      throw new Error(
        "The linked song does not belong to the linked release."
      );
    }
  }

  if (linkedRelease) {
    if (!mongoose.isValidObjectId(linkedRelease)) {
      throw new Error("Invalid linked release ID.");
    }

    const release = await Release.findById(linkedRelease);

    if (!release) {
      throw new Error("Linked release not found.");
    }

    if (
      release.submittedBy.toString() !==
      userId.toString()
    ) {
      throw new Error(
        "You cannot link a release you do not own."
      );
    }
  }
};

const validateArtists = async ({
  primaryArtists,
  featuredArtists,
  artist,
}) => {
  const finalPrimaryArtists =
    Array.isArray(primaryArtists) &&
    primaryArtists.length > 0
      ? primaryArtists
      : [artist._id];

  const finalFeaturedArtists =
    featuredArtists === undefined
      ? []
      : featuredArtists;

  if (!Array.isArray(finalFeaturedArtists)) {
    throw new Error(
      "Featured artists must be an array."
    );
  }

  const allIds = [
    ...finalPrimaryArtists,
    ...finalFeaturedArtists,
  ];

  if (
    allIds.some(
      (id) => !mongoose.isValidObjectId(id)
    )
  ) {
    throw new Error("Invalid artist ID.");
  }

  const uniqueIds = [
    ...new Set(
      allIds.map((id) => id.toString())
    ),
  ];

  if (
    !finalPrimaryArtists.some(
      (id) =>
        id.toString() === artist._id.toString()
    )
  ) {
    throw new Error(
      "You must be included as a primary artist."
    );
  }

  const existingCount = await Artist.countDocuments({
    _id: { $in: uniqueIds },
  });

  if (existingCount !== uniqueIds.length) {
    throw new Error(
      "One or more artists do not exist."
    );
  }

  return {
    primaryArtists: finalPrimaryArtists,
    featuredArtists: finalFeaturedArtists,
  };
};

const checkVideoUploadAvailability = async (
  uploadId,
  excludeVideoId = null
) => {
  if (!uploadId) return;

  const query = {
    videoUploadId: uploadId,
  };

  if (excludeVideoId) {
    query._id = { $ne: excludeVideoId };
  }

  const existing = await Video.exists(query);

  if (existing) {
    throw new Error(
      "This video upload is already attached to another video."
    );
  }
};

const checkThumbnailUploadAvailability = async (
  uploadId,
  excludeVideoId = null
) => {
  if (!uploadId) return;

  const query = {
    thumbnailUploadId: uploadId,
  };

  if (excludeVideoId) {
    query._id = { $ne: excludeVideoId };
  }

  const existing = await Video.exists(query);

  if (existing) {
    throw new Error(
      "This thumbnail upload is already attached to another video."
    );
  }
};

const populateVideo = (query) =>
  query
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

// ========================================
// CREATE VIDEO
// ========================================

const createVideo = async (req, res) => {
  try {
    const {
      title,
      videoType = "music_video",
      videoUrl,
      thumbnailUrl,
      videoUploadId,
      thumbnailUploadId,
      duration,
      primaryArtists,
      featuredArtists,
      linkedSong,
      linkedRelease,
    } = req.body || {};

    if (
      typeof title !== "string" ||
      !title.trim() ||
      !allowedVideoTypes.includes(videoType) ||
      !Number.isFinite(Number(duration)) ||
      Number(duration) < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid title, video type and duration are required.",
      });
    }

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

    const videoMedia = await resolveMedia({
      uploadId: videoUploadId,
      url: videoUrl,
      kind: "video",
      userId: req.user._id,
      fieldName: "Video",
    });

    const thumbnailMedia = await resolveMedia({
      uploadId: thumbnailUploadId,
      url: thumbnailUrl,
      kind: "artwork",
      userId: req.user._id,
      fieldName: "Thumbnail",
    });

    await checkVideoUploadAvailability(
      videoMedia.uploadId
    );

    await checkThumbnailUploadAvailability(
      thumbnailMedia.uploadId
    );

    const artists = await validateArtists({
      primaryArtists,
      featuredArtists,
      artist,
    });

    await validateLinkedContent({
      linkedSong,
      linkedRelease,
      userId: req.user._id,
    });

    const video = new Video({
      title: title.trim(),
      videoType,

      videoUrl: videoMedia.url,
      videoUploadId: videoMedia.uploadId,

      thumbnailUrl: thumbnailMedia.url,
      thumbnailUploadId: thumbnailMedia.uploadId,

      duration: Number(duration),

      primaryArtists: artists.primaryArtists,
      featuredArtists: artists.featuredArtists,

      linkedSong: linkedSong || null,
      linkedRelease: linkedRelease || null,

      submittedBy: req.user._id,
      status: "draft",
      visibilityStatus: "visible",
    });

    await video.save();

    const populatedVideo = await populateVideo(
      Video.findById(video._id)
    );

    return res.status(201).json({
      success: true,
      message: "Video created successfully.",
      video: populatedVideo,
    });
  } catch (error) {
    console.error("Create video error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Media upload is already in use.",
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// ========================================
// SUBMIT VIDEO FOR REVIEW
// ========================================

const submitVideoForReview = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { rightsConfirmed } = req.body || {};

    if (!mongoose.isValidObjectId(videoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid video ID.",
      });
    }

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
        message:
          "You are not allowed to submit this video.",
      });
    }

    if (video.status !== "draft") {
      return res.status(400).json({
        success: false,
        message:
          "Only draft videos can be submitted.",
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
      message:
        "Video submitted for review successfully.",
      video,
    });
  } catch (error) {
    console.error("Submit video error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

// ========================================
// GET PENDING VIDEOS
// ========================================

const getPendingVideos = async (req, res) => {
  try {
    const videos = await populateVideo(
      Video.find({
        status: "pending",
        visibilityStatus: "visible",
      }).sort({ createdAt: 1 })
    ).populate("submittedBy", "fullName email");

    return res.status(200).json({
      success: true,
      videos,
    });
  } catch (error) {
    console.error("Get pending videos error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

// ========================================
// APPROVE VIDEO
// ========================================

const approveVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid video ID.",
      });
    }

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
        message:
          "Only pending videos can be approved.",
      });
    }

    video.status = "approved";
    video.moderationReason = "";
    video.moderatedBy = req.user._id;
    video.moderatedAt = new Date();

    await video.save();

    await Notification.create({
      userId: video.submittedBy,
      type: "video_approved",
      title: "Video Approved",
      message:
        `Your video "${video.title}" has been approved.`,
      link: `/video.html?id=${video._id}`,
    });

    return res.status(200).json({
      success: true,
      message: "Video approved successfully.",
      video,
    });
  } catch (error) {
    console.error("Approve video error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

// ========================================
// REJECT VIDEO
// ========================================

const rejectVideo = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { reason } = req.body || {};

    if (
      typeof reason !== "string" ||
      !reason.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A rejection reason is required.",
      });
    }

    const cleanReason = reason.trim();

    if (cleanReason.length > 1000) {
      return res.status(400).json({
        success: false,
        message:
          "Rejection reason cannot exceed 1000 characters.",
      });
    }

    if (!mongoose.isValidObjectId(videoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid video ID.",
      });
    }

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
        message:
          "Only pending videos can be rejected.",
      });
    }

    video.status = "rejected";
    video.moderationReason = cleanReason;
    video.moderatedBy = req.user._id;
    video.moderatedAt = new Date();

    await video.save();

    await Notification.create({
      userId: video.submittedBy,
      type: "video_rejected",
      title: "Video Rejected",
      message:
        `Your video "${video.title}" was not approved. Reason: ${cleanReason}`,
      link: "/artist-videos.html",
    });

    return res.status(200).json({
      success: true,
      message: "Video rejected successfully.",
      video,
    });
  } catch (error) {
    console.error("Reject video error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

// ========================================
// GET PUBLIC VIDEOS
// ========================================

const getPublicVideos = async (req, res) => {
  try {
    const videos = await populateVideo(
      Video.find({
        status: "approved",
        ...isVisible,
      }).sort({ createdAt: -1 })
    );

    return res.status(200).json({
      success: true,
      videos,
    });
  } catch (error) {
    console.error("Get public videos error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

// ========================================
// GET PUBLIC VIDEO BY ID
// ========================================

const getPublicVideoById = async (req, res) => {
  try {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid video ID.",
      });
    }

    const video = await populateVideo(
      Video.findOne({
        _id: videoId,
        status: "approved",
        ...isVisible,
      })
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
    console.error("Get public video error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

// ========================================
// GET MY VIDEOS
// ========================================

const getMyVideos = async (req, res) => {
  try {
    const videos = await populateVideo(
      Video.find({
        submittedBy: req.user._id,
      }).sort({ createdAt: -1 })
    );

    return res.status(200).json({
      success: true,
      count: videos.length,
      videos,
    });
  } catch (error) {
    console.error("Get my videos error:", error);

    return res.status(500).json({
      success: false,
      message:
        "Unable to retrieve your videos.",
    });
  }
};

// ========================================
// UPDATE MY VIDEO
// ========================================

const updateMyVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    if (!mongoose.isValidObjectId(videoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid video ID.",
      });
    }

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
        message: "You cannot edit this video.",
      });
    }

    if (
      !["draft", "rejected"].includes(video.status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only draft or rejected videos can be edited.",
      });
    }

    const {
      title,
      videoType,
      videoUrl,
      thumbnailUrl,
      videoUploadId,
      thumbnailUploadId,
      duration,
      linkedSong,
      linkedRelease,
    } = req.body || {};

    if (
      typeof title !== "string" ||
      !title.trim() ||
      !allowedVideoTypes.includes(videoType) ||
      !Number.isFinite(Number(duration)) ||
      Number(duration) < 1
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide valid video details.",
      });
    }

    const videoMedia = await resolveMedia({
      uploadId: videoUploadId,
      url: videoUrl,
      existingUploadId: video.videoUploadId,
      existingUrl: video.videoUrl,
      kind: "video",
      userId: req.user._id,
      fieldName: "Video",
    });

    const thumbnailMedia = await resolveMedia({
      uploadId: thumbnailUploadId,
      url: thumbnailUrl,
      existingUploadId: video.thumbnailUploadId,
      existingUrl: video.thumbnailUrl,
      kind: "artwork",
      userId: req.user._id,
      fieldName: "Thumbnail",
    });

    await checkVideoUploadAvailability(
      videoMedia.uploadId,
      video._id
    );

    await checkThumbnailUploadAvailability(
      thumbnailMedia.uploadId,
      video._id
    );

    await validateLinkedContent({
      linkedSong,
      linkedRelease,
      userId: req.user._id,
    });

    video.title = title.trim();
    video.videoType = videoType;

    video.videoUrl = videoMedia.url;
    video.videoUploadId = videoMedia.uploadId;

    video.thumbnailUrl = thumbnailMedia.url;
    video.thumbnailUploadId =
      thumbnailMedia.uploadId;

    video.duration = Number(duration);

    video.linkedSong = linkedSong || null;
    video.linkedRelease = linkedRelease || null;

    // Editing rejected videos returns them to draft.
    video.status = "draft";

    // Rights must be reconfirmed.
    video.rightsConfirmed = false;
    video.rightsConfirmedAt = null;

    // Clear previous moderation decisions.
    video.moderationReason = "";
    video.moderatedBy = null;
    video.moderatedAt = null;

    await video.save();

    return res.status(200).json({
      success: true,
      message:
        "Video draft updated successfully.",
      video,
    });
  } catch (error) {
    console.error("Update video error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Media upload is already in use.",
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// ========================================
// EXPORT CONTROLLERS
// ========================================

module.exports = {
  createVideo,
  submitVideoForReview,
  getMyVideos,
  updateMyVideo,
  getPendingVideos,
  approveVideo,
  rejectVideo,
  getPublicVideos,
  getPublicVideoById,
};
