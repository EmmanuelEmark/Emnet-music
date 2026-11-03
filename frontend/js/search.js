
/* ==========================================================
   EMNET MUSIC — AUTHENTICATED SEARCH
   Songs, Artists, Releases and Videos
   Secure Cloudflare R2 Artwork and Thumbnails
========================================================== */

/* ==========================================================
   1. AUTHENTICATION
========================================================== */

const searchPageAuthorized =
  typeof protectPage === "function"
    ? protectPage()
    : Boolean(
        typeof getToken === "function"
          ? getToken()
          : localStorage.getItem("token")
      );

/* ==========================================================
   2. PAGE ELEMENTS
========================================================== */

const searchInput =
  document.getElementById("searchInput");

const clearSearchButton =
  document.getElementById("clearSearchButton");

const searchHelper =
  document.getElementById("searchHelper");

const searchEmptyScreen =
  document.getElementById("searchEmptyScreen");

const searchResults =
  document.getElementById("searchResults");

const songResults =
  document.getElementById("songResults");

const artistResults =
  document.getElementById("artistResults");

const releaseResults =
  document.getElementById("releaseResults");

const videoResults =
  document.getElementById("videoResults");

const songResultsSection =
  document.getElementById("songResultsSection");

const artistResultsSection =
  document.getElementById("artistResultsSection");

const releaseResultsSection =
  document.getElementById("releaseResultsSection");

const videoResultsSection =
  document.getElementById("videoResultsSection");

const noSearchResults =
  document.getElementById("noSearchResults");

const logoutButton =
  document.getElementById("logoutButton");

const profileInitial =
  document.getElementById("profileInitial");

/* ==========================================================
   3. STATE
========================================================== */

let searchTimer = null;
let searchRequestController = null;
let searchRequestSequence = 0;

let currentSearchSongs = [];

const SEARCH_PLACEHOLDER =
  "https://placehold.co/600x600/111612/35e67a?text=EmnetMusic";

const SEARCH_VIDEO_PLACEHOLDER =
  "https://placehold.co/1280x720/111612/35e67a?text=EmnetMusic";

const searchArtworkCache = new Map();
const searchThumbnailCache = new Map();

/* ==========================================================
   4. START SEARCH PAGE
========================================================== */

if (searchPageAuthorized) {
  startSearchPage();
}

async function startSearchPage() {
  try {
    const user = await loadSearchUser();

    if (!user) {
      return;
    }

    if (typeof loadPlayerComponent === "function") {
      await loadPlayerComponent();
    }

    setupSearchEvents();

  } catch (error) {
    console.error(
      "Search initialization error:",
      error
    );

    setSearchHelper(
      "Unable to initialize search."
    );
  }
}

/* ==========================================================
   5. LOAD CURRENT USER
========================================================== */

async function loadSearchUser() {
  if (typeof getCurrentUser !== "function") {
    setSearchHelper(
      "Authentication service is unavailable."
    );

    return null;
  }

  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const firstName =
    user.fullName
      ? user.fullName.trim().split(/\s+/)[0]
      : "E";

  if (profileInitial) {
    profileInitial.textContent =
      firstName.charAt(0).toUpperCase();
  }

  return user;
}

/* ==========================================================
   6. LOGOUT
========================================================== */

if (
  logoutButton &&
  typeof logout === "function"
) {
  logoutButton.addEventListener(
    "click",
    logout
  );
}

/* ==========================================================
   7. SEARCH EVENTS
========================================================== */

function setupSearchEvents() {
  if (searchInput) {
    searchInput.addEventListener(
      "input",
      handleSearchInput
    );
  }

  if (clearSearchButton) {
    clearSearchButton.addEventListener(
      "click",
      clearSearch
    );
  }
}

function handleSearchInput() {
  const query =
    searchInput.value.trim();

  clearTimeout(searchTimer);

  cancelActiveSearch();

  if (!query) {
    resetSearchPage();
    return;
  }

  setSearchHelper(
    `Searching for "${query}"...`
  );

  searchTimer = setTimeout(() => {
    searchEmnetMusic(query);
  }, 350);
}

function clearSearch() {
  if (!searchInput) return;

  searchInput.value = "";
  searchInput.focus();

  clearTimeout(searchTimer);

  cancelActiveSearch();
  resetSearchPage();
}

function cancelActiveSearch() {
  searchRequestSequence += 1;

  if (searchRequestController) {
    searchRequestController.abort();
    searchRequestController = null;
  }
}

/* ==========================================================
   8. SEARCH BACKEND
========================================================== */

async function searchEmnetMusic(query) {
  const requestId =
    ++searchRequestSequence;

  const controller =
    new AbortController();

  searchRequestController = controller;

  try {
    const token =
      typeof getToken === "function"
        ? getToken()
        : localStorage.getItem("token");

    if (!token) {
      redirectSearchLogin();
      return;
    }

    const response = await fetch(
      `${API_BASE_URL}/search?q=${encodeURIComponent(
        query
      )}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        },
        signal: controller.signal
      }
    );

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      redirectSearchLogin();
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Search failed."
      );
    }

    if (
      requestId !== searchRequestSequence
    ) {
      return;
    }

    const results =
      data.results || data;

    const songs =
      Array.isArray(results.songs)
        ? results.songs
        : [];

    const artists =
      Array.isArray(results.artists)
        ? results.artists
        : [];

    const releases =
      Array.isArray(results.releases)
        ? results.releases
        : [];

    const videos =
      Array.isArray(results.videos)
        ? results.videos
        : [];

    // Preserve release information for player.js.
    currentSearchSongs = songs.map((song) => ({
      ...song,
      releaseId: song.releaseId
    }));

    renderSearchSongs(currentSearchSongs);
    renderSearchArtists(artists);
    renderSearchReleases(releases);
    renderSearchVideos(videos);

    const totalResults =
      songs.length +
      artists.length +
      releases.length +
      videos.length;

    if (searchEmptyScreen) {
      searchEmptyScreen.style.display = "none";
    }

    if (searchResults) {
      searchResults.classList.add("active");
    }

    if (noSearchResults) {
      noSearchResults.classList.toggle(
        "active",
        totalResults === 0
      );
    }

    setSearchHelper(
      totalResults
        ? `${totalResults} result${
            totalResults === 1 ? "" : "s"
          } found`
        : "No matching results found."
    );

  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    if (
      requestId !== searchRequestSequence
    ) {
      return;
    }

    console.error(
      "Search error:",
      error
    );

    setSearchHelper(
      "Unable to search EmnetMusic."
    );

  } finally {
    if (
      searchRequestController === controller
    ) {
      searchRequestController = null;
    }
  }
}

function redirectSearchLogin() {
  window.location.href =
    `login.html?redirect=${encodeURIComponent(
      window.location.pathname +
      window.location.search
    )}`;
}

/* ==========================================================
   9. SECURE MEDIA REQUESTS
========================================================== */

async function requestSearchMedia(endpoint) {
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ||
      "Unable to load media."
    );
  }

  const mediaUrl =
    data.mediaUrl ||
    data.playbackUrl;

  if (!mediaUrl) {
    throw new Error(
      "Media URL was not returned."
    );
  }

  return {
    url: mediaUrl,
    expiresIn: data.expiresIn
  };
}

async function resolveSearchMedia(
  cache,
  mediaId,
  endpoint
) {
  const cached = cache.get(mediaId);

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
    await requestSearchMedia(endpoint);

  const expiresAt =
    Number.isFinite(result.expiresIn) &&
    result.expiresIn > 0
      ? Date.now() +
        Math.max(
          result.expiresIn - 30,
          0
        ) * 1000
      : null;

  cache.set(mediaId, {
    url: result.url,
    expiresAt
  });

  return result.url;
}

/* ==========================================================
   10. SECURE RELEASE ARTWORK
========================================================== */

async function applySearchReleaseArtwork(
  image,
  release
) {
  const releaseId =
    typeof release === "string"
      ? release
      : release?._id;

  if (!image || !releaseId) {
    return;
  }

  try {
    const url = await resolveSearchMedia(
      searchArtworkCache,
      releaseId,
      `/media/releases/${encodeURIComponent(
        releaseId
      )}/artwork`
    );

    if (image.isConnected) {
      image.src = safeSearchImage(url);
    }

  } catch (error) {
    console.warn(
      "Search release artwork unavailable:",
      releaseId,
      error.message
    );
  }
}

/* ==========================================================
   11. SECURE VIDEO THUMBNAILS
========================================================== */

async function applySearchVideoThumbnail(
  image,
  video
) {
  if (!image || !video?._id) {
    return;
  }

  try {
    const url = await resolveSearchMedia(
      searchThumbnailCache,
      video._id,
      `/media/videos/${encodeURIComponent(
        video._id
      )}/thumbnail`
    );

    if (image.isConnected) {
      image.src = safeSearchImage(url);
    }

  } catch (error) {
    console.warn(
      "Search video thumbnail unavailable:",
      video._id,
      error.message
    );
  }
}

/* ==========================================================
   12. SONG RESULTS
========================================================== */

function renderSearchSongs(songs) {
  if (!songResults) return;

  songResults.innerHTML = "";

  if (songResultsSection) {
    songResultsSection.style.display =
      songs.length ? "" : "none";
  }

  const fragment =
    document.createDocumentFragment();

  songs.forEach((song) => {
    const row =
      document.createElement("div");

    row.className = "search-song-row";

    const release =
      song.releaseId || {};

    const artistName =
      getSearchArtistNames(
        song.primaryArtists
      );

    const image =
      document.createElement("img");

    image.className =
      "search-song-cover";

    image.alt =
      song.title || "Song";

    image.loading = "lazy";

    image.src =
      safeSearchImage(
        typeof release === "object"
          ? release.coverImage
          : null
      );

    addSearchImageFallback(image);

    const info =
      document.createElement("div");

    info.className =
      "search-song-info";

    const title =
      document.createElement("h3");

    title.textContent =
      song.title || "Untitled";

    const artist =
      document.createElement("p");

    artist.textContent =
      artistName || "Artist";

    info.append(title, artist);

    const releaseName =
      document.createElement("div");

    releaseName.className =
      "search-release-name";

    releaseName.textContent =
      typeof release === "object"
        ? release.title || ""
        : "";

    const playButton =
      document.createElement("button");

    playButton.type = "button";
    playButton.className =
      "search-play-button";

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
        if (typeof playSong !== "function") {
          console.error(
            "Music player unavailable."
          );

          return;
        }

        playSong(
          song,
          currentSearchSongs
        );
      }
    );

    row.append(
      image,
      info,
      releaseName,
      playButton
    );

    fragment.appendChild(row);

    applySearchReleaseArtwork(
      image,
      release
    );
  });

  songResults.appendChild(fragment);
}

/* ==========================================================
   13. ARTIST RESULTS
========================================================== */

function renderSearchArtists(artists) {
  if (!artistResults) return;

  artistResults.innerHTML = "";

  if (artistResultsSection) {
    artistResultsSection.style.display =
      artists.length ? "" : "none";
  }

  const fragment =
    document.createDocumentFragment();

  artists.forEach((artist) => {
    const card =
      document.createElement("div");

    card.className =
      "search-artist-card";

    card.style.cursor = "pointer";

    const image =
      document.createElement("img");

    image.src =
      safeSearchImage(
        artist.profileImage
      );

    image.alt =
      artist.stageName || "Artist";

    image.loading = "lazy";

    addSearchImageFallback(image);

    const title =
      document.createElement("h3");

    title.textContent =
      artist.stageName || "Artist";

    const description =
      document.createElement("p");

    description.textContent =
      artist.verified
        ? "Verified artist"
        : "Artist";

    card.append(
      image,
      title,
      description
    );

    card.addEventListener(
      "click",
      () => {
        if (!artist._id) {
          return;
        }

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

  artistResults.appendChild(fragment);
}

/* ==========================================================
   14. RELEASE RESULTS
========================================================== */

function renderSearchReleases(releases) {
  if (!releaseResults) return;

  releaseResults.innerHTML = "";

  if (releaseResultsSection) {
    releaseResultsSection.style.display =
      releases.length ? "" : "none";
  }

  const fragment =
    document.createDocumentFragment();

  releases.forEach((release) => {
    const card =
      document.createElement("div");

    card.className =
      "search-release-card";

    card.style.cursor = "pointer";

    const image =
      document.createElement("img");

    image.src =
      safeSearchImage(
        release.coverImage
      );

    image.alt =
      release.title || "Release";

    image.loading = "lazy";

    addSearchImageFallback(image);

    const title =
      document.createElement("h3");

    title.textContent =
      release.title || "Untitled";

    const artist =
      document.createElement("p");

    artist.textContent =
      getSearchArtistNames(
        release.primaryArtists
      ) ||
      release.releaseType ||
      "Release";

    card.append(
      image,
      title,
      artist
    );

    card.addEventListener(
      "click",
      () => {
        if (!release._id) {
          return;
        }

        window.location.href =
          `release.html?id=${encodeURIComponent(
            release._id
          )}`;
      }
    );

    fragment.appendChild(card);

    applySearchReleaseArtwork(
      image,
      release
    );
  });

  releaseResults.appendChild(fragment);
}

/* ==========================================================
   15. VIDEO RESULTS
========================================================== */

function renderSearchVideos(videos) {
  if (!videoResults) return;

  videoResults.innerHTML = "";

  if (videoResultsSection) {
    videoResultsSection.style.display =
      videos.length ? "" : "none";
  }

  const fragment =
    document.createDocumentFragment();

  videos.forEach((video) => {
    const card =
      document.createElement("div");

    card.className =
      "search-video-card";

    card.style.cursor = "pointer";

    const artistName =
      getSearchArtistNames(
        video.primaryArtists
      );

    const thumbnail =
      document.createElement("div");

    thumbnail.className =
      "search-video-thumbnail";

    const image =
      document.createElement("img");

    image.src =
      safeSearchImage(
        video.thumbnailUrl
      );

    image.alt =
      video.title || "Video";

    image.loading = "lazy";

    addSearchImageFallback(image);

    thumbnail.appendChild(image);

    const overlay =
      document.createElement("div");

    overlay.className =
      "search-video-play";

    const playIcon =
      document.createElement("span");

    playIcon.textContent = "▶";

    overlay.appendChild(playIcon);
    thumbnail.appendChild(overlay);

    const title =
      document.createElement("h3");

    title.textContent =
      video.title || "Video";

    const description =
      document.createElement("p");

    description.textContent =
      artistName ||
      video.videoType ||
      "Video";

    card.append(
      thumbnail,
      title,
      description
    );

    card.addEventListener(
      "click",
      () => {
        if (!video._id) {
          return;
        }

        window.location.href =
          `video.html?id=${encodeURIComponent(
            video._id
          )}`;
      }
    );

    fragment.appendChild(card);

    applySearchVideoThumbnail(
      image,
      video
    );
  });

  videoResults.appendChild(fragment);
}

/* ==========================================================
   16. RESET SEARCH
========================================================== */

function resetSearchPage() {
  setSearchHelper(
    "Find music, artists and videos across EmnetMusic."
  );

  if (searchEmptyScreen) {
    searchEmptyScreen.style.display = "";
  }

  if (searchResults) {
    searchResults.classList.remove(
      "active"
    );
  }

  if (noSearchResults) {
    noSearchResults.classList.remove(
      "active"
    );
  }

  currentSearchSongs = [];

  if (songResults) {
    songResults.innerHTML = "";
  }

  if (artistResults) {
    artistResults.innerHTML = "";
  }

  if (releaseResults) {
    releaseResults.innerHTML = "";
  }

  if (videoResults) {
    videoResults.innerHTML = "";
  }
}

/* ==========================================================
   17. ARTIST NAMES
========================================================== */

function getSearchArtistNames(artists) {
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

/* ==========================================================
   18. SAFE IMAGE URL
========================================================== */

function safeSearchImage(imageUrl) {
  if (
    typeof imageUrl !== "string" ||
    !imageUrl.trim()
  ) {
    return SEARCH_PLACEHOLDER;
  }

  try {
    const parsed = new URL(
      imageUrl,
      window.location.href
    );

    if (
      parsed.protocol === "https:" ||
      parsed.protocol === "http:"
    ) {
      return parsed.href;
    }

  } catch {
    // Use placeholder.
  }

  return SEARCH_PLACEHOLDER;
}

function addSearchImageFallback(image) {
  image.addEventListener(
    "error",
    () => {
      const fallback =
        image.closest(
          ".search-video-thumbnail"
        )
          ? SEARCH_VIDEO_PLACEHOLDER
          : SEARCH_PLACEHOLDER;

      if (image.src !== fallback) {
        image.src = fallback;
      }
    }
  );
}

/* ==========================================================
   19. HELPER TEXT
========================================================== */

function setSearchHelper(message) {
  if (searchHelper) {
    searchHelper.textContent = message;
  }
}

/* ==========================================================
   20. ESCAPE HTML
========================================================== */

function escapeSearchHTML(value) {
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
