
require("dotenv").config({
  path: require("path").resolve(
    __dirname,
    "../.env"
  ),
});

const mongoose = require("mongoose");

const readline = require("readline-sync");

const User = require("../models/User");

// ==========================================
// CONFIGURATION
// ==========================================

const MIN_PASSWORD_LENGTH = 15;

const MAX_PASSWORD_BYTES = 72;

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
// VALIDATE DATE OF BIRTH
// ==========================================

function isValidDateOfBirth(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(
    `${value}T00:00:00.000Z`
  );

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  if (
    date.toISOString().slice(0, 10) !==
    value
  ) {
    return false;
  }

  return date.getTime() <= Date.now();
}

// ==========================================
// VALIDATE SUPER ADMIN PASSWORD
// ==========================================

function validatePassword(password) {
  if (
    typeof password !== "string" ||
    password.length < MIN_PASSWORD_LENGTH
  ) {
    throw new Error(
      `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`
    );
  }

  if (
    Buffer.byteLength(password, "utf8") >
    MAX_PASSWORD_BYTES
  ) {
    throw new Error(
      "Password must be 72 bytes or fewer."
    );
  }

  if (!password.trim()) {
    throw new Error(
      "Password cannot contain only whitespace."
    );
  }
}

// ==========================================
// CONNECT TO MONGODB
// ==========================================

async function connectDatabase() {
  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error(
      "MongoDB connection URI is missing from your backend .env file."
    );
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log(
    "MongoDB connected successfully."
  );

  // Ensure the User model's declared indexes,
  // including its unique email index, exist.

  await User.init();

  await User.createIndexes();
}

// ==========================================
// CREATE FIRST SUPER ADMIN
// ==========================================

async function createSuperAdmin() {
  try {
    console.log("");

    console.log(
      "========================================"
    );

    console.log(
      "EMNET MUSIC - SUPER ADMIN SETUP"
    );

    console.log(
      "========================================"
    );

    console.log("");

    // ======================================
    // CONNECT TO DATABASE
    // ======================================

    await connectDatabase();

    console.log(
      `Connected database: ${mongoose.connection.name}`
    );

    // ======================================
    // CHECK EXISTING SUPER ADMIN
    //
    // This script is intended only for
    // creating the initial Super Admin.
    // ======================================

    const existingSuperAdmin =
      await User.exists({
        role: "superadmin",
      });

    if (existingSuperAdmin) {
      throw new Error(
        "A Super Admin account already exists. This setup script cannot create another one."
      );
    }

    // ======================================
    // COLLECT FULL NAME
    // ======================================

    const fullName = readline
      .question("Enter your full name: ")
      .trim();

    if (
      !fullName ||
      fullName.length > 100
    ) {
      throw new Error(
        "Enter a valid full name with at most 100 characters."
      );
    }

    // ======================================
    // COLLECT EMAIL ADDRESS
    // ======================================

    const email = readline
      .question("Enter your email address: ")
      .trim()
      .toLowerCase();

    if (!isValidEmail(email)) {
      throw new Error(
        "Please enter a valid email address."
      );
    }

    // ======================================
    // CHECK EXISTING EMAIL
    //
    // Never silently promote an existing
    // listener or artist account.
    // ======================================

    const existingUser =
      await User.exists({
        email,
      });

    if (existingUser) {
      throw new Error(
        "An account already exists with this email. Use a separate administrative email address."
      );
    }

    // ======================================
    // COLLECT DATE OF BIRTH
    // ======================================

    const dateOfBirth = readline
      .question(
        "Enter your date of birth (YYYY-MM-DD): "
      )
      .trim();

    if (
      !isValidDateOfBirth(dateOfBirth)
    ) {
      throw new Error(
        "Please enter a valid date of birth."
      );
    }

    // ======================================
    // COLLECT SECURE PASSWORD
    //
    // Password is hidden while typing.
    // ======================================

    const password = readline.question(
      "Enter your Super Admin password: ",
      {
        hideEchoBack: true,
      }
    );

    validatePassword(password);

    // ======================================
    // CONFIRM PASSWORD
    // ======================================

    const confirmPassword =
      readline.question(
        "Confirm your password: ",
        {
          hideEchoBack: true,
        }
      );

    if (
      password !== confirmPassword
    ) {
      throw new Error(
        "Passwords do not match."
      );
    }

    // ======================================
    // CONFIRM ACCOUNT DETAILS
    // ======================================

    console.log("");

    console.log(
      "SUPER ADMIN ACCOUNT DETAILS"
    );

    console.log(
      "----------------------------------------"
    );

    console.log(
      `Name: ${fullName}`
    );

    console.log(
      `Email: ${email}`
    );

    console.log(
      `Role: Super Admin`
    );

    console.log(
      `Database: ${mongoose.connection.name}`
    );

    console.log("");

    console.log(
      "Confirm that you own and control this email address."
    );

    const confirmation =
      readline.question(
        'Type CREATE to confirm: '
      );

    if (
      confirmation !== "CREATE"
    ) {
      console.log(
        "Super Admin creation cancelled."
      );

      return;
    }

    // ======================================
    // RECHECK EXISTING SUPER ADMIN
    // ======================================

    const alreadyCreated =
      await User.exists({
        role: "superadmin",
      });

    if (alreadyCreated) {
      throw new Error(
        "A Super Admin account already exists."
      );
    }

    // ======================================
    // CREATE SUPER ADMIN ACCOUNT
    //
    // The User model automatically hashes
    // the password before saving.
    // ======================================

    const superAdmin = new User({
      fullName,

      email,

      password,

      dateOfBirth,

      role: "superadmin",

      emailVerified: true,

      accountStatus: "active",

      tokenVersion: 0,

      roleAssignedAt: new Date(),

      roleAssignedBy: null,

      createdBy: null,

      lastLoginAt: null,

      emailPreferences: {
        birthdayGreetings: false,

        monthlyGreetings: false,
      },
    });

    await superAdmin.save();

    // ======================================
    // SUCCESSFUL ACCOUNT CREATION
    // ======================================

    console.log("");

    console.log(
      "========================================"
    );

    console.log(
      "SUPER ADMIN CREATED SUCCESSFULLY"
    );

    console.log(
      "========================================"
    );

    console.log(
      `User ID: ${superAdmin._id}`
    );

    console.log(
      `Name: ${superAdmin.fullName}`
    );

    console.log(
      `Email: ${superAdmin.email}`
    );

    console.log(
      `Role: ${superAdmin.role}`
    );

    console.log(
      `Status: ${superAdmin.accountStatus}`
    );

    console.log("");

    console.log(
      "You can now sign in using your Super Admin credentials."
    );

  } catch (error) {
    console.error("");

    if (error.code === 11000) {
      console.error(
        "Account creation failed because a duplicate record exists."
      );
    } else {
      console.error(
        "Super Admin setup failed:",
        error.name === "ValidationError"
          ? "Invalid account information."
          : error.message
      );
    }

    process.exitCode = 1;

  } finally {
    await mongoose.disconnect();

    console.log("");

    console.log(
      "Database connection closed."
    );
  }
}

// ==========================================
// EXECUTE SCRIPT
// ==========================================

createSuperAdmin();
