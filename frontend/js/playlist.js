
/* =====================================================
   EMNET MUSIC — PLAYLIST DETAILS
   Authenticated management + secure R2 artwork
===================================================== */

// Keep playlist management restricted to logged-in users.
const playlistAuthorized =
  typeof protectPage === "function"
    ? protectPage()
    : Boolean(
        typeof getToken === "function" &&
        getToken()
      );

/* =====================================================
   1. PLAYLIST ID
===================================================== */

const playlistId =
  new URLSearchParams(
    window.location.search
  ).get("id");

/* =====================================================
   2. ELEMENTS
===================================================== */

const playlistLoading =
  document.getElementById("playlistLoading");

const playlistError =
  document.getElementById("playlistError");

const playlistContent =
  document.getElementById("playlistContent");

const playlistTitle =
  document.getElementById("playlistTitle");

const playlistDescription =
  document.getElementById("playlistDescription");

const playlistVisibility =
  document.getElementById("playlistVisibility");

const playlistSongCount =
  document.getElementById("playlistSongCount");

const playPlaylistButton =
  document.getElementById("playPlaylistButton");

const editPlaylistButton =
  document.getElementById("editPlaylistButton");

const deletePlaylistButton =
  document.getElementById("deletePlaylistButton");

const playlistTrackList =
  document.getElementById("playlistTrackList");

const editPlaylistModal =
  document.getElementById("editPlaylistModal");

const closeEditPlaylistModal =
  document.getElementById("closeEditPlaylistModal");

const editPlaylistForm =
  document.getElementById("editPlaylistForm");

const editPlaylistName =
  document.getElementById("editPlaylistName");

const editPlaylistDescription =
  document.getElementById("editPlaylistDescription");

const editPlaylistPublic =
  document.getElementById("editPlaylistPublic");

const editPlaylistMessage =
  document.getElementById("editPlaylistMessage");

const savePlaylistButton =
  document.getElementById("savePlaylistButton");

const logoutButton =
  document.getElementById("logoutButton");

/* =====================================================
   3. STATE
===================================================== */

let currentPlaylist = null;
let playlistSongs = [];
let playlistBusy = false;

const PLAYLIST_PLACEHOLDER =
  "https://placehold.co/600x600/111612/35e67a?text=EmnetMusic";

const playlistArtworkCache = new Map();

/* =====================================================
   4. START PAGE
===================================================== */

if (playlistAuthorized) {
  startPlaylistPage();
}

async function startPlaylistPage() {
  if (!playlistId) {
    showPlaylistError("Playlist ID is missing.");
    return;
  }

  if (typeof loadPlayerComponent === "function") {
    try {
      await loadPlayerComponent();
    } catch (error) {
      console.warn(
        "Player component unavailable:",
        error
      );
    }
  }

  await loadPlaylist();
}

/* =====================================================
   5. AUTHENTICATION
===================================================== */

function getPlaylistToken() {
  return typeof getToken === "function"
    ? getToken()
    : null;
}

function redirectPlaylistLogin() {
  window.location.href =
    `login.html?redirect=${encodeURIComponent(
      window.location.pathname +
      window.location.search
    )}`;
}

function handlePlaylistAuthentication(response) {
  if (response.status === 401) {
    redirectPlaylistLogin();
    return false;
  }

  return true;
}

/* =====================================================
   6. AUTHENTICATED API REQUESTS
===================================================== */

async function playlistRequest(
  endpoint,
  options = {}
) {
  const token = getPlaylistToken();

  if (!token) {
    redirectPlaylistLogin();

    throw new Error(
      "Authentication required."
    );
  }

  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!handlePlaylistAuthentication(response)) {
    throw new Error(
      "Your session has expired."
    );
  }

  // DELETE requests may return 204 No Content.
  const responseText = await response.text();

  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      if (!response.ok) {
        throw new Error(
          "Unexpected server response."
        );
      }
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
   7. LOAD PLAYLIST
===================================================== */

async function loadPlaylist() {
  try {
    const data = await playlistRequest(
      `/playlists/${encodeURIComponent(
        playlistId
      )}`
    );

    if (
      !data.playlist ||
      typeof data.playlist !== "object"
    ) {
      throw new Error(
        "Playlist information was not returned."
      );
    }

    currentPlaylist = data.playlist;

    playlistSongs =
      Array.isArray(currentPlaylist.songs)
        ? currentPlaylist.songs.filter(
            (song) =>
              song &&
              typeof song === "object" &&
              song._id
          )
        : [];

    renderPlaylist();

    if (playlistLoading) {
      playlistLoading.style.display = "none";
    }

    if (playlistError) {
      playlistError.style.display = "none";
    }

    if (playlistContent) {
      playlistContent.classList.add("active");
    }

  } catch (error) {
    console.error(
      "Playlist load error:",
      error
    );

    showPlaylistError(error.message);
  }
}

/* =====================================================
   8. RENDER PLAYLIST INFORMATION
===================================================== */

function renderPlaylist() {
  if (!currentPlaylist) {
    return;
  }

  document.title =
    `${currentPlaylist.name || "Playlist"} | EmnetMusic`;

  if (playlistTitle) {
    playlistTitle.textContent =
      currentPlaylist.name || "Playlist";
  }

  if (playlistDescription) {
    playlistDescription.textContent =
      currentPlaylist.description ||
      "No description";
  }

  if (playlistVisibility) {
    playlistVisibility.textContent =
      currentPlaylist.isPublic
        ? "Public"
        : "Private";
  }

  if (playlistSongCount) {
    playlistSongCount.textContent =
      `${playlistSongs.length} ${
        playlistSongs.length === 1
          ? "song"
          : "songs"
      }`;
  }

  if (playPlaylistButton) {
    playPlaylistButton.disabled =
      !playlistSongs.length;
  }

  renderPlaylistSongs();
}

/* =====================================================
   9. IMAGE HELPERS
===================================================== */

function safePlaylistImage(url) {
  if (
    typeof url !== "string" ||
    !url.trim()
  ) {
    return PLAYLIST_PLACEHOLDER;
  }

  try {
    const parsed = new URL(
      url,
      window.location.href
    );

    return (
      parsed.protocol === "https:" ||
      parsed.protocol === "http:"
    )
      ? parsed.href
      : PLAYLIST_PLACEHOLDER;

  } catch {
    return PLAYLIST_PLACEHOLDER;
  }
}

function attachPlaylistImageFallback(image) {
  image.addEventListener("error", () => {
    if (image.src !== PLAYLIST_PLACEHOLDER) {
      image.src = PLAYLIST_PLACEHOLDER;
    }
  });
}

function playlistReleaseId(song) {
  const release = song.releaseId;

  if (typeof release === "string") {
    return release;
  }

  return release &&
    typeof release === "object"
      ? release._id
      : null;
}

function playlistReleaseObject(song) {
  return song.releaseId &&
    typeof song.releaseId === "object"
      ? song.releaseId
      : {};
}

/* =====================================================
   10. SECURE CLOUDFLARE R2 ARTWORK
===================================================== */

async function getSecurePlaylistArtwork(releaseId) {
  const cached =
    playlistArtworkCache.get(releaseId);

  if (
    cached &&
    Date.now() < cached.expiresAt
  ) {
    return cached.url;
  }

  const response = await fetch(
    `${API_BASE_URL}/media/releases/${encodeURIComponent(
      releaseId
    )}/artwork`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(
      `Artwork unavailable (${response.status})`
    );
  }

  const data = await response.json();

  const url =
    data.mediaUrl ||
    data.playbackUrl;

  if (!url) {
    throw new Error(
      "Artwork URL missing."
    );
  }

  const seconds = Number(data.expiresIn);

  if (
    Number.isFinite(seconds) &&
    seconds > 30
  ) {
    playlistArtworkCache.set(releaseId, {
      url,
      expiresAt:
        Date.now() +
        (seconds - 30) * 1000
    });
  }

  return url;
}

async function applySecurePlaylistArtwork(
  image,
  song
) {
  const releaseId =
    playlistReleaseId(song);

  if (!releaseId || !image) {
    return;
  }

  try {
    const url =
      await getSecurePlaylistArtwork(
        releaseId
      );

    if (image.isConnected) {
      image.src =
        safePlaylistImage(url);
    }

  } catch (error) {
    console.warn(
      "Playlist artwork fallback:",
      releaseId,
      error.message
    );
  }
}

/* =====================================================
   11. ARTIST NAMES
===================================================== */

function getPlaylistArtistNames(artists) {
  if (!Array.isArray(artists)) {
    return "";
  }

  return artists
    .filter(
      (artist) =>
        artist &&
        typeof artist === "object"
    )
    .map(
      (artist) =>
        artist.stageName ||
        artist.fullName ||
        ""
    )
    .filter(Boolean)
    .join(", ");
}

/* =====================================================
   12. RENDER PLAYLIST SONGS
===================================================== */

function renderPlaylistSongs() {
  if (!playlistTrackList) {
    return;
  }

  playlistTrackList.replaceChildren();

  if (!playlistSongs.length) {
    const empty =
      document.createElement("div");

    empty.className = "playlist-empty";

    empty.textContent =
      "This playlist has no songs yet.";

    playlistTrackList.appendChild(empty);

    return;
  }

  const fragment =
    document.createDocumentFragment();

  playlistSongs.forEach((song, index) => {
    const release =
      playlistReleaseObject(song);

    const row =
      document.createElement("div");

    row.className =
      "playlist-track-row";

    /* TRACK NUMBER */

    const number =
      document.createElement("div");

    number.className =
      "playlist-track-number";

    number.textContent = index + 1;

    /* COVER ARTWORK */

    const image =
      document.createElement("img");

    image.className =
      "playlist-track-cover";

    image.alt =
      song.title || "Song";

    image.loading = "lazy";

    image.src =
      safePlaylistImage(
        release.coverImage
      );

    attachPlaylistImageFallback(image);

    /* SONG INFORMATION */

    const main =
      document.createElement("div");

    main.className =
      "playlist-track-main";

    const title =
      document.createElement("h3");

    title.textContent =
      song.title || "Untitled";

    const artist =
      document.createElement("p");

    artist.textContent =
      getPlaylistArtistNames(
        song.primaryArtists
      ) || "Artist";

    main.append(title, artist);

    /* RELEASE NAME */

    const releaseName =
      document.createElement("div");

    releaseName.className =
      "playlist-track-release";

    releaseName.textContent =
      release.title || "";

    /* PLAY BUTTON */

    const playButton =
      document.createElement("button");

    playButton.type = "button";

    playButton.className =
      "playlist-track-play";

    playButton.dataset.songId =
      song._id;

    playButton.setAttribute(
      "aria-label",
      `Play ${song.title || "song"}`
    );

    playButton.textContent = "▶";

    playButton.addEventListener(
      "click",
      () => playPlaylistSong(song._id)
    );

    /* REMOVE BUTTON */

    const removeButton =
      document.createElement("button");

    removeButton.type = "button";

    removeButton.className =
      "playlist-track-remove";

    removeButton.dataset.songId =
      song._id;

    removeButton.setAttribute(
      "aria-label",
      `Remove ${song.title || "song"}`
    );

    removeButton.textContent = "×";

    removeButton.addEventListener(
      "click",
      () => removeSongFromPlaylist(
        song._id
      )
    );

    row.append(
      number,
      image,
      main,
      releaseName,
      playButton,
      removeButton
    );

    fragment.appendChild(row);

    applySecurePlaylistArtwork(
      image,
      song
    );
  });

  playlistTrackList.appendChild(fragment);
}

/* =====================================================
   13. PLAY SONG / PLAY WHOLE PLAYLIST
===================================================== */

function playPlaylistSong(songId) {
  if (typeof playSong !== "function") {
    alert(
      "Music player is unavailable."
    );

    return;
  }

  const song =
    playlistSongs.find(
      (item) =>
        String(item._id) ===
        String(songId)
    );

  if (song) {
    // player.js handles signed R2 audio URLs.
    playSong(song, playlistSongs);
  }
}

if (playPlaylistButton) {
  playPlaylistButton.addEventListener(
    "click",
    () => {
      if (playlistSongs.length) {
        playPlaylistSong(
          playlistSongs[0]._id
        );
      }
    }
  );
}

/* =====================================================
   14. REMOVE SONG FROM PLAYLIST
===================================================== */

async function removeSongFromPlaylist(songId) {
  if (
    playlistBusy ||
    !currentPlaylist
  ) {
    return;
  }

  const confirmed = window.confirm(
    "Remove this song from the playlist?"
  );

  if (!confirmed) {
    return;
  }

  playlistBusy = true;

  try {
    await playlistRequest(
      `/playlists/${encodeURIComponent(
        playlistId
      )}/songs/${encodeURIComponent(
        songId
      )}`,
      {
        method: "DELETE"
      }
    );

    playlistSongs =
      playlistSongs.filter(
        (song) =>
          String(song._id) !==
          String(songId)
      );

    currentPlaylist.songs =
      playlistSongs;

    renderPlaylist();

  } catch (error) {
    console.error(
      "Remove song error:",
      error
    );

    alert(
      error.message ||
      "Unable to remove song."
    );

  } finally {
    playlistBusy = false;
  }
}

/* =====================================================
   15. EDIT PLAYLIST MODAL
===================================================== */

function closeEditModal() {
  if (editPlaylistModal) {
    editPlaylistModal.classList.remove(
      "active"
    );
  }

  if (editPlaylistMessage) {
    editPlaylistMessage.textContent = "";
  }
}

if (editPlaylistButton) {
  editPlaylistButton.addEventListener(
    "click",
    () => {
      if (
        !currentPlaylist ||
        !editPlaylistModal
      ) {
        return;
      }

      if (editPlaylistName) {
        editPlaylistName.value =
          currentPlaylist.name || "";
      }

      if (editPlaylistDescription) {
        editPlaylistDescription.value =
          currentPlaylist.description || "";
      }

      if (editPlaylistPublic) {
        editPlaylistPublic.checked =
          Boolean(
            currentPlaylist.isPublic
          );
      }

      if (editPlaylistMessage) {
        editPlaylistMessage.textContent = "";
      }

      editPlaylistModal.classList.add(
        "active"
      );
    }
  );
}

if (closeEditPlaylistModal) {
  closeEditPlaylistModal.addEventListener(
    "click",
    closeEditModal
  );
}

if (editPlaylistModal) {
  editPlaylistModal.addEventListener(
    "click",
    (event) => {
      if (
        event.target === editPlaylistModal
      ) {
        closeEditModal();
      }
    }
  );
}

/* =====================================================
   16. UPDATE PLAYLIST
===================================================== */

if (editPlaylistForm) {
  editPlaylistForm.addEventListener(
    "submit",
    updatePlaylist
  );
}

async function updatePlaylist(event) {
  event.preventDefault();

  if (
    playlistBusy ||
    !currentPlaylist
  ) {
    return;
  }

  const name =
    editPlaylistName?.value.trim() ||
    "";

  if (!name) {
    if (editPlaylistMessage) {
      editPlaylistMessage.textContent =
        "Playlist name is required.";
    }

    return;
  }

  playlistBusy = true;

  if (savePlaylistButton) {
    savePlaylistButton.disabled = true;

    savePlaylistButton.textContent =
      "Saving...";
  }

  try {
    const changes = {
      name,

      description:
        editPlaylistDescription?.value.trim() ||
        "",

      isPublic:
        Boolean(
          editPlaylistPublic?.checked
        )
    };

    const data = await playlistRequest(
      `/playlists/${encodeURIComponent(
        playlistId
      )}`,
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify(changes)
      }
    );

    currentPlaylist = {
      ...currentPlaylist,
      ...changes,
      ...(data.playlist || {})
    };

    closeEditModal();
    renderPlaylist();

  } catch (error) {
    console.error(
      "Update playlist error:",
      error
    );

    if (editPlaylistMessage) {
      editPlaylistMessage.textContent =
        error.message ||
        "Unable to update playlist.";
    }

  } finally {
    playlistBusy = false;

    if (savePlaylistButton) {
      savePlaylistButton.disabled = false;

      savePlaylistButton.textContent =
        "Save changes";
    }
  }
}

/* =====================================================
   17. DELETE PLAYLIST
===================================================== */

if (deletePlaylistButton) {
  deletePlaylistButton.addEventListener(
    "click",
    deletePlaylist
  );
}

async function deletePlaylist() {
  if (
    playlistBusy ||
    !currentPlaylist
  ) {
    return;
  }

  const confirmed = window.confirm(
    `Delete "${currentPlaylist.name}"?`
  );

  if (!confirmed) {
    return;
  }

  playlistBusy = true;

  if (deletePlaylistButton) {
    deletePlaylistButton.disabled = true;
  }

  try {
    await playlistRequest(
      `/playlists/${encodeURIComponent(
        playlistId
      )}`,
      {
        method: "DELETE"
      }
    );

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

  } finally {
    playlistBusy = false;

    if (deletePlaylistButton) {
      deletePlaylistButton.disabled = false;
    }
  }
}

/* =====================================================
   18. LOGOUT
===================================================== */

if (
  logoutButton &&
  typeof logout === "function"
) {
  logoutButton.addEventListener(
    "click",
    logout
  );
}

/* =====================================================
   19. ERROR HANDLING
===================================================== */

function showPlaylistError(message) {
  if (playlistLoading) {
    playlistLoading.style.display = "none";
  }

  if (playlistContent) {
    playlistContent.classList.remove(
      "active"
    );
  }

  if (playlistError) {
    playlistError.style.display = "block";

    playlistError.textContent =
      message ||
      "Unable to load playlist.";
  }
}
