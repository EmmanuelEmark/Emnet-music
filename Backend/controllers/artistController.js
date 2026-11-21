
const Artist = require("../models/Artist");
const mongoose = require("mongoose");
const MediaUpload = require("../models/MediaUpload");

const User = require("../models/User");
const Release = require("../models/Release");
const Song = require("../models/song");
const Video = require("../models/video");

const {
  recordAdminActivity,
} = require("../utils/adminActivityService");

// ==========================================
// CONFIGURATION
// ==========================================

const administrativeRoles = [
  "admin",
  "superadmin",
];

const artistApprovalStatuses = [
  "pending",
  "approved",
  "rejected",
  "suspended",
];

const ARTIST_PUBLIC_FIELDS =
  "stageName profileImage profileImageUploadId verified";

// ==========================================
// CUSTOM REQUEST ERROR
// ==========================================

class ArtistRequestError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "ArtistRequestError";
    this.status = status;
  }
}

// ==========================================
// VALIDATE MONGODB ID
// ==========================================

function isValidArtistId(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{24}$/i.test(value)
  );
}

// ==========================================
// CHECK REQUEST FIELD
// ==========================================

function hasField(object, field) {
  return Object.prototype.hasOwnProperty.call(
    object,
    field
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
// ERROR HANDLING
// ==========================================

function sendArtistError(
  res,
  error,
  context
) {
  if (error instanceof ArtistRequestError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message:
        "An artist application or stage name already exists.",
    });
  }

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid artist information.",
    });
  }

  if (
    error.hasErrorLabel?.(
      "UnknownTransactionCommitResult"
    )
  ) {
    return res.status(503).json({
      success: false,

      message:
        "The operation result could not be confirmed. Refresh the artist information before trying again.",
    });
  }

  if (
    error.code === 112 ||

    error.hasErrorLabel?.(
      "TransientTransactionError"
    )
  ) {
    return res.status(409).json({
      success: false,

      message:
        "The artist or account changed during this operation. Please refresh and try again.",
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
      "Unable to complete the artist operation.",
  });
}

// ==========================================
// VERIFY AUTHENTICATED USER
// ==========================================

function requireAuthenticatedUser(req) {
  if (!req.user?._id) {
    throw new ArtistRequestError(
      "Authentication required.",
      401
    );
  }

  if (req.user.accountStatus !== "active") {
    throw new ArtistRequestError(
      "Your account is not active.",
      403
    );
  }

  return req.user;
}

// ==========================================
// VERIFY ADMINISTRATOR
// ==========================================

function requireArtistAdministrator(req) {
  const actor =
    requireAuthenticatedUser(req);

  if (!req.auth) {
    throw new ArtistRequestError(
      "Authentication required.",
      401
    );
  }

  if (
    !administrativeRoles.includes(
      actor.role
    ) ||

    actor.emailVerified !== true
  ) {
    throw new ArtistRequestError(
      "Administrative access is required.",
      403
    );
  }

  if (
    !Number.isSafeInteger(
      req.auth.tokenVersion
    ) ||

    req.auth.tokenVersion < 0
  ) {
    throw new ArtistRequestError(
      "Invalid administrative session.",
      401
    );
  }

  return actor;
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
// VALIDATE ADMINISTRATIVE REASON
// ==========================================

function getArtistAdminReason(
  req,
  defaultReason
) {
  const value = req.body?.reason;

  if (
    value === undefined ||
    value === null
  ) {
    return defaultReason;
  }

  if (
    typeof value !== "string" ||

    value.trim().length > 1000
  ) {
    throw new ArtistRequestError(
      "Reason must be text with at most 1000 characters."
    );
  }

  return value.trim() || defaultReason;
}

// ==========================================
// RUN DATABASE TRANSACTION
// ==========================================

async function runArtistAdminTransaction(
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
// TOKEN VERSION FILTER
//
// Support older users whose tokenVersion
// field was not originally available.
// ==========================================

function applyTokenVersionFilter(
  filter,
  version
) {
  if (
    !Number.isSafeInteger(version) ||

    version < 0
  ) {
    throw new ArtistRequestError(
      "Invalid account security version.",
      409
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
// LOCK ACTING ADMINISTRATOR
//
// Recheck permissions before committing
// an administrative operation.
// ==========================================

async function lockArtistAdministrator(
  req,
  session
) {
  const actor =
    requireArtistAdministrator(req);

  const filter =
    applyTokenVersionFilter(
      {
        _id: actor._id,

        role: actor.role,

        accountStatus: "active",

        emailVerified: true,
      },

      req.auth.tokenVersion
    );

  const administrator =
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
      "_id fullName role accountStatus"
    );

  if (!administrator) {
    throw new ArtistRequestError(
      "Your administrative permissions or session have changed.",
      403
    );
  }

  return administrator;
}

// ==========================================
// CREATE SAFE ARTIST ACTIVITY SNAPSHOT
// ==========================================

function artistActivitySnapshot(artist) {
  return {
    approvalStatus:
      artist.approvalStatus,

    visibilityStatus:
      artist.visibilityStatus,

    verified:
      Boolean(artist.verified),

    featured:
      Boolean(artist.featured),
  };
}

// ==========================================
// VALIDATE LEGACY HTTPS IMAGE URL
// ==========================================

function isValidArtistImageUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  if (!value.trim()) {
    return true;
  }

  if (value.length > 2048) {
    return false;
  }

  try {
    const url =
      new URL(value.trim());

    return (
      url.protocol === "https:" &&

      !url.username &&

      !url.password
    );

  } catch {
    return false;
  }
}

// ==========================================
// VALIDATE ARTIST IMAGE UPLOAD
//
// Only confirmed R2 media belonging to
// the authenticated user may be attached.
// ==========================================

const validateArtistImageUpload = async ({
  uploadId,
  userId,
  kind,
}) => {
  if (!isValidArtistId(uploadId)) {
    return null;
  }

  return MediaUpload.findOne({
    _id: uploadId,

    userId,

    kind,

    status: "ready",
  });
};

// ==========================================
// APPLY AS ARTIST
//
// Only active listeners may apply.
// New applications require approval.
// ==========================================

const applyAsArtist = async (
  req,
  res
) => {
  try {
    const user =
      requireAuthenticatedUser(req);

    if (user.role !== "listener") {
      throw new ArtistRequestError(
        "Only active listener accounts can apply to become artists.",
        403
      );
    }

    // ======================================
    // GET APPLICATION INFORMATION
    // ======================================

    const {
      stageName,

      bio = "",

      country,

      profileImage = "",

      coverImage = "",
    } = req.body || {};

    // ======================================
    // VALIDATE STAGE NAME
    // ======================================

    if (
      typeof stageName !== "string" ||

      !stageName.trim() ||

      stageName.trim().length > 100
    ) {
      throw new ArtistRequestError(
        "Enter a valid stage name of at most 100 characters."
      );
    }

    // ======================================
    // VALIDATE BIOGRAPHY
    // ======================================

    if (
      typeof bio !== "string" ||

      bio.trim().length > 500
    ) {
      throw new ArtistRequestError(
        "Biography cannot exceed 500 characters."
      );
    }

    // ======================================
    // VALIDATE COUNTRY
    // ======================================

    if (
      typeof country !== "string" ||

      !country.trim() ||

      country.trim().length > 100
    ) {
      throw new ArtistRequestError(
        "Please enter a valid country."
      );
    }

    // ======================================
    // VALIDATE LEGACY IMAGE URLS
    // ======================================

    if (
      !isValidArtistImageUrl(
        profileImage
      ) ||

      !isValidArtistImageUrl(
        coverImage
      )
    ) {
      throw new ArtistRequestError(
        "Profile and cover images must use valid HTTPS URLs."
      );
    }

    // ======================================
    // CHECK EXISTING ARTIST APPLICATION
    // ======================================

    const existingArtist =
      await Artist.exists({
        userId: user._id,
      });

    if (existingArtist) {
      throw new ArtistRequestError(
        "You already have an artist application or profile.",
        409
      );
    }

    // ======================================
    // NORMALIZE STAGE NAME
    // ======================================

    const cleanStageName =
      stageName.trim();

    const normalizedStageName =
      cleanStageName.toLowerCase();

    // ======================================
    // CHECK STAGE NAME AVAILABILITY
    // ======================================

    const stageNameExists =
      await Artist.exists({
        stageNameNormalized:
          normalizedStageName,
      });

    if (stageNameExists) {
      throw new ArtistRequestError(
        "This stage name is already in use.",
        409
      );
    }

    // ======================================
    // CREATE PENDING ARTIST APPLICATION
    // ======================================

    const artist = new Artist({
      userId:
        user._id,

      stageName:
        cleanStageName,

      stageNameNormalized:
        normalizedStageName,

      bio:
        bio.trim(),

      country:
        country.trim(),

      profileImage:
        profileImage.trim(),

      coverImage:
        coverImage.trim(),

      approvalStatus:
        "pending",

      visibilityStatus:
        "visible",

      verified:
        false,

      featured:
        false,
    });

    await artist.save();

    return res.status(201).json({
      success: true,

      message:
        "Artist application submitted successfully.",

      artist,
    });

  } catch (error) {
    return sendArtistError(
      res,

      error,

      "Artist application error:"
    );
  }
};

// ==========================================
// GET PENDING ARTIST APPLICATIONS
//
// ADMIN AND SUPER ADMIN
// ==========================================

const getPendingArtists = async (
  req,
  res
) => {
  try {
    requireArtistAdministrator(req);

    setPrivateHeaders(res);

    const artists =
      await Artist.find({
        approvalStatus: "pending",
      })

        .populate(
          "userId",

          "fullName email role accountStatus emailVerified"
        )

        .sort({
          createdAt: 1,

          _id: 1,
        });

    return res.status(200).json({
      success: true,

      count:
        artists.length,

      artists,
    });

  } catch (error) {
    return sendArtistError(
      res,

      error,

      "Get pending artists error:"
    );
  }
};

// ==========================================
// APPROVE ARTIST APPLICATION
//
// ADMIN AND SUPER ADMIN
//
// Approve artist profile, change user role,
// revoke previous tokens and record activity
// inside the same database transaction.
// ==========================================

const approveArtist = async (
  req,
  res
) => {
  try {
    requireArtistAdministrator(req);

    const artistId =
      req.params.id ||
      req.params.artistId;

    if (!isValidArtistId(artistId)) {
      throw new ArtistRequestError(
        "Invalid artist ID."
      );
    }

    const reason =
      getArtistAdminReason(
        req,

        "Artist application approved."
      );

    // ======================================
    // START APPROVAL TRANSACTION
    // ======================================

    const approvedArtist =
      await runArtistAdminTransaction(
        async (session) => {
          // ==================================
          // VERIFY ACTING ADMINISTRATOR
          // ==================================

          const administrator =
            await lockArtistAdministrator(
              req,

              session
            );

          // ==================================
          // FIND ARTIST APPLICATION
          // ==================================

          const artist =
            await Artist.findById(
              artistId
            ).session(session);

          if (!artist) {
            throw new ArtistRequestError(
              "Artist application not found.",
              404
            );
          }

          // ==================================
          // VERIFY APPLICATION STATUS
          // ==================================

          if (
            artist.approvalStatus !==
            "pending"
          ) {
            throw new ArtistRequestError(
              "Only pending artist applications can be approved.",
              409
            );
          }

          if (
            artist.visibilityStatus !==
            "visible"
          ) {
            throw new ArtistRequestError(
              "Restricted artist applications cannot be approved.",
              409
            );
          }

          // ==================================
          // FIND ASSOCIATED USER ACCOUNT
          // ==================================

          const user =
            await User.findById(
              artist.userId
            )

              .select(
                "_id fullName role accountStatus tokenVersion"
              )

              .session(session);

          if (!user) {
            throw new ArtistRequestError(
              "The associated user account does not exist.",
              404
            );
          }

          // ==================================
          // PROTECT ADMINISTRATIVE ACCOUNTS
          // ==================================

          if (
            user.role !== "listener" ||

            user.accountStatus !==
              "active"
          ) {
            throw new ArtistRequestError(
              "Only active listener accounts can be approved as artists.",
              409
            );
          }

          // ==================================
          // CAPTURE PREVIOUS VALUES
          // ==================================

          const previousValues = {
            ...artistActivitySnapshot(
              artist
            ),

            role:
              user.role,
          };

          // ==================================
          // PREPARE SESSION REVOCATION
          // ==================================

          const version =
            user.tokenVersion ?? 0;

          if (
            !Number.isSafeInteger(
              version
            ) ||

            version < 0 ||

            version >=
              Number.MAX_SAFE_INTEGER
          ) {
            throw new ArtistRequestError(
              "The user has an invalid security version.",
              409
            );
          }

          const userFilter =
            applyTokenVersionFilter(
              {
                _id: user._id,

                role: "listener",

                accountStatus:
                  "active",
              },

              version
            );

          const now = new Date();

          // ==================================
          // CHANGE LISTENER ROLE TO ARTIST
          // ==================================

          const updatedUser =
            await User.findOneAndUpdate(
              userFilter,

              {
                $set: {
                  role:
                    "artist",

                  tokenVersion:
                    version + 1,

                  roleAssignedAt:
                    now,

                  roleAssignedBy:
                    administrator._id,
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

          if (!updatedUser) {
            throw new ArtistRequestError(
              "The associated user account has changed.",
              409
            );
          }

          // ==================================
          // APPROVE ARTIST PROFILE
          // ==================================

          const updatedArtist =
            await Artist.findOneAndUpdate(
              {
                _id: artist._id,

                userId: user._id,

                approvalStatus:
                  "pending",

                visibilityStatus:
                  "visible",
              },

              {
                $set: {
                  approvalStatus:
                    "approved",

                  moderationReason:
                    "",

                  moderatedBy:
                    administrator._id,

                  moderatedAt:
                    now,
                },

                $inc: {
                  __v: 1,
                },
              },

              {
                new: true,

                session,

                runValidators: true,
              }
            );

          if (!updatedArtist) {
            throw new ArtistRequestError(
              "This artist application has changed.",
              409
            );
          }

          // ==================================
          // RECORD ADMINISTRATIVE ACTIVITY
          // ==================================

          await recordAdminActivity({
            req,

            actor:
              administrator,

            action:
              "artist_approved",

            targetType:
              "artist",

            targetId:
              updatedArtist._id,

            targetName:
              updatedArtist.stageName,

            previousValues,

            newValues: {
              ...artistActivitySnapshot(
                updatedArtist
              ),

              role:
                updatedUser.role,
            },

            reason,

            outcome:
              "success",

            session,
          });

          return updatedArtist;
        }
      );

    // ======================================
    // SUCCESSFUL ARTIST APPROVAL
    // ======================================

    return res.status(200).json({
      success: true,

      message:
        "Artist approved successfully.",

      artist:
        approvedArtist,

      sessionsRevoked:
        true,
    });

  } catch (error) {
    return sendArtistError(
      res,

      error,

      "Approve artist error:"
    );
  }
};

// ==========================================
// REJECT ARTIST APPLICATION
//
// ADMIN AND SUPER ADMIN
//
// Only pending applications may be rejected.
// Existing approved artists must be managed
// through moderation.
// ==========================================

const rejectArtist = async (
  req,
  res
) => {
  try {
    requireArtistAdministrator(req);

    const artistId =
      req.params.id ||
      req.params.artistId;

    if (!isValidArtistId(artistId)) {
      throw new ArtistRequestError(
        "Invalid artist ID."
      );
    }

    const reason =
      getArtistAdminReason(
        req,

        "Artist application rejected."
      );

    // ======================================
    // START REJECTION TRANSACTION
    // ======================================

    const rejectedArtist =
      await runArtistAdminTransaction(
        async (session) => {
          const administrator =
            await lockArtistAdministrator(
              req,

              session
            );

          // ==================================
          // FIND PENDING APPLICATION
          // ==================================

          const artist =
            await Artist.findById(
              artistId
            ).session(session);

          if (!artist) {
            throw new ArtistRequestError(
              "Artist application not found.",
              404
            );
          }

          if (
            artist.approvalStatus !==
            "pending"
          ) {
            throw new ArtistRequestError(
              "Only pending applications can be rejected. Use moderation for existing approved artists.",
              409
            );
          }

          // ==================================
          // CAPTURE PREVIOUS VALUES
          // ==================================

          const previousValues =
            artistActivitySnapshot(
              artist
            );

          // ==================================
          // REJECT APPLICATION
          // ==================================

          const updatedArtist =
            await Artist.findOneAndUpdate(
              {
                _id: artist._id,

                approvalStatus:
                  "pending",
              },

              {
                $set: {
                  approvalStatus:
                    "rejected",

                  moderationReason:
                    reason,

                  moderatedBy:
                    administrator._id,

                  moderatedAt:
                    new Date(),
                },

                $inc: {
                  __v: 1,
                },
              },

              {
                new: true,

                session,

                runValidators: true,
              }
            );

          if (!updatedArtist) {
            throw new ArtistRequestError(
              "The artist application has changed.",
              409
            );
          }

          // ==================================
          // RECORD ADMINISTRATIVE ACTIVITY
          // ==================================

          await recordAdminActivity({
            req,

            actor:
              administrator,

            action:
              "artist_rejected",

            targetType:
              "artist",

            targetId:
              updatedArtist._id,

            targetName:
              updatedArtist.stageName,

            previousValues,

            newValues:
              artistActivitySnapshot(
                updatedArtist
              ),

            reason,

            outcome:
              "success",

            session,
          });

          return updatedArtist;
        }
      );

    return res.status(200).json({
      success: true,

      message:
        "Artist application rejected.",

      artist:
        rejectedArtist,
    });

  } catch (error) {
    return sendArtistError(
      res,

      error,

      "Reject artist error:"
    );
  }
};

// ==========================================
// GET MY ARTIST PROFILE
//
// Includes pending or rejected applications
// belonging to the authenticated user.
// ==========================================

const getMyArtistProfile = async (
  req,
  res
) => {
  try {
    const user =
      requireAuthenticatedUser(req);

    setPrivateHeaders(res);

    const artist =
      await Artist.findOne({
        userId: user._id,
      }).populate(
        "userId",

        "fullName email"
      );

    if (!artist) {
      throw new ArtistRequestError(
        "Artist profile not found.",
        404
      );
    }

    return res.status(200).json({
      success: true,

      artist,
    });

  } catch (error) {
    return sendArtistError(
      res,

      error,

      "Get my artist profile error:"
    );
  }
};

// ==========================================
// UPDATE MY ARTIST PROFILE
//
// Supports:
// - Stage name
// - Biography
// - Country
// - Verified R2 profile image
// - Verified R2 cover image
//
// Administrative fields cannot be changed.
// ==========================================

const updateMyArtistProfile = async (
  req,
  res
) => {
  try {
    const user =
      requireAuthenticatedUser(req);

    const input =
      req.body || {};

    setPrivateHeaders(res);

    // ======================================
    // FIND OWN ARTIST PROFILE
    // ======================================

    const artist =
      await Artist.findOne({
        userId: user._id,
      });

    if (!artist) {
      throw new ArtistRequestError(
        "Artist profile not found.",
        404
      );
    }

    // ======================================
    // PROTECT RESTRICTED ARTISTS
    // ======================================

    if (
      artist.visibilityStatus !==
      "visible"
    ) {
      throw new ArtistRequestError(
        "This artist profile is currently restricted.",
        403
      );
    }

    // ======================================
    // VERIFY ACCOUNT ROLE
    // ======================================

    if (
      artist.approvalStatus ===
        "approved" &&

      user.role !== "artist"
    ) {
      throw new ArtistRequestError(
        "An approved artist account is required.",
        403
      );
    }

    if (
      !["listener", "artist"].includes(
        user.role
      )
    ) {
      throw new ArtistRequestError(
        "This account cannot manage an artist profile.",
        403
      );
    }

    // ======================================
    // STORE VALIDATED CHANGES
    // ======================================

    const changes = {};

    // ======================================
    // ALLOWED PROFILE TEXT FIELDS
    // ======================================

    const allowedFields = [
      "stageName",

      "bio",

      "country",
    ];

    for (const field of allowedFields) {
      if (!hasField(input, field)) {
        continue;
      }

      const value = input[field];

      // Validate text values.

      if (typeof value !== "string") {
        throw new ArtistRequestError(
          `${field} must be text.`
        );
      }

      const cleanedValue =
        value.trim();

      // ====================================
      // VALIDATE STAGE NAME
      // ====================================

      if (field === "stageName") {
        if (!cleanedValue) {
          throw new ArtistRequestError(
            "Stage name cannot be empty."
          );
        }

        if (
          cleanedValue.length > 100
        ) {
          throw new ArtistRequestError(
            "Stage name is too long."
          );
        }

        const normalizedStageName =
          cleanedValue.toLowerCase();

        // Prevent duplicate stage names.

        const existingArtist =
          await Artist.exists({
            stageNameNormalized:
              normalizedStageName,

            _id: {
              $ne: artist._id,
            },
          });

        if (existingArtist) {
          throw new ArtistRequestError(
            "This stage name is already in use.",
            409
          );
        }

        changes.stageName =
          cleanedValue;

        changes.stageNameNormalized =
          normalizedStageName;
      }

      // ====================================
      // VALIDATE BIOGRAPHY
      // ====================================

      if (field === "bio") {
        if (
          cleanedValue.length > 500
        ) {
          throw new ArtistRequestError(
            "Biography cannot exceed 500 characters."
          );
        }

        changes.bio =
          cleanedValue;
      }

      // ====================================
      // VALIDATE COUNTRY
      // ====================================

      if (field === "country") {
        if (!cleanedValue) {
          throw new ArtistRequestError(
            "Country cannot be empty."
          );
        }

        if (
          cleanedValue.length > 100
        ) {
          throw new ArtistRequestError(
            "Country name is too long."
          );
        }

        changes.country =
          cleanedValue;
      }
    }

    // ======================================
    // R2 PROFILE AND COVER IMAGE FIELDS
    // ======================================

    const imageFields = [
      {
        requestField:
          "profileImageUploadId",

        modelField:
          "profileImageUploadId",

        legacyField:
          "profileImage",

        kind:
          "artistProfile",
      },

      {
        requestField:
          "coverImageUploadId",

        modelField:
          "coverImageUploadId",

        legacyField:
          "coverImage",

        kind:
          "artistCover",
      },
    ];

    // ======================================
    // VALIDATE AND ATTACH R2 MEDIA
    // ======================================

    for (const imageField of imageFields) {
      if (
        !hasField(
          input,

          imageField.requestField
        )
      ) {
        continue;
      }

      const uploadId =
        input[imageField.requestField];

      if (!isValidArtistId(uploadId)) {
        throw new ArtistRequestError(
          `${imageField.requestField} must be a valid upload ID.`
        );
      }

      const upload =
        await validateArtistImageUpload({
          uploadId,

          userId:
            user._id,

          kind:
            imageField.kind,
        });

      if (!upload) {
        throw new ArtistRequestError(
          `Invalid or unconfirmed ${imageField.kind} upload.`
        );
      }

      // Attach the verified R2 media.

      changes[
        imageField.modelField
      ] = upload._id;

      // Remove the old manually entered URL.

      changes[
        imageField.legacyField
      ] = "";
    }

    // ======================================
    // NO PROFILE CHANGES
    // ======================================

    if (
      Object.keys(changes).length === 0
    ) {
      return res.status(200).json({
        success: true,

        message:
          "No artist profile changes were submitted.",

        artist,
      });
    }

    // ======================================
    // VALIDATE PROPOSED ARTIST DOCUMENT
    // ======================================

    artist.set(changes);

    await artist.validate();

    // ======================================
    // CONDITIONAL DATABASE UPDATE
    //
    // Prevent an older request from
    // overwriting concurrent modifications.
    // ======================================

    const updateFilter = {
      _id:
        artist._id,

      userId:
        user._id,

      approvalStatus:
        artist.approvalStatus,

      visibilityStatus:
        "visible",

      updatedAt:
        artist.updatedAt,
    };

    if (artist.__v === undefined) {
      updateFilter.__v = {
        $exists: false,
      };

    } else {
      updateFilter.__v =
        artist.__v;
    }

    const updatedArtist =
      await Artist.findOneAndUpdate(
        updateFilter,

        {
          $set:
            changes,

          $inc: {
            __v: 1,
          },
        },

        {
          new: true,

          runValidators: true,
        }
      );

    if (!updatedArtist) {
      throw new ArtistRequestError(
        "The artist profile changed during this operation. Refresh and try again.",
        409
      );
    }

    // ======================================
    // SUCCESSFUL PROFILE UPDATE
    // ======================================

    return res.status(200).json({
      success: true,

      message:
        "Artist profile updated successfully.",

      artist:
        updatedArtist,
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,

        message:
          "This stage name is already in use.",
      });
    }

    return sendArtistError(
      res,

      error,

      "Update artist profile error:"
    );
  }
};

// ==========================================
// GET PUBLIC ARTIST PROFILE
//
// Returns:
// - Approved and visible artist profile
// - Published and visible releases
// - Published and visible songs
// - Published and visible videos
//
// Restricted parent releases and linked
// music are excluded from public results.
// ==========================================

const getPublicArtistProfile = async (
  req,
  res
) => {
  try {
    const { artistId } =
      req.params;

    if (!isValidArtistId(artistId)) {
      throw new ArtistRequestError(
        "Invalid artist ID."
      );
    }

    // ======================================
    // FIND PUBLIC ARTIST
    // ======================================

    const artist =
      await Artist.findOne({
        _id:
          artistId,

        approvalStatus:
          "approved",

        visibilityStatus:
          "visible",
      })

        .select(
          "_id userId stageName bio country profileImage profileImageUploadId coverImage coverImageUploadId approvalStatus visibilityStatus verified featured followersCount createdAt updatedAt"
        )

        .populate(
          "userId",

          "fullName"
        );

    if (!artist) {
      throw new ArtistRequestError(
        "Artist not found.",
        404
      );
    }

    // ======================================
    // PUBLIC RELEASES
    // ======================================

    const releaseQuery =
      Release.find({
        status:
          "approved",

        visibilityStatus:
          "visible",

        $or: [
          {
            primaryArtists:
              artist._id,
          },

          {
            collaboratingArtists:
              artist._id,
          },
        ],
      })

        .sort({
          releaseDate: -1,

          _id: -1,
        })

        .populate(
          "primaryArtists",

          ARTIST_PUBLIC_FIELDS
        )

        .populate(
          "collaboratingArtists",

          ARTIST_PUBLIC_FIELDS
        );

    // ======================================
    // PUBLIC SONGS
    // ======================================

    const songQuery =
      Song.find({
        status:
          "approved",

        visibilityStatus:
          "visible",

        $or: [
          {
            primaryArtists:
              artist._id,
          },

          {
            featuredArtists:
              artist._id,
          },
        ],
      })

        .sort({
          createdAt: -1,

          _id: -1,
        })

        .populate(
          "primaryArtists",

          ARTIST_PUBLIC_FIELDS
        )

        .populate(
          "featuredArtists",

          ARTIST_PUBLIC_FIELDS
        )

        .populate({
          path:
            "releaseId",

          select:
            "title releaseType coverImage coverUploadId releaseDate status visibilityStatus",

          match: {
            status:
              "approved",

            visibilityStatus:
              "visible",
          },
        });

    // ======================================
    // PUBLIC VIDEOS
    // ======================================

    const videoQuery =
      Video.find({
        status:
          "approved",

        visibilityStatus:
          "visible",

        $or: [
          {
            primaryArtists:
              artist._id,
          },

          {
            featuredArtists:
              artist._id,
          },
        ],
      })

        .sort({
          createdAt: -1,

          _id: -1,
        })

        .populate(
          "primaryArtists",

          ARTIST_PUBLIC_FIELDS
        )

        .populate(
          "featuredArtists",

          ARTIST_PUBLIC_FIELDS
        )

        // ==================================
        // POPULATE ONLY PUBLIC LINKED SONG
        // ==================================

        .populate({
          path:
            "linkedSong",

          select:
            "title genre duration releaseId",

          match: {
            status:
              "approved",

            visibilityStatus:
              "visible",
          },

          populate: {
            path:
              "releaseId",

            select:
              "_id",

            match: {
              status:
                "approved",

              visibilityStatus:
                "visible",
            },
          },
        })

        // ==================================
        // POPULATE PUBLIC LINKED RELEASE
        // ==================================

        .populate({
          path:
            "linkedRelease",

          select:
            "title releaseType coverImage coverUploadId",

          match: {
            status:
              "approved",

            visibilityStatus:
              "visible",
          },
        });

    // ======================================
    // RETRIEVE PUBLIC ARTIST CONTENT
    // ======================================

    const [
      releases,

      songs,

      videos,
    ] = await Promise.all([
      releaseQuery,

      songQuery,

      videoQuery,
    ]);

    // ======================================
    // EXCLUDE SONGS WITH HIDDEN RELEASES
    // ======================================

    const publicSongs =
      songs.filter(
        (song) =>
          song.releaseId &&

          song.releaseId.status ===
            "approved" &&

          song.releaseId.visibilityStatus ===
            "visible"
      );

    // ======================================
    // PROTECT RESTRICTED VIDEO MUSIC LINKS
    // ======================================

    const publicVideos =
      videos.map((video) => {
        const result =
          video.toObject();

        // Remove linked song when its
        // parent release is unavailable.

        if (
          result.linkedSong &&

          !result.linkedSong.releaseId
        ) {
          result.linkedSong =
            null;
        }

        // Prevent invalid song and
        // release combinations.

        if (
          result.linkedSong &&

          result.linkedRelease &&

          String(
            result.linkedSong.releaseId._id
          ) !==

            String(
              result.linkedRelease._id
            )
        ) {
          result.linkedSong =
            null;
        }

        return result;
      });

    // ======================================
    // RETURN PUBLIC ARTIST PROFILE
    // ======================================

    return res.status(200).json({
      success: true,

      artist,

      releases,

      songs:
        publicSongs,

      videos:
        publicVideos,
    });

  } catch (error) {
    return sendArtistError(
      res,

      error,

      "Get public artist profile error:"
    );
  }
};

// ==========================================
// SHARED FEATURED ARTIST MANAGEMENT
//
// ADMIN AND SUPER ADMIN
// ==========================================

async function changeArtistFeaturedStatus(
  req,
  featured
) {
  requireArtistAdministrator(req);

  const artistId =
    req.params.artistId ||
    req.params.id;

  if (!isValidArtistId(artistId)) {
    throw new ArtistRequestError(
      "Invalid artist ID."
    );
  }

  const reason =
    getArtistAdminReason(
      req,

      featured
        ? "Artist added to featured artists."
        : "Artist removed from featured artists."
    );

  // ========================================
  // START FEATURED ARTIST TRANSACTION
  // ========================================

  return runArtistAdminTransaction(
    async (session) => {
      const administrator =
        await lockArtistAdministrator(
          req,

          session
        );

      // ====================================
      // FIND ARTIST
      // ====================================

      const artist =
        await Artist.findById(
          artistId
        ).session(session);

      if (!artist) {
        throw new ArtistRequestError(
          "Artist not found.",
          404
        );
      }

      // ====================================
      // VERIFY ELIGIBILITY
      // ====================================

      if (featured) {
        if (
          artist.approvalStatus !==
            "approved" ||

          artist.visibilityStatus !==
            "visible"
        ) {
          throw new ArtistRequestError(
            "Only approved and visible artists can be featured.",
            409
          );
        }

        const activeArtistUser =
          await User.exists({
            _id:
              artist.userId,

            role:
              "artist",

            accountStatus:
              "active",
          }).session(session);

        if (!activeArtistUser) {
          throw new ArtistRequestError(
            "Only artists with active artist accounts can be featured.",
            409
          );
        }
      }

      // ====================================
      // PREVENT REPEATED ACTIVITIES
      // ====================================

      if (
        Boolean(artist.featured) ===
        featured
      ) {
        return {
          artist,

          alreadyUpdated:
            true,
        };
      }

      // ====================================
      // CAPTURE PREVIOUS VALUES
      // ====================================

      const previousValues =
        artistActivitySnapshot(
          artist
        );

      // ====================================
      // UPDATE FEATURED STATUS
      // ====================================

      const updatedArtist =
        await Artist.findOneAndUpdate(
          {
            _id:
              artist._id,

            approvalStatus:
              artist.approvalStatus,

            visibilityStatus:
              artist.visibilityStatus,
          },

          {
            $set: {
              featured,
            },

            $inc: {
              __v: 1,
            },
          },

          {
            new: true,

            session,

            runValidators: true,
          }
        );

      if (!updatedArtist) {
        throw new ArtistRequestError(
          "Artist information has changed.",
          409
        );
      }

      // ====================================
      // RECORD ADMINISTRATIVE ACTIVITY
      // ====================================

      await recordAdminActivity({
        req,

        actor:
          administrator,

        action:
          featured
            ? "artist_featured"
            : "artist_unfeatured",

        targetType:
          "artist",

        targetId:
          updatedArtist._id,

        targetName:
          updatedArtist.stageName,

        previousValues,

        newValues:
          artistActivitySnapshot(
            updatedArtist
          ),

        reason,

        outcome:
          "success",

        session,
      });

      return {
        artist:
          updatedArtist,

        alreadyUpdated:
          false,
      };
    }
  );
}

// ==========================================
// FEATURE ARTIST
//
// ADMIN AND SUPER ADMIN
// ==========================================

const featureArtist = async (
  req,
  res
) => {
  try {
    const result =
      await changeArtistFeaturedStatus(
        req,

        true
      );

    return res.status(200).json({
      success: true,

      message:
        result.alreadyUpdated
          ? "This artist is already featured."
          : "Artist added to featured artists.",

      artist:
        result.artist,

      alreadyUpdated:
        result.alreadyUpdated,
    });

  } catch (error) {
    return sendArtistError(
      res,

      error,

      "Feature artist error:"
    );
  }
};

// ==========================================
// UNFEATURE ARTIST
//
// ADMIN AND SUPER ADMIN
// ==========================================

const unfeatureArtist = async (
  req,
  res
) => {
  try {
    const result =
      await changeArtistFeaturedStatus(
        req,

        false
      );

    return res.status(200).json({
      success: true,

      message:
        result.alreadyUpdated
          ? "This artist is not featured."
          : "Artist removed from featured artists.",

      artist:
        result.artist,

      alreadyUpdated:
        result.alreadyUpdated,
    });

  } catch (error) {
    return sendArtistError(
      res,

      error,

      "Unfeature artist error:"
    );
  }
};

// ==========================================
// VERIFY APPROVED ARTIST ACCOUNT
//
// Used by collaboration search and
// saved artist selection resolution.
// ==========================================

async function getApprovedArtistAccount(
  req
) {
  const user =
    requireAuthenticatedUser(req);

  if (user.role !== "artist") {
    throw new ArtistRequestError(
      "Approved artist account required.",
      403
    );
  }

  const artist =
    await Artist.findOne({
      userId:
        user._id,

      approvalStatus:
        "approved",

      visibilityStatus:
        "visible",
    }).select("_id");

  if (!artist) {
    throw new ArtistRequestError(
      "Approved and visible artist account required.",
      403
    );
  }

  return artist;
}

// ==========================================
// SEARCH ARTISTS FOR COLLABORATIONS
//
// GET /api/artists/search?q=stageName
//
// Only approved and visible artists
// appear in collaboration search.
// ==========================================

const searchArtistsForCollaboration =
  async (req, res) => {
    try {
      // ====================================
      // VERIFY REQUESTING ARTIST
      // ====================================

      const currentArtist =
        await getApprovedArtistAccount(
          req
        );

      setPrivateHeaders(res);

      const { q } =
        req.query;

      // ====================================
      // VALIDATE SEARCH QUERY
      // ====================================

      if (typeof q !== "string") {
        throw new ArtistRequestError(
          "Enter an artist stage name."
        );
      }

      const searchTerm =
        q.trim().toLowerCase();

      // Require at least two characters.

      if (searchTerm.length < 2) {
        return res.status(200).json({
          success: true,

          count: 0,

          artists: [],
        });
      }

      if (searchTerm.length > 100) {
        throw new ArtistRequestError(
          "Search cannot exceed 100 characters."
        );
      }

      // ====================================
      // ESCAPE REGEX SEARCH TEXT
      // ====================================

      const escapedSearch =
        escapeRegex(searchTerm);

      // ====================================
      // FIND ELIGIBLE COLLABORATORS
      // ====================================

      const artists =
        await Artist.find({
          approvalStatus:
            "approved",

          visibilityStatus:
            "visible",

          // Exclude requesting artist.

          _id: {
            $ne:
              currentArtist._id,
          },

          stageNameNormalized: {
            $regex:
              `^${escapedSearch}`,
          },
        })

          .select(
            "_id stageName profileImage profileImageUploadId verified country"
          )

          .sort({
            stageNameNormalized: 1,

            _id: 1,
          })

          .limit(20)

          .lean();

      // ====================================
      // RETURN SEARCH RESULTS
      // ====================================

      return res.status(200).json({
        success: true,

        count:
          artists.length,

        artists,
      });

    } catch (error) {
      return sendArtistError(
        res,

        error,

        "Artist collaboration search error:"
      );
    }
  };

// ==========================================
// RESOLVE SAVED ARTIST SELECTIONS
//
// Used when opening saved drafts or
// restoring primary and featured artists.
// ==========================================

const resolveSelectedArtists = async (
  req,
  res
) => {
  try {
    await getApprovedArtistAccount(
      req
    );

    setPrivateHeaders(res);

    const { ids } =
      req.body || {};

    // ======================================
    // VALIDATE ARTIST SELECTION
    // ======================================

    if (
      !Array.isArray(ids) ||

      ids.length > 50 ||

      ids.some(
        (id) =>
          !isValidArtistId(id)
      )
    ) {
      throw new ArtistRequestError(
        "Invalid artist selection."
      );
    }

    // ======================================
    // REMOVE DUPLICATE ARTIST IDS
    // ======================================

    const uniqueIds = [
      ...new Set(
        ids.map(
          (id) => id.toLowerCase()
        )
      ),
    ];

    // ======================================
    // FIND APPROVED SELECTED ARTISTS
    // ======================================

    const artists =
      await Artist.find({
        _id: {
          $in:
            uniqueIds,
        },

        approvalStatus:
          "approved",

        visibilityStatus:
          "visible",
      })

        .select(
          "_id stageName profileImage profileImageUploadId verified country"
        )

        .lean();

    // ======================================
    // PRESERVE SELECTION ORDER
    // ======================================

    const artistMap =
      new Map(
        artists.map((artist) => [
          String(artist._id),

          artist,
        ])
      );

    const orderedArtists =
      uniqueIds

        .map(
          (id) =>
            artistMap.get(id)
        )

        .filter(Boolean);

    return res.status(200).json({
      success: true,

      artists:
        orderedArtists,
    });

  } catch (error) {
    return sendArtistError(
      res,

      error,

      "Resolve selected artists error:"
    );
  }
};

// ==========================================
// VALIDATE ADMINISTRATIVE PAGINATION
// ==========================================

function getArtistPagination(query) {
  const pageValue =
    query.page ?? "1";

  const limitValue =
    query.limit ?? "50";

  if (
    typeof pageValue !== "string" ||

    typeof limitValue !== "string" ||

    !/^[1-9]\d*$/.test(pageValue) ||

    !/^[1-9]\d*$/.test(limitValue)
  ) {
    throw new ArtistRequestError(
      "Invalid pagination parameters."
    );
  }

  const page =
    Number(pageValue);

  const limit =
    Number(limitValue);

  if (
    !Number.isSafeInteger(page) ||

    !Number.isSafeInteger(limit) ||

    page > 10000 ||

    limit > 100
  ) {
    throw new ArtistRequestError(
      "Pagination exceeds the allowed limits."
    );
  }

  return {
    page,

    limit,

    skip:
      (page - 1) * limit,
  };
}

// ==========================================
// BUILD ADMINISTRATIVE ARTIST FILTER
// ==========================================

function buildAdminArtistFilter(query) {
  const filter = {};

  const {
    search = "",

    status = "",

    visibility = "",

    verified = "",

    featured = "",
  } = query;

  // ========================================
  // APPROVAL STATUS FILTER
  // ========================================

  if (status !== "") {
    if (
      typeof status !== "string" ||

      !artistApprovalStatuses.includes(
        status
      )
    ) {
      throw new ArtistRequestError(
        "Invalid artist approval status."
      );
    }

    filter.approvalStatus =
      status;
  }

  // ========================================
  // VISIBILITY STATUS FILTER
  // ========================================

  if (visibility !== "") {
    const allowedVisibility =
      Artist.schema
        .path("visibilityStatus")
        ?.enumValues || [];

    if (
      typeof visibility !== "string" ||

      !allowedVisibility.includes(
        visibility
      )
    ) {
      throw new ArtistRequestError(
        "Invalid artist visibility status."
      );
    }

    filter.visibilityStatus =
      visibility;
  }

  // ========================================
  // VERIFIED ARTIST FILTER
  // ========================================

  if (verified !== "") {
    if (
      !["true", "false"].includes(
        verified
      )
    ) {
      throw new ArtistRequestError(
        "Invalid verification filter."
      );
    }

    filter.verified =
      verified === "true";
  }

  // ========================================
  // FEATURED ARTIST FILTER
  // ========================================

  if (featured !== "") {
    if (
      !["true", "false"].includes(
        featured
      )
    ) {
      throw new ArtistRequestError(
        "Invalid featured artist filter."
      );
    }

    filter.featured =
      featured === "true";
  }

  // ========================================
  // SEARCH BY STAGE NAME OR COUNTRY
  // ========================================

  if (
    typeof search !== "string" ||

    search.trim().length > 100
  ) {
    throw new ArtistRequestError(
      "Invalid artist search query."
    );
  }

  const searchTerm =
    search.trim();

  if (searchTerm) {
    const escapedSearch =
      escapeRegex(searchTerm);

    filter.$or = [
      {
        stageName: {
          $regex:
            escapedSearch,

          $options:
            "i",
        },
      },

      {
        country: {
          $regex:
            escapedSearch,

          $options:
            "i",
        },
      },
    ];
  }

  return filter;
}

// ==========================================
// GET ALL ARTISTS FOR ADMINISTRATION
//
// ADMIN AND SUPER ADMIN
//
// Supports:
// - Search
// - Pagination
// - Approval status
// - Visibility status
// - Verification status
// - Featured status
// ==========================================

const getAdminArtists = async (
  req,
  res
) => {
  try {
    requireArtistAdministrator(req);

    setPrivateHeaders(res);

    // ======================================
    // PREPARE PAGINATION AND FILTERS
    // ======================================

    const pagination =
      getArtistPagination(
        req.query
      );

    const filter =
      buildAdminArtistFilter(
        req.query
      );

    // ======================================
    // RETRIEVE ARTISTS
    // ======================================

    const [
      artists,

      total,
    ] = await Promise.all([
      Artist.find(filter)

        .select(
          "_id userId stageName bio country profileImage profileImageUploadId coverImage coverImageUploadId approvalStatus visibilityStatus verified featured followersCount moderationReason moderatedAt moderatedBy createdAt updatedAt"
        )

        .populate(
          "userId",

          "fullName email role accountStatus emailVerified"
        )

        .sort({
          createdAt: -1,

          _id: -1,
        })

        .skip(
          pagination.skip
        )

        .limit(
          pagination.limit
        )

        .lean(),

      Artist.countDocuments(
        filter
      ),
    ]);

    // ======================================
    // RETURN ADMINISTRATIVE ARTIST RESULTS
    // ======================================

    return res.status(200).json({
      success: true,

      count:
        artists.length,

      artists,

      pagination: {
        page:
          pagination.page,

        limit:
          pagination.limit,

        total,

        totalPages:
          Math.ceil(
            total /
            pagination.limit
          ),
      },
    });

  } catch (error) {
    return sendArtistError(
      res,

      error,

      "Get administrative artists error:"
    );
  }
};

// ==========================================
// EXPORT ARTIST CONTROLLERS
//
// All original controller functions
// have been preserved.
//
// New controller:
// getAdminArtists
// ==========================================

module.exports = {
  // Artist applications.

  applyAsArtist,

  getPendingArtists,

  approveArtist,

  rejectArtist,

  // Artist profile management.

  getMyArtistProfile,

  updateMyArtistProfile,

  getPublicArtistProfile,

  // Featured artist management.

  featureArtist,

  unfeatureArtist,

  // Administrative artist management.

  getAdminArtists,

  // Artist collaboration management.

  searchArtistsForCollaboration,

  resolveSelectedArtists,
};
