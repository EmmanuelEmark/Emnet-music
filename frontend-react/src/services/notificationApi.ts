
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

export type EmnetNotification = {
  _id: string;
  type: string;
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
};

export type NotificationListResponse = {
  success: boolean;
  unreadCount: number;
  notifications: EmnetNotification[];
};

async function notificationRequest<T>(
  path: string,
  method: "GET" | "PATCH" = "GET"
): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error("Please sign in to view notifications.");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/notifications${path}`,
    {
      method,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success) {
    throw new Error(
      data?.message ||
        `Notification request failed (${response.status}).`
    );
  }

  return data as T;
}

export function getNotifications() {
  return notificationRequest<NotificationListResponse>("/");
}

export function markNotificationRead(notificationId: string) {
  return notificationRequest<{
    success: boolean;
    notification: EmnetNotification;
  }>(
    `/${encodeURIComponent(notificationId)}/read`,
    "PATCH"
  );
}

export function markAllNotificationsRead() {
  return notificationRequest<{ success: boolean }>(
    "/read-all",
    "PATCH"
  );
}