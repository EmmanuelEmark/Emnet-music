
/* =====================================================
   EMNET MUSIC — PUBLIC ARTIST PROFILE
   Secure Artwork + Video Thumbnails + Follow
===================================================== */

/* =====================================================
   1. ARTIST ID
===================================================== */

const artistParams =
  new URLSearchParams(window.location.search);

const artistIdFromUrl =
  artistParams.get("id");

const artistIdFromStorage =
  sessionStorage.getItem("selectedArtistId");

const artistId =
  artistIdFromUrl || artistIdFromStorage;

if (artistIdFromUrl) {
  sessionStorage.setItem(
    "selectedArtistId",
    artistIdFromUrl
  );
}

/* =====================================================
   2. ELEMENTS
===================================================== */

const artistLoading =
  document.getElementById("artistLoading");

const artistError =
  document.getElementById("artistError");

const artistContent =
  document.getElementById("artistContent");

const artistCoverBackground =
  document.getElementById("artistCoverBackground");

const artistProfileImage =
  document.getElementById("artistProfileImage");

const artistStageName =
  document.getElementById("artistStageName");

const verifiedBadge =
  document.getElementById("verifiedBadge");

const artistFollowers =
  document.getElementById("artistFollowers");

const followArtistButton =
  document.getElementById("followArtistButton");

const playArtistButton =
  document.getElementById("playArtistButton");

const artistSongList =
  document.getElementById("artistSongList");

const artistReleaseGrid =
  document.getElementById("artistReleaseGrid");

const artistVideoGrid =
  document.getElementById("artistVideoGrid");

const artistSongsSection =
  document.getElementById("artistSongsSection");

const artistReleasesSection =
  document.getElementById("artistReleasesSection");

const artistVideosSection =
  document.getElementById("artistVideosSection");

const logoutButton =
  document.getElementById("logoutButton");

const guestLoginLink =
  document.getElementById("guestLoginLink");

/* =====================================================
   3. STATE
===================================================== */

let currentArtist = null;
let artistSongs = [];
let artistReleases = [];
let artistVideos = [];

let isFollowingArtist = false;
let followRequestPending = false;

const ARTIST_PLACEHOLDER =
  "https://placehold.co/600x600/111612/35e67a?text=EmnetMusic";

const artistArtworkCache = new Map();
const artistThumbnailCache = new Map();

/* =====================================================
   4. START PAGE
===================================================== */

// Public artist profiles do not require login.

startArtistPage();

async function startArtistPage() {
  updateArtistNavigation();

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

  if (!artistId) {
    showArtistError("Artist ID is missing.");
    return;
  }

  await loadArtistProfile();
}

/* =====================================================
   5. AUTHENTICATION & NAVIGATION
===================================================== */

function getArtistToken() {
  if (typeof getToken === "function") {
    return getToken();
  }

  return localStorage.getItem("token");
}

function getArtistStoredUser() {
  if (typeof getStoredUser === "function") {
    return getStoredUser();
  }

  return null;
}

function updateArtistNavigation() {
  const loggedIn =
    Boolean(getArtistToken());

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
   6. LOAD ARTIST PROFILE
===================================================== */

async function loadArtistProfile() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/artists/profile/${encodeURIComponent(
        artistId
      )}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to load artist."
      );
    }

    if (!data.artist) {
      throw new Error(
        "Artist information was not returned."
      );
    }

    currentArtist = data.artist;

    artistSongs = Array.isArray(data.songs)
      ? data.songs.filter((song) =>
          isPublicArtistMedia(song)
        )
      : [];

    artistReleases = Array.isArray(data.releases)
      ? data.releases.filter((release) =>
          isPublicArtistMedia(release)
        )
      : [];

    artistVideos = Array.isArray(data.videos)
      ? data.videos.filter((video) =>
          isPublicArtistMedia(video)
        )
      : [];

    renderArtist();

    if (artistLoading) {
      artistLoading.style.display = "none";
    }

    if (artistError) {
      artistError.style.display = "none";
    }

    if (artistContent) {
      artistContent.classList.add("active");
    }

    await loadArtistFollowStatus();

  } catch (error) {
    console.error(
      "Artist profile error:",
      error
    );

    showArtistError(error.message);
  }
}

function isPublicArtistMedia(item) {
  return Boolean(
    item &&
    item._id &&
    item.status === "approved" &&
    (
      item.visibilityStatus === "visible" ||
      item.visibilityStatus == null
    )
  );
}

/* =====================================================
   7. RENDER ARTIST PROFILE
===================================================== */

function renderArtist() {
  if (!currentArtist) {
    return;
  }

  document.title =
    `${currentArtist.stageName || "Artist"} | EmnetMusic`;

  if (artistStageName) {
    artistStageName.textContent =
      currentArtist.stageName || "Artist";
  }

  if (artistFollowers) {
    artistFollowers.textContent =
      Number(currentArtist.followersCount) || 0;
  }

  if (artistProfileImage) {
    artistProfileImage.src =
      safeArtistImage(
        currentArtist.profileImage
      );

    artistProfileImage.onerror = () => {
      artistProfileImage.onerror = null;
      artistProfileImage.src =
        ARTIST_PLACEHOLDER;
    };
  }

  if (artistCoverBackground) {
    const coverImage =
      currentArtist.coverImage ||
      currentArtist.profileImage;

    if (coverImage) {
      const safeUrl =
        safeArtistImage(coverImage);

      artistCoverBackground.style.backgroundImage =
        `url(${JSON.stringify(safeUrl)})`;

    } else {
      artistCoverBackground.style.backgroundImage = `
        radial-gradient(
          circle at 35% 35%,
          rgba(53, 230, 122, 0.20),
          transparent 40%
        )
      `;
    }
  }

  if (verifiedBadge) {
    verifiedBadge.style.display =
      currentArtist.verified
        ? ""
        : "none";
  }

  renderArtistSongs();
  renderArtistReleases();
  renderArtistVideos();
  updateFollowButton();
}

/* =====================================================
   8. SECURE MEDIA HELPERS
===================================================== */

function getArtistMediaId(item) {
  if (typeof item === "string") {
    return item;
  }

  if (item && typeof item === "object") {
    return item._id || item.id || null;
  }

  return null;
}

async function requestArtistMedia(endpoint) {
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
      "Unable to load secure media."
    );
  }

  const mediaUrl =
    data.mediaUrl ||
    data.playbackUrl;

  if (!mediaUrl) {
    throw new Error(
      "Secure media URL was not returned."
    );
  }

  return {
    url: mediaUrl,
    expiresIn: data.expiresIn
  };
}

async function resolveArtistMedia(
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
    await requestArtistMedia(endpoint);

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

/* =====================================================
   9. SECURE RELEASE ARTWORK
===================================================== */

async function applyArtistReleaseArtwork(
  image,
  release
) {
  const releaseId =
    getArtistMediaId(release);

  if (!image || !releaseId) {
    return;
  }

  try {
    const url = await resolveArtistMedia(
      artistArtworkCache,
      releaseId,
      `/media/releases/${encodeURIComponent(
        releaseId
      )}/artwork`
    );

    if (image.isConnected) {
      image.src = safeArtistImage(url);
    }

  } catch (error) {
    console.warn(
      "Artist release artwork unavailable:",
      releaseId,
      error.message
    );
  }
}

/* =====================================================
   10. SECURE VIDEO THUMBNAILS
===================================================== */

async function applyArtistVideoThumbnail(
  image,
  video
) {
  const videoId =
    getArtistMediaId(video);

  if (!image || !videoId) {
    return;
  }

  try {
    const url = await resolveArtistMedia(
      artistThumbnailCache,
      videoId,
      `/media/videos/${encodeURIComponent(
        videoId
      )}/thumbnail`
    );

    if (image.isConnected) {
      image.src = safeArtistImage(url);
    }

  } catch (error) {
    console.warn(
      "Artist video thumbnail unavailable:",
      videoId,
      error.message
    );
  }
}

/* =====================================================
   11. ARTIST SONGS
===================================================== */

function renderArtistSongs() {
  if (
    !artistSongList ||
    !artistSongsSection
  ) {
    return;
  }

  artistSongList.innerHTML = "";

  artistSongsSection.style.display =
    artistSongs.length ? "" : "none";

  const fragment =
    document.createDocumentFragment();

  artistSongs.forEach((song, index) => {
    const row =
      document.createElement("div");

    row.className = "artist-song-row";

    const release =
      song.releaseId || {};

    const number =
      document.createElement("div");

    number.className =
      "artist-song-number";

    number.textContent = index + 1;

    const image =
      document.createElement("img");

    image.className =
      "artist-song-cover";

    image.alt =
      song.title || "Song";

    image.loading = "lazy";

    image.src = safeArtistImage(
      typeof release === "object"
        ? release.coverImage
        : null
    );

    image.onerror = () => {
      image.onerror = null;
      image.src = ARTIST_PLACEHOLDER;
    };

    const metadata =
      document.createElement("div");

    metadata.className =
      "artist-song-meta";

    const title =
      document.createElement("h3");

    title.textContent =
      song.title || "Untitled";

    const genre =
      document.createElement("p");

    genre.textContent =
      song.genre || "Music";

    metadata.append(title, genre);

    const releaseName =
      document.createElement("div");

    releaseName.className =
      "artist-song-release";

    releaseName.textContent =
      typeof release === "object"
        ? release.title || ""
        : "";

    const playButton =
      document.createElement("button");

    playButton.type = "button";
    playButton.className =
      "artist-song-play";

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
        playArtistSong(song._id);
      }
    );

    row.append(
      number,
      image,
      metadata,
      releaseName,
      playButton
    );

    fragment.appendChild(row);

    applyArtistReleaseArtwork(
      image,
      release
    );
  });

  artistSongList.appendChild(fragment);
}

/* =====================================================
   12. PLAY INDIVIDUAL SONG
===================================================== */

function playArtistSong(songId) {
  const selectedSong =
    artistSongs.find((song) =>
      String(song._id) ===
      String(songId)
    );

  if (!selectedSong) {
    return;
  }

  if (typeof playSong !== "function") {
    console.error(
      "Music player unavailable."
    );

    return;
  }

  playSong(
    selectedSong,
    artistSongs
  );
}

/* =====================================================
   13. ARTIST RELEASES
===================================================== */

function renderArtistReleases() {
  if (
    !artistReleaseGrid ||
    !artistReleasesSection
  ) {
    return;
  }

  artistReleaseGrid.innerHTML = "";

  artistReleasesSection.style.display =
    artistReleases.length ? "" : "none";

  const fragment =
    document.createDocumentFragment();

  artistReleases.forEach((release) => {
    const card =
      document.createElement("a");

    card.className =
      "artist-release-card";

    card.href =
      `release.html?id=${encodeURIComponent(
        release._id
      )}`;

    const image =
      document.createElement("img");

    image.alt =
      release.title || "Release";

    image.loading = "lazy";

    image.src =
      safeArtistImage(
        release.coverImage
      );

    image.onerror = () => {
      image.onerror = null;
      image.src = ARTIST_PLACEHOLDER;
    };

    const title =
      document.createElement("h3");

    title.textContent =
      release.title || "Untitled";

    const type =
      document.createElement("p");

    type.textContent =
      release.releaseType || "Release";

    card.append(image, title, type);

    fragment.appendChild(card);

    applyArtistReleaseArtwork(
      image,
      release
    );
  });

  artistReleaseGrid.appendChild(fragment);
}

/* =====================================================
   14. ARTIST VIDEOS
===================================================== */

function renderArtistVideos() {
  if (
    !artistVideoGrid ||
    !artistVideosSection
  ) {
    return;
  }

  artistVideoGrid.innerHTML = "";

  artistVideosSection.style.display =
    artistVideos.length ? "" : "none";

  const fragment =
    document.createDocumentFragment();

  artistVideos.forEach((video) => {
    const card =
      document.createElement("a");

    card.className =
      "artist-video-card";

    card.href =
      `video.html?id=${encodeURIComponent(
        video._id
      )}`;

    const thumbnail =
      document.createElement("div");

    thumbnail.className =
      "artist-video-thumbnail";

    const image =
      document.createElement("img");

    image.alt =
      video.title || "Video";

    image.loading = "lazy";

    image.src =
      safeArtistImage(
        video.thumbnailUrl
      );

    image.onerror = () => {
      image.onerror = null;
      image.src = ARTIST_PLACEHOLDER;
    };

    thumbnail.appendChild(image);

    const overlay =
      document.createElement("div");

    overlay.className =
      "artist-video-play";

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
      "Music video";

    card.append(
      thumbnail,
      title,
      description
    );

    fragment.appendChild(card);

    applyArtistVideoThumbnail(
      image,
      video
    );
  });

  artistVideoGrid.appendChild(fragment);
}

/* =====================================================
   15. PLAY ALL ARTIST SONGS
===================================================== */

if (playArtistButton) {
  playArtistButton.addEventListener(
    "click",
    () => {
      if (!artistSongs.length) {
        return;
      }

      if (typeof playSong !== "function") {
        console.error(
          "Music player unavailable."
        );

        return;
      }

      playSong(
        artistSongs[0],
        artistSongs
      );
    }
  );
}

/* =====================================================
   16. FOLLOW STATUS
===================================================== */

async function loadArtistFollowStatus() {
  const token = getArtistToken();
  const user = getArtistStoredUser();

  if (
    !token ||
    user?.role !== "listener" ||
    !artistId
  ) {
    isFollowingArtist = false;
    updateFollowButton();
    return;
  }

  // The current project already supports POST/DELETE
  // /listener/follows/:artistId.
  //
  // Do not assume a follow-status GET endpoint exists.
  // If your backend provides one, we can integrate it
  // after reviewing the route and response structure.

  updateFollowButton();
}

/* =====================================================
   17. FOLLOW / UNFOLLOW
===================================================== */

if (followArtistButton) {
  followArtistButton.addEventListener(
    "click",
    toggleArtistFollow
  );
}

async function toggleArtistFollow() {
  if (
    !currentArtist ||
    !followArtistButton ||
    followRequestPending
  ) {
    return;
  }

  const token = getArtistToken();

  if (!token) {
    window.location.href =
      `login.html?redirect=${encodeURIComponent(
        window.location.pathname +
        window.location.search
      )}`;

    return;
  }

  const user = getArtistStoredUser();

  if (user?.role !== "listener") {
    console.warn(
      "Only listener accounts can follow artists."
    );

    return;
  }

  followRequestPending = true;
  followArtistButton.disabled = true;

  try {
    const response = await fetch(
      `${API_BASE_URL}/listener/follows/${encodeURIComponent(
        artistId
      )}`,
      {
        method: isFollowingArtist
          ? "DELETE"
          : "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to update follow."
      );
    }

    isFollowingArtist =
      !isFollowingArtist;

    if (
      typeof data.followersCount === "number"
    ) {
      currentArtist.followersCount =
        data.followersCount;

      if (artistFollowers) {
        artistFollowers.textContent =
          data.followersCount;
      }
    }

    updateFollowButton();

  } catch (error) {
    console.error(
      "Follow error:",
      error
    );

  } finally {
    followRequestPending = false;
    followArtistButton.disabled = false;
  }
}

/* =====================================================
   18. FOLLOW BUTTON DISPLAY
===================================================== */

function updateFollowButton() {
  if (!followArtistButton) {
    return;
  }

  followArtistButton.textContent =
    isFollowingArtist
      ? "Following"
      : "Follow";

  followArtistButton.classList.toggle(
    "following",
    isFollowingArtist
  );
}

/* =====================================================
   19. SAFE IMAGE URL
===================================================== */

function safeArtistImage(imageUrl) {
  if (
    typeof imageUrl !== "string" ||
    !imageUrl.trim()
  ) {
    return ARTIST_PLACEHOLDER;
  }

  try {
    const url = new URL(
      imageUrl,
      window.location.href
    );

    if (
      url.protocol === "https:" ||
      url.protocol === "http:"
    ) {
      return url.href;
    }

  } catch {
    // Use placeholder.
  }

  return ARTIST_PLACEHOLDER;
}

/* =====================================================
   20. ERROR HANDLING
===================================================== */

function showArtistError(message) {
  if (artistLoading) {
    artistLoading.style.display = "none";
  }

  if (artistContent) {
    artistContent.classList.remove(
      "active"
    );
  }

  if (artistError) {
    artistError.style.display = "block";

    artistError.textContent =
      message ||
      "Unable to load artist.";
  }
}

/* =====================================================
   21. HTML ESCAPING
===================================================== */

function escapeArtistHTML(value) {
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
