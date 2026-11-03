
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ========================================
// PROTECT ROUTES
// ========================================

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Check for a valid Bearer token format.
  if (
    typeof authHeader !== "string" ||
    !/^Bearer\s+\S+$/i.test(authHeader)
  ) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. No valid token provided.",
    });
  }

  const token = authHeader.split(/\s+/)[1];

  let decoded;

  // ========================================
  // VERIFY JWT TOKEN
  // ========================================

  try {
    decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] }
    );
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Your session has expired. Please log in again.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Not authorized. Invalid token.",
    });
  }

  // Keep the existing JWT payload format.
  const userId = decoded?.userId;

  if (
    typeof userId !== "string" ||
    !/^[0-9a-f]{24}$/i.test(userId)
  ) {
    return res.status(401).json({
      success: false,
      message: "Not authorized. Invalid token payload.",
    });
  }

  // ========================================
  // FIND CURRENT USER
  // ========================================

  try {
    const user = await User.findById(userId)
      .select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found or account deleted.",
      });
    }

    // ========================================
    // CHECK ACCOUNT STATUS
    // ========================================

    if (user.accountStatus !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is not active.",
      });
    }

    // Use the current role from MongoDB,
    // not a role supplied in the JWT.
    req.user = user;

    return next();

  } catch (error) {
    console.error(
      "Authentication database error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to verify your account right now.",
    });
  }
};

// ========================================
// AUTHORIZE USER ROLES
// ========================================

const authorize = (...allowedRoles) => {
  return (req, res, next) => {

    // Ensure authentication ran first.
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // Check the user's current database role.
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to access this resource.",
      });
    }

    return next();
  };
};

// ========================================
// OPTIONAL AUTHENTICATION
// ========================================

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // Allow guests without an Authorization header.
  if (!authHeader) {
    return next();
  }

  // If a token is supplied, verify it.
  // Invalid, expired, or inactive accounts
  // must not be treated as authenticated.
  return protect(req, res, next);
};

// ========================================
// EXPORT MIDDLEWARE
// ========================================

module.exports = {
  protect,
  authorize,
  optionalAuth,
};
