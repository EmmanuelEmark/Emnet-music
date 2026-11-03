const Release = require("../models/Release");
const Artist = require("../models/Artist");
const Song = require("../models/song");
const Notification = require("../models/Notification");
const Follow = require("../models/Follow");


const mongoose = require("mongoose");
const MediaUpload = require("../models/MediaUpload");


// ========================================
// CREATE RELEASE WITH R2 COVER ARTWORK
// ========================================

const createRelease = async (req, res) => {
  try {
    const {
      title,
      releaseType,
      coverImage,
      coverUploadId,
      releaseDate,
      primaryArtists,
      collaboratingArtists,
    } = req.body || {};

    // Validate required information
    if (
      typeof title !== "string" ||
      !title.trim() ||
      !releaseType ||
      !releaseDate
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Title, release type and release date are required.",
      });
    }

    const allowedReleaseTypes = [
      "single",
      "ep",
      "album",
    ];

    if (!allowedReleaseTypes.includes(releaseType)) {
      return res.status(400).json({
        success: false,
        message:
          "Release type must be single, ep or album.",
      });
    }

    const parsedReleaseDate = new Date(releaseDate);

    if (Number.isNaN(parsedReleaseDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid release date.",
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
          "You must be an approved artist to create a release.",
      });
    }

    // ========================================
    // VERIFY COVER ARTWORK
    // ========================================

    const hasUpload =
      coverUploadId !== undefined &&
      coverUploadId !== null &&
      coverUploadId !== "";

    const hasLegacyCover =
      typeof coverImage === "string" &&
      coverImage.trim().length > 0;

    if (hasUpload === hasLegacyCover) {
      return res.status(400).json({
        success: false,
        message:
          "Provide either coverUploadId or coverImage, but not both.",
      });
    }

    let verifiedCover = null;

    if (hasUpload) {
      if (!mongoose.isValidObjectId(coverUploadId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid cover upload ID.",
        });
      }

      verifiedCover = await MediaUpload.findOne({
        _id: coverUploadId,
        userId: req.user._id,
        kind: "artwork",
        status: "ready",
      });

      if (!verifiedCover) {
        return res.status(400).json({
          success: false,
          message:
            "Cover artwork is not confirmed or does not belong to you.",
        });
      }

      // Prevent reusing the same artwork upload record.
      const alreadyUsed = await Release.exists({
        coverUploadId: verifiedCover._id,
      });

      if (alreadyUsed) {
        return res.status(409).json({
          success: false,
          message:
            "This cover upload is already attached to a release.",
        });
      }
    }

    // ========================================
    // PRIMARY ARTISTS
    // ========================================

    let finalPrimaryArtists = primaryArtists;

    if (
      !Array.isArray(finalPrimaryArtists) ||
      finalPrimaryArtists.length === 0
    ) {
      finalPrimaryArtists = [artist._id];
    }

    const finalCollaboratingArtists =
      collaboratingArtists === undefined
        ? []
        : collaboratingArtists;

    if (!Array.isArray(finalCollaboratingArtists)) {
      return res.status(400).json({
        success: false,
        message:
          "Collaborating artists must be an array.",
      });
    }

    const allArtistIds = [
      ...finalPrimaryArtists,
      ...finalCollaboratingArtists,
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
    // CREATE RELEASE
    // ========================================

    const release = new Release({
      title: title.trim(),

      releaseType,

      // Old releases can still use coverImage.
      coverImage: hasLegacyCover
        ? coverImage.trim()
        : "",

      // New R2 releases use the upload reference.
      coverUploadId: verifiedCover
        ? verifiedCover._id
        : null,

      releaseDate: parsedReleaseDate,

      primaryArtists: finalPrimaryArtists,

      collaboratingArtists:
        finalCollaboratingArtists,

      sourceType: "artist",

      submittedBy: req.user._id,

      status: "draft",

      visibilityStatus: "visible",
    });

    await release.save();

    // ========================================
    // POPULATE ARTIST DETAILS
    // ========================================

    const populatedRelease = await Release.findById(
      release._id
    )
      .populate(
        "primaryArtists",
        "stageName profileImage verified"
      )
      .populate(
        "collaboratingArtists",
        "stageName profileImage verified"
      );

    return res.status(201).json({
      success: true,
      message: "Release created successfully.",
      release: populatedRelease,
    });

  } catch (error) {
    console.error("Create release error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


/* ========================================
   GET MY RELEASES
======================================== */

const getMyReleases =
  async (req, res) => {

    try {

      /*
        Only releases created by
        the currently logged-in artist.
      */

      const releases =
        await Release.find({

          submittedBy:
            req.user._id,

        })
          .sort({
            createdAt: -1,
          })
          .populate(
            "primaryArtists",
            "stageName profileImage verified"
          )
          .populate(
            "collaboratingArtists",
            "stageName profileImage verified"
          );


      /*
        Add number of songs belonging
        to each release.
      */

      const releasesWithSongs =
        await Promise.all(

          releases.map(
            async (release) => {

              const songCount =
                await Song.countDocuments({

                  releaseId:
                    release._id,

                });


              return {

                ...release.toObject(),

                songCount,

              };

            }
          )

        );


      return res.status(200).json({

        success: true,

        count:
          releasesWithSongs.length,

        releases:
          releasesWithSongs,

      });


    } catch (error) {

      console.error(
        "Get my releases error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Server error.",

      });

    }

  };


/* ========================================
   GET ONE PUBLIC RELEASE
======================================== */

const getReleaseById = async (
  req,
  res
) => {

  try {

    const {
      releaseId,
    } = req.params;


    /*
      Allow approved releases that are
      visible or old records where
      visibilityStatus does not exist.
    */

    const release =
      await Release.findOne({

        _id:
          releaseId,

        status:
          "approved",

        $or: [

          {
            visibilityStatus:
              "visible",
          },

          {
            visibilityStatus: {
              $exists: false,
            },
          },

        ],

      })
        .populate(
          "primaryArtists",
          "stageName profileImage verified"
        )
        .populate(
          "collaboratingArtists",
          "stageName profileImage verified"
        );


    if (!release) {

      return res.status(404).json({

        success: false,

        message:
          "Release not found.",

      });

    }


    /*
      Get approved public songs
      belonging to this release.
    */

    const songs =
      await Song.find({

        releaseId:
          release._id,

        status:
          "approved",

        $or: [

          {
            visibilityStatus:
              "visible",
          },

          {
            visibilityStatus: {
              $exists: false,
            },
          },

        ],

      })
        .sort({
          trackNumber: 1,
        })
        .populate(
          "primaryArtists",
          "stageName profileImage verified"
        )
        .populate(
          "featuredArtists",
          "stageName profileImage verified"
        );


    return res.status(200).json({

      success: true,

      release,

      songs,

    });


  } catch (error) {

    console.error(
      "Get release error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Server error.",

    });

  }

};


/* ========================================
   SUBMIT RELEASE FOR REVIEW
======================================== */

const submitReleaseForReview =
  async (
    req,
    res
  ) => {

    try {

      const {
        releaseId,
      } = req.params;


      const {
        rightsConfirmed,
      } = req.body;


      const release =
        await Release.findById(
          releaseId
        );


      if (!release) {

        return res.status(404).json({

          success: false,

          message:
            "Release not found.",

        });

      }


      /*
        Only the creator of the release
        can submit it.
      */

      if (
        !release.submittedBy ||
        release.submittedBy.toString() !==
          req.user._id.toString()
      ) {

        return res.status(403).json({

          success: false,

          message:
            "You are not allowed to submit this release.",

        });

      }


      /*
        Only draft releases
        can be submitted.
      */

      if (
        release.status !==
        "draft"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Only draft releases can be submitted.",

        });

      }


      /*
        Artist must confirm rights.
      */

      if (
        rightsConfirmed !== true
      ) {

        return res.status(400).json({

          success: false,

          message:
            "You must confirm that you own this content or have permission to distribute it.",

        });

      }


      /*
        Find all songs inside release.
      */

      const songs =
        await Song.find({

          releaseId:
            release._id,

        });


      /*
        Release must contain
        at least one song.
      */

      if (
        songs.length === 0
      ) {

        return res.status(400).json({

          success: false,

          message:
            "You must add at least one song before submitting the release.",

        });

      }


      /*
        A single must contain
        exactly one song.
      */

      if (
        release.releaseType ===
          "single" &&
        songs.length !== 1
      ) {

        return res.status(400).json({

          success: false,

          message:
            "A single release must contain exactly one song.",

        });

      }


      /*
        Confirm rights.
      */

      release.rightsConfirmed =
        true;


      release.rightsConfirmedAt =
        new Date();


      /*
        Move release to pending.
      */

      release.status =
        "pending";


      await release.save();


      /*
        Move all songs inside
        this release to pending.
      */

      await Song.updateMany(

        {

          releaseId:
            release._id,

        },

        {

          $set: {

            status:
              "pending",

          },

        }

      );


      return res.status(200).json({

        success: true,

        message:
          "Release submitted for review successfully.",

        release,

      });


    } catch (error) {

      console.error(
        "Submit release error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Server error.",

      });

    }

  };


/* ========================================
   GET PENDING RELEASES
======================================== */

const getPendingReleases =
  async (
    req,
    res
  ) => {

    try {

      const releases =
        await Release.find({

          status:
            "pending",

        })
          .sort({
            createdAt: 1,
          })
          .populate(
            "primaryArtists",
            "stageName profileImage verified"
          )
          .populate(
            "collaboratingArtists",
            "stageName profileImage verified"
          )
          .populate(
            "submittedBy",
            "fullName email"
          );


      return res.status(200).json({

        success: true,

        releases,

      });


    } catch (error) {

      console.error(
        "Pending releases error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Server error.",

      });

    }

  };


/* ========================================
   APPROVE RELEASE
======================================== */

const approveRelease =
  async (
    req,
    res
  ) => {

    try {

      const {
        releaseId,
      } = req.params;


      const release =
        await Release.findById(
          releaseId
        )
          .populate(
            "primaryArtists",
            "stageName"
          );


      if (!release) {

        return res.status(404).json({

          success: false,

          message:
            "Release not found.",

        });

      }


      if (
        release.status !==
        "pending"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Only pending releases can be approved.",

        });

      }


      const songs =
        await Song.find({

          releaseId:
            release._id,

        });


      if (
        songs.length === 0
      ) {

        return res.status(400).json({

          success: false,

          message:
            "This release does not contain any songs.",

        });

      }


      /*
        Approve release.
      */

      release.status =
        "approved";


      /*
        Old releases may not have
        visibilityStatus.
      */

      if (
        !release.visibilityStatus
      ) {

        release.visibilityStatus =
          "visible";

      }


      await release.save();


      /*
        Approve all songs.
      */

      await Song.updateMany(

        {

          releaseId:
            release._id,

        },

        {

          $set: {

            status:
              "approved",

          },

        }

      );


      /*
        Notify artist who submitted release.
      */

      if (
        release.submittedBy
      ) {

        await Notification.create({

          userId:
            release.submittedBy,

          type:
            "release_approved",

          title:
            "Release Approved",

          message:
            `Your release "${release.title}" has been approved.`,

          link:
            `/release?id=${release._id}`,

        });

      }


      /*
        Primary artist IDs.
      */

      const artistIds =
        release.primaryArtists
          .map(
            (artist) =>
              artist._id
          );


      /*
        Followers with release
        notifications enabled.
      */

      const followers =
        await Follow.find({

          artistId: {
            $in:
              artistIds,
          },

          notificationsEnabled:
            true,

        });


      /*
        Remove duplicate listener IDs.
      */

      const uniqueFollowerIds =
        [
          ...new Set(

            followers.map(
              (follow) =>
                follow.userId.toString()
            )

          ),
        ];


      const artistNames =
        release.primaryArtists
          .map(
            (artist) =>
              artist.stageName
          )
          .filter(Boolean)
          .join(" & ");


      /*
        Create notifications for followers.
      */

      const followerNotifications =
        uniqueFollowerIds.map(
          (userId) => ({

            userId,

            type:
              "new_release",

            title:
              "New Release",

            message:
              `${artistNames} just released "${release.title}".`,

            link:
              `/release?id=${release._id}`,

          })
        );


      if (
        followerNotifications.length >
        0
      ) {

        await Notification.insertMany(
          followerNotifications
        );

      }


      return res.status(200).json({

        success: true,

        message:
          "Release approved successfully.",

        release,

        notifiedFollowers:
          followerNotifications.length,

      });


    } catch (error) {

      console.error(
        "Approve release error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Server error.",

      });

    }

  };


/* ========================================
   REJECT RELEASE
======================================== */

const rejectRelease =
  async (
    req,
    res
  ) => {

    try {

      const {
        releaseId,
      } = req.params;


      const release =
        await Release.findById(
          releaseId
        );


      if (!release) {

        return res.status(404).json({

          success: false,

          message:
            "Release not found.",

        });

      }


      if (
        release.status !==
        "pending"
      ) {

        return res.status(400).json({

          success: false,

          message:
            "Only pending releases can be rejected.",

        });

      }


      /*
        Reject release.
      */

      release.status =
        "rejected";


      await release.save();


      /*
        Reject all songs.
      */

      await Song.updateMany(

        {

          releaseId:
            release._id,

        },

        {

          $set: {

            status:
              "rejected",

          },

        }

      );


      /*
        Notify artist.
      */

      if (
        release.submittedBy
      ) {

        await Notification.create({

          userId:
            release.submittedBy,

          type:
            "release_rejected",

          title:
            "Release Rejected",

          message:
            `Your release "${release.title}" was not approved.`,

          link:
            `/release?id=${release._id}`,

        });

      }


      return res.status(200).json({

        success: true,

        message:
          "Release rejected successfully.",

        release,

      });


    } catch (error) {

      console.error(
        "Reject release error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Server error.",

      });

    }

  };


/* ========================================
   GET ALL PUBLIC RELEASES
======================================== */

const getPublicReleases =
  async (
    req,
    res
  ) => {

    try {

      const releases =
        await Release.find({

          status:
            "approved",

          $or: [

            {
              visibilityStatus:
                "visible",
            },

            {
              visibilityStatus: {
                $exists: false,
              },
            },

          ],

        })
          .sort({
            releaseDate: -1,
          })
          .populate(
            "primaryArtists",
            "stageName profileImage verified"
          )
          .populate(
            "collaboratingArtists",
            "stageName profileImage verified"
          );


      return res.status(200).json({

        success: true,

        releases,

      });


    } catch (error) {

      console.error(
        "Public releases error:",
        error
      );


      return res.status(500).json({

        success: false,

        message:
          "Server error.",

      });

    }

  };


/* ========================================
   EXPORT CONTROLLERS
======================================== */

module.exports = {

  createRelease,

  getMyReleases,

  getReleaseById,

  getPublicReleases,

  submitReleaseForReview,

  getPendingReleases,

  approveRelease,

  rejectRelease,

};