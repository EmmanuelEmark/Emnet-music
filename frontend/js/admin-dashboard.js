/* ========================================
   AUTHENTICATION
======================================== */

if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


/* ========================================
   CURRENT USER
======================================== */

const adminUser =
  getStoredUser();


if (!adminUser) {

  window.location.href =
    "login.html";


  throw new Error(
    "Admin account not found."
  );

}


/*
  Normal admins use this dashboard.

  Superadmins have their own dashboard.
*/

if (
  adminUser.role ===
  "superadmin"
) {

  window.location.href =
    "admin.html";


  throw new Error(
    "Redirecting superadmin."
  );

}


if (
  adminUser.role !==
  "admin"
) {

  alert(
    "Admin access required."
  );


  window.location.href =
    "home.html";


  throw new Error(
    "Admin access required."
  );

}


/* ========================================
   ELEMENTS
======================================== */

const adminProfileName =
  document.getElementById(
    "adminProfileName"
  );


const adminProfileEmail =
  document.getElementById(
    "adminProfileEmail"
  );


const adminProfileAvatar =
  document.getElementById(
    "adminProfileAvatar"
  );


const welcomeAdminName =
  document.getElementById(
    "welcomeAdminName"
  );


const adminLogoutButton =
  document.getElementById(
    "adminLogoutButton"
  );


const dashboardPendingArtists =
  document.getElementById(
    "dashboardPendingArtists"
  );


const dashboardPendingReleases =
  document.getElementById(
    "dashboardPendingReleases"
  );


const dashboardPendingVideos =
  document.getElementById(
    "dashboardPendingVideos"
  );


const dashboardOpenReports =
  document.getElementById(
    "dashboardOpenReports"
  );


const dashboardStatsError =
  document.getElementById(
    "dashboardStatsError"
  );  


/* ========================================
   DISPLAY ADMIN
======================================== */

const adminName =
  adminUser.fullName ||
  "Admin";


adminProfileName.textContent =
  adminName;


adminProfileEmail.textContent =
  adminUser.email ||
  "EmnetMusic";


welcomeAdminName.textContent =
  `Welcome, ${adminName}`;


adminProfileAvatar.textContent =
  adminName
    .charAt(0)
    .toUpperCase();

loadAdminDashboardStats();



/* ========================================
   DASHBOARD LIVE STATS
======================================== */

async function loadAdminDashboardStats() {

  const token =
    getToken();


  if (!token) {

    return;

  }


  try {

    dashboardStatsError.style.display =
      "none";


    const headers = {

      Authorization:
        `Bearer ${token}`,

    };


    const [
      artistsResponse,
      releasesResponse,
      videosResponse,
      reportsResponse,
    ] = await Promise.all([

      fetch(
        `${API_BASE_URL}/artists/pending`,
        {
          headers,
        }
      ),


      fetch(
        `${API_BASE_URL}/releases/pending`,
        {
          headers,
        }
      ),


      fetch(
        `${API_BASE_URL}/videos/pending`,
        {
          headers,
        }
      ),


      fetch(
        `${API_BASE_URL}/reports`,
        {
          headers,
        }
      ),

    ]);


    const [
      artistsData,
      releasesData,
      videosData,
      reportsData,
    ] = await Promise.all([

      artistsResponse.json(),

      releasesResponse.json(),

      videosResponse.json(),

      reportsResponse.json(),

    ]);


    if (
      !artistsResponse.ok ||
      !releasesResponse.ok ||
      !videosResponse.ok ||
      !reportsResponse.ok
    ) {

      throw new Error(
        "Unable to load dashboard statistics."
      );

    }


    const artists =
      Array.isArray(
        artistsData.artists
      )
        ? artistsData.artists
        : [];


    const releases =
      Array.isArray(
        releasesData.releases
      )
        ? releasesData.releases
        : [];


    const videos =
      Array.isArray(
        videosData.videos
      )
        ? videosData.videos
        : [];


    const reports =
      Array.isArray(
        reportsData.reports
      )
        ? reportsData.reports
        : [];


    const openReports =
      reports.filter(
        (report) =>
          [
            "pending",
            "reviewing",
          ].includes(
            report.status
          )
      );


    dashboardPendingArtists.textContent =
      artists.length;


    dashboardPendingReleases.textContent =
      releases.length;


    dashboardPendingVideos.textContent =
      videos.length;


    dashboardOpenReports.textContent =
      openReports.length;


  } catch (error) {

    console.error(
      "Admin dashboard stats error:",
      error
    );


    dashboardStatsError.style.display =
      "block";


    dashboardStatsError.textContent =
      "Some dashboard statistics could not be loaded.";

  }

}
/* ========================================
   LOGOUT
======================================== */

if (adminLogoutButton) {

  adminLogoutButton.addEventListener(
    "click",
    logout
  );

}