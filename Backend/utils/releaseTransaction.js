
const mongoose = require("mongoose");

const Release = require("../models/Release");

// ==========================================
// CUSTOM TRANSACTION ERROR
// ==========================================

class ReleaseTransactionError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "ReleaseTransactionError";
    this.status = status;
  }
}

// ==========================================
// EXECUTE DATABASE TRANSACTION
//
// Automatically commits successful operations
// and rolls back failed operations.
//
// MongoDB can retry transient transaction
// failures through withTransaction().
// ==========================================

async function runReleaseTransaction(
  operation
) {
  const session =
    await mongoose.startSession();

  let result;

  try {
    await session.withTransaction(
      async () => {
        result = await operation(session);
      },

      {
        readPreference: "primary",

        readConcern: {
          level: "snapshot",
        },

        writeConcern: {
          w: "majority",
        },
      }
    );

    return result;

  } finally {
    await session.endSession();
  }
}

// ==========================================
// ACQUIRE RELEASE WRITE LOCK
//
// Updating the release version establishes
// a shared write-conflict point.
//
// All release and song mutations must use
// this function inside their transactions.
// ==========================================

async function lockRelease({
  releaseId,
  userId,
  session,
  allowedStatuses = ["draft"],
  requireVisible = true,
}) {
  if (!session || !session.inTransaction()) {
    throw new Error(
      "A database transaction is required to lock a release."
    );
  }

  if (
    !mongoose.isValidObjectId(
      releaseId
    )
  ) {
    throw new ReleaseTransactionError(
      "Invalid release ID."
    );
  }

  const filter = {
    _id: releaseId,

    status: {
      $in: allowedStatuses,
    },
  };

  // Verify ownership for artist requests.

  if (userId) {
    filter.submittedBy = userId;
  }

  // Prevent restricted releases from
  // being edited or published.

  if (requireVisible) {
    filter.$or = [
      {
        visibilityStatus: "visible",
      },

      {
        visibilityStatus: {
          $exists: false,
        },
      },
    ];
  }

  // ========================================
  // UPDATE RELEASE VERSION
  // ========================================

  const release =
    await Release.findOneAndUpdate(
      filter,

      {
        $inc: {
          __v: 1,
        },
      },

      {
        new: true,

        session,

        runValidators: true,
      }
    );

  if (!release) {
    throw new ReleaseTransactionError(
      "The release is unavailable, restricted, already published or you do not have permission to modify it.",

      409
    );
  }

  return release;
}

// ==========================================
// EXPORT TRANSACTION UTILITIES
// ==========================================

module.exports = {
  ReleaseTransactionError,

  runReleaseTransaction,

  lockRelease,
};