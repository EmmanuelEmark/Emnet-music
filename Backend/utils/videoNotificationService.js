
const Video = require("../models/video");

const Artist = require("../models/Artist");

const Follow = require("../models/follow");

const {
  createNotificationOnce,
  createNotificationsOnce,
} = require("./notificationDeliveryService");

// ==========================================
// CONFIGURATION
// ==========================================

const NOTIFICATION_BATCH_SIZE = 500;

// ==========================================
// NOTIFY UPLOADING ARTIST
// ==========================================

async function notifyUploadingArtist(video) {
  if (!video.submittedBy) {
    return false;
  }

  try {
    // ======================================
    // UNIQUE VIDEO PUBLICATION EVENT
    //
    // Prevents multiple notifications
    // for the same published video.
    // ======================================

    const eventKey =
      `video:published:${video._id}`;

    const created =
      await createNotificationOnce({
        userId: video.submittedBy,

        eventKey,

        type: "video_approved",

        title: "Video Published",

        message:
          `Your video "${video.title}" is now live on Emnet Music.`,

        link:
          `/videos/${video._id}`,
      });

    return created;

  } catch (error) {
    console.error(
      "Uploading artist notification failed:",
      error
    );

    return false;
  }
}

// ==========================================
// GET ELIGIBLE PRIMARY ARTISTS
// ==========================================

async function getEligiblePrimaryArtists(
  video
) {
  const primaryArtistIds = [
    ...new Set(
      (video.primaryArtists || [])
        .filter(Boolean)
        .map((artistId) =>
          String(
            artistId._id || artistId
          )
        )
    ),
  ];

  if (primaryArtistIds.length === 0) {
    return [];
  }

  return Artist.find({
    _id: {
      $in: primaryArtistIds,
    },

    approvalStatus: "approved",

    visibilityStatus: "visible",

  })
    .select("_id stageName")
    .lean();
}

// ==========================================
// NOTIFY FOLLOWERS OF PRIMARY ARTISTS
// ==========================================

async function notifyVideoFollowers(video) {
  const artists =
    await getEligiblePrimaryArtists(
      video
    );

  if (artists.length === 0) {
    return 0;
  }

  // ========================================
  // EXTRACT ARTIST IDS
  // ========================================

  const artistIds = artists.map(
    (artist) => artist._id
  );

  // ========================================
  // FORMAT ARTIST STAGE NAMES
  // ========================================

  const artistNames = artists
    .map(
      (artist) =>
        artist.stageName
    )
    .filter(Boolean)
    .join(" & ");

  const displayName =
    artistNames ||
    "An artist you follow";

  // ========================================
  // EXCLUDE UPLOADING ARTIST
  // ========================================

  const ownerUserId =
    String(
      video.submittedBy || ""
    );

  // ========================================
  // FIND FOLLOWERS WHO ENABLED NOTIFICATIONS
  //
  // Group by userId to prevent duplicates
  // when a listener follows multiple artists
  // credited on the same video.
  // ========================================

  const followerFilter = {
    artistId: {
      $in: artistIds,
    },

    notificationsEnabled: true,

    userId: {
      $ne: null,
    },
  };

  if (video.submittedBy) {
    followerFilter.userId = {
      $ne: video.submittedBy,
      $exists: true,
      $type: "objectId",
    };
  }

  const cursor = Follow.aggregate([
    {
      $match: followerFilter,
    },

    {
      $group: {
        _id: "$userId",
      },
    },

  ])
    .allowDiskUse(true)
    .cursor({
      batchSize: NOTIFICATION_BATCH_SIZE,
    });

  // ========================================
  // NOTIFICATION CONTENT
  // ========================================

  const notificationLink =
    `/videos/${video._id}`;

  const notificationMessage =
    `${displayName} just published a new video, "${video.title}".`;

  // ========================================
  // UNIQUE VIDEO PUBLICATION EVENT
  //
  // The combination of userId and eventKey
  // is unique in the Notification model.
  // ========================================

  const eventKey =
    `video:published:${video._id}`;

  let batch = [];

  let notifiedFollowers = 0;

  // ========================================
  // INSERT NOTIFICATIONS IN BATCHES
  //
  // Avoid building an enormous notification
  // array when an artist has many followers.
  // ========================================

  async function flushBatch() {
    if (batch.length === 0) {
      return;
    }

    const currentBatch = batch;

    batch = [];

    // Recheck publication before each batch.

    const stillPublished =
      await Video.exists({
        _id: video._id,

        status: "approved",

        visibilityStatus: "visible",
      });

    if (!stillPublished) {
      return;
    }

    // ======================================
    // INSERT ONLY NEW NOTIFICATIONS
    //
    // Existing notifications are preserved.
    // Their read status is never reset.
    // ======================================

    const insertedCount =
      await createNotificationsOnce(
        currentBatch
      );

    notifiedFollowers +=
      insertedCount;
  }

  // ========================================
  // PROCESS FOLLOWERS
  // ========================================

  try {
    for await (
      const follower of cursor
    ) {
      if (!follower._id) {
        continue;
      }

      if (
        String(follower._id) ===
        ownerUserId
      ) {
        continue;
      }

      batch.push({
        userId: follower._id,

        eventKey,

        type: "new_video",

        title: "New Music Video",

        message:
          notificationMessage,

        link:
          notificationLink,
      });

      if (
        batch.length >=
        NOTIFICATION_BATCH_SIZE
      ) {
        await flushBatch();
      }
    }

    // Insert any remaining notifications.

    await flushBatch();

  } catch (error) {
    console.error(
      "Video follower notification failed:",
      error
    );

  } finally {
    await cursor.close();
  }

  return notifiedFollowers;
}

// ==========================================
// MAIN VIDEO PUBLICATION NOTIFICATION SERVICE
//
// Called only after a successful database
// transition from draft or pending to approved.
// ==========================================

async function notifyPublishedVideo(
  videoId
) {
  const result = {
    artistNotified: false,

    notifiedFollowers: 0,
  };

  try {
    // Verify that the video is actually
    // published and publicly visible.

    const video = await Video.findOne({
      _id: videoId,

      status: "approved",

      visibilityStatus: "visible",

    })
      .select(
        "_id title primaryArtists submittedBy status visibilityStatus"
      )
      .lean();

    if (!video) {
      return result;
    }

    // ======================================
    // NOTIFY THE UPLOADING ARTIST
    // ======================================

    result.artistNotified =
      await notifyUploadingArtist(
        video
      );

    // ======================================
    // NOTIFY ELIGIBLE FOLLOWERS
    // ======================================

    result.notifiedFollowers =
      await notifyVideoFollowers(
        video
      );

    return result;

  } catch (error) {
    // Notification failure must not
    // reverse successful publication.

    console.error(
      "Published video notification service failed:",
      error
    );

    return result;
  }
}

// ==========================================
// EXPORT NOTIFICATION SERVICE
// ==========================================

module.exports = {
  notifyPublishedVideo,
};
