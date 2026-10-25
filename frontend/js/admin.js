/* ========================================
   PROTECT PAGE
======================================== */

if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


/* ========================================
   CURRENT USER
======================================== */

const storedAdminUser =
  getStoredUser();


if (
  !storedAdminUser ||
  storedAdminUser.role !==
    "superadmin"
) {

  alert(
    "This page is only available to the superadmin."
  );


  window.location.href =
    "home.html";


  throw new Error(
    "Superadmin access required."
  );

}


/* ========================================
   ELEMENTS
======================================== */

const adminLoading =
  document.getElementById(
    "adminLoading"
  );


const adminError =
  document.getElementById(
    "adminError"
  );


const adminDashboardContent =
  document.getElementById(
    "adminDashboardContent"
  );


const refreshDashboardButton =
  document.getElementById(
    "refreshDashboardButton"
  );


const adminLogoutButton =
  document.getElementById(
    "adminLogoutButton"
  );


const adminUserName =
  document.getElementById(
    "adminUserName"
  );


const adminUserEmail =
  document.getElementById(
    "adminUserEmail"
  );


const totalUsers =
  document.getElementById(
    "totalUsers"
  );


const totalListeners =
  document.getElementById(
    "totalListeners"
  );


const totalArtists =
  document.getElementById(
    "totalArtists"
  );


const totalAdmins =
  document.getElementById(
    "totalAdmins"
  );


const totalSuperadmins =
  document.getElementById(
    "totalSuperadmins"
  );


const suspendedUsers =
  document.getElementById(
    "suspendedUsers"
  );


const totalSongs =
  document.getElementById(
    "totalSongs"
  );


const totalReleases =
  document.getElementById(
    "totalReleases"
  );


const totalVideos =
  document.getElementById(
    "totalVideos"
  );


/* ========================================
   START
======================================== */

initializeAdminProfile();

loadDashboardStats();


/* ========================================
   ADMIN PROFILE
======================================== */

function initializeAdminProfile() {

  const name =
    storedAdminUser.fullName ||
    "Superadmin";


  const email =
    storedAdminUser.email ||
    "EmnetMusic";


  adminUserName.textContent =
    name;


  adminUserEmail.textContent =
    email;


  const avatar =
    document.querySelector(
      ".admin-profile-avatar"
    );


  if (avatar) {

    avatar.textContent =
      name.charAt(0)
        .toUpperCase();

  }

}


/* ========================================
   LOAD DASHBOARD STATS
======================================== */

async function loadDashboardStats() {

  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  try {

    adminLoading.style.display =
      "block";


    adminError.style.display =
      "none";


    const response =
      await fetch(
        `${API_BASE_URL}/admins/dashboard/stats`,
        {
          headers: {

            Authorization:
              `Bearer ${token}`,

          },
        }
      );


    const data =
      await response.json();


    console.log(
      "Admin dashboard response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load dashboard."
      );

    }


    renderDashboardStats(
      data.stats || {}
    );


    adminLoading.style.display =
      "none";


    adminDashboardContent.classList.add(
      "active"
    );


  } catch (error) {

    console.error(
      "Admin dashboard error:",
      error
    );


    adminLoading.style.display =
      "none";


    adminDashboardContent.classList.remove(
      "active"
    );


    adminError.style.display =
      "block";


    adminError.textContent =
      error.message ||
      "Unable to load the admin dashboard.";

  }

}


/* ========================================
   RENDER STATS
======================================== */

function renderDashboardStats(
  stats
) {

  totalUsers.textContent =
    formatAdminNumber(
      stats.totalUsers
    );


  totalListeners.textContent =
    formatAdminNumber(
      stats.listeners
    );


  totalArtists.textContent =
    formatAdminNumber(
      stats.artists
    );


  totalAdmins.textContent =
    formatAdminNumber(
      stats.admins
    );


  totalSuperadmins.textContent =
    formatAdminNumber(
      stats.superadmins
    );


  suspendedUsers.textContent =
    formatAdminNumber(
      stats.suspendedUsers
    );


  totalSongs.textContent =
    formatAdminNumber(
      stats.totalSongs
    );


  totalReleases.textContent =
    formatAdminNumber(
      stats.totalReleases
    );


  totalVideos.textContent =
    formatAdminNumber(
      stats.totalVideos
    );

}


/* ========================================
   FORMAT NUMBERS
======================================== */

function formatAdminNumber(
  number
) {

  const value =
    Number(number || 0);


  return value.toLocaleString();

}


/* ========================================
   REFRESH
======================================== */

refreshDashboardButton.addEventListener(
  "click",
  async () => {

    refreshDashboardButton.disabled =
      true;


    refreshDashboardButton.textContent =
      "Refreshing...";


    await loadDashboardStats();


    refreshDashboardButton.disabled =
      false;


    refreshDashboardButton.textContent =
      "↻ Refresh";

  }
);


/* ========================================
   LOGOUT
======================================== */

if (adminLogoutButton) {

  adminLogoutButton.addEventListener(
    "click",
    logout
  );

}