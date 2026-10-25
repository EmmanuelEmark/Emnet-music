if (!protectPage()) {
  throw new Error(
    "Authentication required."
  );
}


/* ========================================
   GET RELEASE ID
======================================== */

const params =
  new URLSearchParams(
    window.location.search
  );


const releaseIdFromUrl =
  params.get("id");


const releaseIdFromStorage =
  sessionStorage.getItem(
    "selectedReleaseId"
  );


const releaseId =
  releaseIdFromUrl ||
  releaseIdFromStorage;


/*
  If an ID came from the URL,
  also remember it.
*/

if (releaseIdFromUrl) {

  sessionStorage.setItem(
    "selectedReleaseId",
    releaseIdFromUrl
  );

}


/* ========================================
   PAGE ELEMENTS
======================================== */

const releaseLoading =
  document.getElementById(
    "releaseLoading"
  );


const releaseError =
  document.getElementById(
    "releaseError"
  );


const releaseContent =
  document.getElementById(
    "releaseContent"
  );


const releaseHeroBg =
  document.getElementById(
    "releaseHeroBg"
  );


const releaseCover =
  document.getElementById(
    "releaseCover"
  );


const releaseType =
  document.getElementById(
    "releaseType"
  );


const releaseTitle =
  document.getElementById(
    "releaseTitle"
  );


const releaseArtistName =
  document.getElementById(
    "releaseArtistName"
  );


const releaseDate =
  document.getElementById(
    "releaseDate"
  );


const releaseTrackCount =
  document.getElementById(
    "releaseTrackCount"
  );


const playReleaseButton =
  document.getElementById(
    "playReleaseButton"
  );


const releaseTrackList =
  document.getElementById(
    "releaseTrackList"
  );


const logoutButton =
  document.getElementById(
    "logoutButton"
  );


/* ========================================
   STATE
======================================== */

let currentRelease = null;

let releaseSongs = [];


/* ========================================
   START PAGE
======================================== */

startReleasePage();


async function startReleasePage() {

  await loadPlayerComponent();


  if (!releaseId) {

    showReleaseError(
      "Release ID is missing."
    );

    return;

  }


  await loadRelease();

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
   LOAD RELEASE FROM BACKEND
======================================== */

async function loadRelease() {

  try {

    const response =
      await fetch(
        `${API_BASE_URL}/releases/${releaseId}`
      );


    const data =
      await response.json();


    console.log(
      "Release API response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load release."
      );

    }


    if (!data.release) {

      throw new Error(
        "Release information was not returned."
      );

    }


    currentRelease =
      data.release;


    /*
      Make absolutely sure songs
      is an array.
    */

    releaseSongs =
      Array.isArray(data.songs)
        ? data.songs
        : [];


    console.log(
      "Release loaded:",
      currentRelease
    );


    console.log(
      "Songs loaded:",
      releaseSongs
    );


    console.log(
      "Number of songs:",
      releaseSongs.length
    );


    renderRelease();


    releaseLoading.style.display =
      "none";


    releaseError.style.display =
      "none";


    releaseContent.classList.add(
      "active"
    );


  } catch (error) {

    console.error(
      "Release page error:",
      error
    );


    showReleaseError(
      error.message
    );

  }

}


/* ========================================
   RENDER RELEASE INFORMATION
======================================== */

function renderRelease() {

  if (!currentRelease) {

    console.error(
      "No release available to render."
    );

    return;

  }


  document.title =
    `${
      currentRelease.title ||
      "Release"
    } | EmnetMusic`;


  const coverImage =
    safeReleaseImage(
      currentRelease.coverImage
    );


  releaseCover.src =
    coverImage;


  releaseHeroBg.style.backgroundImage =
    `url("${coverImage}")`;


  releaseType.textContent =
    (
      currentRelease.releaseType ||
      "release"
    ).toUpperCase();


  releaseTitle.textContent =
    currentRelease.title ||
    "Untitled";


  const artistName =
    getReleaseArtistNames(
      currentRelease.primaryArtists
    );


  releaseArtistName.textContent =
    artistName ||
    "Artist";


  releaseDate.textContent =
    formatReleaseDate(
      currentRelease.releaseDate
    );


  releaseTrackCount.textContent =
    `${releaseSongs.length} ${
      releaseSongs.length === 1
        ? "track"
        : "tracks"
    }`;


  /*
    Connect artist name to
    artist profile.
  */

  const primaryArtist =
    Array.isArray(
      currentRelease.primaryArtists
    )
      ? currentRelease.primaryArtists[0]
      : null;


  if (
    primaryArtist &&
    primaryArtist._id
  ) {

    releaseArtistName.style.cursor =
      "pointer";


    releaseArtistName.onclick =
      () => {

        sessionStorage.setItem(
          "selectedArtistId",
          primaryArtist._id
        );


        window.location.href =
          "artist.html";

      };

  }


  /*
    IMPORTANT:
    Render songs after release
    information has been rendered.
  */

  renderReleaseSongs();

}


/* ========================================
   RENDER SONGS
======================================== */

function renderReleaseSongs() {

  if (!releaseTrackList) {

    console.error(
      "releaseTrackList element was not found."
    );

    return;

  }


  releaseTrackList.innerHTML =
    "";


  console.log(
    "Rendering songs:",
    releaseSongs
  );


  if (
    !Array.isArray(releaseSongs) ||
    releaseSongs.length === 0
  ) {

    releaseTrackList.innerHTML = `
      <div class="release-empty">
        No songs available for this release.
      </div>
    `;

    return;

  }


  releaseSongs.forEach(
    (song, index) => {

      const row =
        document.createElement(
          "div"
        );


      row.className =
        "release-track-row";


      const artistName =
        getReleaseArtistNames(
          song.primaryArtists
        );


      const trackNumber =
        song.trackNumber ||
        index + 1;


      const title =
        song.title ||
        "Untitled";


      const genre =
        song.genre ||
        "Music";


      row.innerHTML = `
        <div class="release-track-number">
          ${trackNumber}
        </div>


        <div class="release-track-main">

          <h3>
            ${escapeReleaseHTML(
              title
            )}
          </h3>

          <p>
            ${escapeReleaseHTML(
              artistName ||
              "Artist"
            )}
          </p>

        </div>


        <div class="release-track-genre">
          ${escapeReleaseHTML(
            genre
          )}
        </div>


        <div class="release-track-duration">
          ${formatDuration(
            song.duration
          )}
        </div>


        <button
          type="button"
          class="release-track-play"
          data-song-id="${song._id}"
          aria-label="Play ${escapeReleaseHTML(
            title
          )}"
        >
          ▶
        </button>
      `;


      releaseTrackList.appendChild(
        row
      );

    }
  );


  /*
    Add play listeners after
    all song rows exist.
  */

  const playButtons =
    releaseTrackList.querySelectorAll(
      ".release-track-play"
    );


  playButtons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          const songId =
            button.dataset.songId;


          const playableSongs =
            createPlayableSongs();


          const selectedSong =
            playableSongs.find(
              (song) =>
                song._id === songId
            );


          if (!selectedSong) {

            console.error(
              "Selected release song was not found."
            );

            return;

          }


          playSong(
            selectedSong,
            playableSongs
          );

        }
      );

    }
  );

}


/* ========================================
   CREATE PLAYER QUEUE
======================================== */

function createPlayableSongs() {

  return releaseSongs.map(
    (song) => {

      return {
        ...song,

        /*
          player.js needs releaseId
          to contain release information
          such as coverImage.
        */

        releaseId:
          currentRelease,
      };

    }
  );

}


/* ========================================
   PLAY ENTIRE RELEASE
======================================== */

if (playReleaseButton) {

  playReleaseButton.addEventListener(
    "click",
    () => {

      if (
        !Array.isArray(
          releaseSongs
        ) ||
        releaseSongs.length === 0
      ) {

        console.log(
          "This release has no songs."
        );

        return;

      }


      const playableSongs =
        createPlayableSongs();


      playSong(
        playableSongs[0],
        playableSongs
      );

    }
  );

}


/* ========================================
   GET ARTIST NAMES
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
   FORMAT RELEASE DATE
======================================== */

function formatReleaseDate(
  value
) {

  if (!value) {

    return "";

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "";

  }


  return date.toLocaleDateString(
    "en-US",
    {
      year:
        "numeric",

      month:
        "short",

      day:
        "numeric",
    }
  );

}


/* ========================================
   FORMAT SONG DURATION
======================================== */

function formatDuration(
  seconds
) {

  const total =
    Number(seconds);


  if (
    !Number.isFinite(total) ||
    total < 0
  ) {

    return "0:00";

  }


  const minutes =
    Math.floor(
      total / 60
    );


  const remainingSeconds =
    Math.floor(
      total % 60
    )
      .toString()
      .padStart(
        2,
        "0"
      );


  return (
    `${minutes}:${remainingSeconds}`
  );

}


/* ========================================
   IMAGE FALLBACK
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
   SHOW ERROR
======================================== */

function showReleaseError(
  message
) {

  if (releaseLoading) {

    releaseLoading.style.display =
      "none";

  }


  if (releaseContent) {

    releaseContent.classList.remove(
      "active"
    );

  }


  if (releaseError) {

    releaseError.style.display =
      "block";


    releaseError.textContent =
      message ||
      "Unable to load release.";

  }

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