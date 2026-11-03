const Song = require("../models/song");

const Release = require("../models/Release");

const Artist = require("../models/Artist");
const Video = require("../models/video");

const Play = require("../models/Play");

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


  
    
    // ========================================
    // TRENDING SONGS — LAST 7 DAYS
    // ========================================

    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    );

    // Count recorded plays for each song.
    const trendingPlayCounts = await Play.aggregate([
      {
        $match: {
          countedAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: "$songId",
          recentPlays: { $sum: 1 },
        },
      },
      {
        $sort: {
          recentPlays: -1,
        },
      },
      {
        $limit: 100,
      },
    ]);

    const trendingSongIds = trendingPlayCounts.map(
      (item) => item._id
    );

    // Retrieve only approved, visible songs.
    const trendingCandidates = await Song.find({
      _id: { $in: trendingSongIds },
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

    // Match each song to its recent play count.
    const playCountMap = new Map(
      trendingPlayCounts.map((item) => [
        String(item._id),
        item.recentPlays,
      ])
    );

    const trendingSongs = trendingCandidates
      .filter(
        (song) =>
          song.releaseId &&
          song.releaseId.status === "approved"
      )
      .map((song) => ({
        ...song.toObject(),
        recentPlays:
          playCountMap.get(String(song._id)) || 0,
      }))
      .sort(
        (a, b) => b.recentPlays - a.recentPlays
      )
      .slice(0, 10);

   
    // ========================================
    // PERSONALIZED RECOMMENDATIONS
    // ========================================

    const trendingIds = new Set(
      trendingSongs.map((song) => String(song._id))
    );

    const recommendationCandidates = await Song.find({
      status: "approved",
      visibilityStatus: "visible",
    })
      .sort({ createdAt: -1 })
      .limit(100)
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

    const approvedRecommendations =
      recommendationCandidates.filter(
        (song) =>
          song.releaseId &&
          song.releaseId.status === "approved" &&
          !trendingIds.has(String(song._id))
      );

    let rankedRecommendations = [
      ...approvedRecommendations,
    ];

    if (req.user && req.user._id) {
      const ninetyDaysAgo = new Date(
        Date.now() - 90 * 24 * 60 * 60 * 1000
      );

      const recentPlays = await Play.find({
        userId: req.user._id,
        countedAt: { $gte: ninetyDaysAgo },
      })
        .sort({ countedAt: -1 })
        .limit(200)
        .select("songId")
        .lean();

      const playedIds = new Set(
        recentPlays.map((play) => String(play.songId))
      );

      const playedSongs = await Song.find({
        _id: { $in: [...playedIds] },
      })
        .select("genre primaryArtists")
        .lean();

      const preferredGenres = new Set();
      const preferredArtists = new Set();

      playedSongs.forEach((song) => {
        if (song.genre) {
          preferredGenres.add(
            String(song.genre).toLowerCase()
          );
        }

        (song.primaryArtists || []).forEach(
          (artistId) => {
            preferredArtists.add(String(artistId));
          }
        );
      });

      rankedRecommendations.sort((a, b) => {
        const score = (song) => {
          let points = 0;

          if (
            preferredGenres.has(
              String(song.genre || "").toLowerCase()
            )
          ) {
            points += 2;
          }

          if (
            (song.primaryArtists || []).some(
              (artist) =>
                preferredArtists.has(
                  String(artist._id || artist)
                )
            )
          ) {
            points += 3;
          }

          if (!playedIds.has(String(song._id))) {
            points += 1;
          }

          return points;
        };

        return score(b) - score(a);
      });
    }

    // Include different genres where possible.
    const recommendedSongs = [];
    const usedGenres = new Set();
    const recommendedIds = new Set();

    for (const song of rankedRecommendations) {
      const genre = String(
        song.genre || ""
      ).toLowerCase();

      if (genre && !usedGenres.has(genre)) {
        recommendedSongs.push(song);
        recommendedIds.add(String(song._id));
        usedGenres.add(genre);
      }

      if (recommendedSongs.length === 10) break;
    }

    // Fill remaining spaces without duplicates.
    for (const song of rankedRecommendations) {
      if (recommendedSongs.length === 10) break;

      if (!recommendedIds.has(String(song._id))) {
        recommendedSongs.push(song);
        recommendedIds.add(String(song._id));
      }
    }





return res.status(200).json({
  success: true,

  home: {
    latestSongs,
    newReleases,
    featuredArtists,
    latestVideos,
    trendingSongs,
    recommendedSongs,
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