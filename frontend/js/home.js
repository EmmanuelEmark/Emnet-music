
/* ========================================
   EMNET MUSIC - HOME PAGE
======================================== */

const welcomeName = document.getElementById("welcomeName");
const profileName = document.getElementById("profileName");
const profileRole = document.getElementById("profileRole");
const profileInitial = document.getElementById("profileInitial");

const newReleasesGrid = document.getElementById("newReleasesGrid");
const latestSongsList = document.getElementById("latestSongsList");
const featuredArtistsGrid = document.getElementById("featuredArtistsGrid");
const latestVideosGrid = document.getElementById("latestVideosGrid");
const homeMessage = document.getElementById("homeMessage");
const logoutButton = document.getElementById("logoutButton");

const HOME_PLACEHOLDER =
  "https://placehold.co/600x600/111612/35e67a?text=EmnetMusic";

const homeArtworkCache = new Map();
const homeThumbnailCache = new Map();

/* ========================================
   START PAGE
======================================== */

if (logoutButton) {
  logoutButton.addEventListener("click", logout);
}

startHomePage();

async function startHomePage() {
  try {
    if (typeof loadPlayerComponent === "function") {
      await loadPlayerComponent();
    }

    let user = null;

    if (isLoggedIn()) {
      user = await loadUser();
    }

    if (!user) {
      showGuestWelcome();
    }

    updateHomeNavigation(Boolean(user));

    await loadHomeContent();
  } catch (error) {
    console.error("Home initialization error:", error);

    showHomeMessage(
      "Some homepage features could not be loaded."
    );
  }
}

/* ========================================
   GUEST WELCOME
======================================== */

function showGuestWelcome() {
  if (welcomeName) {
    welcomeName.textContent = "Welcome to EmnetMusic";
  }

  if (profileName) {
    profileName.textContent = "Guest";
  }

  if (profileRole) {
    profileRole.textContent = "Visitor";
  }

  if (profileInitial) {
    profileInitial.textContent = "E";
  }
}

/* ========================================
   NAVIGATION
======================================== */

function updateHomeNavigation(loggedIn) {
  document.querySelectorAll("[data-auth-only]")
    .forEach((element) => {
      element.hidden = !loggedIn;
    });

  const guestLoginLink =
    document.getElementById("guestLoginLink");

  if (guestLoginLink) {
    guestLoginLink.hidden = loggedIn;
  }

  if (logoutButton) {
    logoutButton.hidden = !loggedIn;
  }

  const mobileGuestLoginLink =
    document.getElementById("mobileGuestLoginLink");

  if (mobileGuestLoginLink) {
    mobileGuestLoginLink.hidden = loggedIn;
  }

  const profileChip =
    document.querySelector(".profile-chip");

  if (profileChip) {
    profileChip.href =
      loggedIn ? "profile.html" : "login.html";

    profileChip.setAttribute(
      "aria-label",
      loggedIn
        ? "View profile"
        : "Log in to EmnetMusic"
    );
  }

  const welcomeLabel =
    document.querySelector(".welcome-label");

  if (welcomeLabel) {
    welcomeLabel.textContent = loggedIn
      ? "WELCOME BACK"
      : "WELCOME TO EMNETMUSIC";
  }
}

/* ========================================
   CURRENT USER
======================================== */

async function loadUser() {
  const user = await getCurrentUser({
    redirectOnFailure: false
  });

  if (!user) {
    return null;
  }

  const firstName = user.fullName
    ? user.fullName.split(" ")[0]
    : "Listener";

  if (welcomeName) {
    welcomeName.textContent =
      `Good to see you, ${firstName}`;
  }

  if (profileName) {
    profileName.textContent =
      user.fullName || "Account";
  }

  if (profileRole) {
    profileRole.textContent =
      user.role || "listener";
  }

  if (profileInitial) {
    profileInitial.textContent =
      firstName.charAt(0).toUpperCase();
  }

  return user;
}

/* ========================================
   LOAD HOME CONTENT
======================================== */

async function loadHomeContent() {
  try {
    const token = getToken();

    const response = await fetch(
      `${API_BASE_URL}/home`,
      {
        headers: token
          ? {
              Authorization: `Bearer ${token}`
            }
          : {}
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to load home content."
      );
    }

    const home = data.home || {};

    renderReleases(home.newReleases || []);

    renderSongs(
      home.latestSongs || [],
      latestSongsList
    );

    const latestSongsSection =
      latestSongsList?.closest("section");

    if (latestSongsSection) {
      const trendingSection =
        createDiscoverySection(
          "Trending Songs",
          "trendingSongsList",
          home.trendingSongs || [],
          latestSongsSection
        );

      createDiscoverySection(
        "Recommended Songs",
        "recommendedSongsList",
        home.recommendedSongs || [],
        trendingSection || latestSongsSection
      );
    }

    renderArtists(home.featuredArtists || []);
    renderVideos(home.latestVideos || []);

  } catch (error) {
    console.error("Home content error:", error);

    showHomeMessage(
      "Unable to load EmnetMusic content."
    );
  }
}

/* ========================================
   SECURE MEDIA HELPERS
======================================== */

function getDocumentId(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    return value._id || value.id || null;
  }

  return null;
}

function getReleaseId(release) {
  return getDocumentId(release);
}

function safeImage(imageUrl) {
  if (
    typeof imageUrl !== "string" ||
    !imageUrl.trim()
  ) {
    return HOME_PLACEHOLDER;
  }

  try {
    const url = new URL(
      imageUrl,
      window.location.href
    );

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return HOME_PLACEHOLDER;
    }

    return url.href;
  } catch {
    return HOME_PLACEHOLDER;
  }
}

function createImage(
  className,
  altText,
  fallbackUrl = null
) {
  const image = document.createElement("img");

  if (className) {
    image.className = className;
  }

  image.alt = altText || "EmnetMusic artwork";
  image.loading = "lazy";
  image.src = safeImage(fallbackUrl);

  image.addEventListener("error", () => {
    if (image.src !== HOME_PLACEHOLDER) {
      image.src = HOME_PLACEHOLDER;
    }
  });

  return image;
}

function getMediaUrlFromResponse(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  return (
    data.mediaUrl ||
    data.playbackUrl ||
    data.url ||
    null
  );
}

async function fetchSecureImage(path) {
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(
      `Media request failed: ${response.status}`
    );
  }

  const data = await response.json();

  const url = getMediaUrlFromResponse(data);

  if (!url) {
    throw new Error(
      "Media response did not contain a URL."
    );
  }

  return {
    url,
    expiresIn: data.expiresIn
  };
}

async function resolveSecureImage(
  cache,
  cacheKey,
  endpoint
) {
  const existing = cache.get(cacheKey);

  if (
    existing &&
    (
      existing.expiresAt === null ||
      Date.now() < existing.expiresAt
    )
  ) {
    return existing.url;
  }

  const result = await fetchSecureImage(endpoint);

  const expiresAt =
    typeof result.expiresIn === "number" &&
    result.expiresIn > 0
      ? Date.now() +
        Math.max(result.expiresIn - 30, 0) * 1000
      : null;

  cache.set(cacheKey, {
    url: result.url,
    expiresAt
  });

  return result.url;
}

/* ========================================
   RELEASE ARTWORK
======================================== */

async function applyReleaseArtwork(
  image,
  release
) {
  const releaseId = getReleaseId(release);

  const fallback =
    release &&
    typeof release === "object"
      ? release.coverImage
      : null;

  image.src = safeImage(fallback);

  if (!releaseId) {
    return;
  }

  try {
    const url = await resolveSecureImage(
      homeArtworkCache,
      releaseId,
      `/media/releases/${encodeURIComponent(
        releaseId
      )}/artwork`
    );

    if (image.isConnected) {
      image.src = safeImage(url);
    }
  } catch (error) {
    console.warn(
      "Release artwork unavailable:",
      releaseId,
      error.message
    );
  }
}

/* ========================================
   VIDEO THUMBNAILS
======================================== */

async function applyVideoThumbnail(
  image,
  video
) {
  const videoId = getDocumentId(video);

  image.src = safeImage(
    video?.thumbnailUrl
  );

  if (!videoId) {
    return;
  }

  try {
    const url = await resolveSecureImage(
      homeThumbnailCache,
      videoId,
      `/media/videos/${encodeURIComponent(
        videoId
      )}/thumbnail`
    );

    if (image.isConnected) {
      image.src = safeImage(url);
    }
  } catch (error) {
    console.warn(
      "Video thumbnail unavailable:",
      videoId,
      error.message
    );
  }
}

/* ========================================
   RELEASES
======================================== */

function renderReleases(releases) {
  if (!newReleasesGrid) {
    return;
  }

  newReleasesGrid.innerHTML = "";

  if (!releases.length) {
    newReleasesGrid.innerHTML = `
      <div class="empty-state">
        No new releases yet.
      </div>
    `;

    return;
  }

  releases.forEach((release) => {
    const card = document.createElement("div");

    card.className = "release-card";
    card.style.cursor = "pointer";

    const artistName = getArtistNames(
      release.primaryArtists
    );

    const cover = document.createElement("div");
    cover.className = "release-cover";

    const image = createImage(
      "",
      release.title || "Release",
      release.coverImage
    );

    cover.appendChild(image);

    const playIcon = document.createElement("div");
    playIcon.className = "release-play";
    playIcon.textContent = "▶";

    cover.appendChild(playIcon);

    const title = document.createElement("h3");
    title.textContent =
      release.title || "Untitled";

    const artist = document.createElement("p");
    artist.textContent =
      artistName ||
      release.releaseType ||
      "Release";

    card.append(cover, title, artist);

    card.addEventListener("click", () => {
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
    });

    newReleasesGrid.appendChild(card);

    applyReleaseArtwork(image, release);
  });
}

/* ========================================
   SONGS
======================================== */

function renderSongs(
  songs,
  targetList = latestSongsList
) {
  if (!targetList) {
    return;
  }

  targetList.innerHTML = "";

  if (!songs.length) {
    targetList.innerHTML = `
      <div class="empty-state">
        No songs available yet.
      </div>
    `;

    return;
  }

  songs.forEach((song) => {
    const row = document.createElement("div");
    row.className = "song-row";

    const release = song.releaseId || {};

    const artistName = getArtistNames(
      song.primaryArtists
    );

    const image = createImage(
      "song-cover",
      song.title || "Song",
      release?.coverImage
    );

    const main = document.createElement("div");
    main.className = "song-main";

    const title = document.createElement("h3");
    title.textContent = song.title || "Untitled";

    const artist = document.createElement("p");
    artist.textContent = artistName || "Artist";

    main.append(title, artist);

    const releaseName =
      document.createElement("div");

    releaseName.className = "song-release";

    releaseName.textContent =
      typeof release === "object"
        ? release.title || ""
        : "";

    const playButton =
      document.createElement("button");

    playButton.type = "button";
    playButton.className = "song-play-button";
    playButton.textContent = "▶";

    playButton.setAttribute(
      "aria-label",
      `Play ${song.title || "song"}`
    );

    playButton.addEventListener("click", () => {
      if (typeof playSong !== "function") {
        console.error(
          "Music player is not available."
        );

        return;
      }

      playSong(song, songs);
    });

    row.append(
      image,
      main,
      releaseName,
      playButton
    );

    targetList.appendChild(row);

    applyReleaseArtwork(image, release);
  });
}

/* ========================================
   TRENDING AND RECOMMENDED SONGS
======================================== */

function createDiscoverySection(
  title,
  listId,
  songs,
  afterSection
) {
  if (!afterSection) {
    return null;
  }

  let section = document.getElementById(
    `${listId}Section`
  );

  if (!section) {
    section = document.createElement("section");

    section.id = `${listId}Section`;
    section.className =
      afterSection.className || "content-section";

    const headingContainer =
      document.createElement("div");

    headingContainer.className =
      "section-heading";

    const headingGroup =
      document.createElement("div");

    const sectionLabel =
      document.createElement("p");

    sectionLabel.className = "section-label";
    sectionLabel.textContent =
      "DISCOVER MORE MUSIC";

    const heading =
      document.createElement("h2");

    heading.textContent = title;

    headingGroup.append(
      sectionLabel,
      heading
    );

    headingContainer.appendChild(headingGroup);

    const list =
      document.createElement("div");

    list.id = listId;
    list.className =
      latestSongsList?.className || "song-list";

    section.append(
      headingContainer,
      list
    );

    afterSection.insertAdjacentElement(
      "afterend",
      section
    );
  }

  const targetList =
    document.getElementById(listId);

  renderSongs(songs, targetList);

  return section;
}

/* ========================================
   FEATURED ARTISTS
======================================== */

function renderArtists(artists) {
  if (!featuredArtistsGrid) {
    return;
  }

  featuredArtistsGrid.innerHTML = "";

  if (!artists.length) {
    featuredArtistsGrid.innerHTML = `
      <div class="empty-state">
        Featured artists will appear here.
      </div>
    `;

    return;
  }

  artists.forEach((artist) => {
    const card = document.createElement("div");

    card.className = "artist-card";
    card.style.cursor = "pointer";

    const image = createImage(
      "artist-image",
      artist.stageName || "Artist",
      artist.profileImage
    );

    const title = document.createElement("h3");
    title.textContent =
      artist.stageName || "Artist";

    const description =
      document.createElement("p");

    description.textContent = artist.verified
      ? "Verified artist"
      : "Artist";

    card.append(
      image,
      title,
      description
    );

    card.addEventListener("click", () => {
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
    });

    featuredArtistsGrid.appendChild(card);
  });
}

/* ========================================
   VIDEOS
======================================== */

function renderVideos(videos) {
  if (!latestVideosGrid) {
    return;
  }

  latestVideosGrid.innerHTML = "";

  if (!videos.length) {
    latestVideosGrid.innerHTML = `
      <div class="empty-state">
        No videos available yet.
      </div>
    `;

    return;
  }

  videos.forEach((video) => {
    const card = document.createElement("div");

    card.className = "video-card";
    card.style.cursor = "pointer";

    const artistName = getArtistNames(
      video.primaryArtists
    );

    const thumbnail =
      document.createElement("div");

    thumbnail.className = "video-thumbnail";

    const image = createImage(
      "",
      video.title || "Video",
      video.thumbnailUrl
    );

    thumbnail.appendChild(image);

    const playOverlay =
      document.createElement("div");

    playOverlay.className = "video-play";

    const playIcon =
      document.createElement("span");

    playIcon.textContent = "▶";

    playOverlay.appendChild(playIcon);
    thumbnail.appendChild(playOverlay);

    const title = document.createElement("h3");
    title.textContent =
      video.title || "Video";

    const artist = document.createElement("p");
    artist.textContent =
      artistName ||
      video.videoType ||
      "Video";

    card.append(
      thumbnail,
      title,
      artist
    );

    card.addEventListener("click", () => {
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
    });

    latestVideosGrid.appendChild(card);

    applyVideoThumbnail(image, video);
  });
}

/* ========================================
   ARTIST NAMES
======================================== */

function getArtistNames(artists) {
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

/* ========================================
   HTML ESCAPING
======================================== */

function escapeHTML(value) {
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

/* ========================================
   HOME MESSAGES
======================================== */

function showHomeMessage(message) {
  if (homeMessage) {
    homeMessage.textContent = message;
  }
}
