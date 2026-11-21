
const crypto = require("crypto");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const AdminInvite = require("../models/AdminInvite");

// ==========================================
// CONFIGURATION
// ==========================================

const INVITATION_EXPIRATION_MS =
  10 * 60 * 1000;

const ADMIN_PASSWORD_MIN_LENGTH = 15;

const MAX_PASSWORD_BYTES = 72;

const ADMIN_TOKEN_EXPIRATION = "4h";

// ==========================================
// CUSTOM REQUEST ERROR
// ==========================================

class InviteError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "InviteError";
    this.status = status;
  }
}

// ==========================================
// ERROR HANDLING
// ==========================================

function sendError(res, error, context) {
  if (error instanceof InviteError) {
    return res.status(error.status).json({
      success: false,

      message: error.message,
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,

      message:
        "An account or invitation already exists for this email.",
    });
  }

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,

      message:
        "Invalid administrator account information.",
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
        "The operation result could not be confirmed. Check the account or invitation status before trying again.",
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
        "Another request changed this invitation. Please try again.",
    });
  }

  console.error(
    context,
    error.name,
    error.code || ""
  );

  return res.status(500).json({
    success: false,

    message:
      "Unable to complete the administrator invitation operation.",
  });
}

// ==========================================
// SECURITY RESPONSE HEADERS
// ==========================================

function setSecurityHeaders(res) {
  res.set(
    "Cache-Control",
    "private, no-store"
  );

  res.set(
    "Referrer-Policy",
    "no-referrer"
  );
}

// ==========================================
// HASH INVITATION TOKEN
//
// Store only the SHA-256 hash in MongoDB.
// Never store the original invitation token.
// ==========================================

function hashInviteToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

// ==========================================
// NORMALIZE EMAIL ADDRESS
// ==========================================

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

// ==========================================
// VALIDATE EMAIL ADDRESS
// ==========================================

function isValidEmail(email) {
  return (
    typeof email === "string" &&

    email.length <= 254 &&

    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

// ==========================================
// VALIDATE INVITATION TOKEN
// ==========================================

function isValidInviteToken(token) {
  return (
    typeof token === "string" &&

    /^[a-f0-9]{64}$/i.test(token)
  );
}

// ==========================================
// VALIDATE MONGODB ID
// ==========================================

function isValidId(value) {
  return mongoose.isValidObjectId(value);
}

// ==========================================
// VALIDATE DATE OF BIRTH
// ==========================================

function isValidDateOfBirth(value) {
  if (
    typeof value !== "string" ||

    !/^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  ) {
    return false;
  }

  const date = new Date(
    `${value}T00:00:00.000Z`
  );

  return (
    !Number.isNaN(
      date.getTime()
    ) &&

    date.toISOString().slice(0, 10) ===
      value &&

    date.getTime() <= Date.now()
  );
}

// ==========================================
// VALIDATE ADMINISTRATOR PASSWORD
// ==========================================

function validateAdminPassword(password) {
  if (
    typeof password !== "string" ||

    password.length <
      ADMIN_PASSWORD_MIN_LENGTH ||

    !password.trim()
  ) {
    throw new InviteError(
      `Administrator password must contain at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`
    );
  }

  if (
    Buffer.byteLength(
      password,
      "utf8"
    ) > MAX_PASSWORD_BYTES
  ) {
    throw new InviteError(
      "Password must be 72 bytes or fewer."
    );
  }
}

// ==========================================
// REQUIRE SUPER ADMIN
//
// Defense in depth.
//
// Even if a route is incorrectly configured,
// this controller must not allow an ordinary
// administrator to create other admins.
// ==========================================

function requireSuperAdminRequest(req) {
  if (!req.user?._id) {
    throw new InviteError(
      "Authentication required.",
      401
    );
  }

  if (
    req.user.role !== "superadmin" ||

    req.user.accountStatus !== "active" ||

    req.user.emailVerified !== true
  ) {
    throw new InviteError(
      "Only an active, verified Super Admin can manage administrator invitations.",
      403
    );
  }

  return req.user._id;
}

// ==========================================
// VERIFY CURRENT SUPER ADMIN ACCOUNT
//
// Verify the creator of an invitation
// is still authorized.
// ==========================================

async function getActiveSuperAdmin(
  userId,
  session = null
) {
  if (!userId || !isValidId(userId)) {
    throw new InviteError(
      "The invitation creator is invalid.",
      403
    );
  }

  const query = User.findOne({
    _id: userId,

    role: "superadmin",

    accountStatus: "active",

    emailVerified: true,
  }).select(
    "_id fullName email role accountStatus emailVerified tokenVersion"
  );

  if (session) {
    query.session(session);
  }

  const superAdmin = await query;

  if (!superAdmin) {
    throw new InviteError(
      "The Super Admin responsible for this invitation is no longer authorized.",
      403
    );
  }

  return superAdmin;
}

// ==========================================
// LOCK AUTHORIZED INVITATION CREATOR
//
// Used during transactions to coordinate
// invitation operations with concurrent
// updates to the creator's User document.
//
// No role or security version is changed.
// ==========================================

async function lockActiveSuperAdmin(
  userId,
  session,
  expectedTokenVersion
) {
  if (
    !session ||
    !session.inTransaction()
  ) {
    throw new Error(
      "An active database transaction is required."
    );
  }

  const filter = {
    _id: userId,

    role: "superadmin",

    accountStatus: "active",

    emailVerified: true,
  };

  if (
    expectedTokenVersion !== undefined
  ) {
    if (expectedTokenVersion === 0) {
      filter.$or = [
        { tokenVersion: 0 },

        {
          tokenVersion: {
            $exists: false,
          },
        },

        { tokenVersion: null },
      ];
    } else {
      filter.tokenVersion =
        expectedTokenVersion;
    }
  }

  const creator =
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
      "_id role accountStatus emailVerified tokenVersion"
    );

  if (!creator) {
    throw new InviteError(
      "The Super Admin account is no longer authorized to manage this invitation.",
      403
    );
  }

  return creator;
}

// ==========================================
// RUN ADMIN INVITATION TRANSACTION
//
// Invitation changes and user creation
// must succeed together or roll back.
// ==========================================

async function runInviteTransaction(
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
// GET FRONTEND URL
//
// Production invitation links must use
// HTTPS and the configured frontend URL.
// ==========================================

function getFrontendUrl() {
  const configuredUrl =
    process.env.FRONTEND_URL ||

    (
      process.env.NODE_ENV === "production"
        ? ""
        : "http://localhost:5173"
    );

  if (!configuredUrl) {
    throw new Error(
      "FRONTEND_URL is not configured."
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error(
      "FRONTEND_URL is invalid."
    );
  }

  if (
    !["http:", "https:"].includes(
      parsedUrl.protocol
    ) ||

    parsedUrl.username ||

    parsedUrl.password ||

    parsedUrl.search ||

    parsedUrl.hash ||

    parsedUrl.pathname !== "/"
  ) {
    throw new Error(
      "FRONTEND_URL must contain a valid frontend origin."
    );
  }

  const localHosts = [
    "localhost",
    "127.0.0.1",
    "[::1]",
  ];

  const localDevelopment =
    process.env.NODE_ENV !==
      "production" &&

    localHosts.includes(
      parsedUrl.hostname
    );

  if (
    parsedUrl.protocol !== "https:" &&
    !localDevelopment
  ) {
    throw new Error(
      "Production invitation links must use HTTPS."
    );
  }

  return parsedUrl.origin;
}

// ==========================================
// VERIFY INVITATION STATUS
// ==========================================

function validateInvitationStatus(
  invitation
) {
  if (!invitation) {
    throw new InviteError(
      "Invalid invitation link.",
      404
    );
  }

  if (invitation.used) {
    throw new InviteError(
      "This invitation has already been used.",
      409
    );
  }

  if (
    !invitation.expiresAt ||

    new Date(
      invitation.expiresAt
    ).getTime() <= Date.now()
  ) {
    throw new InviteError(
      "This invitation link has expired.",
      410
    );
  }

  return invitation;
}

// ==========================================
// VERIFY EMAIL ACCOUNT AVAILABILITY
// ==========================================

async function ensureEmailAvailable(
  email,
  session = null
) {
  const query = User.exists({
    email,
  });

  if (session) {
    query.session(session);
  }

  const existingUser =
    await query;

  if (existingUser) {
    throw new InviteError(
      "An account with this email already exists.",
      409
    );
  }
}

// ==========================================
// GENERATE ADMINISTRATOR AUTH TOKEN
//
// Compatible with the updated
// authentication middleware.
// ==========================================

function generateAdminToken(admin) {
  const secret =
    process.env.JWT_SECRET;

  if (
    typeof secret !== "string" ||
    !secret.trim()
  ) {
    throw new Error(
      "JWT_SECRET is not configured."
    );
  }

  const tokenVersion =
    admin.tokenVersion ?? 0;

  if (
    admin.role !== "admin" ||

    admin.accountStatus !== "active" ||

    admin.emailVerified !== true ||

    !Number.isSafeInteger(
      tokenVersion
    ) ||

    tokenVersion < 0
  ) {
    throw new Error(
      "Administrator authentication information is invalid."
    );
  }

  return jwt.sign(
    {
      userId: String(admin._id),

      role: "admin",

      tokenVersion,
    },

    secret,

    {
      algorithm: "HS256",

      expiresIn:
        ADMIN_TOKEN_EXPIRATION,
    }
  );
}

// ==========================================
// FORMAT ADMINISTRATOR RESPONSE
// ==========================================

function formatAdminResponse(admin) {
  return {
    id: admin._id,

    fullName: admin.fullName,

    email: admin.email,

    role: admin.role,

    emailVerified:
      admin.emailVerified,

    profileImage:
      admin.profileImage || "",
  };
}

// ==========================================
// CREATE ADMIN INVITATION
//
// SUPER ADMIN ONLY
// ==========================================

const createAdminInvitation = async (
  req,
  res
) => {
  try {
    setSecurityHeaders(res);

    // ======================================
    // VERIFY SUPER ADMIN PERMISSION
    // ======================================

    const creatorId =
      requireSuperAdminRequest(req);

    // ======================================
    // VALIDATE ADMINISTRATOR INFORMATION
    // ======================================

    const {
      fullName,
      email,
    } = req.body || {};

    if (
      typeof fullName !== "string" ||

      typeof email !== "string"
    ) {
      throw new InviteError(
        "Full name and email are required."
      );
    }

    const cleanName =
      fullName.trim();

    const cleanEmail =
      normalizeEmail(email);

    if (
      !cleanName ||

      cleanName.length > 100
    ) {
      throw new InviteError(
        "Please enter a valid full name."
      );
    }

    if (
      !isValidEmail(cleanEmail)
    ) {
      throw new InviteError(
        "Please enter a valid email address."
      );
    }

    // Reject unauthorized role assignments.

    if (
      req.body.role !== undefined &&

      req.body.role !== "admin"
    ) {
      throw new InviteError(
        "Invitations can only create ordinary administrator accounts.",
        403
      );
    }

    // ======================================
    // VALIDATE FRONTEND CONFIGURATION
    // ======================================

    const frontendUrl =
      getFrontendUrl();

    // ======================================
    // GENERATE SECURE INVITATION TOKEN
    // ======================================

    const inviteToken = crypto
      .randomBytes(32)
      .toString("hex");

    const tokenHash =
      hashInviteToken(inviteToken);

    // ======================================
    // CREATE INVITATION TRANSACTION
    // ======================================

    const invitation =
      await runInviteTransaction(
        async (session) => {
          // Verify and coordinate the
          // current Super Admin account.

          await lockActiveSuperAdmin(
            creatorId,

            session,

            req.auth?.tokenVersion
          );

          // Prevent existing accounts
          // from being silently promoted.

          await ensureEmailAvailable(
            cleanEmail,

            session
          );

          // Invalidate previous unused
          // invitations for this email.

          await AdminInvite.deleteMany(
            {
              email: cleanEmail,

              used: false,
            },

            {
              session,
            }
          );

          // Generate the expiration date.

          const expiresAt = new Date(
            Date.now() +
              INVITATION_EXPIRATION_MS
          );

          // Save the hashed invitation.

          const newInvitation =
            new AdminInvite({
              fullName: cleanName,

              email: cleanEmail,

              tokenHash,

              expiresAt,

              createdBy: creatorId,

              used: false,
            });

          await newInvitation.save({
            session,
          });

          return newInvitation;
        }
      );

    // ======================================
    // GENERATE INVITATION LINK
    //
    // The raw token is returned only
    // to the authorized Super Admin.
    // ======================================

    const invitationLink =
      `${frontendUrl}/admin-signup?token=${inviteToken}`;

    return res.status(201).json({
      success: true,

      message:
        "Admin invitation created successfully.",

      invitation: {
        id: invitation._id,

        fullName:
          invitation.fullName,

        email:
          invitation.email,

        expiresAt:
          invitation.expiresAt,

        used:
          invitation.used,

        invitationLink,
      },
    });

  } catch (error) {
    return sendError(
      res,

      error,

      "Create admin invitation error:"
    );
  }
};

// ==========================================
// GET ADMIN INVITATIONS
//
// SUPER ADMIN ONLY
// ==========================================

const getAdminInvitations = async (
  req,
  res
) => {
  try {
    setSecurityHeaders(res);

    const creatorId =
      requireSuperAdminRequest(req);

    await getActiveSuperAdmin(
      creatorId
    );

    // ======================================
    // RETRIEVE INVITATION HISTORY
    //
    // Never return invitation token hashes.
    // ======================================

    const invitations =
      await AdminInvite.find()
        .select("-tokenHash")
        .populate(
          "createdBy",

          "fullName email"
        )
        .sort({
          createdAt: -1,
        })
        .lean();

    const now =
      new Date();

    // ======================================
    // FORMAT INVITATION STATUS
    // ======================================

    const formatted =
      invitations.map((invite) => {
        let status = "pending";

        if (invite.used) {
          status = "used";

        } else if (
          invite.expiresAt <= now
        ) {
          status = "expired";
        }

        return {
          id: invite._id,

          fullName:
            invite.fullName,

          email:
            invite.email,

          expiresAt:
            invite.expiresAt,

          used:
            invite.used,

          usedAt:
            invite.usedAt || null,

          createdAt:
            invite.createdAt,

          status,

          createdBy:
            invite.createdBy,
        };
      });

    return res.status(200).json({
      success: true,

      invitations:
        formatted,
    });

  } catch (error) {
    return sendError(
      res,

      error,

      "Get admin invitations error:"
    );
  }
};

// ==========================================
// VERIFY ADMIN INVITATION
//
// GET /api/auth/admin-invite/:token
//
// This endpoint must remain public so
// invited administrators can register.
// ==========================================

const verifyAdminInvitation = async (
  req,
  res
) => {
  try {
    setSecurityHeaders(res);

    const { token } =
      req.params;

    // ======================================
    // VALIDATE INVITATION TOKEN
    // ======================================

    if (
      !isValidInviteToken(token)
    ) {
      throw new InviteError(
        "Invalid invitation link."
      );
    }

    const tokenHash =
      hashInviteToken(token);

    // ======================================
    // RETRIEVE INVITATION
    // ======================================

    const invitation =
      await AdminInvite.findOne({
        tokenHash,
      });

    // ======================================
    // VERIFY INVITATION STATUS
    // ======================================

    validateInvitationStatus(
      invitation
    );

    // ======================================
    // VERIFY INVITATION CREATOR
    // ======================================

    await getActiveSuperAdmin(
      invitation.createdBy
    );

    // ======================================
    // VERIFY EMAIL AVAILABILITY
    // ======================================

    await ensureEmailAvailable(
      invitation.email
    );

    // ======================================
    // RETURN INVITATION INFORMATION
    // ======================================

    return res.status(200).json({
      success: true,

      message:
        "Invitation is valid.",

      invitation: {
        fullName:
          invitation.fullName,

        email:
          invitation.email,

        expiresAt:
          invitation.expiresAt,
      },
    });

  } catch (error) {
    return sendError(
      res,

      error,

      "Verify admin invitation error:"
    );
  }
};

// ==========================================
// ACCEPT ADMIN INVITATION
//
// POST /api/auth/admin-invite/:token/accept
//
// Account creation and invitation
// consumption happen in one transaction.
// ==========================================

const acceptAdminInvitation = async (
  req,
  res
) => {
  try {
    setSecurityHeaders(res);

    const { token } =
      req.params;

    const {
      password,
      dateOfBirth,
    } = req.body || {};

    // ======================================
    // VALIDATE INVITATION TOKEN
    // ======================================

    if (
      !isValidInviteToken(token)
    ) {
      throw new InviteError(
        "Invalid invitation link."
      );
    }

    // ======================================
    // VALIDATE REQUIRED ACCOUNT FIELDS
    // ======================================

    if (
      typeof password !== "string" ||

      typeof dateOfBirth !== "string" ||

      !password ||

      !dateOfBirth
    ) {
      throw new InviteError(
        "Password and date of birth are required."
      );
    }

    // ======================================
    // VALIDATE ADMINISTRATOR PASSWORD
    // ======================================

    validateAdminPassword(
      password
    );

    // ======================================
    // VALIDATE DATE OF BIRTH
    // ======================================

    if (
      !isValidDateOfBirth(
        dateOfBirth
      )
    ) {
      throw new InviteError(
        "Please enter a valid date of birth."
      );
    }

    // ======================================
    // PREVENT ROLE MANIPULATION
    // ======================================

    if (
      req.body.role !== undefined &&

      req.body.role !== "admin"
    ) {
      throw new InviteError(
        "This invitation can only create an administrator account.",
        403
      );
    }

    // ======================================
    // VERIFY JWT CONFIGURATION
    // ======================================

    if (
      !process.env.JWT_SECRET?.trim()
    ) {
      throw new Error(
        "JWT_SECRET is not configured."
      );
    }

    const tokenHash =
      hashInviteToken(token);

    // ======================================
    // START ACCOUNT CREATION TRANSACTION
    // ======================================

    const result =
      await runInviteTransaction(
        async (session) => {
          // ==================================
          // FIND INVITATION
          // ==================================

          const invitation =
            await AdminInvite.findOne({
              tokenHash,

            }).session(session);

          validateInvitationStatus(
            invitation
          );

          // ==================================
          // VERIFY AND LOCK THE CREATOR
          //
          // Prevent an invitation from being
          // accepted after an unauthorized
          // creator's account change.
          // ==================================

          const creator =
            await lockActiveSuperAdmin(
              invitation.createdBy,

              session
            );

          // ==================================
          // CHECK EXISTING USER ACCOUNT
          // ==================================

          await ensureEmailAvailable(
            invitation.email,

            session
          );

          // ==================================
          // CLAIM INVITATION ATOMICALLY
          // ==================================

          const now = new Date();

          const claimedInvitation =
            await AdminInvite.findOneAndUpdate(
              {
                _id:
                  invitation._id,

                tokenHash,

                used: false,

                expiresAt: {
                  $gt: now,
                },
              },

              {
                $set: {
                  used: true,

                  usedAt: now,
                },
              },

              {
                new: true,

                session,

                runValidators: true,
              }
            );

          if (!claimedInvitation) {
            throw new InviteError(
              "This invitation has already been used or has expired.",
              409
            );
          }

          // ==================================
          // CREATE ADMINISTRATOR ACCOUNT
          //
          // All privileged fields are assigned
          // by the server, never the browser.
          //
          // This workflow treats possession
          // of a privately delivered invitation
          // as trusted enrollment.
          // ==================================

          const admin = new User({
            fullName:
              claimedInvitation.fullName,

            email:
              claimedInvitation.email,

            password,

            dateOfBirth,

            role: "admin",

            accountStatus: "active",

            emailVerified: true,

            tokenVersion: 0,

            createdBy: creator._id,

            roleAssignedAt: now,

            roleAssignedBy: creator._id,

            lastLoginAt: now,

            emailPreferences: {
              birthdayGreetings: false,

              monthlyGreetings: false,
            },
          });

          // ==================================
          // SAVE ADMINISTRATOR ACCOUNT
          //
          // The User model hashes the
          // password before saving.
          // ==================================

          await admin.save({
            session,
          });

          // ==================================
          // GENERATE AUTHENTICATION TOKEN
          //
          // Do not return it until the
          // database transaction commits.
          // ==================================

          const authToken =
            generateAdminToken(
              admin
            );

          return {
            admin,

            authToken,
          };
        }
      );

    // ======================================
    // ACCOUNT CREATION SUCCESSFUL
    //
    // Both the administrator account
    // and invitation consumption have
    // now committed successfully.
    // ======================================

    return res.status(201).json({
      success: true,

      message:
        "Admin account created successfully.",

      token:
        result.authToken,

      expiresIn:
        ADMIN_TOKEN_EXPIRATION,

      user:
        formatAdminResponse(
          result.admin
        ),
    });

  } catch (error) {
    // MongoDB automatically rolls back
    // failed transactions.
    //
    // Manual invitation rollback is
    // no longer required.

    return sendError(
      res,

      error,

      "Accept admin invitation error:"
    );
  }
};

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

module.exports = {
  createAdminInvitation,

  getAdminInvitations,

  verifyAdminInvitation,

  acceptAdminInvitation,
};
