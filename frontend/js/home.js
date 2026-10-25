if (!protectPage()) {
  throw new Error(
    "Authentication required."
  );
}


const welcomeName =
  document.getElementById(
    "welcomeName"
  );

const profileName =
  document.getElementById(
    "profileName"
  );

const profileRole =
  document.getElementById(
    "profileRole"
  );

const profileInitial =
  document.getElementById(
    "profileInitial"
  );

const newReleasesGrid =
  document.getElementById(
    "newReleasesGrid"
  );

const latestSongsList =
  document.getElementById(
    "latestSongsList"
  );

const featuredArtistsGrid =
  document.getElementById(
    "featuredArtistsGrid"
  );

const latestVideosGrid =
  document.getElementById(
    "latestVideosGrid"
  );

const homeMessage =
  document.getElementById(
    "homeMessage"
  );

const logoutButton =
  document.getElementById(
    "logoutButton"
  );


/* ========================================
   LOGOUT
======================================== */

logoutButton.addEventListener(
  "click",
  logout
);


/* ========================================
   START PAGE
======================================== */

startHomePage();


async function startHomePage() {

  await loadPlayerComponent();

  await loadUser();

  await loadHomeContent();

}


/* ========================================
   LOAD CURRENT USER
======================================== */

async function loadUser() {

  const user =
    await getCurrentUser();


  if (!user) {
    return;
  }


  const firstName =
    user.fullName
      ? user.fullName.split(" ")[0]
      : "Listener";


  welcomeName.textContent =
    `Good to see you, ${firstName}`;


  profileName.textContent =
    user.fullName ||
    "Account";


  profileRole.textContent =
    user.role ||
    "listener";


  profileInitial.textContent =
    firstName
      .charAt(0)
      .toUpperCase();

}


/* ========================================
   LOAD HOME CONTENT
======================================== */

async function loadHomeContent() {

  try {

    const response =
      await fetch(
        `${API_BASE_URL}/home`
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load home content."
      );

    }


    const home =
      data.home || {};


    renderReleases(
      home.newReleases || []
    );


    renderSongs(
      home.latestSongs || []
    );


    renderArtists(
      home.featuredArtists || []
    );


    renderVideos(
      home.latestVideos || []
    );


  } catch (error) {

    console.error(
      "Home content error:",
      error
    );


    homeMessage.textContent =
      "Unable to load EmnetMusic content.";

  }

}


/* ========================================
   RELEASES
======================================== */

function renderReleases(
  releases
) {

  newReleasesGrid.innerHTML = "";


  if (!releases.length) {

    newReleasesGrid.innerHTML = `
      <div class="empty-state">
        No new releases yet.
      </div>
    `;

    return;

  }


  releases.forEach(
    (release) => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "release-card";


      card.style.cursor =
        "pointer";


      const artistName =
        getArtistNames(
          release.primaryArtists
        );


      card.innerHTML = `
        <div class="release-cover">

          <img
            src="${safeImage(
              release.coverImage
            )}"
            alt="${escapeHTML(
              release.title ||
              "Release"
            )}"
          >

          <div class="release-play">
            ▶
          </div>

        </div>

        <h3>
          ${escapeHTML(
            release.title ||
            "Untitled"
          )}
        </h3>

        <p>
          ${escapeHTML(
            artistName ||
            release.releaseType ||
            "Release"
          )}
        </p>
      `;


      card.addEventListener(
        "click",
        () => {

          if (!release._id) {

            console.error(
              "Release ID is missing:",
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


      newReleasesGrid.appendChild(
        card
      );

    }
  );

}

/* ========================================
   SONGS
======================================== */

function renderSongs(
  songs
) {

  latestSongsList.innerHTML =
    "";


  if (!songs.length) {

    latestSongsList.innerHTML = `
      <div class="empty-state">
        No songs available yet.
      </div>
    `;

    return;

  }


  songs.forEach(
    (song) => {

      const row =
        document.createElement(
          "div"
        );


      row.className =
        "song-row";


      const release =
        song.releaseId || {};


      const artistName =
        getArtistNames(
          song.primaryArtists
        );


      row.innerHTML = `
        <img
          class="song-cover"
          src="${safeImage(
            release.coverImage
          )}"
          alt="${escapeHTML(
            song.title ||
            "Song"
          )}"
        >

        <div class="song-main">

          <h3>
            ${escapeHTML(
              song.title ||
              "Untitled"
            )}
          </h3>

          <p>
            ${escapeHTML(
              artistName ||
              "Artist"
            )}
          </p>

        </div>

        <div class="song-release">
          ${escapeHTML(
            release.title ||
            ""
          )}
        </div>

        <button
          type="button"
          class="song-play-button"
          data-song-id="${song._id}"
          aria-label="Play ${escapeHTML(
            song.title ||
            "song"
          )}"
        >
          ▶
        </button>
      `;


      latestSongsList.appendChild(
        row
      );

    }
  );


  const playButtons =
    latestSongsList.querySelectorAll(
      ".song-play-button"
    );


  playButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          const songId =
            button.dataset.songId;


          const selectedSong =
            songs.find(
              (song) =>
                song._id === songId
            );


          if (!selectedSong) {

            console.error(
              "Selected song was not found."
            );

            return;

          }


          playSong(
            selectedSong,
            songs
          );

        }
      );

    }
  );

}


/* ========================================
   FEATURED ARTISTS
======================================== */

function renderArtists(
  artists
) {

  featuredArtistsGrid.innerHTML =
    "";


  if (!artists.length) {

    featuredArtistsGrid.innerHTML = `
      <div class="empty-state">
        Featured artists will appear here.
      </div>
    `;

    return;

  }


  artists.forEach(
    (artist) => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "artist-card";


      card.style.cursor =
        "pointer";


      card.innerHTML = `
        <img
          class="artist-image"
          src="${safeImage(
            artist.profileImage
          )}"
          alt="${escapeHTML(
            artist.stageName ||
            "Artist"
          )}"
        >

        <h3>
          ${escapeHTML(
            artist.stageName ||
            "Artist"
          )}
        </h3>

        <p>
          ${
            artist.verified
              ? "Verified artist"
              : "Artist"
          }
        </p>
      `;


      card.addEventListener(
        "click",
        () => {

          if (!artist._id) {

            console.error(
              "Artist ID is missing:",
              artist
            );

            return;

          }


          window.location.href =
            `/artist?id=${encodeURIComponent(
              artist._id
            )}`;

        }
      );


      featuredArtistsGrid.appendChild(
        card
      );

    }
  );

}


/* ========================================
   VIDEOS
======================================== */

function renderVideos(
  videos
) {

  latestVideosGrid.innerHTML =
    "";


  if (!videos.length) {

    latestVideosGrid.innerHTML = `
      <div class="empty-state">
        No videos available yet.
      </div>
    `;

    return;

  }


  videos.forEach(
    (video) => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "video-card";


      card.style.cursor =
        "pointer";


      const artistName =
        getArtistNames(
          video.primaryArtists
        );


      card.innerHTML = `
        <div class="video-thumbnail">

          <img
            src="${safeImage(
              video.thumbnailUrl
            )}"
            alt="${escapeHTML(
              video.title ||
              "Video"
            )}"
          >

          <div class="video-play">
            <span>▶</span>
          </div>

        </div>

        <h3>
          ${escapeHTML(
            video.title ||
            "Video"
          )}
        </h3>

        <p>
          ${escapeHTML(
            artistName ||
            video.videoType ||
            "Video"
          )}
        </p>
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


      latestVideosGrid.appendChild(
        card
      );

    }
  );

}


/* ========================================
   GET ARTIST NAMES
======================================== */

function getArtistNames(
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
   IMAGE FALLBACK
======================================== */

function safeImage(
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

function escapeHTML(
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