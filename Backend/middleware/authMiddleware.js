
const jwt = require("jsonwebtoken");

const User = require("../models/User");

// ==========================================
// AUTHENTICATION CONFIGURATION
// ==========================================

const SUPPORTED_ROLES = [
  "listener",
  "artist",
  "distributor",
  "admin",
  "superadmin",
];

const ADMINISTRATIVE_ROLES = [
  "admin",
  "superadmin",
];

// ==========================================
// MAXIMUM ADMINISTRATIVE SESSION DURATIONS
//
// Values are measured in seconds.
// ==========================================

const ADMIN_SESSION_LIMITS = {
  admin: 4 * 60 * 60,

  superadmin: 2 * 60 * 60,
};

// ==========================================
// HELPERS
// ==========================================

// Verify supported user roles.

function isValidRole(role) {
  return SUPPORTED_ROLES.includes(
    role
  );
}

// Verify administrative roles.

function isAdministrativeRole(role) {
  return ADMINISTRATIVE_ROLES.includes(
    role
  );
}

// Verify MongoDB user ID.

function isValidUserId(value) {
  return (
    typeof value === "string" &&

    /^[0-9a-f]{24}$/i.test(value)
  );
}

// Verify token version.

function isValidTokenVersion(value) {
  return (
    Number.isSafeInteger(value) &&

    value >= 0
  );
}

// ==========================================
// PREVENT AUTHENTICATED RESPONSE CACHING
// ==========================================

function setSecurityHeaders(res) {
  res.set(
    "Cache-Control",

    "private, no-store"
  );
}

// ==========================================
// AUTHENTICATION ERROR RESPONSE
// ==========================================

function unauthorized(
  res,
  message
) {
  return res.status(401).json({
    success: false,

    message,
  });
}

// ==========================================
// AUTHORIZATION ERROR RESPONSE
// ==========================================

function forbidden(
  res,
  message
) {
  return res.status(403).json({
    success: false,

    message,
  });
}

// ==========================================
// PROTECT ROUTES
//
// 1. Validate Bearer token.
// 2. Verify JWT signature and expiration.
// 3. Retrieve the current database user.
// 4. Verify account status.
// 5. Verify token version.
// 6. Verify current role.
// 7. Enforce administrative security.
// ==========================================

const protect = async (
  req,
  res,
  next
) => {
  setSecurityHeaders(res);

  // ========================================
  // VERIFY SERVER JWT CONFIGURATION
  // ========================================

  const secret =
    process.env.JWT_SECRET;

  if (
    typeof secret !== "string" ||

    !secret.trim()
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

  // ========================================
  // GET AUTHORIZATION HEADER
  // ========================================

  const authHeader =
    req.headers.authorization;

  // ========================================
  // VALIDATE BEARER TOKEN FORMAT
  // ========================================

  if (
    typeof authHeader !== "string" ||

    !/^Bearer\s+\S+$/i.test(
      authHeader
    )
  ) {
    return unauthorized(
      res,

      "Not authorized. No valid token provided."
    );
  }

  const token =
    authHeader.split(/\s+/)[1];

  let decoded;

  // ========================================
  // VERIFY JWT TOKEN
  // ========================================

  try {
    decoded = jwt.verify(
      token,

      secret,

      {
        algorithms: [
          "HS256",
        ],
      }
    );

  } catch (error) {
    // Expired token.

    if (
      error.name ===
      "TokenExpiredError"
    ) {
      return unauthorized(
        res,

        "Your session has expired. Please log in again."
      );
    }

    // Token not yet active.

    if (
      error.name ===
      "NotBeforeError"
    ) {
      return unauthorized(
        res,

        "This authentication token is not active."
      );
    }

    // Invalid token.

    return unauthorized(
      res,

      "Not authorized. Invalid token."
    );
  }

  // ========================================
  // VERIFY JWT PAYLOAD
  // ========================================

  if (
    !decoded ||

    typeof decoded !== "object" ||

    Array.isArray(decoded)
  ) {
    return unauthorized(
      res,

      "Not authorized. Invalid token payload."
    );
  }

  // ========================================
  // VERIFY USER ID
  // ========================================

  const userId =
    decoded.userId;

  if (
    !isValidUserId(userId)
  ) {
    return unauthorized(
      res,

      "Not authorized. Invalid user ID."
    );
  }

  // ========================================
  // VERIFY TOKEN ROLE
  // ========================================

  if (
    !isValidRole(
      decoded.role
    )
  ) {
    return unauthorized(
      res,

      "Not authorized. Invalid account role."
    );
  }

  // ========================================
  // VERIFY TOKEN TIMESTAMPS
  //
  // All authentication tokens must have
  // valid issue and expiration dates.
  // ========================================

  const now = Math.floor(
    Date.now() / 1000
  );

  if (
    !Number.isSafeInteger(
      decoded.iat
    ) ||

    !Number.isSafeInteger(
      decoded.exp
    ) ||

    decoded.iat <= 0 ||

    decoded.exp <= decoded.iat ||

    decoded.iat > now + 30
  ) {
    return unauthorized(
      res,

      "Not authorized. Invalid session information."
    );
  }

  // ========================================
  // FIND CURRENT DATABASE ACCOUNT
  // ========================================

  try {
    const user =
      await User.findById(userId)
        .select("-password");

    // ======================================
    // VERIFY USER EXISTS
    // ======================================

    if (!user) {
      return unauthorized(
        res,

        "User not found or account deleted."
      );
    }

    // ======================================
    // VERIFY ACCOUNT STATUS
    // ======================================

    if (
      user.accountStatus !==
      "active"
    ) {
      return forbidden(
        res,

        "Your account is not active."
      );
    }

    // ======================================
    // VERIFY CURRENT DATABASE ROLE
    // ======================================

    if (
      !isValidRole(
        user.role
      )
    ) {
      return forbidden(
        res,

        "Your account is not authorized to access this platform."
      );
    }

    // ======================================
    // VERIFY ROLE HAS NOT CHANGED
    //
    // A token originally issued to a
    // listener must not automatically
    // become an administrator token
    // after an account role change.
    // ======================================

    if (
      decoded.role !==
      user.role
    ) {
      return unauthorized(
        res,

        "Your account permissions have changed. Please log in again."
      );
    }

    // ======================================
    // VERIFY CURRENT TOKEN VERSION
    // ======================================

    const currentTokenVersion =
      user.tokenVersion ?? 0;

    if (
      !isValidTokenVersion(
        currentTokenVersion
      )
    ) {
      console.error(
        "Invalid database token version:",

        String(user._id)
      );

      return unauthorized(
        res,

        "Unable to verify your session."
      );
    }

    // ======================================
    // HANDLE OLDER LOGIN TOKENS
    //
    // Existing non-administrative accounts
    // may temporarily use older tokens
    // without tokenVersion when their
    // current database version is zero.
    //
    // Administrative accounts must always
    // use the new authentication tokens.
    // ======================================

    let incomingTokenVersion =
      decoded.tokenVersion;

    if (
      incomingTokenVersion ===
      undefined
    ) {
      if (
        isAdministrativeRole(
          user.role
        )
      ) {
        return unauthorized(
          res,

          "Please log in again to establish a secure administrator session."
        );
      }

      incomingTokenVersion = 0;
    }

    // ======================================
    // VALIDATE INCOMING TOKEN VERSION
    // ======================================

    if (
      !isValidTokenVersion(
        incomingTokenVersion
      )
    ) {
      return unauthorized(
        res,

        "Not authorized. Invalid session security information."
      );
    }

    // ======================================
    // CHECK FOR REVOKED SESSION
    // ======================================

    if (
      incomingTokenVersion !==
      currentTokenVersion
    ) {
      return unauthorized(
        res,

        "Your session has been revoked. Please log in again."
      );
    }

    // ======================================
    // PASSWORD CHANGE PROTECTION
    //
    // Invalidate tokens issued before
    // the most recent password change.
    // ======================================

    if (
      user.passwordChangedAt
    ) {
      const passwordChangedTime =
        new Date(
          user.passwordChangedAt
        ).getTime();

      if (
        Number.isFinite(
          passwordChangedTime
        )
      ) {
        const passwordChangedSeconds =
          Math.floor(
            passwordChangedTime /
            1000
          );

        if (
          decoded.iat <
          passwordChangedSeconds
        ) {
          return unauthorized(
            res,

            "Your password has changed. Please log in again."
          );
        }
      }
    }

    // ======================================
    // ADDITIONAL ADMINISTRATIVE SECURITY
    // ======================================

    if (
      isAdministrativeRole(
        user.role
      )
    ) {
      // ====================================
      // REQUIRE VERIFIED EMAIL ADDRESS
      // ====================================

      if (
        user.emailVerified !==
        true
      ) {
        return forbidden(
          res,

          "Administrator email verification is required."
        );
      }

      // ====================================
      // ENFORCE MAXIMUM ADMIN SESSION
      // ====================================

      const maximumSessionDuration =
        ADMIN_SESSION_LIMITS[
          user.role
        ];

      const tokenDuration =
        decoded.exp -
        decoded.iat;

      const sessionAge =
        now -
        decoded.iat;

      if (
        tokenDuration >
          maximumSessionDuration ||

        sessionAge >=
          maximumSessionDuration
      ) {
        return unauthorized(
          res,

          "Your administrator session has expired. Please log in again."
        );
      }
    }

    // ======================================
    // ATTACH AUTHENTICATED USER
    //
    // Controllers continue using:
    //
    // req.user._id
    // req.user.role
    // req.user.email
    // req.user.fullName
    //
    // Role is retrieved from MongoDB,
    // not trusted from the browser.
    // ======================================

    req.user = user;

    // ======================================
    // ATTACH SESSION INFORMATION
    //
    // Available for security checks and
    // future administrative audit logs.
    //
    // Never attach the raw JWT token.
    // ======================================

    req.auth = {
      userId:
        String(user._id),

      role:
        user.role,

      tokenVersion:
        currentTokenVersion,

      issuedAt:
        decoded.iat,

      expiresAt:
        decoded.exp,
    };

    return next();

  } catch (error) {
    console.error(
      "Authentication database error:",

      error.message
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to verify your account right now.",
    });
  }
};

// ==========================================
// AUTHORIZE USER ROLES
//
// Usage:
//
// authorize("artist")
//
// authorize("admin", "superadmin")
//
// authorize("superadmin")
//
// Access is explicitly granted only
// to the supplied roles.
// ==========================================

const authorize = (
  ...allowedRoles
) => {
  // ========================================
  // VALIDATE ROUTE CONFIGURATION
  // ========================================

  if (
    allowedRoles.length === 0 ||

    allowedRoles.some(
      (role) =>
        !isValidRole(role)
    )
  ) {
    throw new Error(
      "Invalid role authorization configuration."
    );
  }

  // ========================================
  // RETURN AUTHORIZATION MIDDLEWARE
  // ========================================

  return (
    req,
    res,
    next
  ) => {
    // Authentication must run first.

    if (!req.user) {
      return unauthorized(
        res,

        "Authentication required."
      );
    }

    // Verify account remains active
    // in the authenticated user context.

    if (
      req.user.accountStatus !==
      "active"
    ) {
      return forbidden(
        res,

        "Your account is not active."
      );
    }

    // ======================================
    // VERIFY ALLOWED ROLE
    // ======================================

    if (
      !allowedRoles.includes(
        req.user.role
      )
    ) {
      return forbidden(
        res,

        "You are not allowed to access this resource."
      );
    }

    return next();
  };
};

// ==========================================
// REQUIRE ADMIN OR SUPER ADMIN
//
// Convenience middleware for routes
// shared by both administrative roles.
//
// Always use protect before this.
// ==========================================

const requireAdmin =
  authorize(
    "admin",

    "superadmin"
  );

// ==========================================
// REQUIRE SUPER ADMIN
//
// Ordinary administrators cannot
// access these protected operations.
//
// Always use protect before this.
// ==========================================

const requireSuperAdmin =
  authorize(
    "superadmin"
  );

// ==========================================
// OPTIONAL AUTHENTICATION
//
// Guests may access public routes.
//
// If a token is supplied, it must
// pass the full authentication checks.
// ==========================================

const optionalAuth = (
  req,
  res,
  next
) => {
  const authHeader =
    req.headers.authorization;

  // Allow guests without an
  // Authorization header.

  if (
    authHeader === undefined
  ) {
    return next();
  }

  // Verify supplied tokens.

  return protect(
    req,

    res,

    next
  );
};

// ==========================================
// EXPORT AUTHENTICATION MIDDLEWARE
// ==========================================

module.exports = {
  protect,

  authorize,

  optionalAuth,

  requireAdmin,

  requireSuperAdmin,
};
