
/* =====================================================
   EMNET MUSIC — RELEASE DETAILS PAGE
   Public Access + Secure Cloudflare R2 Artwork
===================================================== */

/* =====================================================
   1. GET RELEASE ID
===================================================== */

const releaseParams =
  new URLSearchParams(window.location.search);

const releaseIdFromUrl =
  releaseParams.get("id");

const releaseIdFromStorage =
  sessionStorage.getItem("selectedReleaseId");

const releaseId =
  releaseIdFromUrl || releaseIdFromStorage;

if (releaseIdFromUrl) {
  sessionStorage.setItem(
    "selectedReleaseId",
    releaseIdFromUrl
  );
}

/* =====================================================
   2. PAGE ELEMENTS
===================================================== */

const releaseLoading =
  document.getElementById("releaseLoading");

const releaseError =
  document.getElementById("releaseError");

const releaseContent =
  document.getElementById("releaseContent");

const releaseHeroBg =
  document.getElementById("releaseHeroBg");

const releaseCover =
  document.getElementById("releaseCover");

const releaseType =
  document.getElementById("releaseType");

const releaseTitle =
  document.getElementById("releaseTitle");

const releaseArtistName =
  document.getElementById("releaseArtistName");

const releaseDate =
  document.getElementById("releaseDate");

const releaseTrackCount =
  document.getElementById("releaseTrackCount");

const playReleaseButton =
  document.getElementById("playReleaseButton");

const releaseTrackList =
  document.getElementById("releaseTrackList");

const logoutButton =
  document.getElementById("logoutButton");

const guestLoginLink =
  document.getElementById("guestLoginLink");

/* =====================================================
   3. STATE
===================================================== */

let currentRelease = null;
let releaseSongs = [];

const RELEASE_PLACEHOLDER =
  "https://placehold.co/600x600/111612/35e67a?text=EmnetMusic";

let secureReleaseArtworkUrl = null;

/* =====================================================
   4. START PAGE
===================================================== */

// Guests may view approved releases.
// Authentication is not required to open this page.

startReleasePage();

async function startReleasePage() {
  updateReleaseNavigation();

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

  if (!releaseId) {
    showReleaseError("Release ID is missing.");
    return;
  }

  await loadRelease();
}

/* =====================================================
   5. AUTHENTICATION & NAVIGATION
===================================================== */

function getReleaseToken() {
  if (typeof getToken === "function") {
    return getToken();
  }

  return localStorage.getItem("token");
}

function updateReleaseNavigation() {
  const loggedIn =
    Boolean(getReleaseToken());

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
   6. LOAD RELEASE
===================================================== */

async function loadRelease() {
  try {
    const response = await fetch(
      `${API_BASE_URL}/releases/${encodeURIComponent(
        releaseId
      )}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to load release."
      );
    }

    if (!data.release) {
      throw new Error(
        "Release information was not returned."
      );
    }

    currentRelease = data.release;

    if (
      currentRelease.status !== "approved" ||
      (
        currentRelease.visibilityStatus != null &&
        currentRelease.visibilityStatus !== "visible"
      )
    ) {
      throw new Error(
        "This release is not available for public viewing."
      );
    }

    releaseSongs = Array.isArray(data.songs)
      ? data.songs.filter((song) => {
          return (
            song &&
            song._id &&
            song.status === "approved" &&
            (
              song.visibilityStatus === "visible" ||
              song.visibilityStatus == null
            )
          );
        })
      : [];

    renderRelease();

    if (releaseLoading) {
      releaseLoading.style.display = "none";
    }

    if (releaseError) {
      releaseError.style.display = "none";
    }

    if (releaseContent) {
      releaseContent.classList.add("active");
    }

    await loadSecureReleaseArtwork();

  } catch (error) {
    console.error(
      "Release page error:",
      error
    );

    showReleaseError(error.message);
  }
}

/* =====================================================
   7. RENDER RELEASE INFORMATION
===================================================== */

function renderRelease() {
  if (!currentRelease) {
    return;
  }

  document.title =
    `${currentRelease.title || "Release"} | EmnetMusic`;

  const coverImage =
    safeReleaseImage(
      currentRelease.coverImage
    );

  setReleaseArtwork(coverImage);

  if (releaseType) {
    releaseType.textContent =
      (
        currentRelease.releaseType ||
        "release"
      ).toUpperCase();
  }

  if (releaseTitle) {
    releaseTitle.textContent =
      currentRelease.title || "Untitled";
  }

  const artistName =
    getReleaseArtistNames(
      currentRelease.primaryArtists
    );

  if (releaseArtistName) {
    releaseArtistName.textContent =
      artistName || "Artist";
  }

  if (releaseDate) {
    releaseDate.textContent =
      formatReleaseDate(
        currentRelease.releaseDate
      );
  }

  if (releaseTrackCount) {
    releaseTrackCount.textContent =
      `${releaseSongs.length} ${
        releaseSongs.length === 1
          ? "track"
          : "tracks"
      }`;
  }

  renderReleaseArtistLink();
  renderReleaseSongs();
}

/* =====================================================
   8. SECURE RELEASE ARTWORK
===================================================== */

async function loadSecureReleaseArtwork() {
  if (!currentRelease || !releaseId) {
    return;
  }

  try {
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
        "Unable to load release artwork."
      );
    }

    const artworkUrl =
      data.mediaUrl ||
      data.playbackUrl ||
      null;

    if (!artworkUrl) {
      throw new Error(
        "Artwork URL was not returned."
      );
    }

    secureReleaseArtworkUrl =
      safeReleaseImage(artworkUrl);

    setReleaseArtwork(
      secureReleaseArtworkUrl
    );

  } catch (error) {
    console.warn(
      "Secure release artwork unavailable:",
      error.message
    );

    // Keep legacy artwork or placeholder.
  }
}

function setReleaseArtwork(imageUrl) {
  const safeUrl =
    safeReleaseImage(imageUrl);

  if (releaseCover) {
    releaseCover.src = safeUrl;

    releaseCover.onerror = () => {
      releaseCover.onerror = null;
      releaseCover.src = RELEASE_PLACEHOLDER;
    };
  }

  if (releaseHeroBg) {
    // CSS backgroundImage uses a quoted URL.
    // JSON.stringify safely escapes quotes and
    // backslashes for the CSS string representation.
    releaseHeroBg.style.backgroundImage =
      `url(${JSON.stringify(safeUrl)})`;
  }
}

/* =====================================================
   9. ARTIST PROFILE LINK
===================================================== */

function renderReleaseArtistLink() {
  if (!releaseArtistName) {
    return;
  }

  const primaryArtist =
    Array.isArray(
      currentRelease.primaryArtists
    )
      ? currentRelease.primaryArtists[0]
      : null;

  const artistId =
    typeof primaryArtist === "string"
      ? primaryArtist
      : primaryArtist?._id;

  if (!artistId) {
    releaseArtistName.style.cursor = "default";
    releaseArtistName.onclick = null;
    return;
  }

  releaseArtistName.style.cursor = "pointer";

  releaseArtistName.onclick = () => {
    sessionStorage.setItem(
      "selectedArtistId",
      artistId
    );

    window.location.href =
      "artist.html";
  };
}

/* =====================================================
   10. RENDER RELEASE SONGS
===================================================== */

function renderReleaseSongs() {
  if (!releaseTrackList) {
    console.error(
      "releaseTrackList element was not found."
    );

    return;
  }

  releaseTrackList.innerHTML = "";

  if (!releaseSongs.length) {
    releaseTrackList.innerHTML = `
      <div class="release-empty">
        No songs available for this release.
      </div>
    `;

    return;
  }

  const fragment =
    document.createDocumentFragment();

  releaseSongs.forEach((song, index) => {
    const row =
      document.createElement("div");

    row.className = "release-track-row";

    const artistName =
      getReleaseArtistNames(
        song.primaryArtists
      );

    const trackNumber =
      song.trackNumber || index + 1;

    const title =
      song.title || "Untitled";

    const genre =
      song.genre || "Music";

    /* TRACK NUMBER */

    const numberElement =
      document.createElement("div");

    numberElement.className =
      "release-track-number";

    numberElement.textContent =
      trackNumber;

    /* TRACK INFORMATION */

    const main =
      document.createElement("div");

    main.className =
      "release-track-main";

    const songTitle =
      document.createElement("h3");

    songTitle.textContent = title;

    const artist =
      document.createElement("p");

    artist.textContent =
      artistName || "Artist";

    main.append(songTitle, artist);

    /* GENRE */

    const genreElement =
      document.createElement("div");

    genreElement.className =
      "release-track-genre";

    genreElement.textContent = genre;

    /* DURATION */

    const durationElement =
      document.createElement("div");

    durationElement.className =
      "release-track-duration";

    durationElement.textContent =
      formatDuration(song.duration);

    /* PLAY BUTTON */

    const playButton =
      document.createElement("button");

    playButton.type = "button";
    playButton.className =
      "release-track-play";

    playButton.dataset.songId =
      song._id;

    playButton.setAttribute(
      "aria-label",
      `Play ${title}`
    );

    playButton.textContent = "▶";

    playButton.addEventListener(
      "click",
      () => {
        playReleaseSong(song._id);
      }
    );

    row.append(
      numberElement,
      main,
      genreElement,
      durationElement,
      playButton
    );

    fragment.appendChild(row);
  });

  releaseTrackList.appendChild(fragment);
}

/* =====================================================
   11. CREATE PLAYER QUEUE
===================================================== */

function createPlayableSongs() {
  return releaseSongs.map((song) => {
    return {
      ...song,

      // The music player expects releaseId
      // to contain the release information.
      releaseId: currentRelease
    };
  });
}

/* =====================================================
   12. PLAY INDIVIDUAL SONG
===================================================== */

function playReleaseSong(songId) {
  const playableSongs =
    createPlayableSongs();

  const selectedSong =
    playableSongs.find((song) => {
      return String(song._id) ===
        String(songId);
    });

  if (!selectedSong) {
    console.error(
      "Selected release song was not found."
    );

    return;
  }

  if (typeof playSong !== "function") {
    console.error(
      "Music player is unavailable."
    );

    return;
  }

  playSong(
    selectedSong,
    playableSongs
  );
}

/* =====================================================
   13. PLAY ENTIRE RELEASE
===================================================== */

if (playReleaseButton) {
  playReleaseButton.addEventListener(
    "click",
    () => {
      const playableSongs =
        createPlayableSongs();

      if (!playableSongs.length) {
        console.warn(
          "This release has no playable songs."
        );

        return;
      }

      if (typeof playSong !== "function") {
        console.error(
          "Music player is unavailable."
        );

        return;
      }

      playSong(
        playableSongs[0],
        playableSongs
      );
    }
  );
}

/* =====================================================
   14. ARTIST NAMES
===================================================== */

function getReleaseArtistNames(artists) {
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
   15. FORMAT RELEASE DATE
===================================================== */

function formatReleaseDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  return date.toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric"
    }
  );
}

/* =====================================================
   16. FORMAT SONG DURATION
===================================================== */

function formatDuration(seconds) {
  const total = Number(seconds);

  if (
    !Number.isFinite(total) ||
    total < 0
  ) {
    return "0:00";
  }

  const minutes =
    Math.floor(total / 60);

  const remainingSeconds =
    Math.floor(total % 60)
      .toString()
      .padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

/* =====================================================
   17. SAFE IMAGE URL
===================================================== */

function safeReleaseImage(imageUrl) {
  if (
    typeof imageUrl !== "string" ||
    !imageUrl.trim()
  ) {
    return RELEASE_PLACEHOLDER;
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
    // Use fallback.
  }

  return RELEASE_PLACEHOLDER;
}

/* =====================================================
   18. SHOW RELEASE ERROR
===================================================== */

function showReleaseError(message) {
  if (releaseLoading) {
    releaseLoading.style.display =
      "none";
  }

  if (releaseContent) {
    releaseContent.classList.remove(
      "active"
    );
  }

  if (releaseError) {
    releaseError.style.display =
      "block";

    releaseError.textContent =
      message ||
      "Unable to load release.";
  }
}

/* =====================================================
   19. ESCAPE HTML
===================================================== */

function escapeReleaseHTML(value) {
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
