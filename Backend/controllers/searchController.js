const Artist = require("../models/Artist");
const Song = require("../models/song");
const Release = require("../models/Release");
const Video = require("../models/video");

// ==========================================
// CONFIGURATION
// ==========================================

const SEARCH_RESULT_LIMIT = 30;

const MAX_SEARCH_LENGTH = 100;

const ALLOWED_SEARCH_ROLES = [
  "listener",
  "artist",
];

const ARTIST_FIELDS =
  "stageName profileImage profileImageUploadId verified";

const RELEASE_FIELDS =
  "title releaseType coverImage coverUploadId releaseDate status visibilityStatus";

// ==========================================
// CUSTOM SEARCH ERROR
// ==========================================

class SearchError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "SearchError";

    this.status = status;
  }
}

// ==========================================
// PREVENT SEARCH RESPONSE CACHING
//
// Search is restricted to authenticated
// accounts.
//
// Prevent stale or restricted content
// from being returned through caching.
// ==========================================

function preventCaching(res) {
  res.set(
    "Cache-Control",
    "private, no-store, max-age=0"
  );

  res.set(
    "Referrer-Policy",
    "no-referrer"
  );
}

// ==========================================
// REQUIRE AUTHENTICATED SEARCH USER
//
// ACCESS:
// - Listener
// - Artist
//
// BLOCKED:
// - Guest
// - Admin
// - Super Admin
// - Distributor
// ==========================================

function requireSearchUser(req) {
  if (
    !req.user?._id ||
    !req.auth
  ) {
    throw new SearchError(
      "Please sign in to search Emnet Music.",
      401
    );
  }

  if (
    !ALLOWED_SEARCH_ROLES.includes(
      req.user.role
    )
  ) {
    throw new SearchError(
      "This account cannot access listener search.",
      403
    );
  }

  if (
    req.user.accountStatus !==
    "active"
  ) {
    throw new SearchError(
      "Your account is unavailable.",
      403
    );
  }

  // Verify authenticated session.

  if (
    String(req.auth.userId) !==
      String(req.user._id) ||

    req.auth.role !==
      req.user.role ||

    !Number.isSafeInteger(
      req.auth.tokenVersion
    ) ||

    req.auth.tokenVersion < 0
  ) {
    throw new SearchError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// PUBLIC VISIBILITY FILTER
//
// Supports older records that do not
// contain an explicit visibility status.
//
// Hidden and takedown content is excluded.
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
// CHECK DOCUMENT VISIBILITY
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
// CHECK PUBLIC RELEASE
// ==========================================

function isPublicRelease(release) {
  return (
    Boolean(release) &&

    release.status === "approved" &&

    isVisible(release)
  );
}

// ==========================================
// NORMALIZE DOCUMENT ID
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
// VALIDATE SEARCH QUERY
//
// Prevent:
// - Empty queries
// - Invalid query objects
// - Excessively long search queries
// - Control characters
// ==========================================

function validateSearchQuery(value) {
  if (
    typeof value !== "string"
  ) {
    throw new SearchError(
      "Enter a valid search query."
    );
  }

  const searchText =
    value
      .replace(
        /[\u0000-\u001f\u007f]/g,
        " "
      )
      .trim();

  if (!searchText) {
    throw new SearchError(
      "Search query is required."
    );
  }

  if (
    searchText.length >
    MAX_SEARCH_LENGTH
  ) {
    throw new SearchError(
      `Search query cannot exceed ${MAX_SEARCH_LENGTH} characters.`
    );
  }

  return searchText;
}

// ==========================================
// ESCAPE REGULAR EXPRESSION CHARACTERS
//
// Treat the user's search query as
// ordinary text rather than executable
// regular expression patterns.
// ==========================================

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

// ==========================================
// CREATE SAFE SEARCH REGEX
//
// Case-insensitive text matching.
// ==========================================

function createSearchRegex(searchText) {
  return new RegExp(
    escapeRegex(searchText),

    "i"
  );
}

// ==========================================
// PUBLIC ARTIST POPULATION
//
// Restricted artist profiles must not
// appear through populated content.
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
// ==========================================

function populatePublicSongs(query) {
  return query.populate([
    // Primary artists.

    publicArtistPopulation(
      "primaryArtists"
    ),

    // Featured artists.

    publicArtistPopulation(
      "featuredArtists"
    ),

    // Parent release.

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
// Restricted linked songs and releases
// must not appear in search results.
// ==========================================

function populatePublicVideos(query) {
  return query.populate([
    // Primary artists.

    publicArtistPopulation(
      "primaryArtists"
    ),

    // Featured artists.

    publicArtistPopulation(
      "featuredArtists"
    ),

    // Linked song.

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

    // Linked release.

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
// ==========================================

function sanitizePublicVideo(video) {
  const result =
    removeInternalFields(video);

  // Remove linked songs if their
  // parent releases are unavailable.

  if (
    result.linkedSong &&

    !result.linkedSong.releaseId
  ) {
    result.linkedSong =
      null;
  }

  // Remove incorrect linked music
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

  // Remove internal administrative
  // and ownership information.

  delete result.videoHash;

  delete result.thumbnailHash;

  delete result.submittedBy;

  delete result.rightsConfirmed;

  delete result.rightsConfirmedAt;

  return result;
}

// ==========================================
// SEARCH PUBLIC ARTISTS
//
// Only approved and visible artists
// can appear in listener search.
// ==========================================

async function searchArtists(regex) {
  const artists =
    await Artist.find({
      stageName:
        regex,

      approvalStatus:
        "approved",

      ...publicVisibilityFilter(),
    })
      .select(
        "stageName profileImage profileImageUploadId coverImage coverImageUploadId verified followersCount"
      )
      .sort({
        verified: -1,

        followersCount: -1,

        stageName: 1,

        _id: 1,
      })
      .limit(
        SEARCH_RESULT_LIMIT
      )
      .lean();

  return artists;
}

// ==========================================
// FIND MATCHING PUBLIC SONG IDS
//
// Verify the parent release before
// applying the search result limit.
//
// This prevents restricted releases
// from occupying valid search positions.
// ==========================================

async function findMatchingPublicSongIds(
  regex
) {
  const songs =
    await Song.aggregate([
      // ====================================
      // MATCH PUBLISHED SONGS
      // ====================================

      {
        $match: {
          title:
            regex,

          status:
            "approved",

          ...publicVisibilityFilter(),
        },
      },

      // ====================================
      // SORT MATCHING SONGS
      // ====================================

      {
        $sort: {
          createdAt: -1,

          _id: -1,
        },
      },

      // ====================================
      // FIND PARENT RELEASE
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
      // VERIFY PARENT RELEASE VISIBILITY
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

      // ====================================
      // LIMIT VALID RESULTS
      // ====================================

      {
        $limit:
          SEARCH_RESULT_LIMIT,
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
// SEARCH PUBLIC SONGS
//
// Both the song and its parent release
// must be published and visible.
// ==========================================

async function searchSongs(regex) {
  const songIds =
    await findMatchingPublicSongIds(
      regex
    );

  if (
    songIds.length === 0
  ) {
    return [];
  }

  // ========================================
  // LOAD MATCHING SONG INFORMATION
  // ========================================

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

  // ========================================
  // RECHECK PARENT RELEASE
  // ========================================

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

  // ========================================
  // PRESERVE SEARCH RESULT ORDER
  // ========================================

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
// SEARCH PUBLIC RELEASES
//
// Includes:
// - Singles
// - EPs
// - Albums
// ==========================================

async function searchReleases(regex) {
  const releases =
    await populatePublicReleases(
      Release.find({
        title:
          regex,

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
          SEARCH_RESULT_LIMIT
        )
    ).lean();

  return releases.map(
    sanitizePublicRelease
  );
}

// ==========================================
// SEARCH PUBLIC VIDEOS
//
// Includes:
// - Music videos
// - Live performances
// - Interviews
// - Other video types
// ==========================================

async function searchVideos(regex) {
  const videos =
    await populatePublicVideos(
      Video.find({
        title:
          regex,

        status:
          "approved",

        ...publicVisibilityFilter(),
      })
        .sort({
          publishedAt: -1,

          createdAt: -1,

          _id: -1,
        })
        .limit(
          SEARCH_RESULT_LIMIT
        )
    ).lean();

  return videos.map(
    sanitizePublicVideo
  );
}

// ==========================================
// CENTRALIZED ERROR HANDLING
// ==========================================

function sendError(
  res,

  error,

  context
) {
  preventCaching(res);

  // Expected search errors.

  if (
    error instanceof SearchError
  ) {
    return res.status(error.status).json({
      success: false,

      message: error.message,
    });
  }

  // Invalid database reference.

  if (
    error.name === "CastError" ||

    error.name === "ValidationError"
  ) {
    return res.status(400).json({
      success: false,

      message:
        "Invalid search information.",
    });
  }

  // Unexpected server error.

  console.error(
    context,

    error.name,

    error.code || "",

    error.message
  );

  return res.status(500).json({
    success: false,

    message:
      "Unable to complete your search. Please try again.",
  });
}

// ==========================================
// SEARCH EMNET MUSIC
//
// GET /api/search?q=searchText
//
// ACCESS:
// - Authenticated Listener
// - Authenticated Artist
//
// Searches:
// - Artists
// - Songs
// - Releases
// - Videos
// ==========================================

const search =
  async (req, res) => {
    try {
      preventCaching(res);

      // ====================================
      // VERIFY AUTHENTICATED USER
      // ====================================

      requireSearchUser(req);

      // ====================================
      // VALIDATE SEARCH QUERY
      // ====================================

      const searchText =
        validateSearchQuery(
          req.query.q
        );

      // ====================================
      // CREATE SAFE SEARCH PATTERN
      // ====================================

      const regex =
        createSearchRegex(
          searchText
        );

      // ====================================
      // SEARCH ALL CONTENT CATEGORIES
      //
      // Execute independent database
      // queries concurrently.
      // ====================================

      const [
        artists,

        songs,

        releases,

        videos,
      ] = await Promise.all([
        searchArtists(
          regex
        ),

        searchSongs(
          regex
        ),

        searchReleases(
          regex
        ),

        searchVideos(
          regex
        ),
      ]);

      // ====================================
      // RETURN SEARCH RESULTS
      //
      // Preserve the existing response
      // structure used by React.
      // ====================================

      return res.status(200).json({
        success: true,

        query:
          searchText,

        results: {
          artists,

          songs,

          releases,

          videos,
        },
      });

    } catch (error) {
      return sendError(
        res,

        error,

        "Search Emnet Music error:"
      );
    }
  };

// ==========================================
// EXPORT SEARCH CONTROLLER
// ==========================================

module.exports = {
  search,
};