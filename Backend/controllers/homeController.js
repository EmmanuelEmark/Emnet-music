const Song = require("../models/song");

const Release = require("../models/Release");

const Artist = require("../models/Artist");
const Video = require("../models/video");

const getHomeFeed = async (req, res) => {
  try {
    // Latest approved songs
    const songs = await Song.find({
      status: "approved",
      visibilityStatus: "visible",
    })
      .sort({ createdAt: -1 })
      .limit(10)
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
        console.log("HOME SONGS:", JSON.stringify(songs, null, 2));
    // Make sure the song's release is also approved
    const latestSongs = songs.filter(
      (song) =>
        song.releaseId &&
        song.releaseId.status === "approved"
    );

    const featuredArtists = await Artist.find({
  approvalStatus: "approved",
  featured: true,
  visibilityStatus: "visible",
})
  .limit(10)
  .select(
    "stageName profileImage coverImage verified followersCount"
  );

    // Latest approved Singles, EPs and Albums
   const newReleases = await Release.find({
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
      .sort({ releaseDate: -1 })
      .limit(10)
      .populate(
        "primaryArtists",
        "stageName profileImage verified"
      )
      .populate(
        "collaboratingArtists",
        "stageName profileImage verified"
      );


const latestVideos = await Video.find({
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

  .sort({ createdAt: -1 })
  .limit(10)
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

  home: {
    latestSongs,
    newReleases,
    featuredArtists,
    latestVideos,
  },
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
  getHomeFeed,
};