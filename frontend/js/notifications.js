if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


/* ========================================
   ELEMENTS
======================================== */

const notificationsLoading =
  document.getElementById(
    "notificationsLoading"
  );


const notificationsError =
  document.getElementById(
    "notificationsError"
  );


const notificationsList =
  document.getElementById(
    "notificationsList"
  );


const notificationsEmpty =
  document.getElementById(
    "notificationsEmpty"
  );


const unreadCountElement =
  document.getElementById(
    "unreadCount"
  );


const markAllReadButton =
  document.getElementById(
    "markAllReadButton"
  );


const logoutButton =
  document.getElementById(
    "logoutButton"
  );


/* ========================================
   STATE
======================================== */

let notifications = [];

let unreadCount = 0;


/* ========================================
   START
======================================== */

startNotificationsPage();


async function startNotificationsPage() {

  await loadPlayerComponent();

  await loadNotifications();

}


/* ========================================
   LOGOUT
======================================== */

if (logoutButton) {

  logoutButton.addEventListener(
    "click",
    logout
  );

}


/* ========================================
   LOAD NOTIFICATIONS
======================================== */

async function loadNotifications() {

  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  try {

    const response =
      await fetch(

      `${API_BASE_URL}/api/notifications`,

        {
          headers: {

            Authorization:
              `Bearer ${token}`,

          },
        }
      );



const contentType =
  response.headers.get("content-type") || "";

if (!contentType.includes("application/json")) {
  throw new Error(
    `Unable to load notifications. Server returned HTTP ${response.status}.`
  );
}

const data = await response.json();



    console.log(
      "Notifications response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load notifications."
      );

    }


    notifications =
      Array.isArray(
        data.notifications
      )
        ? data.notifications
        : [];


    unreadCount =
      Number(
        data.unreadCount || 0
      );


    notificationsLoading.style.display =
      "none";


    notificationsError.style.display =
      "none";


    renderUnreadCount();

    renderNotifications();


  } catch (error) {

    console.error(
      "Notification loading error:",
      error
    );


    notificationsLoading.style.display =
      "none";


    notificationsError.style.display =
      "block";


    notificationsError.textContent =
      error.message ||
      "Unable to load notifications.";

  }

}


/* ========================================
   RENDER UNREAD COUNT
======================================== */

function renderUnreadCount() {

  unreadCountElement.textContent =
    `${unreadCount} ${
      unreadCount === 1
        ? "unread"
        : "unread"
    }`;


  unreadCountElement.classList.toggle(
    "has-unread",
    unreadCount > 0
  );


  markAllReadButton.disabled =
    unreadCount === 0;

}


/* ========================================
   RENDER NOTIFICATIONS
======================================== */

function renderNotifications() {

  notificationsList.innerHTML =
    "";


  notificationsEmpty.style.display =
    "none";


  if (!notifications.length) {

    notificationsList.style.display =
      "none";


    notificationsEmpty.style.display =
      "block";


    return;

  }


  notificationsList.style.display =
    "block";


  notifications.forEach(
    (notification) => {

      const item =
        document.createElement(
          "div"
        );


      item.className =
        notification.read
          ? "notification-item read"
          : "notification-item unread";


      const title =
        notification.title ||
        getNotificationTitle(
          notification.type
        );


      const message =
        notification.message ||
        "You have a new notification.";


      item.innerHTML = `
        <div class="notification-icon">
          ${getNotificationIcon(
            notification.type
          )}
        </div>

        <div class="notification-content">

          <div class="notification-top">

            <h3 class="notification-title">
              ${escapeNotificationHTML(
                title
              )}
            </h3>

            <span class="notification-time">
              ${formatNotificationTime(
                notification.createdAt
              )}
            </span>

          </div>

          <p class="notification-message">
            ${escapeNotificationHTML(
              message
            )}
          </p>

        </div>

        <div class="notification-unread-dot"></div>
      `;


      item.addEventListener(
        "click",
        async () => {

          await handleNotificationClick(
            notification
          );

        }
      );


      notificationsList.appendChild(
        item
      );

    }
  );

}


/* ========================================
   NOTIFICATION CLICK
======================================== */

async function handleNotificationClick(
  notification
) {

  if (!notification) {

    return;

  }


  if (!notification.read) {

    const success =
      await markNotificationRead(
        notification
      );


    if (!success) {

      return;

    }

  }


  if (notification.link) {

    window.location.href =
      notification.link;

  }

}


/* ========================================
   MARK ONE AS READ
======================================== */

async function markNotificationRead(
  notification
) {

  const token =
    getToken();


  if (
    !token ||
    !notification?._id
  ) {

    return false;

  }


  try {

    const response =
      await fetch(

    `${API_BASE_URL}/api/notifications/${encodeURIComponent(notification._id)}/read`,

        {
          method: "PATCH",

          headers: {

            Authorization:
              `Bearer ${token}`,

          },
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to mark notification as read."
      );

    }


    notification.read =
      true;


    if (unreadCount > 0) {

      unreadCount -= 1;

    }


    renderUnreadCount();

    renderNotifications();


    return true;


  } catch (error) {

    console.error(
      "Mark notification read error:",
      error
    );


    return false;

  }

}


/* ========================================
   MARK ALL AS READ
======================================== */

markAllReadButton.addEventListener(
  "click",
  markAllNotificationsRead
);


async function markAllNotificationsRead() {

  if (!unreadCount) {

    return;

  }


  const token =
    getToken();


  if (!token) {

    return;

  }


  try {

    markAllReadButton.disabled =
      true;


    markAllReadButton.textContent =
      "Updating...";


    const response =
      await fetch(

    `${API_BASE_URL}/api/notifications/read-all`,

        {
          method: "PATCH",

          headers: {

            Authorization:
              `Bearer ${token}`,

          },
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to mark all notifications as read."
      );

    }


    notifications =
      notifications.map(
        (notification) => ({
          ...notification,
          read: true,
        })
      );


    unreadCount = 0;


    renderUnreadCount();

    renderNotifications();


  } catch (error) {

    console.error(
      "Mark all notifications error:",
      error
    );


    alert(
      error.message ||
      "Unable to mark all notifications as read."
    );


  } finally {

    markAllReadButton.textContent =
      "Mark all as read";


    markAllReadButton.disabled =
      unreadCount === 0;

  }

}


/* ========================================
   ICON
======================================== */

function getNotificationIcon(
  type
) {

  switch (type) {

    case "new_release":
      return "♫";

    case "artist":
      return "★";

    case "playlist":
      return "☷";

    case "like":
      return "♥";

    case "follow":
      return "＋";

    case "video":
      return "▶";

    case "account":
      return "○";

    case "system":
      return "●";

    default:
      return "♪";

  }

}


/* ========================================
   TITLE FALLBACK
======================================== */

function getNotificationTitle(
  type
) {

  switch (type) {

    case "new_release":
      return "New release";

    case "artist":
      return "Artist update";

    case "playlist":
      return "Playlist update";

    case "like":
      return "Music update";

    case "follow":
      return "Artist update";

    case "video":
      return "New video";

    case "account":
      return "Account update";

    case "system":
      return "EmnetMusic";

    default:
      return "Notification";

  }

}


/* ========================================
   TIME
======================================== */

function formatNotificationTime(
  dateValue
) {

  if (!dateValue) {

    return "";

  }


  const date =
    new Date(
      dateValue
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "";

  }


  const now =
    new Date();


  const difference =
    now.getTime() -
    date.getTime();


  const minute =
    60 * 1000;


  const hour =
    60 * minute;


  const day =
    24 * hour;


  if (difference < minute) {

    return "Just now";

  }


  if (difference < hour) {

    const minutes =
      Math.floor(
        difference / minute
      );


    return `${minutes}m ago`;

  }


  if (difference < day) {

    const hours =
      Math.floor(
        difference / hour
      );


    return `${hours}h ago`;

  }


  if (difference < 7 * day) {

    const days =
      Math.floor(
        difference / day
      );


    return `${days}d ago`;

  }


  return date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );

}


/* ========================================
   ESCAPE HTML
======================================== */

function escapeNotificationHTML(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return "";

  }


  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}