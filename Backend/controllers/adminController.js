
const User = require("../models/User");
const Release = require("../models/Release");
const Song = require("../models/song");
const Video = require("../models/video");

// ========================================
// HELPERS
// ========================================

const platformRoles = [
  "listener",
  "artist",
  "distributor",
];

const isValidId = (id) => {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{24}$/i.test(id)
  );
};

const userResponse = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  accountStatus: user.accountStatus,
});

const serverError = (res, label, error) => {
  console.error(`${label}:`, error.message);

  return res.status(500).json({
    success: false,
    message: "Server error.",
  });
};

// ========================================
// GET ADMINS
// ========================================

const getAdmins = async (req, res) => {
  try {
    const admins = await User.find({
      role: "admin",
    }).select("-password");

    return res.status(200).json({
      success: true,
      admins,
    });

  } catch (error) {
    return serverError(res, "Get admins error", error);
  }
};

// ========================================
// PROMOTE USER TO ADMIN
// SUPERADMIN ONLY
// ========================================

const promoteToAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    // Update only an active ordinary user.
    // The role condition is checked atomically.
    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        role: { $in: platformRoles },
        accountStatus: "active",
      },
      {
        $set: { role: "admin" },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!user) {
      const existing = await User.findById(userId);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      if (existing.role === "superadmin") {
        return res.status(400).json({
          success: false,
          message:
            "A superadmin account cannot be changed to admin.",
        });
      }

      if (existing.role === "admin") {
        return res.status(400).json({
          success: false,
          message: "This user is already an admin.",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          "Only active platform users can be promoted to admin.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User promoted to admin successfully.",
      user: userResponse(user),
    });

  } catch (error) {
    return serverError(res, "Promote admin error", error);
  }
};

// ========================================
// SUSPEND ADMIN
// SUPERADMIN ONLY
// ========================================

const suspendAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;

    if (!isValidId(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID.",
      });
    }

    const admin = await User.findOneAndUpdate(
      {
        _id: adminId,
        role: "admin",
        accountStatus: "active",
      },
      {
        $set: { accountStatus: "suspended" },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!admin) {
      const existing = await User.findOne({
        _id: adminId,
        role: "admin",
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Admin not found.",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          existing.accountStatus === "suspended"
            ? "This admin is already suspended."
            : "Only active admin accounts can be suspended.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Admin suspended successfully.",
    });

  } catch (error) {
    return serverError(res, "Suspend admin error", error);
  }
};

// ========================================
// REACTIVATE ADMIN
// SUPERADMIN ONLY
// ========================================

const reactivateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;

    if (!isValidId(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID.",
      });
    }

    const admin = await User.findOneAndUpdate(
      {
        _id: adminId,
        role: "admin",
        accountStatus: "suspended",
      },
      {
        $set: { accountStatus: "active" },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!admin) {
      const existing = await User.findOne({
        _id: adminId,
        role: "admin",
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "Admin not found.",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          existing.accountStatus === "active"
            ? "This admin is already active."
            : "Disabled admin accounts cannot be reactivated here.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Admin reactivated successfully.",
    });

  } catch (error) {
    return serverError(res, "Reactivate admin error", error);
  }
};

// ========================================
// REMOVE ADMIN PRIVILEGES
// SUPERADMIN ONLY
// ========================================

const removeAdminRole = async (req, res) => {
  try {
    const { adminId } = req.params;

    if (!isValidId(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID.",
      });
    }

    // Change only the role.
    // Preserve the existing account status.
    const admin = await User.findOneAndUpdate(
      {
        _id: adminId,
        role: "admin",
      },
      {
        $set: { role: "listener" },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Admin privileges removed successfully.",
    });

  } catch (error) {
    return serverError(res, "Remove admin role error", error);
  }
};

// ========================================
// DASHBOARD STATISTICS
// SUPERADMIN ONLY
// ========================================

const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      listeners,
      artists,
      admins,
      superadmins,
      suspendedUsers,
      totalSongs,
      totalReleases,
      totalVideos,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "listener" }),
      User.countDocuments({ role: "artist" }),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ role: "superadmin" }),
      User.countDocuments({
        accountStatus: "suspended",
      }),
      Song.countDocuments(),
      Release.countDocuments(),
      Video.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        listeners,
        artists,
        admins,
        superadmins,
        suspendedUsers,
        totalSongs,
        totalReleases,
        totalVideos,
      },
    });

  } catch (error) {
    return serverError(res, "Dashboard stats error", error);
  }
};

// ========================================
// GET PLATFORM USERS
// ADMIN AND SUPERADMIN
// ========================================

const getUsers = async (req, res) => {
  try {
    const users = await User.find({
      role: { $in: platformRoles },
    })
      .select("-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });

  } catch (error) {
    return serverError(res, "Get users error", error);
  }
};

// ========================================
// SUSPEND PLATFORM USER
// ADMIN AND SUPERADMIN
// ========================================

const suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    // Both role and status are checked
    // in the same atomic database operation.
    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        role: { $in: platformRoles },
        accountStatus: "active",
      },
      {
        $set: { accountStatus: "suspended" },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!user) {
      const existing = await User.findById(userId);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      if (!platformRoles.includes(existing.role)) {
        return res.status(403).json({
          success: false,
          message:
            "Administrative accounts cannot be suspended from the Users section.",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          existing.accountStatus === "suspended"
            ? "This user is already suspended."
            : "Only active user accounts can be suspended.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User suspended successfully.",
      user: userResponse(user),
    });

  } catch (error) {
    return serverError(res, "Suspend user error", error);
  }
};

// ========================================
// REACTIVATE PLATFORM USER
// ADMIN AND SUPERADMIN
// ========================================

const reactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    // Only suspended ordinary users
    // can be reactivated here.
    const user = await User.findOneAndUpdate(
      {
        _id: userId,
        role: { $in: platformRoles },
        accountStatus: "suspended",
      },
      {
        $set: { accountStatus: "active" },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!user) {
      const existing = await User.findById(userId);

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      if (!platformRoles.includes(existing.role)) {
        return res.status(403).json({
          success: false,
          message:
            "Administrative accounts cannot be reactivated from the Users section.",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          existing.accountStatus === "active"
            ? "This user account is already active."
            : "Disabled accounts cannot be reactivated here.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User reactivated successfully.",
      user: userResponse(user),
    });

  } catch (error) {
    return serverError(res, "Reactivate user error", error);
  }
};

// ========================================
// EXPORT CONTROLLERS
// ========================================

module.exports = {
  getAdmins,
  promoteToAdmin,
  suspendAdmin,
  reactivateAdmin,
  removeAdminRole,
  getDashboardStats,
  getUsers,
  suspendUser,
  reactivateUser,
};
