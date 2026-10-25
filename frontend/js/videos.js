if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


/* ========================================
   ELEMENTS
======================================== */

const videosGrid =
  document.getElementById(
    "videosGrid"
  );


const videosLoading =
  document.getElementById(
    "videosLoading"
  );


const videosError =
  document.getElementById(
    "videosError"
  );


const videosEmpty =
  document.getElementById(
    "videosEmpty"
  );


const logoutButton =
  document.getElementById(
    "logoutButton"
  );


/* ========================================
   STATE
======================================== */

let allVideos = [];


/* ========================================
   START PAGE
======================================== */

startVideosPage();


async function startVideosPage() {

  await loadPlayerComponent();

  await loadVideos();

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
   LOAD VIDEOS
======================================== */

async function loadVideos() {

  try {

    const response =
      await fetch(
        `${API_BASE_URL}/videos`
      );


    const data =
      await response.json();


    console.log(
      "Videos response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load videos."
      );

    }


    allVideos =
      Array.isArray(
        data.videos
      )
        ? data.videos
        : [];


    videosLoading.style.display =
      "none";


    renderVideos();


  } catch (error) {

    console.error(
      "Videos page error:",
      error
    );


    videosLoading.style.display =
      "none";


    videosError.style.display =
      "block";


    videosError.textContent =
      error.message ||
      "Unable to load videos.";

  }

}


/* ========================================
   RENDER VIDEOS
======================================== */

function renderVideos() {

  videosGrid.innerHTML =
    "";


  videosEmpty.style.display =
    "none";


  if (!allVideos.length) {

    videosEmpty.style.display =
      "block";

    return;

  }


  allVideos.forEach(
    (video) => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "video-list-card";


      const artistName =
        getVideoArtistNames(
          video.primaryArtists
        );


      card.innerHTML = `
        <div class="video-list-thumbnail">

          <img
            src="${safeVideoImage(
              video.thumbnailUrl
            )}"
            alt="${escapeVideoHTML(
              video.title ||
              "Video"
            )}"
          >

          <div class="video-list-overlay">

            <div class="video-list-play">
              ▶
            </div>

          </div>

        </div>


        <h3>
          ${escapeVideoHTML(
            video.title ||
            "Untitled video"
          )}
        </h3>


        <p>
          ${escapeVideoHTML(
            artistName ||
            "Artist"
          )}
        </p>


        <div class="video-list-meta">

          <span class="video-list-type">
            ${escapeVideoHTML(
              video.videoType ||
              "Music video"
            )}
          </span>

          ${
            typeof video.viewCount ===
            "number"

              ? `
                <span>•</span>

                <span>
                  ${formatViews(
                    video.viewCount
                  )} views
                </span>
              `

              : ""
          }

        </div>
      `;


      card.addEventListener(
        "click",
        () => {

          if (!video._id) {

            console.error(
              "Video ID is missing:",
              video
            );

            return;

          }


          window.location.href =
            `/video?id=${encodeURIComponent(
              video._id
            )}`;

        }
      );


      videosGrid.appendChild(
        card
      );

    }
  );

}


/* ========================================
   ARTIST NAMES
======================================== */

function getVideoArtistNames(
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
   FORMAT VIEW COUNT
======================================== */

function formatViews(
  value
) {

  const views =
    Number(value);


  if (
    !Number.isFinite(views)
  ) {

    return "0";

  }


  if (views >= 1000000) {

    return (
      views / 1000000
    )
      .toFixed(1)
      .replace(
        ".0",
        ""
      ) + "M";

  }


  if (views >= 1000) {

    return (
      views / 1000
    )
      .toFixed(1)
      .replace(
        ".0",
        ""
      ) + "K";

  }


  return views.toString();

}


/* ========================================
   IMAGE
======================================== */

function safeVideoImage(
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
    "1280x720/111612/" +
    "35e67a?text=EmnetMusic"
  );

}


/* ========================================
   ESCAPE HTML
======================================== */

function escapeVideoHTML(
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