
const mongoose = require("mongoose");

const Artist = require("../models/Artist");
const User = require("../models/User");

// ==========================================
// CONFIGURATION
// ==========================================

const allowedApplicationRoles = [
  "listener",
  "artist",
];

// ==========================================
// CUSTOM APPLICATION ERROR
// ==========================================

class ArtistApplicationError extends Error {
  constructor(message, status = 400, details = {}) {
    super(message);

    this.name = "ArtistApplicationError";
    this.status = status;
    this.details = details;
  }
}

// ==========================================
// PREVENT PRIVATE RESPONSE CACHING
// ==========================================

function setPrivateHeaders(res) {
  res.set(
    "Cache-Control",
    "private, no-store"
  );
}

// ==========================================
// VALIDATE AUTHENTICATED USER
// ==========================================

function requireApplicationUser(req) {
  if (!req.user?._id || !req.auth) {
    throw new ArtistApplicationError(
      "Authentication required.",
      401
    );
  }

  if (req.user.accountStatus !== "active") {
    throw new ArtistApplicationError(
      "Your account must be active.",
      403
    );
  }

  if (
    !Number.isSafeInteger(
      req.auth.tokenVersion
    ) ||

    req.auth.tokenVersion < 0
  ) {
    throw new ArtistApplicationError(
      "Invalid authentication session.",
      401
    );
  }

  return req.user;
}

// ==========================================
// CLEAN AND VALIDATE TEXT
// ==========================================

function cleanText(
  value,
  label,
  optional = false
) {
  if (
    optional &&
    (
      value === undefined ||
      value === null
    )
  ) {
    return "";
  }

  if (typeof value !== "string") {
    throw new ArtistApplicationError(
      `${label} must be text.`
    );
  }

  return value.trim();
}

// ==========================================
// FORMAT SAFE ARTIST APPLICATION RESPONSE
//
// Preserve existing frontend response fields.
// ==========================================

function artistApplicationResponse(artist) {
  return {
    id:
      String(artist._id),

    stageName:
      artist.stageName,

    bio:
      artist.bio || "",

    country:
      artist.country,

    approvalStatus:
      artist.approvalStatus,

    visibilityStatus:
      artist.visibilityStatus,

    verified:
      Boolean(artist.verified),

    createdAt:
      artist.createdAt,

    updatedAt:
      artist.updatedAt,
  };
}

// ==========================================
// ERROR HANDLING
// ==========================================

function sendApplicationError(
  res,
  error,
  context
) {
  // ========================================
  // CUSTOM APPLICATION ERROR
  // ========================================

  if (
    error instanceof ArtistApplicationError
  ) {
    return res.status(error.status).json({
      success: false,

      message:
        error.message,

      ...error.details,
    });
  }

  // ========================================
  // DUPLICATE DATABASE RECORD
  // ========================================

  if (error.code === 11000) {
    const duplicateField =
      error.keyPattern || {};

    const nameTaken = Boolean(
      duplicateField.stageName ||

      duplicateField.stageNameNormalized
    );

    const applicationExists = Boolean(
      duplicateField.userId
    );

    let message =
      "An artist application or stage name already exists.";

    if (nameTaken) {
      message =
        "This stage name is already in use. Please choose another.";
    }

    if (applicationExists) {
      message =
        "You already have an artist application.";
    }

    return res.status(409).json({
      success: false,

      message,
    });
  }

  // ========================================
  // DATABASE VALIDATION ERROR
  // ========================================

  if (
    error.name === "ValidationError" ||

    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,

      message:
        "Please check your application information.",
    });
  }

  // ========================================
  // UNCERTAIN TRANSACTION RESULT
  // ========================================

  if (
    error.hasErrorLabel?.(
      "UnknownTransactionCommitResult"
    )
  ) {
    return res.status(503).json({
      success: false,

      message:
        "The application result could not be confirmed. Check your application status before submitting again.",
    });
  }

  // ========================================
  // CONCURRENT DATABASE MODIFICATION
  // ========================================

  if (
    error.code === 112 ||

    error.hasErrorLabel?.(
      "TransientTransactionError"
    )
  ) {
    return res.status(409).json({
      success: false,

      message:
        "Your account or application changed during this operation. Please refresh and try again.",
    });
  }

  // ========================================
  // UNEXPECTED SERVER ERROR
  // ========================================

  console.error(
    context,
    error.name,
    error.code || ""
  );

  return res.status(500).json({
    success: false,

    message:
      "Unable to complete the artist application operation.",
  });
}

// ==========================================
// BUILD TOKEN VERSION FILTER
//
// Supports older accounts that were created
// before tokenVersion was introduced.
// ==========================================

function buildTokenVersionFilter(
  filter,
  version
) {
  if (
    !Number.isSafeInteger(version) ||

    version < 0
  ) {
    throw new ArtistApplicationError(
      "Invalid authentication session.",
      401
    );
  }

  if (version === 0) {
    filter.$or = [
      {
        tokenVersion: 0,
      },

      {
        tokenVersion: {
          $exists: false,
        },
      },

      {
        tokenVersion: null,
      },
    ];

  } else {
    filter.tokenVersion =
      version;
  }

  return filter;
}

// ==========================================
// RUN ARTIST APPLICATION TRANSACTION
// ==========================================

async function runApplicationTransaction(
  operation
) {
  const session =
    await mongoose.startSession();

  let result;

  try {
    await session.withTransaction(
      async () => {
        result =
          await operation(session);
      },

      {
        readPreference: "primary",

        readConcern: {
          level: "snapshot",
        },

        writeConcern: {
          w: "majority",
        },
      }
    );

    return result;

  } finally {
    await session.endSession();
  }
}

// ==========================================
// VERIFY AND LOCK LISTENER ACCOUNT
//
// Prevent an application from being created
// concurrently with account suspension or
// an unauthorized role change.
// ==========================================

async function lockListenerAccount(
  req,
  session
) {
  const user =
    requireApplicationUser(req);

  if (user.role !== "listener") {
    throw new ArtistApplicationError(
      "Only listener accounts can apply to become artists.",
      403
    );
  }

  const filter =
    buildTokenVersionFilter(
      {
        _id: user._id,

        role: "listener",

        accountStatus: "active",
      },

      req.auth.tokenVersion
    );

  const currentUser =
    await User.findOneAndUpdate(
      filter,

      {
        $inc: {
          __v: 1,
        },
      },

      {
        new: true,

        session,

        runValidators: true,
      }
    ).select(
      "_id role accountStatus"
    );

  if (!currentUser) {
    throw new ArtistApplicationError(
      "Your account status, role or authentication session has changed. Please sign in again.",
      403
    );
  }

  return currentUser;
}

// ==========================================
// VALIDATE ARTIST APPLICATION INFORMATION
// ==========================================

function validateApplicationInformation(
  input
) {
  // ========================================
  // READ ALLOWED APPLICATION FIELDS
  // ========================================

  const stageName =
    cleanText(
      input.stageName,
      "Stage name"
    );

  const bio =
    cleanText(
      input.bio,
      "Artist biography",
      true
    );

  const country =
    cleanText(
      input.country,
      "Country"
    );

  // ========================================
  // VALIDATE STAGE NAME
  // ========================================

  if (
    stageName.length < 2 ||

    stageName.length > 100
  ) {
    throw new ArtistApplicationError(
      "Stage name must contain 2 to 100 characters."
    );
  }

  // ========================================
  // VALIDATE BIOGRAPHY
  // ========================================

  if (bio.length > 500) {
    throw new ArtistApplicationError(
      "Artist biography cannot exceed 500 characters."
    );
  }

  // ========================================
  // VALIDATE COUNTRY
  // ========================================

  if (
    !country ||

    country.length > 100
  ) {
    throw new ArtistApplicationError(
      "Please enter a valid country."
    );
  }

  // ========================================
  // NORMALIZE ARTIST STAGE NAME
  // ========================================

  const stageNameNormalized =
    stageName.toLowerCase();

  return {
    stageName,

    stageNameNormalized,

    bio,

    country,
  };
}

// ==========================================
// APPLY TO BECOME AN ARTIST
//
// POST /api/artists/apply
//
// Only active listener accounts can apply.
//
// An application does not automatically
// change the user's role to artist.
// ==========================================

const applyAsArtist = async (
  req,
  res
) => {
  try {
    setPrivateHeaders(res);

    // ======================================
    // VERIFY AUTHENTICATED USER
    // ======================================

    const user =
      requireApplicationUser(req);

    if (user.role !== "listener") {
      throw new ArtistApplicationError(
        "Only listener accounts can apply to become artists.",
        403
      );
    }

    // ======================================
    // VALIDATE REQUEST BODY
    // ======================================

    const input =
      req.body || {};

    if (
      typeof input !== "object" ||

      Array.isArray(input)
    ) {
      throw new ArtistApplicationError(
        "Invalid artist application information."
      );
    }

    // ======================================
    // VALIDATE APPLICATION INFORMATION
    // ======================================

    const applicationData =
      validateApplicationInformation(
        input
      );

    // ======================================
    // START APPLICATION TRANSACTION
    // ======================================

    const artist =
      await runApplicationTransaction(
        async (session) => {
          // ==================================
          // RECHECK CURRENT LISTENER ACCOUNT
          // ==================================

          const currentUser =
            await lockListenerAccount(
              req,

              session
            );

          // ==================================
          // PREVENT DUPLICATE APPLICATIONS
          // ==================================

          const existingApplication =
            await Artist.findOne({
              userId:
                currentUser._id,
            })

              .select(
                "_id approvalStatus"
              )

              .session(session);

          if (existingApplication) {
            throw new ArtistApplicationError(
              "You already have an artist application. Please check its status.",

              409,

              {
                approvalStatus:
                  existingApplication.approvalStatus,
              }
            );
          }

          // ==================================
          // CHECK STAGE NAME AVAILABILITY
          // ==================================

          const existingStageName =
            await Artist.exists({
              stageNameNormalized:
                applicationData.stageNameNormalized,
            }).session(session);

          if (existingStageName) {
            throw new ArtistApplicationError(
              "This stage name is already in use. Please choose another.",
              409
            );
          }

          // ==================================
          // CREATE PENDING ARTIST APPLICATION
          //
          // All sensitive fields are assigned
          // by the server, never by the client.
          // ==================================

          const newArtist =
            new Artist({
              userId:
                currentUser._id,

              stageName:
                applicationData.stageName,

              stageNameNormalized:
                applicationData.stageNameNormalized,

              bio:
                applicationData.bio,

              country:
                applicationData.country,

              profileImage:
                "",

              profileImageUploadId:
                null,

              coverImage:
                "",

              coverImageUploadId:
                null,

              approvalStatus:
                "pending",

              visibilityStatus:
                "visible",

              verified:
                false,

              featured:
                false,

              followersCount:
                0,
            });

          // ==================================
          // SAVE APPLICATION
          // ==================================

          await newArtist.save({
            session,
          });

          return newArtist;
        }
      );

    // ======================================
    // SUCCESSFUL APPLICATION
    // ======================================

    return res.status(201).json({
      success: true,

      message:
        "Artist application submitted successfully. Your application is awaiting review.",

      application:
        artistApplicationResponse(
          artist
        ),
    });

  } catch (error) {
    return sendApplicationError(
      res,

      error,

      "Artist application error:"
    );
  }
};

// ==========================================
// GET MY ARTIST APPLICATION STATUS
//
// GET /api/artists/application-status
//
// Available to listeners and artists.
//
// A listener may check a pending or
// rejected application.
//
// An approved artist may check their
// existing artist profile status.
// ==========================================

const getMyArtistApplication = async (
  req,
  res
) => {
  try {
    setPrivateHeaders(res);

    // ======================================
    // VERIFY AUTHENTICATED USER
    // ======================================

    const user =
      requireApplicationUser(req);

    if (
      !allowedApplicationRoles.includes(
        user.role
      )
    ) {
      throw new ArtistApplicationError(
        "This account cannot access artist application information.",
        403
      );
    }

    // ======================================
    // FIND ASSOCIATED ARTIST APPLICATION
    // ======================================

    const artist =
      await Artist.findOne({
        userId:
          user._id,
      }).select(
        "_id stageName bio country approvalStatus visibilityStatus verified createdAt updatedAt"
      );

    // ======================================
    // NO APPLICATION FOUND
    // ======================================

    if (!artist) {
      return res.status(200).json({
        success: true,

        hasApplication:
          false,

        application:
          null,
      });
    }

    // ======================================
    // RETURN APPLICATION STATUS
    // ======================================

    return res.status(200).json({
      success: true,

      hasApplication:
        true,

      application:
        artistApplicationResponse(
          artist
        ),
    });

  } catch (error) {
    return sendApplicationError(
      res,

      error,

      "Get artist application error:"
    );
  }
};

// ==========================================
// EXPORT ARTIST APPLICATION CONTROLLERS
// ==========================================

module.exports = {
  applyAsArtist,

  getMyArtistApplication,
};
