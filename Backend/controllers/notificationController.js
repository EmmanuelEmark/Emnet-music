const Notification = require("../models/Notification");


const getMyNotifications = async (req, res) => {
  try {
    const notifications =
      await Notification.find({
        userId: req.user._id,
      })
        .sort({ createdAt: -1 })
        .limit(100);

    const unreadCount =
      await Notification.countDocuments({
        userId: req.user._id,
        read: false,
      });

    return res.status(200).json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const markNotificationAsRead = async (
  req,
  res
) => {
  try {
    const { notificationId } = req.params;

    const notification =
      await Notification.findOne({
        _id: notificationId,
        userId: req.user._id,
      });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    notification.read = true;

    await notification.save();

    return res.status(200).json({
      success: true,
      message:
        "Notification marked as read.",
      notification,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const markAllNotificationsAsRead = async (
  req,
  res
) => {
  try {
    await Notification.updateMany(
      {
        userId: req.user._id,
        read: false,
      },
      {
        read: true,
      }
    );

    return res.status(200).json({
      success: true,
      message:
        "All notifications marked as read.",
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
  getMyNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};