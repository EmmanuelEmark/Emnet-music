const Song = require("../models/song");
const Release = require("../models/Release");
const Artist = require("../models/Artist");
const Video = require("../models/video");
const Play = require("../models/play");

// ==========================================
// CONFIGURATION
// ==========================================

const HOME_SECTION_LIMIT = 10;

const TRENDING_CANDIDATE_LIMIT = 100;

const RECOMMENDATION_CANDIDATE_LIMIT = 100;

const HISTORY_LIMIT = 200;

const TRENDING_DAYS = 7;

const RECOMMENDATION_HISTORY_DAYS = 90;

const ARTIST_FIELDS =
  "stageName profileImage profileImageUploadId verified";

const RELEASE_FIELDS =
  "title releaseType coverImage coverUploadId releaseDate status visibilityStatus";

// ==========================================
// PUBLIC VISIBILITY FILTER
//
// Support older records without explicit
// visibility statuses.
//
// Hidden and taken-down content is excluded.
// ==========================================

function publicVisibilityFilter() {
  return {
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
  };
}

// ==========================================
// VERIFY DOCUMENT VISIBILITY
// ==========================================

function isVisible(content) {
  if (!content) {
    return false;
  }

  return (
    content.visibilityStatus === "visible" ||

    content.visibilityStatus === undefined ||

    content.visibilityStatus === null
  );
}

// ==========================================
// VERIFY PUBLIC RELEASE
// ==========================================

function isPublicRelease(release) {
  return (
    Boolean(release) &&

    release.status === "approved" &&

    isVisible(release)
  );
}

// ==========================================
// PREVENT RESPONSE CACHING
//
// The homepage may contain personalized
// recommendations.
//
// Do not serve stale recommendations or
// previously restricted content.
// ==========================================

function preventCaching(res) {
  res.set(
    "Cache-Control",
    "private, no-store, max-age=0"
  );
}

// ==========================================
// NORMALIZE ID
//
// Supports populated objects and
// ordinary MongoDB ObjectIds.
// ==========================================

function getId(value) {
  if (!value) {
    return "";
  }

  return String(
    value._id || value
  );
}

// ==========================================
// NORMALIZE GENRE
// ==========================================

function normalizeGenre(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .toLowerCase();
}

// ==========================================
// PUBLIC ARTIST POPULATION
// ==========================================

function publicArtistPopulation(path) {
  return {
    path,

    select:
      ARTIST_FIELDS,

    match: {
      approvalStatus:
        "approved",

      ...publicVisibilityFilter(),
    },
  };
}

// ==========================================
// POPULATE PUBLIC SONG INFORMATION
//
// Includes R2 media references.
//
// Restricted artist profiles and parent
// releases are excluded.
// ==========================================

function populatePublicSongs(query) {
  return query.populate([
    publicArtistPopulation(
      "primaryArtists"
    ),

    publicArtistPopulation(
      "featuredArtists"
    ),

    {
      path:
        "releaseId",

      select:
        RELEASE_FIELDS,

      match: {
        status:
          "approved",

        ...publicVisibilityFilter(),
      },
    },
  ]);
}

// ==========================================
// POPULATE PUBLIC RELEASE INFORMATION
// ==========================================

function populatePublicReleases(query) {
  return query.populate([
    publicArtistPopulation(
      "primaryArtists"
    ),

    publicArtistPopulation(
      "collaboratingArtists"
    ),
  ]);
}

// ==========================================
// POPULATE PUBLIC VIDEO INFORMATION
//
// Restricted linked music must not
// appear through video information.
// ==========================================

function populatePublicVideos(query) {
  return query.populate([
    publicArtistPopulation(
      "primaryArtists"
    ),

    publicArtistPopulation(
      "featuredArtists"
    ),

    {
      path:
        "linkedSong",

      select:
        "title genre duration releaseId",

      match: {
        status:
          "approved",

        ...publicVisibilityFilter(),
      },

      populate: {
        path:
          "releaseId",

        select:
          "_id",

        match: {
          status:
            "approved",

          ...publicVisibilityFilter(),
        },
      },
    },

    {
      path:
        "linkedRelease",

      select:
        "title releaseType coverImage coverUploadId",

      match: {
        status:
          "approved",

        ...publicVisibilityFilter(),
      },
    },
  ]);
}

// ==========================================
// CONVERT DOCUMENT TO PLAIN OBJECT
// ==========================================

function toPlainObject(document) {
  return (
    typeof document.toObject ===
    "function"
  )
    ? document.toObject()
    : { ...document };
}

// ==========================================
// REMOVE INTERNAL MODERATION INFORMATION
// ==========================================

function removeInternalFields(content) {
  const result =
    toPlainObject(content);

  delete result.moderationReason;

  delete result.moderatedBy;

  delete result.moderatedAt;

  delete result.__v;

  return result;
}

// ==========================================
// SANITIZE PUBLIC SONG
// ==========================================

function sanitizePublicSong(song) {
  const result =
    removeInternalFields(song);

  delete result.audioHash;

  return result;
}

// ==========================================
// SANITIZE PUBLIC RELEASE
// ==========================================

function sanitizePublicRelease(release) {
  const result =
    removeInternalFields(
      release
    );

  delete result.coverHash;

  delete result.submittedBy;

  delete result.distributorId;

  delete result.rightsConfirmed;

  delete result.rightsConfirmedAt;

  return result;
}

// ==========================================
// SANITIZE PUBLIC VIDEO
//
// Keep video moderation independent from
// song and release moderation.
//
// Remove unavailable linked music.
// ==========================================

function sanitizePublicVideo(video) {
  const result =
    removeInternalFields(video);

  // A linked song is unavailable if
  // its parent release is unavailable.

  if (
    result.linkedSong &&

    !result.linkedSong.releaseId
  ) {
    result.linkedSong =
      null;
  }

  // Prevent incorrect linked music
  // relationships.

  if (
    result.linkedSong &&

    result.linkedRelease &&

    getId(
      result.linkedSong.releaseId
    ) !==

    getId(
      result.linkedRelease
    )
  ) {
    result.linkedSong =
      null;
  }

  delete result.videoHash;

  delete result.thumbnailHash;

  delete result.submittedBy;

  delete result.rightsConfirmed;

  delete result.rightsConfirmedAt;

  return result;
}

// ==========================================
// FIND PUBLIC SONG CANDIDATES
//
// Use MongoDB aggregation to verify the
// parent release BEFORE applying limits.
//
// This prevents hidden releases from
// occupying homepage positions.
// ==========================================

async function findPublicSongIds({
  match = {},

  sort = {
    createdAt: -1,
    _id: -1,
  },

  limit = HOME_SECTION_LIMIT,
} = {}) {
  const songs =
    await Song.aggregate([
      {
        $match: {
          $and: [
            {
              status:
                "approved",

              ...publicVisibilityFilter(),
            },

            match,
          ],
        },
      },

      {
        $sort:
          sort,
      },

      // ====================================
      // FIND THE PARENT RELEASE
      // ====================================

      {
        $lookup: {
          from:
            Release.collection.name,

          localField:
            "releaseId",

          foreignField:
            "_id",

          as:
            "parentRelease",
        },
      },

      // ====================================
      // REQUIRE A PUBLIC PARENT RELEASE
      // ====================================

      {
        $match: {
          parentRelease: {
            $elemMatch: {
              status:
                "approved",

              ...publicVisibilityFilter(),
            },
          },
        },
      },

      // Only apply the limit after
      // verifying content visibility.

      {
        $limit:
          limit,
      },

      {
        $project: {
          _id: 1,
        },
      },
    ]);

  return songs.map(
    (song) =>
      song._id
  );
}

// ==========================================
// LOAD PUBLIC SONGS BY ID
//
// Recheck publication and visibility.
//
// Preserve the supplied order.
// ==========================================

async function loadPublicSongsByIds(
  songIds
) {
  if (
    !Array.isArray(songIds) ||

    songIds.length === 0
  ) {
    return [];
  }

  const songs =
    await populatePublicSongs(
      Song.find({
        _id: {
          $in:
            songIds,
        },

        status:
          "approved",

        ...publicVisibilityFilter(),
      })
    ).lean();

  const songMap =
    new Map();

  for (const song of songs) {
    if (
      !isPublicRelease(
        song.releaseId
      )
    ) {
      continue;
    }

    songMap.set(
      getId(song),

      sanitizePublicSong(song)
    );
  }

  return songIds
    .map(
      (songId) =>
        songMap.get(
          getId(songId)
        )
    )
    .filter(Boolean);
}

// ==========================================
// GET LATEST SONGS
//
// Latest publicly available songs.
// ==========================================

async function getLatestSongs() {
  const songIds =
    await findPublicSongIds({
      limit:
        HOME_SECTION_LIMIT,
    });

  return loadPublicSongsByIds(
    songIds
  );
}

// ==========================================
// GET FEATURED ARTISTS
//
// Only approved, visible and featured
// artists can appear on the homepage.
// ==========================================

async function getFeaturedArtists() {
  return Artist.find({
    approvalStatus:
      "approved",

    featured:
      true,

    ...publicVisibilityFilter(),
  })
    .select(
      "stageName profileImage profileImageUploadId coverImage coverImageUploadId verified followersCount"
    )
    .sort({
      createdAt: -1,

      _id: -1,
    })
    .limit(
      HOME_SECTION_LIMIT
    )
    .lean();
}

// ==========================================
// GET NEW RELEASES
//
// Singles, EPs and Albums.
// ==========================================

async function getNewReleases() {
  const releases =
    await populatePublicReleases(
      Release.find({
        status:
          "approved",

        ...publicVisibilityFilter(),
      })
        .sort({
          releaseDate: -1,

          createdAt: -1,

          _id: -1,
        })
        .limit(
          HOME_SECTION_LIMIT
        )
    ).lean();

  return releases.map(
    sanitizePublicRelease
  );
}

// ==========================================
// GET LATEST VIDEOS
//
// Published and visible videos only.
// ==========================================

async function getLatestVideos() {
  const videos =
    await populatePublicVideos(
      Video.find({
        status:
          "approved",

        ...publicVisibilityFilter(),
      })
        .sort({
          createdAt: -1,

          _id: -1,
        })
        .limit(
          HOME_SECTION_LIMIT
        )
    ).lean();

  return videos.map(
    sanitizePublicVideo
  );
}

// ==========================================
// GET TRENDING SONGS
//
// Based on recorded plays within the
// previous seven days.
//
// Restricted songs and parent releases
// are excluded from the trending chart.
// ==========================================

async function getTrendingSongs() {
  const sevenDaysAgo =
    new Date(
      Date.now() -
        TRENDING_DAYS *
        24 *
        60 *
        60 *
        1000
    );

  // ========================================
  // COUNT RECENT SONG PLAYS
  // ========================================

  const trendingRecords =
    await Play.aggregate([
      {
        $match: {
          countedAt: {
            $gte:
              sevenDaysAgo,
          },
        },
      },

      {
        $group: {
          _id:
            "$songId",

          recentPlays: {
            $sum: 1,
          },
        },
      },

      // ====================================
      // VERIFY THE SONG IS PUBLIC
      // ====================================

      {
        $lookup: {
          from:
            Song.collection.name,

          localField:
            "_id",

          foreignField:
            "_id",

          as:
            "song",
        },
      },

      {
        $unwind:
          "$song",
      },

      {
        $match: {
          "song.status":
            "approved",

          $or: [
            {
              "song.visibilityStatus":
                "visible",
            },

            {
              "song.visibilityStatus": {
                $exists: false,
              },
            },

            {
              "song.visibilityStatus":
                null,
            },
          ],
        },
      },

      // ====================================
      // VERIFY PARENT RELEASE
      // ====================================

      {
        $lookup: {
          from:
            Release.collection.name,

          localField:
            "song.releaseId",

          foreignField:
            "_id",

          as:
            "parentRelease",
        },
      },

      {
        $match: {
          parentRelease: {
            $elemMatch: {
              status:
                "approved",

              ...publicVisibilityFilter(),
            },
          },
        },
      },

      // ====================================
      // RANK PUBLIC TRENDING SONGS
      // ====================================

      {
        $sort: {
          recentPlays: -1,

          _id: 1,
        },
      },

      {
        $limit:
          TRENDING_CANDIDATE_LIMIT,
      },

      {
        $project: {
          _id: 1,

          recentPlays: 1,
        },
      },
    ]);

  if (
    trendingRecords.length === 0
  ) {
    return [];
  }

  // ========================================
  // LOAD PUBLIC SONG INFORMATION
  // ========================================

  const songIds =
    trendingRecords.map(
      (record) =>
        record._id
    );

  const songs =
    await loadPublicSongsByIds(
      songIds
    );

  const playCountMap =
    new Map(
      trendingRecords.map(
        (record) => [
          getId(record._id),

          record.recentPlays,
        ]
      )
    );

  // ========================================
  // ATTACH RECENT PLAY COUNTS
  // ========================================

  return songs
    .map(
      (song) => ({
        ...song,

        recentPlays:
          playCountMap.get(
            getId(song)
          ) || 0,
      })
    )

    .sort(
      (first, second) =>
        second.recentPlays -
        first.recentPlays
    )

    .slice(
      0,

      HOME_SECTION_LIMIT
    );
}

// ==========================================
// GET LISTENER MUSIC PREFERENCES
//
// Uses the authenticated listener's or
// artist's recorded listening history.
//
// Guests do not have personalized
// account-based recommendations.
// ==========================================

async function getListenerPreferences(
  req
) {
  const preferences = {
    preferredGenres:
      new Set(),

    preferredArtists:
      new Set(),

    playedSongIds:
      new Set(),
  };

  // ========================================
  // VERIFY PERSONALIZATION ELIGIBILITY
  // ========================================

  if (
    !req.user?._id ||

    !["listener", "artist"].includes(
      req.user.role
    ) ||

    req.user.accountStatus !== "active"
  ) {
    return preferences;
  }

  const historyStartDate =
    new Date(
      Date.now() -
        RECOMMENDATION_HISTORY_DAYS *
        24 *
        60 *
        60 *
        1000
    );

  // ========================================
  // GET RECENT RECORDED PLAYS
  // ========================================

  const recentPlays =
    await Play.find({
      userId:
        req.user._id,

      countedAt: {
        $gte:
          historyStartDate,
      },
    })
      .select(
        "songId"
      )
      .sort({
        countedAt: -1,

        _id: -1,
      })
      .limit(
        HISTORY_LIMIT
      )
      .lean();

  const playedSongIds = [
    ...new Set(
      recentPlays
        .filter(
          (play) =>
            Boolean(play.songId)
        )
        .map(
          (play) =>
            getId(play.songId)
        )
    ),
  ];

  preferences.playedSongIds =
    new Set(
      playedSongIds
    );

  if (
    playedSongIds.length === 0
  ) {
    return preferences;
  }

  // ========================================
  // LOAD PREVIOUSLY PLAYED PUBLIC SONGS
  //
  // Restricted songs should not influence
  // the public recommendation catalogue.
  // ========================================

  const playedSongs =
    await Song.find({
      _id: {
        $in:
          playedSongIds,
      },

      status:
        "approved",

      ...publicVisibilityFilter(),
    })
      .select(
        "genre primaryArtists releaseId"
      )
      .populate({
        path:
          "releaseId",

        select:
          "_id status visibilityStatus",

        match: {
          status:
            "approved",

          ...publicVisibilityFilter(),
        },
      })
      .populate({
        path:
          "primaryArtists",

        select:
          "_id",

        match: {
          approvalStatus:
            "approved",

          ...publicVisibilityFilter(),
        },
      })
      .lean();

  // ========================================
  // BUILD MUSIC PREFERENCES
  // ========================================

  for (const song of playedSongs) {
    if (
      !isPublicRelease(
        song.releaseId
      )
    ) {
      continue;
    }

    const genre =
      normalizeGenre(
        song.genre
      );

    if (genre) {
      preferences.preferredGenres.add(
        genre
      );
    }

    for (
      const artist of
        song.primaryArtists || []
    ) {
      const artistId =
        getId(artist);

      if (artistId) {
        preferences.preferredArtists.add(
          artistId
        );
      }
    }
  }

  return preferences;
}

// ==========================================
// SCORE RECOMMENDED SONG
//
// Existing recommendation weights:
//
// Preferred genre:  +2
// Preferred artist: +3
// Previously unplayed song: +1
// ==========================================

function scoreRecommendedSong(
  song,

  preferences
) {
  let score = 0;

  // ========================================
  // GENRE MATCH
  // ========================================

  const genre =
    normalizeGenre(
      song.genre
    );

  if (
    genre &&

    preferences.preferredGenres.has(
      genre
    )
  ) {
    score += 2;
  }

  // ========================================
  // ARTIST MATCH
  // ========================================

  const matchesPreferredArtist =
    (song.primaryArtists || [])
      .some(
        (artist) =>
          preferences.preferredArtists.has(
            getId(artist)
          )
      );

  if (
    matchesPreferredArtist
  ) {
    score += 3;
  }

  // ========================================
  // MUSIC DISCOVERY BONUS
  // ========================================

  if (
    !preferences.playedSongIds.has(
      getId(song)
    )
  ) {
    score += 1;
  }

  return score;
}

// ==========================================
// SELECT DIVERSE RECOMMENDATIONS
//
// Prefer different genres initially,
// then fill remaining positions using
// the highest-ranked songs.
// ==========================================

function selectDiverseRecommendations(
  rankedSongs,

  limit
) {
  const selectedSongs = [];

  const selectedSongIds =
    new Set();

  const selectedGenres =
    new Set();

  // ========================================
  // FIRST PASS: GENRE DIVERSITY
  // ========================================

  for (const item of rankedSongs) {
    if (
      selectedSongs.length >=
      limit
    ) {
      break;
    }

    const song =
      item.song;

    const songId =
      getId(song);

    const genre =
      normalizeGenre(
        song.genre
      ) || "unknown";

    if (
      selectedSongIds.has(
        songId
      )
    ) {
      continue;
    }

    if (
      selectedGenres.has(
        genre
      )
    ) {
      continue;
    }

    selectedSongs.push(
      song
    );

    selectedSongIds.add(
      songId
    );

    selectedGenres.add(
      genre
    );
  }

  // ========================================
  // SECOND PASS: FILL REMAINING POSITIONS
  // ========================================

  for (const item of rankedSongs) {
    if (
      selectedSongs.length >=
      limit
    ) {
      break;
    }

    const song =
      item.song;

    const songId =
      getId(song);

    if (
      selectedSongIds.has(
        songId
      )
    ) {
      continue;
    }

    selectedSongs.push(
      song
    );

    selectedSongIds.add(
      songId
    );
  }

  return selectedSongs;
}

// ==========================================
// GET RECOMMENDED SONGS
//
// Combines listening history, preferred
// genres, preferred artists and discovery.
// ==========================================

async function getRecommendedSongs(
  req,

  trendingSongs
) {
  // ========================================
  // EXCLUDE CURRENT TRENDING SONGS
  //
  // Prevent unnecessary duplication
  // between homepage sections.
// ==========================================

  const trendingSongIds =
    trendingSongs.map(
      (song) =>
        song._id
    );

  // ========================================
  // GET PUBLIC RECOMMENDATION CANDIDATES
  // ========================================

  const candidateIds =
    await findPublicSongIds({
      match: {
        _id: {
          $nin:
            trendingSongIds,
        },
      },

      sort: {
        createdAt: -1,

        _id: -1,
      },

      limit:
        RECOMMENDATION_CANDIDATE_LIMIT,
    });

  if (
    candidateIds.length === 0
  ) {
    return [];
  }

  // ========================================
  // LOAD CANDIDATES AND PREFERENCES
  // ========================================

  const [
    candidates,

    preferences,
  ] = await Promise.all([
    loadPublicSongsByIds(
      candidateIds
    ),

    getListenerPreferences(
      req
    ),
  ]);

  // ========================================
  // SCORE CANDIDATES
  // ========================================

  const rankedSongs =
    candidates.map(
      (song) => ({
        song,

        score:
          scoreRecommendedSong(
            song,

            preferences
          ),
      })
    );

  // ========================================
  // RANK RECOMMENDATIONS
  // ========================================

  rankedSongs.sort(
    (first, second) => {
      const scoreDifference =
        second.score -
        first.score;

      if (
        scoreDifference !== 0
      ) {
        return scoreDifference;
      }

      // Prefer newer songs when
      // recommendation scores are equal.

      const firstDate =
        new Date(
          first.song.createdAt || 0
        ).getTime() || 0;

      const secondDate =
        new Date(
          second.song.createdAt || 0
        ).getTime() || 0;

      return secondDate -
        firstDate;
    }
  );

  // ========================================
  // SELECT DIVERSE RECOMMENDATIONS
  // ========================================

  return selectDiverseRecommendations(
    rankedSongs,

    HOME_SECTION_LIMIT
  );
}

// ==========================================
// GET HOME FEED
//
// GET /api/home
//
// Supports guests, listeners and artists.
//
// Existing response structure is preserved.
// ==========================================

const getHomeFeed =
  async (req, res) => {
    try {
      preventCaching(res);

      // ====================================
      // LOAD INDEPENDENT HOMEPAGE SECTIONS
      // ====================================

      const [
        latestSongs,

        newReleases,

        featuredArtists,

        latestVideos,

        trendingSongs,
      ] = await Promise.all([
        getLatestSongs(),

        getNewReleases(),

        getFeaturedArtists(),

        getLatestVideos(),

        getTrendingSongs(),
      ]);

      // ====================================
      // LOAD PERSONALIZED RECOMMENDATIONS
      //
      // Exclude existing trending songs.
      // ====================================

      const recommendedSongs =
        await getRecommendedSongs(
          req,

          trendingSongs
        );

      // ====================================
      // RETURN COMPLETE HOME FEED
      // ====================================

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
      preventCaching(res);

      console.error(
        "Get home feed error:",

        error.name,

        error.code || "",

        error.message
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to load the home feed.",
      });
    }
  };

// ==========================================
// EXPORT HOME CONTROLLER
// ==========================================

module.exports = {
  getHomeFeed,
};