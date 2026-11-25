
const Notification = require("../models/Notification");

// ==========================================
// INSERT ONE EVENT ONCE PER RECIPIENT
// ==========================================

async function createNotificationOnce(data) {
  if (!data?.userId || !data?.eventKey) {
    throw new Error(
      "Notification requires userId and eventKey."
    );
  }

  try {
    const result = await Notification.updateOne(
      {
        userId: data.userId,
        eventKey: data.eventKey,
      },
      {
        $setOnInsert: data,
      },
      {
        upsert: true,
        runValidators: true,
      }
    );

    return result.upsertedCount === 1;

  } catch (error) {
    if (error.code === 11000) {
      return false;
    }

    throw error;
  }
}

// ==========================================
// INSERT A BATCH ONCE PER RECIPIENT / EVENT
// ==========================================

async function createNotificationsOnce(notifications) {
  if (!Array.isArray(notifications)) {
    throw new Error(
      "Notifications must be an array."
    );
  }

  if (notifications.length === 0) {
    return 0;
  }

  for (const data of notifications) {
    if (!data?.userId || !data?.eventKey) {
      throw new Error(
        "Each notification requires userId and eventKey."
      );
    }
  }

  const operations = notifications.map((data) => ({
    updateOne: {
      filter: {
        userId: data.userId,
        eventKey: data.eventKey,
      },
      update: {
        $setOnInsert: data,
      },
      upsert: true,
    },
  }));

  try {
    const result = await Notification.bulkWrite(
      operations,
      {
        ordered: false,
      }
    );

    return result.upsertedCount || 0;

  } catch (error) {
    const writeErrors =
      error.writeErrors ||
      error.result?.getWriteErrors?.() ||
      [];

    const onlyDuplicateErrors =
      writeErrors.length > 0 &&
      writeErrors.every(
        (item) =>
          item.code === 11000 ||
          item.err?.code === 11000
      );

    if (onlyDuplicateErrors) {
      return (
        error.result?.upsertedCount ||
        error.result?.result?.nUpserted ||
        0
      );
    }

    throw error;
  }
}

module.exports = {
  createNotificationOnce,
  createNotificationsOnce,
};
