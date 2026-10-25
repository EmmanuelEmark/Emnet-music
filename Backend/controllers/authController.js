const User = require("../models/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


const registerUser = async (req, res) => {
  try {
    const {
      fullName,
      email,
      password,
      dateOfBirth,
    } = req.body;

    if (
      !fullName ||
      !email ||
      !password ||
      !dateOfBirth
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Full name, email, password and date of birth are required.",
      });
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          "An account with this email already exists.",
      });
    }

    const user = new User({
      fullName,
      email,
      password,
      dateOfBirth,
    });

    await user.save();

    return res.status(201).json({
      success: true,
      message:
        "Account created successfully.",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
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


const loginUser = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Email and password are required.",
      });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid email or password.",
      });
    }

    if (user.accountStatus !== "active") {
      return res.status(403).json({
        success: false,
        message:
          "This account is not active.",
      });
    }

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

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
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
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


module.exports = {
  registerUser,
  loginUser,
};