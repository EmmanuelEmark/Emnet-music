
/* =====================================================
   EMNET MUSIC — PLAYLISTS PAGE
   List Playlists + Create Playlist
   Authenticated Listener Experience
===================================================== */

/* =====================================================
   1. AUTHENTICATION
===================================================== */

const playlistsPageAuthorized =
  typeof protectPage === "function"
    ? protectPage()
    : Boolean(
        typeof getToken === "function" &&
        getToken()
      );

/* =====================================================
   2. ELEMENTS
===================================================== */

const playlistsGrid =
  document.getElementById("playlistsGrid");

const playlistsMessage =
  document.getElementById("playlistsMessage");

const playlistsEmpty =
  document.getElementById("playlistsEmpty");

const openCreatePlaylist =
  document.getElementById("openCreatePlaylist");

const playlistModal =
  document.getElementById("playlistModal");

const closePlaylistModal =
  document.getElementById("closePlaylistModal");

const createPlaylistForm =
  document.getElementById("createPlaylistForm");

const playlistName =
  document.getElementById("playlistName");

const playlistDescription =
  document.getElementById("playlistDescription");

const playlistPublic =
  document.getElementById("playlistPublic");

const playlistFormMessage =
  document.getElementById("playlistFormMessage");

const createPlaylistButton =
  document.getElementById("createPlaylistButton");

const logoutButton =
  document.getElementById("logoutButton");

/* =====================================================
   3. STATE
===================================================== */

let playlists = [];

let creatingPlaylist = false;

const CREATE_PLAYLIST_BUTTON_TEXT =
  createPlaylistButton?.textContent?.trim() ||
  "Create playlist";

/* =====================================================
   4. START PAGE
===================================================== */

if (playlistsPageAuthorized) {
  startPlaylistsPage();
}

async function startPlaylistsPage() {
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

  setupPlaylistEvents();

  await loadPlaylists();
}

/* =====================================================
   5. AUTHENTICATION HELPERS
===================================================== */

function getPlaylistsToken() {
  if (typeof getToken === "function") {
    return getToken();
  }

  return null;
}

function redirectPlaylistsLogin() {
  window.location.href =
    `login.html?redirect=${encodeURIComponent(
      window.location.pathname +
      window.location.search
    )}`;
}

function handlePlaylistsAuthentication(response) {
  if (response.status === 401) {
    redirectPlaylistsLogin();
    return false;
  }

  return true;
}

/* =====================================================
   6. AUTHENTICATED API REQUESTS
===================================================== */

async function playlistsRequest(
  endpoint,
  options = {}
) {
  const token = getPlaylistsToken();

  if (!token) {
    redirectPlaylistsLogin();

    throw new Error(
      "Authentication required."
    );
  }

  const response = await fetch(

    `${API_BASE_URL.replace(/\/$/, "")}/api${endpoint}`,

    {
      ...options,

      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!handlePlaylistsAuthentication(response)) {
    throw new Error(
      "Your session has expired."
    );
  }

  const responseText = await response.text();

  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        "Unexpected server response."
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      `Request failed (${response.status}).`
    );
  }

  return data;
}

/* =====================================================
   7. LOAD PLAYLISTS
===================================================== */

async function loadPlaylists() {
  showPlaylistsMessage(
    "Loading your playlists..."
  );

  if (playlistsEmpty) {
    playlistsEmpty.style.display = "none";
  }

  try {
    const data = await playlistsRequest(
      "/playlists"
    );

    const items =
      Array.isArray(data)
        ? data
        : data.playlists ??
          data.data ??
          [];

    if (!Array.isArray(items)) {
      throw new Error(
        "Invalid playlists response."
      );
    }

    playlists = items;

    renderPlaylists();

    hidePlaylistsMessage();

  } catch (error) {
    console.error(
      "Load playlists error:",
      error
    );

    showPlaylistsMessage(
      error.message ||
      "Unable to load playlists."
    );
  }
}

/* =====================================================
   8. RENDER PLAYLISTS
===================================================== */

function renderPlaylists() {
  if (!playlistsGrid) {
    return;
  }

  playlistsGrid.replaceChildren();

  if (playlistsEmpty) {
    playlistsEmpty.style.display =
      playlists.length ? "none" : "block";
  }

  if (!playlists.length) {
    return;
  }

  const fragment =
    document.createDocumentFragment();

  playlists.forEach((playlist) => {
    if (
      !playlist ||
      typeof playlist !== "object" ||
      !playlist._id
    ) {
      return;
    }

    const songCount =
      Array.isArray(playlist.songs)
        ? playlist.songs.length
        : 0;

    const card =
      document.createElement("div");

    card.className = "playlist-card";

    card.style.cursor = "pointer";

    card.setAttribute("role", "link");
    card.setAttribute("tabindex", "0");

    /* PLAYLIST COVER */

    const cover =
      document.createElement("div");

    cover.className =
      "playlist-card-cover";

    const musicIcon =
      document.createElement("span");

    musicIcon.textContent = "♪";

    cover.appendChild(musicIcon);

    /* PLAYLIST NAME */

    const title =
      document.createElement("h3");

    title.textContent =
      playlist.name ||
      playlist.title ||
      "Playlist";

    /* SONG COUNT */

    const description =
      document.createElement("p");

    description.textContent =
      `${songCount} ${
        songCount === 1
          ? "song"
          : "songs"
      }`;

    card.append(
      cover,
      title,
      description
    );

    /* PUBLIC BADGE */

    if (playlist.isPublic) {
      const badge =
        document.createElement("span");

      badge.className =
        "playlist-public-badge";

      badge.textContent = "PUBLIC";

      card.appendChild(badge);
    }

    /* OPEN PLAYLIST */

    const openPlaylist = () => {
      window.location.href =
        `playlist.html?id=${encodeURIComponent(
          playlist._id
        )}`;
    };

    card.addEventListener(
      "click",
      openPlaylist
    );

    card.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          openPlaylist();
        }
      }
    );

    fragment.appendChild(card);
  });

  playlistsGrid.appendChild(fragment);
}

/* =====================================================
   9. PLAYLIST EVENTS
===================================================== */

function setupPlaylistEvents() {
  if (openCreatePlaylist) {
    openCreatePlaylist.addEventListener(
      "click",
      openCreatePlaylistModal
    );
  }

  if (closePlaylistModal) {
    closePlaylistModal.addEventListener(
      "click",
      closeCreatePlaylistModal
    );
  }

  if (playlistModal) {
    playlistModal.addEventListener(
      "click",
      (event) => {
        if (
          event.target === playlistModal
        ) {
          closeCreatePlaylistModal();
        }
      }
    );
  }

  if (createPlaylistForm) {
    createPlaylistForm.addEventListener(
      "submit",
      createNewPlaylist
    );
  }

  if (
    logoutButton &&
    typeof logout === "function"
  ) {
    logoutButton.addEventListener(
      "click",
      logout
    );
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        playlistModal?.classList.contains(
          "active"
        )
      ) {
        closeCreatePlaylistModal();
      }
    }
  );
}

/* =====================================================
   10. OPEN CREATE PLAYLIST MODAL
===================================================== */

function openCreatePlaylistModal() {
  if (!playlistModal) {
    return;
  }

  if (playlistFormMessage) {
    playlistFormMessage.textContent = "";
  }

  playlistModal.classList.add("active");

  if (playlistName) {
    playlistName.focus();
  }
}

/* =====================================================
   11. CLOSE CREATE PLAYLIST MODAL
===================================================== */

function closeCreatePlaylistModal() {
  if (
    !playlistModal ||
    creatingPlaylist
  ) {
    return;
  }

  playlistModal.classList.remove(
    "active"
  );

  if (createPlaylistForm) {
    createPlaylistForm.reset();
  }

  if (playlistFormMessage) {
    playlistFormMessage.textContent = "";
  }
}

/* =====================================================
   12. CREATE NEW PLAYLIST
===================================================== */

async function createNewPlaylist(event) {
  event.preventDefault();

  if (creatingPlaylist) {
    return;
  }

  const name =
    playlistName?.value.trim() || "";

  const description =
    playlistDescription?.value.trim() ||
    "";

  const isPublic =
    Boolean(playlistPublic?.checked);

  if (!name) {
    showPlaylistFormMessage(
      "Playlist name is required."
    );

    playlistName?.focus();

    return;
  }

  creatingPlaylist = true;

  if (createPlaylistButton) {
    createPlaylistButton.disabled = true;

    createPlaylistButton.textContent =
      "Creating...";
  }

  showPlaylistFormMessage("");

  try {
    const data = await playlistsRequest(
      "/playlists",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          name,
          description,
          isPublic
        })
      }
    );

    // The playlist has been created successfully.
    // Do not add a second creation request.

    creatingPlaylist = false;

    closeCreatePlaylistModal();

    // Refresh the list using the existing GET endpoint.
    await loadPlaylists();

  } catch (error) {
    console.error(
      "Create playlist error:",
      error
    );

    showPlaylistFormMessage(
      error.message ||
      "Unable to create playlist."
    );

  } finally {
    creatingPlaylist = false;

    if (createPlaylistButton) {
      createPlaylistButton.disabled = false;

      createPlaylistButton.textContent =
        CREATE_PLAYLIST_BUTTON_TEXT;
    }
  }
}

/* =====================================================
   13. PAGE MESSAGES
===================================================== */

function showPlaylistsMessage(message) {
  if (!playlistsMessage) {
    return;
  }

  playlistsMessage.textContent = message;

  playlistsMessage.style.display =
    "block";
}

function hidePlaylistsMessage() {
  if (!playlistsMessage) {
    return;
  }

  playlistsMessage.textContent = "";

  playlistsMessage.style.display =
    "none";
}

function showPlaylistFormMessage(message) {
  if (!playlistFormMessage) {
    return;
  }

  playlistFormMessage.textContent =
    message;
}

/* =====================================================
   14. HTML ESCAPING HELPER
===================================================== */

function escapePlaylistHTML(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
