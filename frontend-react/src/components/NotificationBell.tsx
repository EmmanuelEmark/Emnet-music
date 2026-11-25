
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type EmnetNotification,
} from "../services/notificationApi";

import "./NotificationBell.css";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<
    EmnetNotification[]
  >([]);

  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    try {
      const data = await getNotifications();

      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      setError("");
    } catch {
      setError("Unable to load notifications.");
    }
  }, []);

  useEffect(() => {
    void loadNotifications();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadNotifications();
      }
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [loadNotifications]);

  async function openNotification(
    notification: EmnetNotification
  ) {
    if (!notification.read) {
      try {
        await markNotificationRead(notification._id);
        await loadNotifications();
      } catch {
        setError("Unable to mark notification as read.");
        return;
      }
    }

    // Allow only internal application destinations.
    if (
      notification.link.startsWith("/") &&
      !notification.link.startsWith("//")
    ) {
      window.location.assign(notification.link);
    } else {
      setOpen(false);
    }
  }

  async function markAllAsRead() {
    try {
      await markAllNotificationsRead();
      await loadNotifications();
    } catch {
      setError("Unable to mark all notifications as read.");
    }
  }

  return (
    <div className="emnet-notification-wrapper">
      <button
        type="button"
        className="emnet-notification-trigger"
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        <Bell size={21} />

        {unreadCount > 0 && (
          <span className="emnet-notification-count">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="emnet-notification-panel">
          <div className="emnet-notification-heading">
            <h3>Notifications</h3>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
              >
                Mark all as read
              </button>
            )}
          </div>

          {error && (
            <p className="emnet-notification-error" role="alert">
              {error}
            </p>
          )}

          <div className="emnet-notification-list">
            {notifications.length === 0 ? (
              <p className="emnet-notification-empty">
                No notifications yet.
              </p>
            ) : (
              notifications.slice(0, 10).map((notification) => (
                <button
                  key={notification._id}
                  type="button"
                  className={`emnet-notification-item ${
                    notification.read ? "read" : "unread"
                  }`}
                  onClick={() =>
                    void openNotification(notification)
                  }
                >
                  <strong>{notification.title}</strong>
                  <span>{notification.message}</span>

                  <small>
                    {new Date(
                      notification.createdAt
                    ).toLocaleString()}
                  </small>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}