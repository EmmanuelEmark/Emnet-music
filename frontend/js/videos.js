
/* =====================================================
   EMNET MUSIC — VIDEOS PAGE
   Public Videos + Secure Cloudflare R2 Thumbnails
===================================================== */

/* =====================================================
   1. ELEMENTS
===================================================== */

const videosGrid =
  document.getElementById("videosGrid");

const videosLoading =
  document.getElementById("videosLoading");

const videosError =
  document.getElementById("videosError");

const videosEmpty =
  document.getElementById("videosEmpty");

const logoutButton =
  document.getElementById("logoutButton");

const guestLoginLink =
  document.getElementById("guestLoginLink");

/* =====================================================
   2. STATE
===================================================== */

let allVideos = [];

const VIDEO_PLACEHOLDER =
  "https://placehold.co/1280x720/111612/35e67a?text=EmnetMusic";

const videoThumbnailCache = new Map();

/* =====================================================
   3. START PAGE
===================================================== */

// Guests are allowed to browse and watch approved videos.
// Do not call protectPage() on this public page.

startVideosPage();

async function startVideosPage() {
  updateVideosNavigation();

  if (typeof loadPlayerComponent === "function") {
    try {
      await loadPlayerComponent();
    } catch (error) {
      console.warn(
        "Music player component could not load:",
        error
      );
    }
  }

  await loadVideos();
}

/* =====================================================
   4. AUTHENTICATION & NAVIGATION
===================================================== */

function getVideosToken() {
  if (typeof getToken === "function") {
    return getToken();
  }

  return localStorage.getItem("token");
}

function updateVideosNavigation() {
  const loggedIn = Boolean(getVideosToken());

  // Hide account-only links from guests.
  document
    .querySelectorAll("[data-auth-only]")
    .forEach((element) => {
      element.hidden = !loggedIn;
    });

  if (logoutButton) {
    logoutButton.hidden = !loggedIn;
  }

  if (guestLoginLink) {
    guestLoginLink.hidden = loggedIn;

    guestLoginLink.href =
      `login.html?redirect=${encodeURIComponent(
        window.location.pathname +
        window.location.search
      )}`;
  }

  const mobileGuestLoginLink =
    document.getElementById(
      "mobileGuestLoginLink"
    );

  if (mobileGuestLoginLink) {
    mobileGuestLoginLink.hidden = loggedIn;
  }

  const profileChip =
    document.querySelector(".profile-chip");

  if (profileChip) {
    profileChip.href = loggedIn
      ? "profile.html"
      : "login.html";
  }
}

if (logoutButton) {
  logoutButton.addEventListener(
    "click",
    logout
  );
}

/* =====================================================
   5. LOAD VIDEOS
===================================================== */

async function loadVideos() {
  try {
    if (videosLoading) {
      videosLoading.style.display = "";
    }

    if (videosError) {
      videosError.style.display = "none";
      videosError.textContent = "";
    }

    if (videosEmpty) {
      videosEmpty.style.display = "none";
    }

    const response = await fetch(
      `${API_BASE_URL}/videos`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to load videos."
      );
    }

    const videos = Array.isArray(data.videos)
      ? data.videos
      : [];

    // Display only approved and publicly visible videos.
    allVideos = videos.filter((video) => {
      return (
        video &&
        video._id &&
        video.status === "approved" &&
        (
          video.visibilityStatus === "visible" ||
          video.visibilityStatus == null
        )
      );
    });

    if (videosLoading) {
      videosLoading.style.display = "none";
    }

    renderVideos();

  } catch (error) {
    console.error(
      "Videos page error:",
      error
    );

    if (videosLoading) {
      videosLoading.style.display = "none";
    }

    if (videosError) {
      videosError.style.display = "block";

      videosError.textContent =
        error.message ||
        "Unable to load videos.";
    }
  }
}

/* =====================================================
   6. RENDER VIDEOS
===================================================== */

function renderVideos() {
  if (!videosGrid) {
    return;
  }

  videosGrid.innerHTML = "";

  if (videosEmpty) {
    videosEmpty.style.display = "none";
  }

  if (!allVideos.length) {
    if (videosEmpty) {
      videosEmpty.style.display = "block";
    }

    return;
  }

  const fragment =
    document.createDocumentFragment();

  allVideos.forEach((video) => {
    const card =
      document.createElement("div");

    card.className = "video-list-card";
    card.style.cursor = "pointer";

    const artistName =
      getVideoArtistNames(
        video.primaryArtists
      );

    /* THUMBNAIL */

    const thumbnailWrapper =
      document.createElement("div");

    thumbnailWrapper.className =
      "video-list-thumbnail";

    const image =
      document.createElement("img");

    image.alt =
      video.title || "Video";

    image.loading = "lazy";

    image.src =
      safeVideoImage(
        video.thumbnailUrl
      );

    image.addEventListener("error", () => {
      if (image.src !== VIDEO_PLACEHOLDER) {
        image.src = VIDEO_PLACEHOLDER;
      }
    });

    thumbnailWrapper.appendChild(image);

    /* PLAY OVERLAY */

    const overlay =
      document.createElement("div");

    overlay.className =
      "video-list-overlay";

    const playIcon =
      document.createElement("div");

    playIcon.className =
      "video-list-play";

    playIcon.textContent = "▶";

    overlay.appendChild(playIcon);
    thumbnailWrapper.appendChild(overlay);

    /* VIDEO TITLE */

    const title =
      document.createElement("h3");

    title.textContent =
      video.title || "Untitled video";

    /* ARTIST */

    const artist =
      document.createElement("p");

    artist.textContent =
      artistName || "Artist";

    /* VIDEO METADATA */

    const metadata =
      document.createElement("div");

    metadata.className =
      "video-list-meta";

    const type =
      document.createElement("span");

    type.className =
      "video-list-type";

    type.textContent =
      video.videoType || "Music video";

    metadata.appendChild(type);

    if (
      typeof video.viewCount === "number"
    ) {
      const separator =
        document.createElement("span");

      separator.textContent = "•";

      const views =
        document.createElement("span");

      views.textContent =
        `${formatViews(
          video.viewCount
        )} views`;

      metadata.appendChild(separator);
      metadata.appendChild(views);
    }

    /* BUILD CARD */

    card.appendChild(thumbnailWrapper);
    card.appendChild(title);
    card.appendChild(artist);
    card.appendChild(metadata);

    /* OPEN VIDEO */

    card.addEventListener("click", () => {
      window.location.href =
        `/video?id=${encodeURIComponent(
          video._id
        )}`;
    });

    fragment.appendChild(card);

    /* LOAD SECURE THUMBNAIL */

    loadSecureVideoThumbnail(
      image,
      video
    );
  });

  videosGrid.appendChild(fragment);
}

/* =====================================================
   7. SECURE VIDEO THUMBNAILS
===================================================== */

async function requestSecureThumbnail(videoId) {
  const response = await fetch(
    `${API_BASE_URL}/media/videos/${encodeURIComponent(
      videoId
    )}/thumbnail`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message ||
      "Unable to load video thumbnail."
    );
  }

  const thumbnailUrl =
    data.mediaUrl ||
    data.playbackUrl ||
    null;

  if (!thumbnailUrl) {
    throw new Error(
      "Thumbnail URL was not returned."
    );
  }

  return {
    url: thumbnailUrl,
    expiresIn: data.expiresIn
  };
}

async function getCachedVideoThumbnail(videoId) {
  const cached =
    videoThumbnailCache.get(videoId);

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
    await requestSecureThumbnail(videoId);

  const expiresAt =
    typeof result.expiresIn === "number" &&
    result.expiresIn > 0
      ? Date.now() +
        Math.max(
          result.expiresIn - 30,
          0
        ) * 1000
      : null;

  videoThumbnailCache.set(videoId, {
    url: result.url,
    expiresAt
  });

  return result.url;
}

async function loadSecureVideoThumbnail(
  image,
  video
) {
  if (
    !image ||
    !video ||
    !video._id
  ) {
    return;
  }

  try {
    const url =
      await getCachedVideoThumbnail(
        video._id
      );

    if (image.isConnected) {
      image.src = safeVideoImage(url);
    }

  } catch (error) {
    console.warn(
      "Secure thumbnail unavailable:",
      video._id,
      error.message
    );

    // Existing thumbnail or placeholder remains.
  }
}

/* =====================================================
   8. ARTIST NAMES
===================================================== */

function getVideoArtistNames(artists) {
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
   9. FORMAT VIEW COUNT
===================================================== */

function formatViews(value) {
  const views = Number(value);

  if (
    !Number.isFinite(views) ||
    views < 0
  ) {
    return "0";
  }

  if (views >= 1000000) {
    return (
      (views / 1000000)
        .toFixed(1)
        .replace(".0", "") + "M"
    );
  }

  if (views >= 1000) {
    return (
      (views / 1000)
        .toFixed(1)
        .replace(".0", "") + "K"
    );
  }

  return views.toString();
}

/* =====================================================
   10. SAFE IMAGE URL
===================================================== */

function safeVideoImage(imageUrl) {
  if (
    typeof imageUrl !== "string" ||
    !imageUrl.trim()
  ) {
    return VIDEO_PLACEHOLDER;
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

  return VIDEO_PLACEHOLDER;
}

/* =====================================================
   11. ESCAPE HTML
===================================================== */

function escapeVideoHTML(value) {
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
