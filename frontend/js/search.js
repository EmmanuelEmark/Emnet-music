if (!protectPage()) {
  throw new Error(
    "Authentication required."
  );
}


const searchInput =
  document.getElementById(
    "searchInput"
  );

const clearSearchButton =
  document.getElementById(
    "clearSearchButton"
  );

const searchHelper =
  document.getElementById(
    "searchHelper"
  );

const searchEmptyScreen =
  document.getElementById(
    "searchEmptyScreen"
  );

const searchResults =
  document.getElementById(
    "searchResults"
  );

const songResults =
  document.getElementById(
    "songResults"
  );

const artistResults =
  document.getElementById(
    "artistResults"
  );

const releaseResults =
  document.getElementById(
    "releaseResults"
  );

const videoResults =
  document.getElementById(
    "videoResults"
  );

const songResultsSection =
  document.getElementById(
    "songResultsSection"
  );

const artistResultsSection =
  document.getElementById(
    "artistResultsSection"
  );

const releaseResultsSection =
  document.getElementById(
    "releaseResultsSection"
  );

const videoResultsSection =
  document.getElementById(
    "videoResultsSection"
  );

const noSearchResults =
  document.getElementById(
    "noSearchResults"
  );

const logoutButton =
  document.getElementById(
    "logoutButton"
  );

const profileInitial =
  document.getElementById(
    "profileInitial"
  );


let searchTimer = null;

let currentSearchSongs = [];


/* ========================================
   START PAGE
======================================== */

startSearchPage();


async function startSearchPage() {

  await loadPlayerComponent();

  await loadSearchUser();

}


/* ========================================
   LOAD USER
======================================== */

async function loadSearchUser() {

  const user =
    await getCurrentUser();


  if (!user) {
    return;
  }


  const firstName =
    user.fullName
      ? user.fullName.split(" ")[0]
      : "E";


  profileInitial.textContent =
    firstName
      .charAt(0)
      .toUpperCase();

}


/* ========================================
   LOGOUT
======================================== */

logoutButton.addEventListener(
  "click",
  logout
);


/* ========================================
   SEARCH INPUT
======================================== */

searchInput.addEventListener(
  "input",
  () => {

    const query =
      searchInput.value.trim();


    clearTimeout(
      searchTimer
    );


    if (!query) {

      resetSearchPage();

      return;

    }


    searchHelper.textContent =
      `Searching for "${query}"...`;


    searchTimer =
      setTimeout(
        () => {

          searchEmnetMusic(
            query
          );

        },
        350
      );

  }
);


/* ========================================
   CLEAR SEARCH
======================================== */

clearSearchButton.addEventListener(
  "click",
  () => {

    searchInput.value = "";

    searchInput.focus();

    resetSearchPage();

  }
);


/* ========================================
   SEARCH BACKEND
======================================== */

async function searchEmnetMusic(
  query
) {

  try {

    const response =
      await fetch(
        `${API_BASE_URL}/search?q=${encodeURIComponent(
          query
        )}`
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Search failed."
      );

    }


    const results =
      data.results ||
      data;


    const songs =
      results.songs || [];

    const artists =
      results.artists || [];

    const releases =
      results.releases || [];

    const videos =
      results.videos || [];


    currentSearchSongs =
      songs;


    renderSearchSongs(
      songs
    );

    renderSearchArtists(
      artists
    );

    renderSearchReleases(
      releases
    );

    renderSearchVideos(
      videos
    );


    const totalResults =
      songs.length +
      artists.length +
      releases.length +
      videos.length;


    searchEmptyScreen.style.display =
      "none";


    searchResults.classList.add(
      "active"
    );


    noSearchResults.classList.toggle(
      "active",
      totalResults === 0
    );


    searchHelper.textContent =
      totalResults
        ? `${totalResults} result${
            totalResults === 1
              ? ""
              : "s"
          } found`
        : "No matching results found.";


  } catch (error) {

    console.error(
      "Search error:",
      error
    );


    searchHelper.textContent =
      "Unable to search EmnetMusic.";

  }

}


/* ========================================
   SONG RESULTS
======================================== */

function renderSearchSongs(
  songs
) {

  songResults.innerHTML = "";


  songResultsSection.style.display =
    songs.length
      ? ""
      : "none";


  songs.forEach(
    (song) => {

      const row =
        document.createElement(
          "div"
        );


      row.className =
        "search-song-row";


      const release =
        song.releaseId || {};


      const artistName =
        getSearchArtistNames(
          song.primaryArtists
        );


      row.innerHTML = `
        <img
          class="search-song-cover"
          src="${safeSearchImage(
            release.coverImage
          )}"
          alt="${escapeSearchHTML(
            song.title
          )}"
        >

        <div class="search-song-info">

          <h3>
            ${escapeSearchHTML(
              song.title ||
              "Untitled"
            )}
          </h3>

          <p>
            ${escapeSearchHTML(
              artistName ||
              "Artist"
            )}
          </p>

        </div>

        <div class="search-release-name">
          ${escapeSearchHTML(
            release.title ||
            ""
          )}
        </div>

        <button
          type="button"
          class="search-play-button"
          data-song-id="${song._id}"
          aria-label="Play song"
        >
          ▶
        </button>
      `;


      songResults.appendChild(
        row
      );

    }
  );


  songResults
    .querySelectorAll(
      ".search-play-button"
    )
    .forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            const songId =
              button.dataset.songId;


            const selectedSong =
              currentSearchSongs.find(
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
              currentSearchSongs
            );

          }
        );

      }
    );

}


/* ========================================
   ARTIST RESULTS
======================================== */

function renderSearchArtists(
  artists
) {

  artistResults.innerHTML = "";


  artistResultsSection.style.display =
    artists.length
      ? ""
      : "none";


  artists.forEach(
    (artist) => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "search-artist-card";


      card.style.cursor =
        "pointer";


      card.innerHTML = `
        <img
          src="${safeSearchImage(
            artist.profileImage
          )}"
          alt="${escapeSearchHTML(
            artist.stageName ||
            "Artist"
          )}"
        >

        <h3>
          ${escapeSearchHTML(
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
              "Artist ID is missing from search result:",
              artist
            );

            return;
          }


          const params =
  new URLSearchParams(
    window.location.search
  );


const artistIdFromUrl =
  params.get("id");


const artistIdFromStorage =
  sessionStorage.getItem(
    "selectedArtistId"
  );


const artistId =
  artistIdFromUrl ||
  artistIdFromStorage;


          /*
            Save the selected artist ID
            before leaving Search.
          */

          sessionStorage.setItem(
            "selectedArtistId",
            artist._id
          );


          window.location.href =
            "artist.html";

        }
      );


      artistResults.appendChild(
        card
      );

    }
  );

}

/* ========================================
   RELEASE RESULTS
======================================== */

function renderSearchReleases(
  releases
) {

  releaseResults.innerHTML = "";


  releaseResultsSection.style.display =
    releases.length
      ? ""
      : "none";


  releases.forEach(
    (release) => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "search-release-card";


      card.style.cursor =
        "pointer";


      const artistName =
        getSearchArtistNames(
          release.primaryArtists
        );


      card.innerHTML = `
        <img
          src="${safeSearchImage(
            release.coverImage
          )}"
          alt="${escapeSearchHTML(
            release.title ||
            "Release"
          )}"
        >

        <h3>
          ${escapeSearchHTML(
            release.title ||
            "Untitled"
          )}
        </h3>

        <p>
          ${escapeSearchHTML(
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


      releaseResults.appendChild(
        card
      );

    }
  );

}

/* ========================================
   VIDEO RESULTS
======================================== */

function renderSearchVideos(
  videos
) {

  videoResults.innerHTML = "";


  videoResultsSection.style.display =
    videos.length
      ? ""
      : "none";


  videos.forEach(
    (video) => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "search-video-card";


      card.style.cursor =
        "pointer";


      const artistName =
        getSearchArtistNames(
          video.primaryArtists
        );


      card.innerHTML = `
        <div class="search-video-thumbnail">

          <img
            src="${safeSearchImage(
              video.thumbnailUrl
            )}"
            alt="${escapeSearchHTML(
              video.title
            )}"
          >

          <div class="search-video-play">
            <span>▶</span>
          </div>

        </div>

        <h3>
          ${escapeSearchHTML(
            video.title ||
            "Video"
          )}
        </h3>

        <p>
          ${escapeSearchHTML(
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


      videoResults.appendChild(
        card
      );

    }
  );

}


/* ========================================
   RESET SEARCH
======================================== */

function resetSearchPage() {

  searchHelper.textContent =
    "Find music, artists and videos across EmnetMusic.";


  searchEmptyScreen.style.display =
    "";


  searchResults.classList.remove(
    "active"
  );


  noSearchResults.classList.remove(
    "active"
  );


  currentSearchSongs = [];

}


/* ========================================
   ARTIST NAMES
======================================== */

function getSearchArtistNames(
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

function safeSearchImage(
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

function escapeSearchHTML(
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