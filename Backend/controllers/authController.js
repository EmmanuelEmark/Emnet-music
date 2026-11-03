
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ========================================
// HELPERS
// ========================================

const normalizeEmail = (email) => {
  return String(email || "").trim().toLowerCase();
};

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidDateOfBirth = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  if (date.toISOString().slice(0, 10) !== value) {
    return false;
  }

  return date.getTime() <= Date.now();
};

// ========================================
// REGISTER USER
// ========================================

const registerUser = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      dateOfBirth,
    } = req.body || {};

    // Check required fields.
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

    const cleanFullName = fullName.trim();
    const cleanEmail = normalizeEmail(email);

    // Validate full name.
    if (cleanFullName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Full name is too long.",
      });
    }

    // Validate email address.
    if (
      cleanEmail.length > 254 ||
      !isValidEmail(cleanEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // Validate password length.
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain at least 8 characters.",
      });
    }

    // bcrypt uses a maximum of 72 password bytes.
    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message:
          "Password is too long. Please use 72 bytes or fewer.",
      });
    }

    // Validate date of birth.
    if (!isValidDateOfBirth(dateOfBirth)) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid date of birth.",
      });
    }

    // Check for an existing account.
    const existingUser = await User.findOne({
      email: cleanEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          "An account with this email already exists.",
      });
    }

    // Create user.
    // The User model hashes the password
    // automatically before saving.
    const user = new User({
      fullName: cleanFullName,
      email: cleanEmail,
      password,
      dateOfBirth,
    });

    await user.save();

    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    });

  } catch (error) {
    // Handle simultaneous registrations
    // using the same email address.
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message:
          "An account with this email already exists.",
      });
    }

    console.error(
      "Registration error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to create account.",
    });
  }
};

// ========================================
// LOGIN USER
// ========================================

const loginUser = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const cleanEmail = normalizeEmail(email);

    if (
      cleanEmail.length > 254 ||
      !isValidEmail(cleanEmail)
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Find account.
    const user = await User.findOne({
      email: cleanEmail,
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Compare password with stored hash.
    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // Check account status after password validation.
    if (user.accountStatus !== "active") {
      return res.status(403).json({
        success: false,
        message: "This account is not active.",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured.");

      return res.status(500).json({
        success: false,
        message: "Authentication is unavailable.",
      });
    }

    // ========================================
    // GENERATE JWT TOKEN
    // ========================================

    const token = jwt.sign(
      {
        userId: String(user._id),
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "7d",
      }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        profileImage: user.profileImage,
      },
    });

  } catch (error) {
    console.error(
      "Login error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to log in.",
    });
  }
};

// ========================================
// EXPORT CONTROLLERS
// ========================================

module.exports = {
  registerUser,
  loginUser,
};
