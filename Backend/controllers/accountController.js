
const User = require("../models/User");
const bcrypt = require("bcryptjs");

const {
  verifyUnsubscribeToken,
} = require("../utils/unsubscribe");

// ========================================
// VALIDATION HELPERS
// ========================================

const isValidDateOfBirth = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getTime() <= Date.now()
  );
};

const isValidProfileImage = (value) => {
  if (typeof value !== "string") {
    return false;
  }

  // Allow clearing the profile image.
  if (value === "") {
    return true;
  }

  if (
    value.length > 2048 ||
    /[\s\x00-\x1F\x7F]/.test(value)
  ) {
    return false;
  }

  // Allow local images such as /uploads/avatar.jpg.
  // Do not allow protocol-relative URLs (//example.com).
  if (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
  ) {
    return true;
  }

  // Allow HTTP/HTTPS image URLs.
  try {
    const url = new URL(value);

    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};

// Explicitly select fields safe for the frontend.
const publicUserFields = [
  "fullName",
  "email",
  "dateOfBirth",
  "profileImage",
  "role",
  "emailVerified",
  "accountStatus",
  "emailPreferences",
  "createdAt",
  "updatedAt",
].join(" ");

// ========================================
// GET MY ACCOUNT
// ========================================

const getMyAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select(publicUserFields);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });

  } catch (error) {
    console.error(
      "Get account error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to load account.",
    });
  }
};

// ========================================
// UPDATE PROFILE
// ========================================

const updateProfile = async (req, res) => {
  try {
    const {
      fullName,
      dateOfBirth,
      profileImage,
    } = req.body || {};

    // Only these three profile fields
    // can be changed through this endpoint.
    if (
      fullName === undefined &&
      dateOfBirth === undefined &&
      profileImage === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "No profile changes provided.",
      });
    }

    if (fullName !== undefined) {
      if (
        typeof fullName !== "string" ||
        !fullName.trim() ||
        fullName.trim().length > 100
      ) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid full name.",
        });
      }
    }

    if (
      dateOfBirth !== undefined &&
      !isValidDateOfBirth(dateOfBirth)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid date of birth.",
      });
    }

    if (
      profileImage !== undefined &&
      !isValidProfileImage(profileImage)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid profile image URL.",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (fullName !== undefined) {
      user.fullName = fullName.trim();
    }

    if (dateOfBirth !== undefined) {
      user.dateOfBirth = dateOfBirth;
    }

    if (profileImage !== undefined) {
      user.profileImage = profileImage;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully.",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        dateOfBirth: user.dateOfBirth,
        profileImage: user.profileImage,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    });

  } catch (error) {
    console.error(
      "Update profile error:",
      error.message
    );

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Invalid profile information.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update profile.",
    });
  }
};

// ========================================
// CHANGE PASSWORD
// ========================================

const changePassword = async (req, res) => {
  try {
    const {
      currentPassword,
      newPassword,
    } = req.body || {};

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword ||
      !newPassword
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Current password and new password are required.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be at least 8 characters.",
      });
    }

    // bcrypt processes only the first 72 bytes.
    if (Buffer.byteLength(newPassword, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be 72 bytes or fewer.",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be different from the current password.",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!passwordMatches) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    // Prevent reuse of the existing password.
    const samePassword = await bcrypt.compare(
      newPassword,
      user.password
    );

    if (samePassword) {
      return res.status(400).json({
        success: false,
        message:
          "Please choose a different password.",
      });
    }

    // User.js automatically hashes
    // the new password before saving.
    user.password = newPassword;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });

  } catch (error) {
    console.error(
      "Change password error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to change password.",
    });
  }
};

// ========================================
// UPDATE EMAIL PREFERENCES
// ========================================

const updateEmailPreferences = async (req, res) => {
  try {
    const {
      birthdayGreetings,
      monthlyGreetings,
    } = req.body || {};

    if (
      birthdayGreetings === undefined &&
      monthlyGreetings === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide an email preference.",
      });
    }

    if (
      (
        birthdayGreetings !== undefined &&
        typeof birthdayGreetings !== "boolean"
      ) ||
      (
        monthlyGreetings !== undefined &&
        typeof monthlyGreetings !== "boolean"
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Email preferences must be true or false.",
      });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (birthdayGreetings !== undefined) {
      user.set(
        "emailPreferences.birthdayGreetings",
        birthdayGreetings
      );
    }

    if (monthlyGreetings !== undefined) {
      user.set(
        "emailPreferences.monthlyGreetings",
        monthlyGreetings
      );
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email preferences updated successfully.",
      emailPreferences: user.emailPreferences,
    });

  } catch (error) {
    console.error(
      "Update email preferences error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to update email preferences.",
    });
  }
};

// ========================================
// UNSUBSCRIBE FROM GREETING EMAILS
// ========================================

const unsubscribeFromGreetings = async (req, res) => {
  try {
    const { token } = req.body || {};

    if (
      typeof token !== "string" ||
      !token ||
      token.length > 512
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid unsubscribe link.",
      });
    }

    const verified = verifyUnsubscribeToken(token);

    if (
      !verified ||
      !["birthday", "new_month"].includes(verified.type)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid unsubscribe link.",
      });
    }

    const field =
      verified.type === "birthday"
        ? "emailPreferences.birthdayGreetings"
        : "emailPreferences.monthlyGreetings";

    // A signed token can only change
    // its corresponding email preference.
    const user = await User.findByIdAndUpdate(
      verified.userId,
      {
        $set: {
          [field]: false,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Account not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "You have successfully unsubscribed.",
    });

  } catch (error) {
    console.error(
      "Unsubscribe error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to unsubscribe right now.",
    });
  }
};

// ========================================
// EXPORT CONTROLLERS
// ========================================

module.exports = {
  getMyAccount,
  updateProfile,
  changePassword,
  updateEmailPreferences,
  unsubscribeFromGreetings,
};
