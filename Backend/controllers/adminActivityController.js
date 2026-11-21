
const AdminActivity = require(
  "../models/AdminActivity"
);

// ==========================================
// CUSTOM ERROR
// ==========================================

class ActivityError extends Error {
  constructor(message, status = 400) {
    super(message);

    this.name = "ActivityError";
    this.status = status;
  }
}

// ==========================================
// ERROR HANDLING
// ==========================================

function sendError(res, error) {
  if (error instanceof ActivityError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
    });
  }

  console.error(
    "Admin activity error:",
    error.name,
    error.code || ""
  );

  return res.status(500).json({
    success: false,
    message:
      "Unable to retrieve administrative activities.",
  });
}

// ==========================================
// REQUIRE SUPER ADMIN
// ==========================================

function verifySuperAdmin(req) {
  if (!req.user?._id || !req.auth) {
    throw new ActivityError(
      "Authentication required.",
      401
    );
  }

  if (
    req.user.role !== "superadmin" ||
    req.user.accountStatus !== "active" ||
    req.user.emailVerified !== true
  ) {
    throw new ActivityError(
      "Only a Super Admin can view administrative activities.",
      403
    );
  }
}

// ==========================================
// VALIDATE MONGODB ID
// ==========================================

function isValidId(value) {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{24}$/i.test(value)
  );
}

// ==========================================
// ESCAPE SEARCH TEXT
// ==========================================

function escapeRegex(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

// ==========================================
// VALIDATE PAGINATION
// ==========================================

function getPagination(query) {
  const pageValue =
    query.page ?? "1";

  const limitValue =
    query.limit ?? "50";

  if (
    typeof pageValue !== "string" ||
    typeof limitValue !== "string" ||

    !/^[1-9]\d*$/.test(pageValue) ||

    !/^[1-9]\d*$/.test(limitValue)
  ) {
    throw new ActivityError(
      "Invalid pagination parameters."
    );
  }

  const page = Number(pageValue);
  const limit = Number(limitValue);

  if (
    !Number.isSafeInteger(page) ||

    !Number.isSafeInteger(limit) ||

    page > 10000 ||

    limit > 100
  ) {
    throw new ActivityError(
      "Pagination exceeds the allowed limits."
    );
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

// ==========================================
// VALIDATE DATE FILTER
// ==========================================

function parseDate(value, label) {
  if (
    typeof value !== "string" ||

    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new ActivityError(
      `Invalid ${label}. Use YYYY-MM-DD.`
    );
  }

  const date = new Date(
    `${value}T00:00:00.000Z`
  );

  if (
    !Number.isFinite(date.getTime()) ||

    date.toISOString().slice(0, 10) !==
      value
  ) {
    throw new ActivityError(
      `Invalid ${label}.`
    );
  }

  return date;
}

// ==========================================
// BUILD ACTIVITY SEARCH FILTER
// ==========================================

function buildFilter(query) {
  const filter = {};

  // ========================================
  // FILTER BY ADMINISTRATOR
  // ========================================

  if (query.actorId !== undefined) {
    if (!isValidId(query.actorId)) {
      throw new ActivityError(
        "Invalid administrator ID."
      );
    }

    filter.actorId = query.actorId;
  }

  // ========================================
  // FILTER BY ADMINISTRATOR ROLE
  // ========================================

  if (query.actorRole) {
    if (
      !["admin", "superadmin"].includes(
        query.actorRole
      )
    ) {
      throw new ActivityError(
        "Invalid administrator role."
      );
    }

    filter.actorRole =
      query.actorRole;
  }

  // ========================================
  // FILTER BY ACTION
  // ========================================

  if (query.action) {
    const allowedActions =
      AdminActivity.schema
        .path("action")
        .enumValues;

    if (
      !allowedActions.includes(
        query.action
      )
    ) {
      throw new ActivityError(
        "Invalid activity action."
      );
    }

    filter.action = query.action;
  }

  // ========================================
  // FILTER BY RESOURCE TYPE
  // ========================================

  if (query.targetType) {
    const allowedTypes =
      AdminActivity.schema
        .path("targetType")
        .enumValues;

    if (
      !allowedTypes.includes(
        query.targetType
      )
    ) {
      throw new ActivityError(
        "Invalid resource type."
      );
    }

    filter.targetType =
      query.targetType;
  }

  // ========================================
  // FILTER BY RESOURCE ID
  // ========================================

  if (query.targetId !== undefined) {
    if (!isValidId(query.targetId)) {
      throw new ActivityError(
        "Invalid resource ID."
      );
    }

    filter.targetId = query.targetId;
  }

  // ========================================
  // FILTER BY OUTCOME
  // ========================================

  if (query.outcome) {
    if (
      ![
        "success",
        "failed",
        "denied",
      ].includes(query.outcome)
    ) {
      throw new ActivityError(
        "Invalid activity outcome."
      );
    }

    filter.outcome = query.outcome;
  }

  // ========================================
  // FILTER BY DATE RANGE
  // ========================================

  const startDate =
    query.startDate === undefined
      ? null
      : parseDate(
          query.startDate,
          "start date"
        );

  const endDate =
    query.endDate === undefined
      ? null
      : parseDate(
          query.endDate,
          "end date"
        );

  if (
    startDate &&
    endDate &&
    startDate > endDate
  ) {
    throw new ActivityError(
      "Start date cannot be after end date."
    );
  }

  if (startDate || endDate) {
    filter.createdAt = {};

    if (startDate) {
      filter.createdAt.$gte =
        startDate;
    }

    if (endDate) {
      // Include the entire selected day.

      endDate.setUTCDate(
        endDate.getUTCDate() + 1
      );

      filter.createdAt.$lt =
        endDate;
    }
  }

  // ========================================
  // SEARCH ADMINISTRATIVE ACTIVITIES
  // ========================================

  if (query.search !== undefined) {
    if (
      typeof query.search !== "string"
    ) {
      throw new ActivityError(
        "Invalid search query."
      );
    }

    const search =
      query.search.trim();

    if (search.length > 100) {
      throw new ActivityError(
        "Search query is too long."
      );
    }

    if (search) {
      const safeSearch =
        escapeRegex(search);

      filter.$or = [
        {
          actorName: {
            $regex: safeSearch,
            $options: "i",
          },
        },

        {
          targetName: {
            $regex: safeSearch,
            $options: "i",
          },
        },

        {
          action: {
            $regex: safeSearch,
            $options: "i",
          },
        },

        {
          reason: {
            $regex: safeSearch,
            $options: "i",
          },
        },
      ];
    }
  }

  return filter;
}

// ==========================================
// GET ADMINISTRATIVE ACTIVITIES
//
// SUPER ADMIN ONLY
// ==========================================

const getAdminActivities = async (
  req,
  res
) => {
  try {
    verifySuperAdmin(req);

    res.set(
      "Cache-Control",
      "private, no-store"
    );

    const pagination =
      getPagination(req.query);

    const filter =
      buildFilter(req.query);

    const [
      activities,
      total,
    ] = await Promise.all([
      AdminActivity.find(filter)
        .sort({
          createdAt: -1,
          _id: -1,
        })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),

      AdminActivity.countDocuments(
        filter
      ),
    ]);

    return res.status(200).json({
      success: true,

      count:
        activities.length,

      activities,

      pagination: {
        page:
          pagination.page,

        limit:
          pagination.limit,

        total,

        totalPages:
          Math.ceil(
            total / pagination.limit
          ),
      },
    });

  } catch (error) {
    return sendError(
      res,
      error
    );
  }
};

// ==========================================
// GET SINGLE ADMINISTRATIVE ACTIVITY
// ==========================================

const getAdminActivityById = async (
  req,
  res
) => {
  try {
    verifySuperAdmin(req);

    res.set(
      "Cache-Control",
      "private, no-store"
    );

    const { activityId } =
      req.params;

    if (!isValidId(activityId)) {
      throw new ActivityError(
        "Invalid activity ID."
      );
    }

    const activity =
      await AdminActivity
        .findById(activityId)
        .lean();

    if (!activity) {
      throw new ActivityError(
        "Activity record not found.",
        404
      );
    }

    return res.status(200).json({
      success: true,
      activity,
    });

  } catch (error) {
    return sendError(
      res,
      error
    );
  }
};

// ==========================================
// EXPORT CONTROLLERS
// ==========================================

module.exports = {
  getAdminActivities,
  getAdminActivityById,
};