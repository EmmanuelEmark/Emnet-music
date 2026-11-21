
const mongoose = require("mongoose");
const Artist = require("../models/Artist");

// ==========================================
// ARTIST CREDIT VALIDATION ERROR
// ==========================================

class ArtistCreditError extends Error {
  constructor(message) {
    super(message);
    this.name = "ArtistCreditError";
  }
}

// ==========================================
// NORMALIZE ARTIST ID
// ==========================================

function normalizeId(value, label) {
  const id =
    value instanceof mongoose.Types.ObjectId
      ? value.toHexString()
      : value;

  if (
    typeof id !== "string" ||
    !/^[a-f0-9]{24}$/i.test(id)
  ) {
    throw new ArtistCreditError(
      `${label} must contain valid artist IDs.`
    );
  }

  return id.toLowerCase();
}

// ==========================================
// VALIDATE ARTIST ID ARRAYS
// ==========================================

function normalizeArtistIds(values, label) {
  if (!Array.isArray(values)) {
    throw new ArtistCreditError(
      `${label} must be an array of artist IDs.`
    );
  }

  const ids = values.map(
    (value) => normalizeId(value, label)
  );

  // Prevent duplicate artist credits.

  if (new Set(ids).size !== ids.length) {
    throw new ArtistCreditError(
      `${label} cannot contain duplicate artists.`
    );
  }

  return ids;
}

// ==========================================
// VALIDATE ARTIST CREDITS
// ==========================================

async function validateArtistCredits({
  ownerArtistId,
  primaryArtists,
  additionalArtists = [],
  additionalLabel = "Featured artists",
  context = "Content",
  session,
}) {
  const owner = normalizeId(
    ownerArtistId,
    "Owner artist"
  );

  const primary = normalizeArtistIds(
    primaryArtists,
    "Primary artists"
  );

  const additional = normalizeArtistIds(
    additionalArtists,
    additionalLabel
  );

  // ========================================
  // OWNER MUST REMAIN A PRIMARY ARTIST
  // ========================================

  if (!primary.includes(owner)) {
    throw new ArtistCreditError(
      `${context}: you must remain a primary artist.`
    );
  }

  // ========================================
  // PREVENT OVERLAPPING ARTIST CREDITS
  // ========================================

  const primarySet = new Set(primary);

  if (
    additional.some(
      (id) => primarySet.has(id)
    )
  ) {
    throw new ArtistCreditError(
      `${context}: an artist cannot appear in both credit categories.`
    );
  }

  // ========================================
  // VERIFY ARTISTS IN MONGODB
  // ========================================

  const allIds = [
    ...primary,
    ...additional,
  ];

  const query = Artist.find({
    _id: {
      $in: allIds,
    },

    approvalStatus: "approved",

    visibilityStatus: "visible",
  })
    .select("_id")
    .lean();

  // Supports future database transactions.

  if (session) {
    query.session(session);
  }

  const eligible = await query;

  const eligibleIds = new Set(
    eligible.map(
      (artist) => String(artist._id)
    )
  );

  // ========================================
  // REJECT INELIGIBLE ARTISTS
  // ========================================

  if (
    allIds.some(
      (id) => !eligibleIds.has(id)
    )
  ) {
    throw new ArtistCreditError(
      `${context}: all credited artists must exist and have approved, visible profiles. Please review your artist selection.`
    );
  }

  // ========================================
  // RETURN VALIDATED ARTIST CREDITS
  // ========================================

  return {
    primaryArtists: primary,
    additionalArtists: additional,
  };
}

// ==========================================
// EXPORT VALIDATION FUNCTIONS
// ==========================================

module.exports = {
  ArtistCreditError,
  validateArtistCredits,
};
