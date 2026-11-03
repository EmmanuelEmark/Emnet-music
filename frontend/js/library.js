
/* =====================================================
   EMNET MUSIC — LISTENER LIBRARY
   Secure Artwork + Playback + Playlists
===================================================== */

/* =====================================================
   1. AUTHENTICATION
===================================================== */

const libraryAuthorized =
  typeof protectPage === "function"
    ? protectPage()
    : Boolean(
        typeof getToken === "function"
          ? getToken()
          : localStorage.getItem("token")
      );

/* =====================================================
   2. ELEMENTS
===================================================== */

const libraryMessage =
  document.getElementById("libraryMessage");

const likedSongsList =
  document.getElementById("likedSongsList");

const followedArtistsGrid =
  document.getElementById("followedArtistsGrid");

const playlistsGrid =
  document.getElementById("playlistsGrid");

const likedSongsSection =
  document.getElementById("likedSongsSection");

const followedArtistsSection =
  document.getElementById("followedArtistsSection");

const playlistsSection =
  document.getElementById("playlistsSection");

const logoutButton =
  document.getElementById("logoutButton");

/* =====================================================
   3. STATE
===================================================== */

let likedSongs = [];
let followedArtists = [];
let myPlaylists = [];

const LIBRARY_PLACEHOLDER =
  "https://placehold.co/600x600/111612/35e67a?text=EmnetMusic";

const libraryArtworkCache = new Map();

/* =====================================================
   4. START LIBRARY
===================================================== */

if (libraryAuthorized) {
  startLibraryPage();
}

async function startLibraryPage() {
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

  await loadLibrary();
}

/* =====================================================
   5. AUTHENTICATION HELPERS
===================================================== */

function getLibraryToken() {
  if (typeof getToken === "function") {
    return getToken();
  }

  return localStorage.getItem("token");
}

function redirectLibraryLogin() {
  window.location.href =
    `login.html?redirect=${encodeURIComponent(
      window.location.pathname +
      window.location.search
    )}`;
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

/* =====================================================
   6. LOAD LIBRARY
===================================================== */

async function loadLibrary() {
  const token = getLibraryToken();

  if (!token) {
    redirectLibraryLogin();
    return;
  }

  showLibraryMessage(
    "Loading your library..."
  );

  try {
    const headers = {
      Authorization: `Bearer ${token}`
    };

    const [
      likesResult,
      followsResult,
      playlistsResult
    ] = await Promise.allSettled([
      fetch(
        `${API_BASE_URL}/listener/likes`,
        { headers }
      ),

      fetch(
        `${API_BASE_URL}/listener/follows`,
        { headers }
      ),

      fetch(
        `${API_BASE_URL}/playlists`,
        { headers }
      )
    ]);

    const responses = [
      likesResult,
      followsResult,
      playlistsResult
    ];

    const sessionExpired =
      responses.some((result) =>
        result.status === "fulfilled" &&
        result.value.status === 401
      );

    if (sessionExpired) {
      redirectLibraryLogin();
      return;
    }

    const errors = [];

    /* LIKED SONGS */

    if (likesResult.status === "fulfilled") {
      try {
        const response = likesResult.value;
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
            "Unable to load liked songs."
          );
        }

        const items =
          data.songs ??
          data.likedSongs ??
          data.likes ??
          data.data ??
          [];

        likedSongs = Array.isArray(items)
          ? items
          : [];

      } catch (error) {
        likedSongs = [];
        errors.push(error.message);
      }

    } else {
      likedSongs = [];
      errors.push(
        "Unable to connect to liked songs."
      );
    }

    /* FOLLOWED ARTISTS */

    if (followsResult.status === "fulfilled") {
      try {
        const response = followsResult.value;
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
            "Unable to load followed artists."
          );
        }

        const items =
          data.artists ??
          data.followedArtists ??
          data.follows ??
          data.data ??
          [];

        followedArtists =
          Array.isArray(items)
            ? items
            : [];

      } catch (error) {
        followedArtists = [];
        errors.push(error.message);
      }

    } else {
      followedArtists = [];
      errors.push(
        "Unable to connect to followed artists."
      );
    }

    /* PLAYLISTS */

    if (playlistsResult.status === "fulfilled") {
      try {
        const response = playlistsResult.value;
        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
            "Unable to load playlists."
          );
        }

        const items =
          data.playlists ??
          data.data ??
          [];

        myPlaylists = Array.isArray(items)
          ? items
          : [];

      } catch (error) {
        myPlaylists = [];
        errors.push(error.message);
      }

    } else {
      myPlaylists = [];
      errors.push(
        "Unable to connect to playlists."
      );
    }

    renderLikedSongs();
    renderFollowedArtists();
    renderPlaylists();

    if (errors.length) {
      showLibraryMessage(
        errors.join(" ")
      );
    } else {
      hideLibraryMessage();
    }

  } catch (error) {
    console.error(
      "Library error:",
      error
    );

    showLibraryMessage(
      error.message ||
      "Unable to load your library."
    );
  }
}

/* =====================================================
   7. LIBRARY MESSAGES
===================================================== */

function showLibraryMessage(message) {
  if (!libraryMessage) return;

  libraryMessage.textContent = message;
  libraryMessage.style.display = "block";
}

function hideLibraryMessage() {
  if (!libraryMessage) return;

  libraryMessage.textContent = "";
  libraryMessage.style.display = "none";
}

/* =====================================================
   8. NORMALIZE LIBRARY DATA
===================================================== */

function getLibrarySong(item) {
  const song =
    item?.songId ??
    item?.song ??
    item;

  if (
    !song ||
    typeof song !== "object" ||
    !song._id
  ) {
    return null;
  }

  return song;
}

function getLibraryArtist(item) {
  const artist =
    item?.artistId ??
    item?.artist ??
    item;

  if (
    !artist ||
    typeof artist !== "object" ||
    !artist._id
  ) {
    return null;
  }

  return artist;
}

function getLibraryRelease(song) {
  const release = song?.releaseId;

  return release &&
    typeof release === "object"
      ? release
      : {};
}

function getLibraryReleaseId(song) {
  const release = song?.releaseId;

  if (typeof release === "string") {
    return release;
  }

  return release?._id || null;
}

/* =====================================================
   9. SECURE ARTWORK REQUEST
===================================================== */

async function requestLibraryArtwork(releaseId) {
  const response = await fetch(
    `${API_BASE_URL}/media/releases/${encodeURIComponent(
      releaseId
    )}/artwork`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ||
      "Unable to load secure artwork."
    );
  }

  const artworkUrl =
    data.mediaUrl ||
    data.playbackUrl;

  if (!artworkUrl) {
    throw new Error(
      "Artwork URL was not returned."
    );
  }

  return {
    url: artworkUrl,
    expiresIn: Number(data.expiresIn)
  };
}

/* =====================================================
   10. ARTWORK CACHE
===================================================== */

async function getLibraryArtwork(releaseId) {
  const cached =
    libraryArtworkCache.get(releaseId);

  if (
    cached &&
    (
      cached.expiresAt === null ||
      Date.now() < cached.expiresAt
    )
  ) {
    return cached.url;
  }

  const result =
    await requestLibraryArtwork(releaseId);

  const expiresAt =
    Number.isFinite(result.expiresIn) &&
    result.expiresIn > 0
      ? Date.now() +
        Math.max(
          result.expiresIn - 30,
          0
        ) * 1000
      : null;

  libraryArtworkCache.set(releaseId, {
    url: result.url,
    expiresAt
  });

  return result.url;
}

async function applyLibraryArtwork(image, song) {
  const releaseId =
    getLibraryReleaseId(song);

  if (!image || !releaseId) {
    return;
  }

  try {
    const artworkUrl =
      await getLibraryArtwork(releaseId);

    if (image.isConnected) {
      image.src =
        safeLibraryImage(artworkUrl);
    }

  } catch (error) {
    console.warn(
      "Library artwork unavailable:",
      releaseId,
      error.message
    );

    // Keep existing legacy artwork or placeholder.
  }
}

/* =====================================================
   11. IMAGE HELPERS
===================================================== */

function safeLibraryImage(imageUrl) {
  if (
    typeof imageUrl !== "string" ||
    !imageUrl.trim()
  ) {
    return LIBRARY_PLACEHOLDER;
  }

  try {
    const parsed = new URL(
      imageUrl,
      window.location.href
    );

    if (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    ) {
      return parsed.href;
    }

  } catch {
    // Use placeholder.
  }

  return LIBRARY_PLACEHOLDER;
}

function addLibraryImageFallback(image) {
  image.addEventListener(
    "error",
    () => {
      if (
        image.src !== LIBRARY_PLACEHOLDER
      ) {
        image.src =
          LIBRARY_PLACEHOLDER;
      }
    }
  );
}

/* =====================================================
   12. LIKED SONGS
===================================================== */

function renderLikedSongs() {
  if (!likedSongsList) {
    return;
  }

  likedSongsList.innerHTML = "";

  const playableSongs =
    likedSongs
      .map(getLibrarySong)
      .filter(Boolean);

  if (!playableSongs.length) {
    showLibraryEmpty(
      likedSongsList,
      "You haven't liked any songs yet."
    );

    return;
  }

  const fragment =
    document.createDocumentFragment();

  playableSongs.forEach((song) => {
    const release =
      getLibraryRelease(song);

    const artistName =
      getLibraryArtistNames(
        song.primaryArtists
      );

    const row =
      document.createElement("div");

    row.className =
      "library-song-row";

    /* COVER IMAGE */

    const image =
      document.createElement("img");

    image.className =
      "library-song-cover";

    image.alt =
      song.title || "Song";

    image.loading = "lazy";

    image.src =
      safeLibraryImage(
        release.coverImage
      );

    addLibraryImageFallback(image);

    /* SONG INFORMATION */

    const main =
      document.createElement("div");

    main.className =
      "library-song-main";

    const title =
      document.createElement("h3");

    title.textContent =
      song.title || "Untitled";

    const artist =
      document.createElement("p");

    artist.textContent =
      artistName || "Artist";

    main.append(title, artist);

    /* RELEASE NAME */

    const releaseName =
      document.createElement("div");

    releaseName.className =
      "library-song-release";

    releaseName.textContent =
      release.title || "";

    /* PLAY BUTTON */

    const playButton =
      document.createElement("button");

    playButton.type = "button";

    playButton.className =
      "library-song-play";

    playButton.dataset.songId =
      song._id;

    playButton.setAttribute(
      "aria-label",
      `Play ${song.title || "song"}`
    );

    playButton.textContent = "▶";

    playButton.addEventListener(
      "click",
      () => {
        playLibrarySong(
          song._id,
          playableSongs
        );
      }
    );

    row.append(
      image,
      main,
      releaseName,
      playButton
    );

    fragment.appendChild(row);

    applyLibraryArtwork(image, song);
  });

  likedSongsList.appendChild(fragment);
}

/* =====================================================
   13. PLAY LIKED SONG
===================================================== */

function playLibrarySong(songId, songs) {
  if (typeof playSong !== "function") {
    console.error(
      "Music player is unavailable."
    );

    showLibraryMessage(
      "Music player is unavailable."
    );

    return;
  }

  const queue = songs.map((song) => ({
    ...song,
    releaseId: song.releaseId
  }));

  const selectedSong =
    queue.find((song) =>
      String(song._id) === String(songId)
    );

  if (!selectedSong) {
    return;
  }

  // player.js handles secure signed audio URLs.
  playSong(selectedSong, queue);
}

/* =====================================================
   14. FOLLOWED ARTISTS
===================================================== */

function renderFollowedArtists() {
  if (!followedArtistsGrid) {
    return;
  }

  followedArtistsGrid.innerHTML = "";

  const artists =
    followedArtists
      .map(getLibraryArtist)
      .filter(Boolean);

  if (!artists.length) {
    showLibraryEmpty(
      followedArtistsGrid,
      "You aren't following any artists yet."
    );

    return;
  }

  const fragment =
    document.createDocumentFragment();

  artists.forEach((artist) => {
    const card =
      document.createElement("div");

    card.className =
      "library-artist-card";

    card.style.cursor = "pointer";

    const image =
      document.createElement("img");

    image.src =
      safeLibraryImage(
        artist.profileImage
      );

    image.alt =
      artist.stageName || "Artist";

    image.loading = "lazy";

    addLibraryImageFallback(image);

    const name =
      document.createElement("h3");

    name.textContent =
      artist.stageName || "Artist";

    const description =
      document.createElement("p");

    description.textContent =
      artist.verified
        ? "Verified artist"
        : "Artist";

    card.append(
      image,
      name,
      description
    );

    card.addEventListener(
      "click",
      () => {
        sessionStorage.setItem(
          "selectedArtistId",
          artist._id
        );

        window.location.href =
          `artist.html?id=${encodeURIComponent(
            artist._id
          )}`;
      }
    );

    fragment.appendChild(card);
  });

  followedArtistsGrid.appendChild(fragment);
}

/* =====================================================
   15. PLAYLISTS
===================================================== */

function renderPlaylists() {
  if (!playlistsGrid) {
    return;
  }

  playlistsGrid.innerHTML = "";

  if (
    !Array.isArray(myPlaylists) ||
    !myPlaylists.length
  ) {
    showLibraryEmpty(
      playlistsGrid,
      "You haven't created any playlists yet."
    );

    return;
  }

  const fragment =
    document.createDocumentFragment();

  myPlaylists
    .slice(0, 6)
    .forEach((playlist) => {
      if (!playlist?._id) {
        return;
      }

      const songCount =
        Array.isArray(playlist.songs)
          ? playlist.songs.length
          : 0;

      const card =
        document.createElement("div");

      card.className =
        "library-playlist-card";

      card.style.cursor = "pointer";

      const cover =
        document.createElement("div");

      cover.className =
        "library-playlist-cover";

      const icon =
        document.createElement("span");

      icon.textContent = "♪";

      cover.appendChild(icon);

      const title =
        document.createElement("h3");

      title.textContent =
        playlist.name ||
        playlist.title ||
        "Playlist";

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

      card.addEventListener(
        "click",
        () => {
          window.location.href =
            `playlist.html?id=${encodeURIComponent(
              playlist._id
            )}`;
        }
      );

      fragment.appendChild(card);
    });

  playlistsGrid.appendChild(fragment);
}

/* =====================================================
   16. EMPTY SECTION MESSAGE
===================================================== */

function showLibraryEmpty(container, message) {
  const empty =
    document.createElement("div");

  empty.className = "library-empty";
  empty.textContent = message;

  container.appendChild(empty);
}

/* =====================================================
   17. ARTIST NAMES
===================================================== */

function getLibraryArtistNames(artists) {
  if (!Array.isArray(artists)) {
    return "";
  }

  return artists
    .map((artist) => {
      if (
        !artist ||
        typeof artist !== "object"
      ) {
        return "";
      }

      return (
        artist.stageName ||
        artist.fullName ||
        ""
      );
    })
    .filter(Boolean)
    .join(", ");
}

/* =====================================================
   18. HTML ESCAPING
===================================================== */

function escapeLibraryHTML(value) {
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
