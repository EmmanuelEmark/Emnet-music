if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


/* ========================================
   ELEMENTS
======================================== */

const playlistsGrid =
  document.getElementById(
    "playlistsGrid"
  );


const playlistsMessage =
  document.getElementById(
    "playlistsMessage"
  );


const playlistsEmpty =
  document.getElementById(
    "playlistsEmpty"
  );


const openCreatePlaylist =
  document.getElementById(
    "openCreatePlaylist"
  );


const playlistModal =
  document.getElementById(
    "playlistModal"
  );


const closePlaylistModal =
  document.getElementById(
    "closePlaylistModal"
  );


const createPlaylistForm =
  document.getElementById(
    "createPlaylistForm"
  );


const playlistName =
  document.getElementById(
    "playlistName"
  );


const playlistDescription =
  document.getElementById(
    "playlistDescription"
  );


const playlistPublic =
  document.getElementById(
    "playlistPublic"
  );


const playlistFormMessage =
  document.getElementById(
    "playlistFormMessage"
  );


const createPlaylistButton =
  document.getElementById(
    "createPlaylistButton"
  );


const logoutButton =
  document.getElementById(
    "logoutButton"
  );


/* ========================================
   STATE
======================================== */

let playlists = [];


/* ========================================
   START
======================================== */

startPlaylistsPage();


async function startPlaylistsPage() {

  await loadPlayerComponent();

  await loadPlaylists();

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
   LOAD PLAYLISTS
======================================== */

async function loadPlaylists() {

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
        `${API_BASE_URL}/playlists`,
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
      "Playlists response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load playlists."
      );

    }


    playlists =
      Array.isArray(
        data.playlists
      )
        ? data.playlists
        : [];


    playlistsMessage.style.display =
      "none";


    renderPlaylists();


  } catch (error) {

    console.error(
      "Playlists error:",
      error
    );


    playlistsMessage.textContent =
      error.message ||
      "Unable to load playlists.";

  }

}


/* ========================================
   RENDER PLAYLISTS
======================================== */

function renderPlaylists() {

  playlistsGrid.innerHTML =
    "";


  playlistsEmpty.style.display =
    "none";


  if (!playlists.length) {

    playlistsEmpty.style.display =
      "block";

    return;

  }


  playlists.forEach(
    (playlist) => {

      const songCount =
        Array.isArray(
          playlist.songs
        )
          ? playlist.songs.length
          : 0;


      const card =
        document.createElement(
          "div"
        );


      card.className =
        "playlist-card";


      card.innerHTML = `
        <div class="playlist-card-cover">
          <span>♪</span>
        </div>

        <h3>
          ${escapePlaylistHTML(
            playlist.name ||
            "Playlist"
          )}
        </h3>

        <p>
          ${songCount} ${
            songCount === 1
              ? "song"
              : "songs"
          }
        </p>

        ${
          playlist.isPublic
            ? `
              <span class="playlist-public-badge">
                PUBLIC
              </span>
            `
            : ""
        }
      `;


      card.addEventListener(
        "click",
        () => {

          if (!playlist._id) {
            return;
          }


          window.location.href =
            `/playlist?id=${encodeURIComponent(
              playlist._id
            )}`;

        }
      );


      playlistsGrid.appendChild(
        card
      );

    }
  );

}


/* ========================================
   OPEN MODAL
======================================== */

openCreatePlaylist.addEventListener(
  "click",
  () => {

    playlistFormMessage.textContent =
      "";


    playlistModal.classList.add(
      "active"
    );


    playlistName.focus();

  }
);


/* ========================================
   CLOSE MODAL
======================================== */

closePlaylistModal.addEventListener(
  "click",
  closeCreatePlaylistModal
);


playlistModal.addEventListener(
  "click",
  (event) => {

    if (
      event.target ===
      playlistModal
    ) {

      closeCreatePlaylistModal();

    }

  }
);


function closeCreatePlaylistModal() {

  playlistModal.classList.remove(
    "active"
  );


  createPlaylistForm.reset();


  playlistFormMessage.textContent =
    "";

}


/* ========================================
   CREATE PLAYLIST
======================================== */

createPlaylistForm.addEventListener(
  "submit",
  createNewPlaylist
);


async function createNewPlaylist(
  event
) {

  event.preventDefault();


  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  const name =
    playlistName.value.trim();


  const description =
    playlistDescription.value.trim();


  const isPublic =
    playlistPublic.checked;


  if (!name) {

    playlistFormMessage.textContent =
      "Playlist name is required.";

    return;

  }


  try {

    createPlaylistButton.disabled =
      true;


    createPlaylistButton.textContent =
      "Creating...";


    playlistFormMessage.textContent =
      "";


    const response =
      await fetch(
        `${API_BASE_URL}/playlists`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,
          },

          body:
            JSON.stringify({
              name,
              description,
              isPublic,
            }),
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to create playlist."
      );

    }


    console.log(
      "Playlist created:",
      data
    );


    closeCreatePlaylistModal();


    await loadPlaylists();


  } catch (error) {

    console.error(
      "Create playlist error:",
      error
    );


    playlistFormMessage.textContent =
      error.message ||
      "Unable to create playlist.";

  } finally {

    createPlaylistButton.disabled =
      false;


    createPlaylistButton.textContent =
      "Create playlist";

  }

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