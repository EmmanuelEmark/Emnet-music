const mongoose = require("mongoose");
const net = require("node:net");

const AdminActivity = require("../models/AdminActivity");

// ==========================================
// SERVICE CONFIGURATION
// ==========================================

const ADMIN_ROLES = [
  "admin",
  "superadmin",
];

const ALLOWED_OUTCOMES = [
  "success",
  "failed",
  "denied",
];

const ALLOWED_TARGET_TYPES = [
  "user",
  "admin",
  "artist",
  "song",
  "release",
  "video",
  "report",
  "invitation",
  "announcement",
  "settings",
];

// ==========================================
// SAFE ACTIVITY SNAPSHOT FIELDS
//
// Never store passwords, authentication
// tokens or private credentials.
// ==========================================

const SAFE_SNAPSHOT_FIELDS = [
  "role",
  "accountStatus",
  "approvalStatus",
  "visibilityStatus",
  "status",
  "verified",
  "featured",
  "isFeatured",
  "emailVerified",
  "used",
];

// ==========================================
// VALIDATE OBJECT ID
// ==========================================

function isValidId(value) {
  if (value === null || value === undefined) {
    return false;
  }

  return /^[a-f0-9]{24}$/i.test(String(value));
}

// ==========================================
// SANITIZE TEXT
// ==========================================

function sanitizeText(value, maxLength = 1000) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maxLength);
}

// ==========================================
// SANITIZE ACTIVITY SNAPSHOT
// ==========================================

function sanitizeSnapshot(values) {
  const snapshot = {};

  if (
    !values ||
    typeof values !== "object" ||
    Array.isArray(values)
  ) {
    return snapshot;
  }

  for (const field of SAFE_SNAPSHOT_FIELDS) {
    if (
      !Object.prototype.hasOwnProperty.call(
        values,
        field
      )
    ) {
      continue;
    }

    const value = values[field];

    if (typeof value === "boolean") {
      snapshot[field] = value;

    } else if (typeof value === "string") {
      snapshot[field] = sanitizeText(value, 100);

    } else if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      snapshot[field] = value;

    } else if (value === null) {
      snapshot[field] = null;
    }
  }

  return snapshot;
}

// ==========================================
// GET REQUEST IP ADDRESS
// ==========================================

function getRequestIp(req) {
  const address =
    req?.ip ||
    req?.socket?.remoteAddress ||
    "";

  if (typeof address !== "string") {
    return "";
  }

  const cleanAddress = address.trim();

  if (!net.isIP(cleanAddress)) {
    return "";
  }

  return cleanAddress.slice(0, 100);
}

// ==========================================
// GET REQUEST METHOD
// ==========================================

function getRequestMethod(req) {
  const method = sanitizeText(
    req?.method,
    10
  ).toUpperCase();

  const allowedMethods = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ];

  return allowedMethods.includes(method)
    ? method
    : "";
}

// ==========================================
// VALIDATE ADMINISTRATIVE ACTOR
// ==========================================

function validateActor(actor) {
  if (!actor || !isValidId(actor._id)) {
    throw new Error(
      "A valid administrative actor is required."
    );
  }

  if (!ADMIN_ROLES.includes(actor.role)) {
    throw new Error(
      "Invalid administrative actor role."
    );
  }

  const actorName = sanitizeText(
    actor.fullName,
    100
  );

  if (!actorName) {
    throw new Error(
      "Administrator name is required."
    );
  }

  return {
    actorId: actor._id,
    actorName,
    actorRole: actor.role,
  };
}

// ==========================================
// VALIDATE DATABASE SESSION
// ==========================================

function validateSession(session) {
  if (!session) {
    return;
  }

  if (
    typeof session.inTransaction !== "function" ||
    !session.inTransaction()
  ) {
    throw new Error(
      "An active database transaction is required."
    );
  }
}

// ==========================================
// RECORD ADMINISTRATIVE ACTIVITY
//
// Supports standalone activity recording
// and transactional administrative operations.
// ==========================================

async function recordAdminActivity({
  req,
  actor,
  action,
  targetType,
  targetId = null,
  targetName = "",
  previousValues = {},
  newValues = {},
  reason = "",
  outcome = "success",
  session = null,
} = {}) {

  // ========================================
  // VALIDATE ACTOR
  // ========================================

  const administrator = validateActor(
    actor || req?.user
  );

  // ========================================
  // VALIDATE ACTION
  // ========================================

  if (
    typeof action !== "string" ||
    !/^[a-z][a-z0-9_]{0,99}$/.test(action)
  ) {
    throw new Error(
      "Invalid administrative activity action."
    );
  }

  // ========================================
  // VALIDATE TARGET TYPE
  // ========================================

  if (!ALLOWED_TARGET_TYPES.includes(targetType)) {
    throw new Error(
      "Invalid administrative activity target type."
    );
  }

  // ========================================
  // VALIDATE TARGET ID
  // ========================================

  if (targetId !== null && !isValidId(targetId)) {
    throw new Error(
      "Invalid administrative activity target ID."
    );
  }

  // ========================================
  // VALIDATE OUTCOME
  // ========================================

  if (!ALLOWED_OUTCOMES.includes(outcome)) {
    throw new Error(
      "Invalid administrative activity outcome."
    );
  }

  // ========================================
  // VALIDATE SESSION
  // ========================================

  validateSession(session);

  // ========================================
  // PREPARE ACTIVITY RECORD
  // ========================================

  const activityData = {
    actorId: administrator.actorId,

    actorName: administrator.actorName,

    actorRole: administrator.actorRole,

    action,

    targetType,

    targetId:
      targetId === null
        ? null
        : new mongoose.Types.ObjectId(
            String(targetId)
          ),

    targetName: sanitizeText(
      targetName,
      200
    ),

    previousValues:
      sanitizeSnapshot(previousValues),

    newValues:
      sanitizeSnapshot(newValues),

    reason: sanitizeText(
      reason,
      1000
    ),

    outcome,

    ipAddress: getRequestIp(req),

    requestMethod: getRequestMethod(req),
  };

  // ========================================
  // CREATE ACTIVITY INSIDE TRANSACTION
  // ========================================

  if (session) {
    const [activity] = await AdminActivity.create(
      [activityData],
      { session }
    );

    return activity;
  }

  // ========================================
  // CREATE STANDALONE ACTIVITY
  // ========================================

  return AdminActivity.create(activityData);
}

// ==========================================
// EXPORT ACTIVITY SERVICE
// ==========================================

module.exports = {
  recordAdminActivity,
};