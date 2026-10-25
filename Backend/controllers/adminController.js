const User = require("../models/User");
const Release = require("../models/Release");
const Song = require("../models/song");
const Video = require("../models/video");


const getAdmins = async (req, res) => {
  try {
    const admins = await User.find({
      role: "admin",
    }).select(
      "-password"
    );

    return res.status(200).json({
      success: true,
      admins,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const promoteToAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (user.role === "superadmin") {
      return res.status(400).json({
        success: false,
        message:
          "A superadmin account cannot be changed to admin.",
      });
    }

    if (user.role === "admin") {
      return res.status(400).json({
        success: false,
        message:
          "This user is already an admin.",
      });
    }

    user.role = "admin";

    await user.save();

    return res.status(200).json({
      success: true,
      message:
        "User promoted to admin successfully.",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
      },
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const suspendAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await User.findOne({
      _id: adminId,
      role: "admin",
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found.",
      });
    }

    admin.accountStatus = "suspended";

    await admin.save();

    return res.status(200).json({
      success: true,
      message:
        "Admin suspended successfully.",
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const reactivateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await User.findOne({
      _id: adminId,
      role: "admin",
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found.",
      });
    }

    admin.accountStatus = "active";

    await admin.save();

    return res.status(200).json({
      success: true,
      message:
        "Admin reactivated successfully.",
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const removeAdminRole = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await User.findOne({
      _id: adminId,
      role: "admin",
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found.",
      });
    }

    admin.role = "listener";
    admin.accountStatus = "active";

    await admin.save();

    return res.status(200).json({
      success: true,
      message:
        "Admin privileges removed successfully.",
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


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
      User.countDocuments({ accountStatus: "suspended" }),

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
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};

/* ========================================
   GET PLATFORM USERS
======================================== */

const getUsers = async (req, res) => {
  try {

    /*
      Only normal platform accounts.

      Admin and superadmin accounts
      are managed separately.
    */

    const users = await User.find({
      role: {
        $in: [
          "listener",
          "artist",
          "distributor",
        ],
      },
    })
      .select("-password")
      .sort({
        createdAt: -1,
      });


    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });

  } catch (error) {

    console.error(
      "Get users error:",
      error.message
    );


    return res.status(500).json({
      success: false,
      message: "Server error.",
    });

  }
};



/* ========================================
   SUSPEND PLATFORM USER
======================================== */

const suspendUser = async (req, res) => {
  try {

    const {
      userId,
    } = req.params;


    const user = await User.findById(
      userId
    );


    if (!user) {

      return res.status(404).json({
        success: false,
        message: "User not found.",
      });

    }


    /*
      Do not allow this endpoint
      to modify admins or superadmins.
    */

    if (
      [
        "admin",
        "superadmin",
      ].includes(
        user.role
      )
    ) {

      return res.status(403).json({
        success: false,
        message:
          "Administrative accounts cannot be suspended from the Users section.",
      });

    }


    if (
      user.accountStatus ===
      "suspended"
    ) {

      return res.status(400).json({
        success: false,
        message:
          "This user is already suspended.",
      });

    }


    user.accountStatus =
      "suspended";


    await user.save();


    return res.status(200).json({
      success: true,

      message:
        "User suspended successfully.",

      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        accountStatus:
          user.accountStatus,
      },
    });

  } catch (error) {

    console.error(
      "Suspend user error:",
      error.message
    );


    return res.status(500).json({
      success: false,
      message: "Server error.",
    });

  }
};



/* ========================================
   REACTIVATE PLATFORM USER
======================================== */

const reactivateUser = async (
  req,
  res
) => {
  try {

    const {
      userId,
    } = req.params;


    const user = await User.findById(
      userId
    );


    if (!user) {

      return res.status(404).json({
        success: false,
        message: "User not found.",
      });

    }


    /*
      Admin and superadmin accounts
      must be handled separately.
    */

    if (
      [
        "admin",
        "superadmin",
      ].includes(
        user.role
      )
    ) {

      return res.status(403).json({
        success: false,
        message:
          "Administrative accounts cannot be reactivated from the Users section.",
      });

    }


    if (
      user.accountStatus ===
      "active"
    ) {

      return res.status(400).json({
        success: false,
        message:
          "This user account is already active.",
      });

    }


    user.accountStatus =
      "active";


    await user.save();


    return res.status(200).json({
      success: true,

      message:
        "User reactivated successfully.",

      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        accountStatus:
          user.accountStatus,
      },
    });

  } catch (error) {

    console.error(
      "Reactivate user error:",
      error.message
    );


    return res.status(500).json({
      success: false,
      message: "Server error.",
    });

  }
};


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