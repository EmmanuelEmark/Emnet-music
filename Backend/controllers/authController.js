
const User = require("../models/User");

const bcrypt = require("bcryptjs");

const jwt = require("jsonwebtoken");

// ==========================================
// AUTHENTICATION CONFIGURATION
// ==========================================

const PUBLIC_REGISTRATION_ROLE = "listener";

// ==========================================
// ADMINISTRATIVE ROLES
// ==========================================

const ADMINISTRATIVE_ROLES = [
  "admin",
  "superadmin",
];

// ==========================================
// TOKEN EXPIRATION BY ACCOUNT ROLE
// ==========================================

const TOKEN_EXPIRATION = {
  listener: "7d",

  artist: "7d",

  distributor: "7d",

  admin: "4h",

  superadmin: "2h",
};

// ==========================================
// HELPERS
// ==========================================

// ==========================================
// NORMALIZE EMAIL ADDRESS
// ==========================================

const normalizeEmail = (email) => {
  return String(email || "")
    .trim()
    .toLowerCase();
};

// ==========================================
// VALIDATE EMAIL ADDRESS
// ==========================================

const isValidEmail = (email) => {
  return (
    typeof email === "string" &&

    email.length <= 254 &&

    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
};

// ==========================================
// VALIDATE DATE OF BIRTH
// ==========================================

const isValidDateOfBirth = (value) => {
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

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return false;
  }

  if (
    date.toISOString().slice(0, 10) !==
    value
  ) {
    return false;
  }

  return (
    date.getTime() <= Date.now()
  );
};

// ==========================================
// VALIDATE SUPPORTED USER ROLE
// ==========================================

function isValidRole(role) {
  return Object.prototype.hasOwnProperty.call(
    TOKEN_EXPIRATION,

    role
  );
}

// ==========================================
// CHECK ADMINISTRATIVE ROLE
// ==========================================

function isAdministrativeRole(role) {
  return ADMINISTRATIVE_ROLES.includes(
    role
  );
}

// ==========================================
// FORMAT PUBLIC USER INFORMATION
//
// Never return the password hash,
// token version or other private
// authentication information.
// ==========================================

function formatUserResponse(user) {
  return {
    id: user._id,

    fullName:
      user.fullName,

    email:
      user.email,

    role:
      user.role,

    emailVerified:
      user.emailVerified,

    profileImage:
      user.profileImage || "",
  };
}

// ==========================================
// COMMON AUTHENTICATION RESPONSE HEADERS
//
// Authentication responses must not
// be stored in browser or proxy caches.
// ==========================================

function setAuthenticationHeaders(res) {
  res.set(
    "Cache-Control",

    "no-store"
  );

  res.set(
    "Pragma",

    "no-cache"
  );
}

// ==========================================
// GENERATE SECURE AUTHENTICATION TOKEN
// ==========================================

function generateAuthToken(user) {
  const secret =
    process.env.JWT_SECRET;

  // ========================================
  // VERIFY SERVER CONFIGURATION
  // ========================================

  if (
    typeof secret !== "string" ||

    !secret.trim()
  ) {
    throw new Error(
      "JWT_SECRET is not configured."
    );
  }

  // ========================================
  // VERIFY USER ROLE
  // ========================================

  if (
    !isValidRole(
      user.role
    )
  ) {
    throw new Error(
      "Unsupported account role."
    );
  }

  // ========================================
  // VERIFY TOKEN VERSION
  // ========================================

  const tokenVersion =
    user.tokenVersion ?? 0;

  if (
    !Number.isSafeInteger(
      tokenVersion
    ) ||

    tokenVersion < 0
  ) {
    throw new Error(
      "Invalid account token version."
    );
  }

  // ========================================
  // SIGN JWT TOKEN
  //
  // The authentication middleware must
  // verify the token version and retrieve
  // the current account role from MongoDB.
  // ========================================

  return jwt.sign(
    {
      userId:
        String(user._id),

      role:
        user.role,

      tokenVersion,
    },

    secret,

    {
      algorithm:
        "HS256",

      expiresIn:
        TOKEN_EXPIRATION[user.role],
    }
  );
}

// ==========================================
// REGISTER PUBLIC USER
//
// POST /api/auth/register
//
// Public registration can only create
// listener accounts.
//
// Administrator accounts must be created
// through authorized administrative
// processes.
// ==========================================

const registerUser = async (
  req,
  res
) => {
  try {
    setAuthenticationHeaders(
      res
    );

    const {
      fullName,

      email,

      password,

      dateOfBirth,
    } = req.body || {};

    // ======================================
    // CHECK REQUIRED REGISTRATION FIELDS
    // ======================================

    if (
      typeof fullName !== "string" ||

      typeof email !== "string" ||

      typeof password !== "string" ||

      typeof dateOfBirth !== "string" ||

      !fullName.trim() ||

      !email.trim() ||

      !password ||

      !dateOfBirth.trim()
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Full name, email, password and date of birth are required.",
      });
    }

    // ======================================
    // PREVENT UNAUTHORIZED ROLE ASSIGNMENT
    //
    // Reject attempts to register directly
    // as an artist, distributor, admin or
    // superadmin.
    // ======================================

    if (
      Object.prototype.hasOwnProperty.call(
        req.body || {},

        "role"
      ) &&

      req.body.role !==
        PUBLIC_REGISTRATION_ROLE
    ) {
      return res.status(403).json({
        success: false,

        message:
          "Public registration is only available for listener accounts.",
      });
    }

    // ======================================
    // NORMALIZE REGISTRATION INFORMATION
    // ======================================

    const cleanFullName =
      fullName.trim();

    const cleanEmail =
      normalizeEmail(email);

    // ======================================
    // VALIDATE FULL NAME
    // ======================================

    if (
      cleanFullName.length > 100
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Full name is too long.",
      });
    }

    // ======================================
    // VALIDATE EMAIL ADDRESS
    // ======================================

    if (
      !isValidEmail(cleanEmail)
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Please enter a valid email address.",
      });
    }

    // ======================================
    // VALIDATE PASSWORD LENGTH
    // ======================================

    if (
      password.length < 8
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Password must contain at least 8 characters.",
      });
    }

    // ======================================
    // VALIDATE BCRYPT PASSWORD BYTE LIMIT
    // ======================================

    if (
      Buffer.byteLength(
        password,

        "utf8"
      ) > 72
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Password is too long. Please use 72 bytes or fewer.",
      });
    }

    // ======================================
    // VALIDATE DATE OF BIRTH
    // ======================================

    if (
      !isValidDateOfBirth(
        dateOfBirth
      )
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Please enter a valid date of birth.",
      });
    }

    // ======================================
    // CHECK EXISTING USER ACCOUNT
    // ======================================

    const existingUser =
      await User.exists({
        email:
          cleanEmail,
      });

    if (existingUser) {
      return res.status(400).json({
        success: false,

        message:
          "An account with this email already exists.",
      });
    }

    // ======================================
    // CREATE PUBLIC LISTENER ACCOUNT
    //
    // Sensitive account fields are
    // explicitly assigned by the server.
    //
    // Never spread req.body into User.
    // ======================================

    const user = new User({
      fullName:
        cleanFullName,

      email:
        cleanEmail,

      password,

      dateOfBirth,

      role:
        PUBLIC_REGISTRATION_ROLE,

      emailVerified:
        false,

      accountStatus:
        "active",

      tokenVersion:
        0,

      createdBy:
        null,

      roleAssignedAt:
        null,

      roleAssignedBy:
        null,
    });

    // ======================================
    // SAVE USER ACCOUNT
    //
    // The User model automatically hashes
    // the password before saving.
    // ======================================

    await user.save();

    // ======================================
    // SUCCESSFUL REGISTRATION
    // ======================================

    return res.status(201).json({
      success: true,

      message:
        "Account created successfully.",

      user:
        formatUserResponse(user),
    });

  } catch (error) {
    // ======================================
    // HANDLE DUPLICATE EMAIL REGISTRATION
    // ======================================

    if (
      error.code === 11000
    ) {
      return res.status(400).json({
        success: false,

        message:
          "An account with this email already exists.",
      });
    }

    // ======================================
    // HANDLE DATABASE VALIDATION ERRORS
    // ======================================

    if (
      error.name === "ValidationError"
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Invalid registration information.",
      });
    }

    console.error(
      "Registration error:",

      error.message
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to create account.",
    });
  }
};

// ==========================================
// LOGIN USER
//
// POST /api/auth/login
//
// Supports:
// - Listener
// - Artist
// - Distributor
// - Admin
// - Super Admin
// ==========================================

const loginUser = async (
  req,
  res
) => {
  try {
    setAuthenticationHeaders(
      res
    );

    const {
      email,

      password,
    } = req.body || {};

    // ======================================
    // VALIDATE REQUIRED LOGIN FIELDS
    // ======================================

    if (
      typeof email !== "string" ||

      typeof password !== "string" ||

      !email.trim() ||

      !password
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Email and password are required.",
      });
    }

    // ======================================
    // NORMALIZE EMAIL ADDRESS
    // ======================================

    const cleanEmail =
      normalizeEmail(email);

    // ======================================
    // VALIDATE LOGIN CREDENTIAL FORMAT
    // ======================================

    if (
      !isValidEmail(cleanEmail) ||

      password.length < 8 ||

      Buffer.byteLength(
        password,

        "utf8"
      ) > 72
    ) {
      return res.status(401).json({
        success: false,

        message:
          "Invalid email or password.",
      });
    }

    // ======================================
    // FIND USER ACCOUNT
    // ======================================

    const user =
      await User.findOne({
        email:
          cleanEmail,
      }).select(
        "+password +tokenVersion"
      );

    if (!user) {
      return res.status(401).json({
        success: false,

        message:
          "Invalid email or password.",
      });
    }

    // ======================================
    // VERIFY STORED PASSWORD HASH
    // ======================================

    if (
      typeof user.password !==
      "string"
    ) {
      console.error(
        "Missing password hash for user:",

        String(user._id)
      );

      return res.status(401).json({
        success: false,

        message:
          "Invalid email or password.",
      });
    }

    // ======================================
    // COMPARE LOGIN PASSWORD
    // ======================================

    const passwordMatches =
      await bcrypt.compare(
        password,

        user.password
      );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,

        message:
          "Invalid email or password.",
      });
    }

    // ======================================
    // VERIFY ACCOUNT STATUS
    //
    // Suspended and disabled accounts
    // cannot receive authentication tokens.
    // ======================================

    if (
      user.accountStatus !==
      "active"
    ) {
      return res.status(403).json({
        success: false,

        message:
          "This account is not active.",
      });
    }

    // ======================================
    // VERIFY SUPPORTED ACCOUNT ROLE
    // ======================================

    if (
      !isValidRole(
        user.role
      )
    ) {
      return res.status(403).json({
        success: false,

        message:
          "This account is not authorized to sign in.",
      });
    }

    // ======================================
    // ADMINISTRATIVE EMAIL VERIFICATION
    //
    // Admin and Super Admin accounts
    // must have verified email addresses.
    //
    // Existing listener and artist
    // authentication behavior is preserved.
    // ======================================

    if (
      isAdministrativeRole(
        user.role
      ) &&

      user.emailVerified !== true
    ) {
      return res.status(403).json({
        success: false,

        message:
          "Administrator email verification is required before signing in.",
      });
    }

    // ======================================
    // VERIFY TOKEN SECURITY VERSION
    // ======================================

    const tokenVersion =
      user.tokenVersion ?? 0;

    if (
      !Number.isSafeInteger(
        tokenVersion
      ) ||

      tokenVersion < 0
    ) {
      console.error(
        "Invalid token version for user:",

        String(user._id)
      );

      return res.status(500).json({
        success: false,

        message:
          "Authentication is unavailable.",
      });
    }

    // ======================================
    // VERIFY JWT SERVER CONFIGURATION
    // ======================================

    if (
      !process.env.JWT_SECRET?.trim()
    ) {
      console.error(
        "JWT_SECRET is not configured."
      );

      return res.status(500).json({
        success: false,

        message:
          "Authentication is unavailable.",
      });
    }

    // ======================================
    // RECORD SUCCESSFUL LOGIN
    //
    // Conditional update prevents issuing
    // a token if the account was suspended
    // or modified during authentication.
    // ======================================

    const loginFilter = {
      _id:
        user._id,

      accountStatus:
        "active",

      role:
        user.role,

      password:
        user.password,
    };

    // Preserve compatibility with existing
    // users created before tokenVersion was
    // introduced.

    if (
      tokenVersion === 0
    ) {
      loginFilter.$or = [
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
      loginFilter.tokenVersion =
        tokenVersion;
    }

    // Recheck email verification during
    // the conditional account update.

    if (
      isAdministrativeRole(
        user.role
      )
    ) {
      loginFilter.emailVerified =
        true;
    }

    // ======================================
    // UPDATE LAST LOGIN DATE
    // ======================================

    const authenticatedUser =
      await User.findOneAndUpdate(
        loginFilter,

        {
          $set: {
            lastLoginAt:
              new Date(),

            tokenVersion,
          },
        },

        {
          new: true,

          runValidators: true,
        }
      );

    if (!authenticatedUser) {
      return res.status(409).json({
        success: false,

        message:
          "Your account changed during authentication. Please sign in again.",
      });
    }

    // ======================================
    // GENERATE ROLE-BASED JWT TOKEN
    // ======================================

    const token =
      generateAuthToken(
        authenticatedUser
      );

    // ======================================
    // SUCCESSFUL LOGIN
    // ======================================

    return res.status(200).json({
      success: true,

      message:
        "Login successful.",

      token,

      expiresIn:
        TOKEN_EXPIRATION[
          authenticatedUser.role
        ],

      user:
        formatUserResponse(
          authenticatedUser
        ),
    });

  } catch (error) {
    console.error(
      "Login error:",

      error.message
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to log in.",
    });
  }
};

// ==========================================
// EXPORT AUTHENTICATION CONTROLLERS
// ==========================================

module.exports = {
  registerUser,

  loginUser,
};
