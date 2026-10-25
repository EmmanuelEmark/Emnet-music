/* ========================================
   AUTH
======================================== */

if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


const loggedInUser =
  getStoredUser();


if (
  !loggedInUser ||
  loggedInUser.role !== "artist"
) {

  alert(
    "Artist access required."
  );


  window.location.href =
    "home.html";


  throw new Error(
    "Artist access required."
  );

}


/* ========================================
   ELEMENTS
======================================== */

const artistDashboardLoading =
  document.getElementById(
    "artistDashboardLoading"
  );


const artistDashboardError =
  document.getElementById(
    "artistDashboardError"
  );


const artistDashboardContent =
  document.getElementById(
    "artistDashboardContent"
  );


const artistAccountAvatar =
  document.getElementById(
    "artistAccountAvatar"
  );


const artistAccountName =
  document.getElementById(
    "artistAccountName"
  );


const artistAccountEmail =
  document.getElementById(
    "artistAccountEmail"
  );


const artistCover =
  document.getElementById(
    "artistCover"
  );


const artistProfileImage =
  document.getElementById(
    "artistProfileImage"
  );


const artistStageName =
  document.getElementById(
    "artistStageName"
  );


const artistCountry =
  document.getElementById(
    "artistCountry"
  );


const artistApprovalBadge =
  document.getElementById(
    "artistApprovalBadge"
  );


const artistInfoStageName =
  document.getElementById(
    "artistInfoStageName"
  );


const artistInfoCountry =
  document.getElementById(
    "artistInfoCountry"
  );


const artistInfoStatus =
  document.getElementById(
    "artistInfoStatus"
  );


const artistInfoFeatured =
  document.getElementById(
    "artistInfoFeatured"
  );


const artistBio =
  document.getElementById(
    "artistBio"
  );


const artistLogoutButton =
  document.getElementById(
    "artistLogoutButton"
  );


/* ========================================
   ACCOUNT HEADER
======================================== */

artistAccountName.textContent =
  loggedInUser.fullName ||
  "Artist";


artistAccountEmail.textContent =
  loggedInUser.email ||
  "EmnetMusic";


artistAccountAvatar.textContent =
  (
    loggedInUser.fullName ||
    "A"
  )
    .charAt(0)
    .toUpperCase();


/* ========================================
   LOAD ARTIST PROFILE
======================================== */

loadArtistDashboard();


async function loadArtistDashboard() {

  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  try {

    artistDashboardLoading.style.display =
      "block";


    artistDashboardError.style.display =
      "none";


    artistDashboardContent.classList.remove(
      "active"
    );


    const response =
      await fetch(
        `${API_BASE_URL}/artists/me`,
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
      "Artist dashboard:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load artist profile."
      );

    }


    const artist =
      data.artist;


    if (!artist) {

      throw new Error(
        "Artist profile was not found."
      );

    }


    renderArtistProfile(
      artist
    );


    artistDashboardLoading.style.display =
      "none";


    artistDashboardContent.classList.add(
      "active"
    );


  } catch (error) {

    console.error(
      "Artist dashboard error:",
      error
    );


    artistDashboardLoading.style.display =
      "none";


    artistDashboardError.style.display =
      "block";


    artistDashboardError.textContent =
      error.message ||
      "Unable to load artist dashboard.";

  }

}


/* ========================================
   RENDER PROFILE
======================================== */

function renderArtistProfile(
  artist
) {

  const stageName =
    artist.stageName ||
    "Artist";


  const country =
    artist.country ||
    "Country not provided";


  const status =
    artist.approvalStatus ||
    "approved";


  artistStageName.textContent =
    stageName;


  artistCountry.textContent =
    country;


  artistApprovalBadge.textContent =
    status;


  artistInfoStageName.textContent =
    stageName;


  artistInfoCountry.textContent =
    country;


  artistInfoStatus.textContent =
    status;


  artistInfoFeatured.textContent =
    artist.featured
      ? "Yes"
      : "No";


  artistBio.textContent =
    artist.bio ||
    "No bio available.";


  /*
    Profile image
  */

  if (artist.profileImage) {

    artistProfileImage.innerHTML =
      "";


    const image =
      document.createElement(
        "img"
      );


    image.src =
      artist.profileImage;


    image.alt =
      `${stageName} profile`;


    artistProfileImage.appendChild(
      image
    );


  } else {

    artistProfileImage.textContent =
      stageName
        .charAt(0)
        .toUpperCase();

  }


  /*
    Cover image
  */

  if (artist.coverImage) {

    artistCover.style.backgroundImage =
      `linear-gradient(
        rgba(0,0,0,0.2),
        rgba(0,0,0,0.45)
      ),
      url("${artist.coverImage}")`;

  }


  /*
    Small header avatar
  */

  if (artist.profileImage) {

    artistAccountAvatar.innerHTML =
      "";


    const accountImage =
      document.createElement(
        "img"
      );


    accountImage.src =
      artist.profileImage;


    accountImage.alt =
      stageName;


    artistAccountAvatar.appendChild(
      accountImage
    );

  }

}


/* ========================================
   LOGOUT
======================================== */

if (artistLogoutButton) {

  artistLogoutButton.addEventListener(
    "click",
    logout
  );

}