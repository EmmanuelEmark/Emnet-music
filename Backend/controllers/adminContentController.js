const mongoose = require("mongoose");

const Artist = require("../models/Artist");
const Song = require("../models/song");
const Release = require("../models/Release");
const Video = require("../models/video");
const Report = require("../models/Report");

// ==========================================
// CONFIGURATION
// ==========================================

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const CONTENT_STATUSES = [
  "draft",
  "pending",
  "approved",
  "rejected",
];

const VISIBILITY_STATUSES = [
  "visible",
  "hidden",
  "takedown",
];

const ARTIST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "suspended",
];

const ARTIST_FIELDS =
  "stageName profileImage profileImageUploadId verified approvalStatus visibilityStatus";

const RELEASE_FIELDS =
  "title releaseType coverImage coverUploadId status visibilityStatus releaseDate";

// ==========================================
// CUSTOM ADMIN CONTENT ERROR
// ==========================================

class AdminContentError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "AdminContentError";
    this.status = status;
  }
}

// ==========================================
// PREVENT RESPONSE CACHING
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
// VERIFY ADMINISTRATOR
// ==========================================

function requireAdministrator(req) {
  if (!req.user?._id || !req.auth) {
    throw new AdminContentError(
      "Authentication is required.",
      401
    );
  }

  if (
    !["admin", "superadmin"].includes(
      req.user.role
    )
  ) {
    throw new AdminContentError(
      "Administrative access is required.",
      403
    );
  }

  if (
    req.user.accountStatus !== "active" ||
    req.user.emailVerified !== true
  ) {
    throw new AdminContentError(
      "Your administrative account is unavailable.",
      403
    );
  }

  if (
    String(req.auth.userId) !==
      String(req.user._id) ||

    req.auth.role !== req.user.role ||

    !Number.isSafeInteger(
      req.auth.tokenVersion
    ) ||

    req.auth.tokenVersion < 0
  ) {
    throw new AdminContentError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// VALIDATE MONGODB ID
// ==========================================

function isValidId(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{24}$/i.test(value)
  );
}

// ==========================================
// ESCAPE REGULAR EXPRESSION
// ==========================================

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

// ==========================================
// PUBLIC VISIBILITY FILTER
// ==========================================

function publicVisibilityFilter() {
  return {
    $or: [
      { visibilityStatus: "visible" },

      {
        visibilityStatus: {
          $exists: false,
        },
      },

      { visibilityStatus: null },
    ],
  };
}

// ==========================================
// VALIDATE INTEGER QUERY PARAMETER
// ==========================================

function readInteger(
  value,
  defaultValue,
  name
) {
  if (value === undefined) {
    return defaultValue;
  }

  if (
    typeof value !== "string" ||
    !/^\d+$/.test(value)
  ) {
    throw new AdminContentError(
      `${name} must be a positive integer.`
    );
  }

  const number = Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 1
  ) {
    throw new AdminContentError(
      `${name} must be a positive integer.`
    );
  }

  return number;
}

// ==========================================
// VALIDATE PAGINATION
// ==========================================

function getPagination(req) {
  const page = readInteger(
    req.query.page,
    1,
    "Page"
  );

  const requestedLimit = readInteger(
    req.query.limit,
    DEFAULT_LIMIT,
    "Limit"
  );

  const limit = Math.min(
    requestedLimit,
    MAX_LIMIT
  );

  const skip = (page - 1) * limit;

  if (
    !Number.isSafeInteger(skip) ||
    skip > 100000
  ) {
    throw new AdminContentError(
      "The requested page exceeds the supported pagination range."
    );
  }

  return {
    page,
    limit,
    skip,
  };
}

// ==========================================
// VALIDATE SEARCH QUERY
// ==========================================

function getSearchRegex(req) {
  const value = req.query.q;

  if (value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new AdminContentError(
      "Invalid search query."
    );
  }

  const searchText = value
    .replace(
      /[\u0000-\u001f\u007f]/g,
      " "
    )
    .trim();

  if (searchText.length > 100) {
    throw new AdminContentError(
      "Search query cannot exceed 100 characters."
    );
  }

  if (!searchText) {
    return null;
  }

  return new RegExp(
    escapeRegex(searchText),
    "i"
  );
}

// ==========================================
// VALIDATE ENUM FILTER
// ==========================================

function getEnumFilter(
  value,
  allowedValues,
  fieldName
) {
  if (
    value === undefined ||
    value === "all"
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !allowedValues.includes(value)
  ) {
    throw new AdminContentError(
      `Invalid ${fieldName} filter.`
    );
  }

  return value;
}

// ==========================================
// APPLY VISIBILITY FILTER
// ==========================================

function applyVisibilityFilter(
  filter,
  visibility
) {
  if (!visibility) {
    return;
  }

  if (visibility === "visible") {
    filter.$and = [
      ...(filter.$and || []),

      publicVisibilityFilter(),
    ];

    return;
  }

  filter.visibilityStatus =
    visibility;
}

// ==========================================
// APPLY ARTIST ID FILTER
// ==========================================

function applyArtistFilter(
  filter,
  req,
  secondaryField
) {
  const artistId = req.query.artistId;

  if (artistId === undefined) {
    return;
  }

  if (!isValidId(artistId)) {
    throw new AdminContentError(
      "Invalid artist ID."
    );
  }

  const id =
    new mongoose.Types.ObjectId(
      artistId
    );

  filter.$and = [
    ...(filter.$and || []),

    {
      $or: [
        {
          primaryArtists: id,
        },

        {
          [secondaryField]: id,
        },
      ],
    },
  ];
}

// ==========================================
// BUILD CONTENT FILTER
// ==========================================

function buildContentFilter(
  req,
  options = {}
) {
  const filter = {};

  const regex =
    getSearchRegex(req);

  const status =
    getEnumFilter(
      req.query.status,

      CONTENT_STATUSES,

      "content status"
    );

  const visibility =
    getEnumFilter(
      req.query.visibilityStatus,

      VISIBILITY_STATUSES,

      "visibility status"
    );

  if (regex) {
    filter.title = regex;
  }

  // Drafts are private artist work.
  // Do not expose them in moderation lists.

  if (status === "draft") {
    throw new AdminContentError(
      "Private artist drafts are not available through this endpoint.",
      403
    );
  }

  filter.status =
    status || {
      $in: [
        "pending",
        "approved",
        "rejected",
      ],
    };

  applyVisibilityFilter(
    filter,
    visibility
  );

  if (options.secondaryArtistField) {
    applyArtistFilter(
      filter,

      req,

      options.secondaryArtistField
    );
  }

  return filter;
}

// ==========================================
// ADMINISTRATIVE ARTIST POPULATION
//
// Administrators need to identify
// restricted artists during moderation.
// ==========================================

function artistPopulation(path) {
  return {
    path,

    select: ARTIST_FIELDS,
  };
}

// ==========================================
// REMOVE UNNECESSARY INTERNAL FIELDS
// ==========================================

function sanitizeContent(content) {
  const result = { ...content };

  delete result.__v;

  delete result.audioHash;
  delete result.coverHash;
  delete result.videoHash;
  delete result.thumbnailHash;

  // Administrative metadata remains
  // available, but direct media URLs
  // and upload references are excluded.

  delete result.audioUrl;
  delete result.audioUploadId;

  delete result.videoUrl;
  delete result.videoUploadId;

  return result;
}

// ==========================================
// CHECK EFFECTIVE PUBLIC VISIBILITY
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
// ADD ADMINISTRATIVE CONTENT INFORMATION
// ==========================================

function formatAdminSong(song) {
  const result =
    sanitizeContent(song);

  const release =
    song.releaseId;

  const releaseAvailable =
    Boolean(release) &&
    release.status === "approved" &&
    isVisible(release);

  result.parentReleaseAvailable =
    releaseAvailable;

  result.publiclyAvailable =
    song.status === "approved" &&
    isVisible(song) &&
    releaseAvailable;

  return result;
}

function formatAdminRelease(release) {
  const result =
    sanitizeContent(release);

  result.publiclyAvailable =
    release.status === "approved" &&
    isVisible(release);

  return result;
}

function formatAdminVideo(video) {
  const result =
    sanitizeContent(video);

  result.publiclyAvailable =
    video.status === "approved" &&
    isVisible(video);

  return result;
}

function formatAdminArtist(artist) {
  const result =
    sanitizeContent(artist);

  result.publiclyAvailable =
    artist.approvalStatus === "approved" &&
    isVisible(artist);

  return result;
}

// ==========================================
// CREATE PAGINATION RESPONSE
// ==========================================

function createPaginationResponse({
  total,
  page,
  limit,
  count,
}) {
  const totalPages =
    Math.ceil(total / limit);

  return {
    count,

    total,

    page,

    limit,

    totalPages,

    hasNextPage:
      page < totalPages,

    hasPreviousPage:
      page > 1,
  };
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

  if (error instanceof AdminContentError) {
    return res.status(error.status).json({
      success: false,

      message: error.message,
    });
  }

  if (
    error.name === "CastError" ||
    error.name === "ValidationError"
  ) {
    return res.status(400).json({
      success: false,

      message:
        "Invalid administrative request.",
    });
  }

  console.error(
    context,

    error.name,

    error.code || "",

    error.message
  );

  return res.status(500).json({
    success: false,

    message:
      "Unable to complete the administrative request.",
  });
}

// ==========================================
// GET ADMINISTRATIVE SONGS
//
// GET /api/admin/content/songs
// ==========================================

const getAdminSongs = async (req, res) => {
  try {
    preventCaching(res);

    requireAdministrator(req);

    const filter =
      buildContentFilter(req, {
        secondaryArtistField:
          "featuredArtists",
      });

    const {
      page,
      limit,
      skip,
    } = getPagination(req);

    // Optional parent release filter.

    if (req.query.releaseId !== undefined) {
      if (!isValidId(req.query.releaseId)) {
        throw new AdminContentError(
          "Invalid release ID."
        );
      }

      filter.releaseId =
        req.query.releaseId;
    }

    const [total, songs] =
      await Promise.all([
        Song.countDocuments(filter),

        Song.find(filter)
          .select(
            "-audioHash -audioUrl -audioUploadId"
          )
          .populate([
            artistPopulation(
              "primaryArtists"
            ),

            artistPopulation(
              "featuredArtists"
            ),

            {
              path: "releaseId",

              select: RELEASE_FIELDS,

              match: {
                status: {
                  $ne: "draft",
                },
              },
            },
          ])
          .sort({
            createdAt: -1,

            _id: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

    const results =
      songs.map(formatAdminSong);

    return res.status(200).json({
      success: true,

      ...createPaginationResponse({
        total,
        page,
        limit,

        count: results.length,
      }),

      songs: results,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Get admin songs error:"
    );
  }
};

// ==========================================
// GET ADMINISTRATIVE RELEASES
//
// GET /api/admin/content/releases
// ==========================================

const getAdminReleases = async (req, res) => {
  try {
    preventCaching(res);

    requireAdministrator(req);

    const filter =
      buildContentFilter(req, {
        secondaryArtistField:
          "collaboratingArtists",
      });

    const {
      page,
      limit,
      skip,
    } = getPagination(req);

    const releaseType =
      getEnumFilter(
        req.query.releaseType,

        ["single", "ep", "album"],

        "release type"
      );

    if (releaseType) {
      filter.releaseType =
        releaseType;
    }

    const [total, releases] =
      await Promise.all([
        Release.countDocuments(filter),

        Release.find(filter)
          .select("-coverHash")
          .populate([
            artistPopulation(
              "primaryArtists"
            ),

            artistPopulation(
              "collaboratingArtists"
            ),
          ])
          .sort({
            createdAt: -1,

            _id: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

    const results =
      releases.map(
        formatAdminRelease
      );

    return res.status(200).json({
      success: true,

      ...createPaginationResponse({
        total,
        page,
        limit,

        count: results.length,
      }),

      releases: results,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Get admin releases error:"
    );
  }
};

// ==========================================
// GET ADMINISTRATIVE VIDEOS
//
// GET /api/admin/content/videos
// ==========================================

const getAdminVideos = async (req, res) => {
  try {
    preventCaching(res);

    requireAdministrator(req);

    const filter =
      buildContentFilter(req, {
        secondaryArtistField:
          "featuredArtists",
      });

    const {
      page,
      limit,
      skip,
    } = getPagination(req);

    const videoType =
      getEnumFilter(
        req.query.videoType,

        [
          "music_video",
          "live_performance",
          "interview",
          "other",
        ],

        "video type"
      );

    if (videoType) {
      filter.videoType =
        videoType;
    }

    const [total, videos] =
      await Promise.all([
        Video.countDocuments(filter),

        Video.find(filter)
          .select(
            "-videoHash -thumbnailHash -videoUrl -videoUploadId"
          )
          .populate([
            artistPopulation(
              "primaryArtists"
            ),

            artistPopulation(
              "featuredArtists"
            ),

            {
              path: "linkedSong",

              select:
                "title status visibilityStatus",

              match: {
                status: {
                  $ne: "draft",
                },
              },
            },

            {
              path: "linkedRelease",

              select:
                RELEASE_FIELDS,

              match: {
                status: {
                  $ne: "draft",
                },
              },
            },
          ])
          .sort({
            createdAt: -1,

            _id: -1,
          })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

    const results =
      videos.map(
        formatAdminVideo
      );

    return res.status(200).json({
      success: true,

      ...createPaginationResponse({
        total,
        page,
        limit,

        count: results.length,
      }),

      videos: results,
    });

  } catch (error) {
    return sendError(
      res,
      error,
      "Get admin videos error:"
    );
  }
};

// ==========================================
// GET ADMINISTRATIVE ARTISTS
//
// GET /api/admin/content/artists
// ==========================================

const getAdminContentArtists =
  async (req, res) => {
    try {
      preventCaching(res);

      requireAdministrator(req);

      const filter = {};

      const regex =
        getSearchRegex(req);

      const approvalStatus =
        getEnumFilter(
          req.query.approvalStatus,

          ARTIST_STATUSES,

          "artist approval status"
        );

      const visibility =
        getEnumFilter(
          req.query.visibilityStatus,

          VISIBILITY_STATUSES,

          "visibility status"
        );

      if (regex) {
        filter.stageName =
          regex;
      }

      if (approvalStatus) {
        filter.approvalStatus =
          approvalStatus;
      }

      applyVisibilityFilter(
        filter,
        visibility
      );

      // Verification filter.

      if (
        req.query.verified !== undefined &&
        req.query.verified !== "all"
      ) {
        if (
          !["true", "false"].includes(
            req.query.verified
          )
        ) {
          throw new AdminContentError(
            "Invalid verification filter."
          );
        }

        filter.verified =
          req.query.verified === "true";
      }

      // Featured artist filter.

      if (
        req.query.featured !== undefined &&
        req.query.featured !== "all"
      ) {
        if (
          !["true", "false"].includes(
            req.query.featured
          )
        ) {
          throw new AdminContentError(
            "Invalid featured artist filter."
          );
        }

        filter.featured =
          req.query.featured === "true";
      }

      const {
        page,
        limit,
        skip,
      } = getPagination(req);

      const [total, artists] =
        await Promise.all([
          Artist.countDocuments(filter),

          Artist.find(filter)
            .populate({
              path: "userId",

              select:
                "fullName email role accountStatus emailVerified",
            })
            .sort({
              createdAt: -1,

              _id: -1,
            })
            .skip(skip)
            .limit(limit)
            .lean(),
        ]);

      const results =
        artists.map(
          formatAdminArtist
        );

      return res.status(200).json({
        success: true,

        ...createPaginationResponse({
          total,
          page,
          limit,

          count: results.length,
        }),

        artists: results,
      });

    } catch (error) {
      return sendError(
        res,
        error,
        "Get admin content artists error:"
      );
    }
  };

// ==========================================
// COUNT EFFECTIVELY PUBLIC SONGS
//
// Song and parent release must both
// be approved and publicly visible.
// ==========================================

async function countPublicSongs() {
  const result =
    await Song.aggregate([
      {
        $match: {
          status: "approved",

          ...publicVisibilityFilter(),
        },
      },

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

      {
        $match: {
          parentRelease: {
            $elemMatch: {
              status: "approved",

              ...publicVisibilityFilter(),
            },
          },
        },
      },

      {
        $count: "total",
      },
    ]);

  return result[0]?.total || 0;
}

// ==========================================
// COUNT CONTENT BY VISIBILITY
// ==========================================

async function getContentStatistics(Model) {
  const [
    total,

    published,

    visible,

    hidden,

    takenDown,

    pending,

    rejected,
  ] = await Promise.all([
    Model.countDocuments({
      status: {
        $in: [
          "pending",
          "approved",
          "rejected",
        ],
      },
    }),

    Model.countDocuments({
      status: "approved",
    }),

    Model.countDocuments({
      status: "approved",

      ...publicVisibilityFilter(),
    }),

    Model.countDocuments({
      status: "approved",

      visibilityStatus: "hidden",
    }),

    Model.countDocuments({
      status: "approved",

      visibilityStatus: "takedown",
    }),

    Model.countDocuments({
      status: "pending",
    }),

    Model.countDocuments({
      status: "rejected",
    }),
  ]);

  return {
    total,

    published,

    visible,

    hidden,

    takenDown,

    pending,

    rejected,
  };
}

// ==========================================
// GET ARTIST STATISTICS
// ==========================================

async function getArtistStatistics() {
  const [
    total,

    pending,

    approved,

    rejected,

    suspended,

    verified,

    featured,

    hidden,

    takenDown,

    visible,
  ] = await Promise.all([
    Artist.countDocuments(),

    Artist.countDocuments({
      approvalStatus: "pending",
    }),

    Artist.countDocuments({
      approvalStatus: "approved",
    }),

    Artist.countDocuments({
      approvalStatus: "rejected",
    }),

    Artist.countDocuments({
      approvalStatus: "suspended",
    }),

    Artist.countDocuments({
      approvalStatus: "approved",

      verified: true,

      ...publicVisibilityFilter(),
    }),

    Artist.countDocuments({
      approvalStatus: "approved",

      featured: true,

      ...publicVisibilityFilter(),
    }),

    Artist.countDocuments({
      visibilityStatus: "hidden",
    }),

    Artist.countDocuments({
      visibilityStatus: "takedown",
    }),

    Artist.countDocuments({
      approvalStatus: "approved",

      ...publicVisibilityFilter(),
    }),
  ]);

  return {
    total,

    pending,

    approved,

    rejected,

    suspended,

    verified,

    featured,

    hidden,

    takenDown,

    visible,
  };
}

// ==========================================
// GET REPORT STATISTICS
// ==========================================

async function getReportStatistics() {
  const [
    total,

    pending,

    reviewing,

    resolved,

    dismissed,
  ] = await Promise.all([
    Report.countDocuments(),

    Report.countDocuments({
      status: "pending",
    }),

    Report.countDocuments({
      status: "reviewing",
    }),

    Report.countDocuments({
      status: "resolved",
    }),

    Report.countDocuments({
      status: "dismissed",
    }),
  ]);

  return {
    total,

    pending,

    reviewing,

    resolved,

    dismissed,

    open:
      pending + reviewing,
  };
}

// ==========================================
// GET ADMIN CONTENT DASHBOARD STATISTICS
//
// GET /api/admin/content/stats
//
// Available to Admin and Super Admin.
//
// Sensitive administrator management
// statistics remain in adminController.js.
// ==========================================

const getAdminContentStats =
  async (req, res) => {
    try {
      preventCaching(res);

      requireAdministrator(req);

      const [
        artists,

        songs,

        releases,

        videos,

        reports,

        publiclyAvailableSongs,
      ] = await Promise.all([
        getArtistStatistics(),

        getContentStatistics(
          Song
        ),

        getContentStatistics(
          Release
        ),

        getContentStatistics(
          Video
        ),

        getReportStatistics(),

        countPublicSongs(),
      ]);

      return res.status(200).json({
        success: true,

        stats: {
          artists,

          songs: {
            ...songs,

            publiclyAvailable:
              publiclyAvailableSongs,

            blockedByParentRelease:
              Math.max(
                0,

                songs.visible -
                  publiclyAvailableSongs
              ),
          },

          releases: {
            ...releases,

            publiclyAvailable:
              releases.visible,
          },

          videos: {
            ...videos,

            publiclyAvailable:
              videos.visible,
          },

          reports,
        },

        generatedAt:
          new Date().toISOString(),
      });

    } catch (error) {
      return sendError(
        res,
        error,
        "Get admin content stats error:"
      );
    }
  };

// ==========================================
// EXPORT ADMIN CONTENT CONTROLLERS
// ==========================================

module.exports = {
  getAdminSongs,

  getAdminReleases,

  getAdminVideos,

  getAdminContentArtists,

  getAdminContentStats,
};