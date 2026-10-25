if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


/* ========================================
   PLAYLIST ID
======================================== */

const params =
  new URLSearchParams(
    window.location.search
  );


const playlistId =
  params.get("id");


/* ========================================
   ELEMENTS
======================================== */

const playlistLoading =
  document.getElementById(
    "playlistLoading"
  );


const playlistError =
  document.getElementById(
    "playlistError"
  );


const playlistContent =
  document.getElementById(
    "playlistContent"
  );


const playlistTitle =
  document.getElementById(
    "playlistTitle"
  );


const playlistDescription =
  document.getElementById(
    "playlistDescription"
  );


const playlistVisibility =
  document.getElementById(
    "playlistVisibility"
  );


const playlistSongCount =
  document.getElementById(
    "playlistSongCount"
  );


const playPlaylistButton =
  document.getElementById(
    "playPlaylistButton"
  );


const editPlaylistButton =
  document.getElementById(
    "editPlaylistButton"
  );


const deletePlaylistButton =
  document.getElementById(
    "deletePlaylistButton"
  );


const playlistTrackList =
  document.getElementById(
    "playlistTrackList"
  );


const editPlaylistModal =
  document.getElementById(
    "editPlaylistModal"
  );


const closeEditPlaylistModal =
  document.getElementById(
    "closeEditPlaylistModal"
  );


const editPlaylistForm =
  document.getElementById(
    "editPlaylistForm"
  );


const editPlaylistName =
  document.getElementById(
    "editPlaylistName"
  );


const editPlaylistDescription =
  document.getElementById(
    "editPlaylistDescription"
  );


const editPlaylistPublic =
  document.getElementById(
    "editPlaylistPublic"
  );


const editPlaylistMessage =
  document.getElementById(
    "editPlaylistMessage"
  );


const savePlaylistButton =
  document.getElementById(
    "savePlaylistButton"
  );


const logoutButton =
  document.getElementById(
    "logoutButton"
  );


/* ========================================
   STATE
======================================== */

let currentPlaylist = null;

let playlistSongs = [];


/* ========================================
   START
======================================== */

startPlaylistPage();


async function startPlaylistPage() {

  await loadPlayerComponent();


  if (!playlistId) {

    showPlaylistError(
      "Playlist ID is missing."
    );

    return;

  }


  await loadPlaylist();

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
   LOAD PLAYLIST
======================================== */

async function loadPlaylist() {

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
        `${API_BASE_URL}/playlists/${playlistId}`,
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
      "Playlist response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load playlist."
      );

    }


    currentPlaylist =
      data.playlist;


    playlistSongs =
      Array.isArray(
        currentPlaylist.songs
      )
        ? currentPlaylist.songs
        : [];


    renderPlaylist();


    playlistLoading.style.display =
      "none";


    playlistError.style.display =
      "none";


    playlistContent.classList.add(
      "active"
    );


  } catch (error) {

    console.error(
      "Playlist page error:",
      error
    );


    showPlaylistError(
      error.message
    );

  }

}


/* ========================================
   RENDER PLAYLIST
======================================== */

function renderPlaylist() {

  if (!currentPlaylist) {
    return;
  }


  document.title =
    `${currentPlaylist.name || "Playlist"} | EmnetMusic`;


  playlistTitle.textContent =
    currentPlaylist.name ||
    "Playlist";


  playlistDescription.textContent =
    currentPlaylist.description ||
    "No description";


  playlistVisibility.textContent =
    currentPlaylist.isPublic
      ? "Public"
      : "Private";


  playlistSongCount.textContent =
    `${playlistSongs.length} ${
      playlistSongs.length === 1
        ? "song"
        : "songs"
    }`;


  renderPlaylistSongs();

}


/* ========================================
   SONGS
======================================== */

function renderPlaylistSongs() {

  playlistTrackList.innerHTML =
    "";


  if (!playlistSongs.length) {

    playlistTrackList.innerHTML = `
      <div class="playlist-empty">
        This playlist has no songs yet.
      </div>
    `;

    return;

  }


  playlistSongs.forEach(
    (song, index) => {

      const release =
        song.releaseId || {};


      const artistName =
        getPlaylistArtistNames(
          song.primaryArtists
        );


      const row =
        document.createElement(
          "div"
        );


      row.className =
        "playlist-track-row";


      row.innerHTML = `
        <div class="playlist-track-number">
          ${index + 1}
        </div>

        <img
          class="playlist-track-cover"
          src="${safePlaylistImage(
            release.coverImage
          )}"
          alt="${escapePlaylistHTML(
            song.title ||
            "Song"
          )}"
        >

        <div class="playlist-track-main">

          <h3>
            ${escapePlaylistHTML(
              song.title ||
              "Untitled"
            )}
          </h3>

          <p>
            ${escapePlaylistHTML(
              artistName ||
              "Artist"
            )}
          </p>

        </div>

        <div class="playlist-track-release">
          ${escapePlaylistHTML(
            release.title ||
            ""
          )}
        </div>

        <button
          type="button"
          class="playlist-track-play"
          data-song-id="${song._id}"
        >
          ▶
        </button>

        <button
          type="button"
          class="playlist-track-remove"
          data-song-id="${song._id}"
        >
          ×
        </button>
      `;


      playlistTrackList.appendChild(
        row
      );

    }
  );


  /* PLAY BUTTONS */

  playlistTrackList
    .querySelectorAll(
      ".playlist-track-play"
    )
    .forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            const song =
              playlistSongs.find(
                (item) =>
                  item._id ===
                  button.dataset.songId
              );


            if (!song) {
              return;
            }


            playSong(
              song,
              playlistSongs
            );

          }
        );

      }
    );


  /* REMOVE BUTTONS */

  playlistTrackList
    .querySelectorAll(
      ".playlist-track-remove"
    )
    .forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            removeSongFromPlaylist(
              button.dataset.songId
            );

          }
        );

      }
    );

}


/* ========================================
   PLAY WHOLE PLAYLIST
======================================== */

playPlaylistButton.addEventListener(
  "click",
  () => {

    if (!playlistSongs.length) {
      return;
    }


    playSong(
      playlistSongs[0],
      playlistSongs
    );

  }
);


/* ========================================
   REMOVE SONG
======================================== */

async function removeSongFromPlaylist(
  songId
) {

  const token =
    getToken();


  if (!token) {
    return;
  }


  const confirmed =
    window.confirm(
      "Remove this song from the playlist?"
    );


  if (!confirmed) {
    return;
  }


  try {

    const response =
      await fetch(
        `${API_BASE_URL}/playlists/${playlistId}/songs/${songId}`,
        {
          method:
            "DELETE",

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
        "Unable to remove song."
      );

    }


    playlistSongs =
      playlistSongs.filter(
        (song) =>
          song._id !== songId
      );


    currentPlaylist.songs =
      playlistSongs;


    renderPlaylist();


  } catch (error) {

    console.error(
      "Remove playlist song error:",
      error
    );


    alert(
      error.message ||
      "Unable to remove song."
    );

  }

}


/* ========================================
   EDIT MODAL
======================================== */

editPlaylistButton.addEventListener(
  "click",
  () => {

    editPlaylistName.value =
      currentPlaylist.name || "";


    editPlaylistDescription.value =
      currentPlaylist.description || "";


    editPlaylistPublic.checked =
      Boolean(
        currentPlaylist.isPublic
      );


    editPlaylistMessage.textContent =
      "";


    editPlaylistModal.classList.add(
      "active"
    );

  }
);


closeEditPlaylistModal.addEventListener(
  "click",
  closeEditModal
);


editPlaylistModal.addEventListener(
  "click",
  (event) => {

    if (
      event.target ===
      editPlaylistModal
    ) {

      closeEditModal();

    }

  }
);


function closeEditModal() {

  editPlaylistModal.classList.remove(
    "active"
  );


  editPlaylistMessage.textContent =
    "";

}


/* ========================================
   UPDATE PLAYLIST
======================================== */

editPlaylistForm.addEventListener(
  "submit",
  updatePlaylist
);


async function updatePlaylist(
  event
) {

  event.preventDefault();


  const token =
    getToken();


  if (!token) {
    return;
  }


  const name =
    editPlaylistName.value.trim();


  if (!name) {

    editPlaylistMessage.textContent =
      "Playlist name is required.";

    return;

  }


  try {

    savePlaylistButton.disabled =
      true;


    savePlaylistButton.textContent =
      "Saving...";


    const response =
      await fetch(
        `${API_BASE_URL}/playlists/${playlistId}`,
        {
          method:
            "PATCH",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },

          body:
            JSON.stringify({
              name,

              description:
                editPlaylistDescription
                  .value
                  .trim(),

              isPublic:
                editPlaylistPublic
                  .checked,
            }),
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to update playlist."
      );

    }


    currentPlaylist.name =
      data.playlist.name;


    currentPlaylist.description =
      data.playlist.description;


    currentPlaylist.isPublic =
      data.playlist.isPublic;


    closeEditModal();


    renderPlaylist();


  } catch (error) {

    console.error(
      "Update playlist error:",
      error
    );


    editPlaylistMessage.textContent =
      error.message ||
      "Unable to update playlist.";

  } finally {

    savePlaylistButton.disabled =
      false;


    savePlaylistButton.textContent =
      "Save changes";

  }

}


/* ========================================
   DELETE PLAYLIST
======================================== */

deletePlaylistButton.addEventListener(
  "click",
  deletePlaylist
);


async function deletePlaylist() {

  const token =
    getToken();


  if (!token) {
    return;
  }


  const confirmed =
    window.confirm(
      `Delete "${currentPlaylist.name}"?`
    );


  if (!confirmed) {
    return;
  }


  try {

    const response =
      await fetch(
        `${API_BASE_URL}/playlists/${playlistId}`,
        {
          method:
            "DELETE",

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
        "Unable to delete playlist."
      );

    }


    window.location.href =
      "playlists.html";


  } catch (error) {

    console.error(
      "Delete playlist error:",
      error
    );


    alert(
      error.message ||
      "Unable to delete playlist."
    );

  }

}


/* ========================================
   ARTIST NAMES
======================================== */

function getPlaylistArtistNames(
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

function safePlaylistImage(
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
   ERROR
======================================== */

function showPlaylistError(
  message
) {

  playlistLoading.style.display =
    "none";


  playlistContent.classList.remove(
    "active"
  );


  playlistError.style.display =
    "block";


  playlistError.textContent =
    message ||
    "Unable to load playlist.";

}


/* ========================================
   ESCAPE HTML
======================================== */

function escapePlaylistHTML(
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