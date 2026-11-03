
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const AdminInvite = require("../models/AdminInvite");

// ========================================
// HELPERS
// ========================================

const hashInviteToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

const normalizeEmail = (email) => {
  return String(email || "").trim().toLowerCase();
};

const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidInviteToken = (token) => {
  return (
    typeof token === "string" &&
    /^[a-f0-9]{64}$/i.test(token)
  );
};

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

// ========================================
// CREATE ADMIN INVITATION
// ========================================

const createAdminInvitation = async (req, res) => {
  try {
    const { fullName, email } = req.body || {};

    if (
      typeof fullName !== "string" ||
      typeof email !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Full name and email are required.",
      });
    }

    const cleanName = fullName.trim();
    const cleanEmail = normalizeEmail(email);

    if (!cleanName || cleanName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid full name.",
      });
    }

    if (
      cleanEmail.length > 254 ||
      !isValidEmail(cleanEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // This function must be called through
    // a protected, authorized admin route.
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const existingUser = await User.findOne({
      email: cleanEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // Invalidate earlier unused invitations.
    await AdminInvite.deleteMany({
      email: cleanEmail,
      used: false,
    });

    const inviteToken = crypto
      .randomBytes(32)
      .toString("hex");

    const tokenHash = hashInviteToken(inviteToken);

    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    );

    const invitation = await AdminInvite.create({
      fullName: cleanName,
      email: cleanEmail,
      tokenHash,
      expiresAt,
      createdBy: req.user._id,
    });

    const frontendUrl = (
      process.env.FRONTEND_URL ||
      "http://localhost:3000"
    ).replace(/\/+$/, "");

    const invitationLink =
      `${frontendUrl}/admin-signup?token=${inviteToken}`;

    return res.status(201).json({
      success: true,
      message: "Admin invitation created successfully.",
      invitation: {
        id: invitation._id,
        fullName: invitation.fullName,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        used: invitation.used,
        invitationLink,
      },
    });

  } catch (error) {
    console.error(
      "Create admin invitation error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to create admin invitation.",
    });
  }
};

// ========================================
// GET ADMIN INVITATIONS
// ========================================

const getAdminInvitations = async (req, res) => {
  try {
    const invitations = await AdminInvite
      .find()
      .select("-tokenHash")
      .populate("createdBy", "fullName email")
      .sort({ createdAt: -1 });

    const now = new Date();

    const formatted = invitations.map((invite) => {
      let status = "pending";

      if (invite.used) {
        status = "used";
      } else if (invite.expiresAt <= now) {
        status = "expired";
      }

      return {
        id: invite._id,
        fullName: invite.fullName,
        email: invite.email,
        expiresAt: invite.expiresAt,
        used: invite.used,
        usedAt: invite.usedAt,
        createdAt: invite.createdAt,
        status,
        createdBy: invite.createdBy,
      };
    });

    return res.status(200).json({
      success: true,
      invitations: formatted,
    });

  } catch (error) {
    console.error(
      "Get admin invitations error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to load admin invitations.",
    });
  }
};

// ========================================
// VERIFY ADMIN INVITATION
// ========================================

const verifyAdminInvitation = async (req, res) => {
  try {
    const { token } = req.params;

    if (!isValidInviteToken(token)) {
      return res.status(400).json({
        success: false,
        message: "Invalid invitation link.",
      });
    }

    const tokenHash = hashInviteToken(token);

    const invitation = await AdminInvite.findOne({
      tokenHash,
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Invalid invitation link.",
      });
    }

    if (invitation.used) {
      return res.status(400).json({
        success: false,
        message: "This invitation has already been used.",
      });
    }

    if (invitation.expiresAt <= new Date()) {
      return res.status(410).json({
        success: false,
        message: "This invitation link has expired.",
      });
    }

    const existingUser = await User.findOne({
      email: invitation.email,
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Invitation is valid.",
      invitation: {
        fullName: invitation.fullName,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
      },
    });

  } catch (error) {
    console.error(
      "Verify admin invitation error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to verify admin invitation.",
    });
  }
};

// ========================================
// ACCEPT ADMIN INVITATION
// ========================================

const acceptAdminInvitation = async (req, res) => {
  let claimedInvitation = null;
  let adminCreated = false;

  try {
    const { token } = req.params;
    const { password, dateOfBirth } = req.body || {};

    if (!isValidInviteToken(token)) {
      return res.status(400).json({
        success: false,
        message: "Invalid invitation link.",
      });
    }

    if (
      typeof password !== "string" ||
      typeof dateOfBirth !== "string" ||
      !password ||
      !dateOfBirth
    ) {
      return res.status(400).json({
        success: false,
        message: "Password and date of birth are required.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    if (Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must be 72 bytes or fewer.",
      });
    }

    if (!isValidDateOfBirth(dateOfBirth)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid date of birth.",
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Authentication is unavailable.",
      });
    }

    const tokenHash = hashInviteToken(token);

    const invitation = await AdminInvite.findOne({
      tokenHash,
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Invalid invitation link.",
      });
    }

    if (invitation.used) {
      return res.status(400).json({
        success: false,
        message: "This invitation has already been used.",
      });
    }

    if (invitation.expiresAt <= new Date()) {
      return res.status(410).json({
        success: false,
        message: "This invitation link has expired.",
      });
    }

    const existingUser = await User.findOne({
      email: invitation.email,
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // Atomically claim the invitation.
    // Only one concurrent request can succeed.
    claimedInvitation = await AdminInvite.findOneAndUpdate(
      {
        _id: invitation._id,
        tokenHash,
        used: false,
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          used: true,
          usedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!claimedInvitation) {
      return res.status(409).json({
        success: false,
        message:
          "This invitation has already been used or has expired.",
      });
    }

    // User.js hashes the password automatically.
    const admin = new User({
      fullName: claimedInvitation.fullName,
      email: claimedInvitation.email,
      password,
      dateOfBirth,
      role: "admin",
      accountStatus: "active",
    });

    await admin.save();
    adminCreated = true;

    const authToken = jwt.sign(
      {
        userId: String(admin._id),
        role: admin.role,
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "7d",
      }
    );

    return res.status(201).json({
      success: true,
      message: "Admin account created successfully.",
      token: authToken,
      user: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
        emailVerified: admin.emailVerified,
        profileImage: admin.profileImage,
      },
    });

  } catch (error) {
    // If account creation failed, release the
    // invitation claim for another attempt.
    if (claimedInvitation && !adminCreated) {
      try {
        await AdminInvite.updateOne(
          {
            _id: claimedInvitation._id,
            used: true,
            usedAt: claimedInvitation.usedAt,
          },
          {
            $set: { used: false },
            $unset: { usedAt: "" },
          }
        );
      } catch (rollbackError) {
        console.error(
          "Invitation rollback error:",
          rollbackError.message
        );
      }
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    console.error(
      "Accept admin invitation error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to accept admin invitation.",
    });
  }
};

// ========================================
// EXPORT CONTROLLERS
// ========================================

module.exports = {
  createAdminInvitation,
  getAdminInvitations,
  verifyAdminInvitation,
  acceptAdminInvitation,
};
