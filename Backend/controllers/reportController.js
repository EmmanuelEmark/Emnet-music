const Report = require("../models/Report");
const Artist = require("../models/Artist");
const Release = require("../models/Release");
const Song = require("../models/song");
const Video = require("../models/video");


const createReport = async (req, res) => {
  try {
    const {
      targetType,
      targetId,
      reason,
      description,
    } = req.body;

    // 1. Check required fields
    if (!targetType || !targetId || !reason) {
      return res.status(400).json({
        success: false,
        message:
          "Target type, target ID and reason are required.",
      });
    }

    // 2. Check that targetType is valid
    const allowedTargetTypes = [
      "artist",
      "release",
      "song",
      "video",
    ];

    if (!allowedTargetTypes.includes(targetType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report target type.",
      });
    }

    // 3. Check that reason is valid
    const allowedReasons = [
      "copyright",
      "impersonation",
      "inappropriate_content",
      "spam",
      "misleading",
      "other",
    ];

    if (!allowedReasons.includes(reason)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report reason.",
      });
    }

    // 4. Check that the reported content actually exists
    let targetExists = false;

    if (targetType === "artist") {
      targetExists = await Artist.exists({
        _id: targetId,
      });
    }

    if (targetType === "release") {
      targetExists = await Release.exists({
        _id: targetId,
      });
    }

    if (targetType === "song") {
      targetExists = await Song.exists({
        _id: targetId,
      });
    }

    if (targetType === "video") {
      targetExists = await Video.exists({
        _id: targetId,
      });
    }

    if (!targetExists) {
      return res.status(404).json({
        success: false,
        message: "Reported content was not found.",
      });
    }

    // 5. Prevent the same user from repeatedly
    // reporting the same content while an open report exists
    const existingReport = await Report.findOne({
      reportedBy: req.user._id,
      targetType,
      targetId,
      status: {
        $in: ["pending", "reviewing"],
      },
    });

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message:
          "You already have an active report for this content.",
      });
    }

    // 6. Create the report
    const report = await Report.create({
      reportedBy: req.user._id,
      targetType,
      targetId,
      reason,
      description: description || "",
    });

    return res.status(201).json({
      success: true,
      message: "Report submitted successfully.",
      report,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const getReports = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {};

    if (status) {
      filter.status = status;
    }

    const reports = await Report.find(filter)
      .populate("reportedBy", "fullName email role")
      .populate("reviewedBy", "fullName email role")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: reports.length,
      reports,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const markReportReviewing = async (req, res) => {
  try {
    const { reportId } = req.params;

    const report = await Report.findById(reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found.",
      });
    }

    if (report.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending reports can be moved to reviewing.",
      });
    }

    report.status = "reviewing";
    report.reviewedBy = req.user._id;
    report.reviewedAt = new Date();

    await report.save();

    return res.status(200).json({
      success: true,
      message: "Report is now under review.",
      report,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const closeReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { decision } = req.body;

    if (!["resolved", "dismissed"].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: "Decision must be resolved or dismissed.",
      });
    }

    const report = await Report.findById(reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found.",
      });
    }

    if (!["pending", "reviewing"].includes(report.status)) {
      return res.status(400).json({
        success: false,
        message: "This report has already been closed.",
      });
    }

    report.status = decision;
    report.reviewedBy = req.user._id;
    report.reviewedAt = new Date();

    await report.save();

    return res.status(200).json({
      success: true,
      message:
        decision === "resolved"
          ? "Report resolved successfully."
          : "Report dismissed successfully.",
      report,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const moderateContent = async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    const { action, reason } = req.body;

    const allowedTargetTypes = [
      "artist",
      "release",
      "song",
      "video",
    ];

    const allowedActions = [
      "visible",
      "hidden",
      "takedown",
    ];

    if (!allowedTargetTypes.includes(targetType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid content type.",
      });
    }

    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message:
          "Action must be visible, hidden or takedown.",
      });
    }

    if (
      ["hidden", "takedown"].includes(action) &&
      (!reason || !reason.trim())
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A moderation reason is required when hiding or taking down content.",
      });
    }

    let content = null;

    if (targetType === "artist") {
      content = await Artist.findById(targetId);
    }

    if (targetType === "release") {
      content = await Release.findById(targetId);
    }

    if (targetType === "song") {
      content = await Song.findById(targetId);
    }

    if (targetType === "video") {
      content = await Video.findById(targetId);
    }

    if (!content) {
      return res.status(404).json({
        success: false,
        message: "Content not found.",
      });
    }

    content.visibilityStatus = action;

    if (action === "visible") {
      content.moderationReason = "";
    } else {
      content.moderationReason = reason.trim();
    }

    content.moderatedBy = req.user._id;
    content.moderatedAt = new Date();

    await content.save();

    return res.status(200).json({
      success: true,
      message:
        action === "visible"
          ? "Content restored successfully."
          : action === "hidden"
          ? "Content hidden successfully."
          : "Content taken down successfully.",
      content,
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
  createReport,
  getReports,
  markReportReviewing,
  closeReport,
  moderateContent,
};