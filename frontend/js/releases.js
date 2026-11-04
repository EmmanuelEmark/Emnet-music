


/* ========================================
   ELEMENTS
======================================== */

const allReleasesGrid =
  document.getElementById(
    "allReleasesGrid"
  );


const releasesLoading =
  document.getElementById(
    "releasesLoading"
  );


const releasesError =
  document.getElementById(
    "releasesError"
  );


const releasesEmpty =
  document.getElementById(
    "releasesEmpty"
  );


const logoutButton =
  document.getElementById(
    "logoutButton"
  );


const filterButtons =
  document.querySelectorAll(
    ".release-filter"
  );


/* ========================================
   STATE
======================================== */

let allReleases = [];

let currentFilter = "all";


/* ========================================
   START PAGE
======================================== */

startReleasesPage();


async function startReleasesPage() {
  // Load releases immediately for guests and listeners.
  await loadAllReleases();

  // Initialize the music player separately.
  if (typeof loadPlayerComponent === "function") {
    try {
      await loadPlayerComponent();
    } catch (error) {
      console.warn(
        "Music player component unavailable:",
        error
      );
    }
  }
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
   LOAD RELEASES
======================================== */

async function loadAllReleases() {

  try {

    
const response = await fetch(
  `${API_BASE_URL}/api/releases`
);



    const data =
      await response.json();


    console.log(
      "All releases response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load releases."
      );

    }


    /*
      Support both:
      { releases: [...] }

      and:

      { success: true, releases: [...] }
    */

    
allReleases = Array.isArray(data.releases)
  ? data.releases.filter((release) => {
      return (
        release &&
        release._id &&
        release.status === "approved" &&
        (
          release.visibilityStatus === "visible" ||
          release.visibilityStatus == null
        )
      );
    })
  : [];


    releasesLoading.style.display =
      "none";


    renderReleases();

  } catch (error) {

    console.error(
      "Releases page error:",
      error
    );


    releasesLoading.style.display =
      "none";


    releasesError.style.display =
      "block";


    releasesError.textContent =
      error.message;

  }

}


/* ========================================
   RENDER RELEASES
======================================== */

function renderReleases() {

  allReleasesGrid.innerHTML =
    "";


  releasesEmpty.style.display =
    "none";


  const filteredReleases =
    currentFilter === "all"

      ? allReleases

      : allReleases.filter(
          (release) =>
            release.releaseType ===
            currentFilter
        );


  if (!filteredReleases.length) {

    releasesEmpty.style.display =
      "block";

    return;

  }


  filteredReleases.forEach(
    (release) => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "all-release-card";


      const artistName =
        getReleaseArtistNames(
          release.primaryArtists
        );


      card.innerHTML = `
        <div class="all-release-cover">

          <img
            src="${safeReleaseImage(
              release.coverImage
            )}"
            alt="${escapeReleaseHTML(
              release.title ||
              "Release"
            )}"
          >

          <div class="all-release-overlay">

            <div class="all-release-play">
              ▶
            </div>

          </div>

        </div>


        <h3>
          ${escapeReleaseHTML(
            release.title ||
            "Untitled"
          )}
        </h3>


        <p>
          ${escapeReleaseHTML(
            artistName ||
            "Artist"
          )}
        </p>


        <span class="release-card-type">
          ${escapeReleaseHTML(
            release.releaseType ||
            "release"
          )}
        </span>
      `;


      card.addEventListener(
        "click",
        () => {

          if (!release._id) {

            console.error(
              "Release ID missing:",
              release
            );

            return;

          }


          window.location.href =
            `/release?id=${encodeURIComponent(
              release._id
            )}`;

        }
      );


      allReleasesGrid.appendChild(
        card
      );

    }
  );

}


/* ========================================
   FILTER BUTTONS
======================================== */

filterButtons.forEach(
  (button) => {

    button.addEventListener(
      "click",
      () => {

        currentFilter =
          button.dataset.filter;


        filterButtons.forEach(
          (item) => {

            item.classList.remove(
              "active"
            );

          }
        );


        button.classList.add(
          "active"
        );


        renderReleases();

      }
    );

  }
);


/* ========================================
   ARTIST NAMES
======================================== */

function getReleaseArtistNames(
  artists
) {

  if (!Array.isArray(artists)) {

    return "";

  }


  return artists
    .map(
      (artist) => {

        if (
          typeof artist ===
          "string"
        ) {

          return "";

        }


        return (
          artist.stageName ||
          artist.fullName ||
          ""
        );

      }
    )
    .filter(Boolean)
    .join(", ");

}


/* ========================================
   IMAGE
======================================== */

function safeReleaseImage(
  imageUrl
) {

  if (
    imageUrl &&
    typeof imageUrl ===
      "string"
  ) {

    return imageUrl;

  }


  return (
    "https://placehold.co/" +
    "600x600/111612/" +
    "35e67a?text=EmnetMusic"
  );

}


/* ========================================
   ESCAPE HTML
======================================== */

function escapeReleaseHTML(
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