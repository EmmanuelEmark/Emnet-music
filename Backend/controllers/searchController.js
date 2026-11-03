const Artist = require("../models/Artist");
const Song = require("../models/song");
const Release = require("../models/Release");
const Video = require("../models/Video");


const search = async (req, res) => {

  try {

    const query =
      req.query.q;


    if (
      !query ||
      !query.trim()
    ) {

      return res
        .status(400)
        .json({

          success: false,

          message:
            "Search query is required.",

        });

    }


    const searchText =
      query.trim();


    /* ========================================
       ARTISTS
    ======================================== */

    const artists =
      await Artist.find({

        approvalStatus:
          "approved",

        stageName: {
          $regex:
            searchText,

          $options:
            "i",
        },

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
          {
            visibilityStatus:
              null,
          },
        ],

      })
        .select(
          "stageName profileImage coverImage verified followersCount"
        );


    /* ========================================
       SONGS
    ======================================== */

    const songs =
      await Song.find({

        status:
          "approved",

        title: {
          $regex:
            searchText,

          $options:
            "i",
        },

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
          {
            visibilityStatus:
              null,
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
          "releaseId",
          "title releaseType coverImage releaseDate status visibilityStatus"
        );


    /*
      A song should only appear publicly
      if its release is also approved.
    */

    const publicSongs =
      songs.filter(
        (song) => {

          if (!song.releaseId) {
            return false;
          }


          if (
            song.releaseId.status !==
            "approved"
          ) {

            return false;

          }


          /*
            Allow older releases that
            don't yet have
            visibilityStatus.
          */

          if (
            song.releaseId
              .visibilityStatus &&
            song.releaseId
              .visibilityStatus !==
              "visible"
          ) {

            return false;

          }


          return true;

        }
      );


    /* ========================================
       RELEASES
    ======================================== */

    const releases =
      await Release.find({

        status:
          "approved",

        title: {
          $regex:
            searchText,

          $options:
            "i",
        },

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
          {
            visibilityStatus:
              null,
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


    /* ========================================
       VIDEOS
    ======================================== */

    const videos =
      await Video.find({

        status:
          "approved",

        title: {
          $regex:
            searchText,

          $options:
            "i",
        },

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
          {
            visibilityStatus:
              null,
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
          "title releaseType coverImage"
        );


    /* ========================================
       RESPONSE
    ======================================== */

    return res
      .status(200)
      .json({

        success: true,

        query:
          searchText,

        results: {

          artists,

          songs:
            publicSongs,

          releases,

          videos,

        },

      });


  } catch (error) {

    console.error(
      "Search error:",
      error
    );


    return res
      .status(500)
      .json({

        success: false,

        message:
          "Server error.",

      });

  }

};


module.exports = {
  search,
};