
/* =========================================================
   EMNET MUSIC — MUSIC PLAYER

   Supports:
   - Public and registered-user playback
   - Private Cloudflare R2 audio
   - Secure artwork
   - Mini and expanded players
   - Queue and track navigation
   - Likes and playlists
   - Artist and release navigation
   - Song sharing
   - Qualified play counting
   - Signed URL recovery

   Requires:
   config.js
   secureMedia.js
   auth.js
========================================================= */

/* =========================================================
   1. PLAYER ELEMENTS
========================================================= */

let musicPlayer;
let audioPlayer;
let playerCover;
let playerSongTitle;
let playerArtist;
let playPauseButton;
let previousButton;
let nextButton;
let playerProgress;
let currentTime;
let durationTime;
let volumeSlider;

let playerExpandButton;
let playerExpandIconButton;
let nowPlayingOverlay;
let closeNowPlayingButton;

let expandedPlayerCover;
let expandedSongTitle;
let expandedArtistName;

let expandedPreviousButton;
let expandedPlayPauseButton;
let expandedNextButton;

let expandedProgress;
let expandedCurrentTime;
let expandedDurationTime;
let expandedVolumeSlider;

let queueToggleButton;
let queuePanel;
let queueList;
let closeQueueButton;

let miniLikeButton;
let expandedLikeButton;
let shuffleButton;
let repeatButton;
let moreSongButton;

let songMoreModal;
let closeSongMoreModal;
let songMoreTitle;
let songMoreMessage;
let moreAddToPlaylist;
let moreGoToArtist;
let moreGoToRelease;
let moreShareSong;

let playerPlaylistModal;
let closePlayerPlaylistModal;
let playerPlaylistList;
let playerPlaylistMessage;
let playerPlaylistSongName;

/* =========================================================
   2. STATE
========================================================= */

let currentSong = null;
let currentQueue = [];
let currentSongIndex = -1;

let playerLoaded = false;
let playerLoadingPromise = null;

let likedSongIds = new Set();
let likeRequestPending = false;

let activeSongPlaySession = null;

let emnetSongSelectionId = 0;
let playerPlaylistRequestId = 0;
let playerPlaylistSongId = null;
let playerPlaylistBusy = false;

const PLAYER_FALLBACK_COVER =
  "https://placehold.co/600x600/111612/35e67a?text=EmnetMusic";

/* =========================================================
   3. COMMON HELPERS
========================================================= */

function playerElement(id) {
  return document.getElementById(id);
}

function playerOn(element, eventName, callback) {
  if (element) {
    element.addEventListener(eventName, callback);
  }
}

function playerSetText(element, value) {
  if (element) {
    element.textContent = value;
  }
}

function playerSetValue(element, value) {
  if (element) {
    element.value = value;
  }
}

function playerToken() {
  return typeof getToken === "function"
    ? getToken()
    : null;
}

function playerLoggedIn() {
  return Boolean(playerToken());
}

function playerLoginRedirect() {
  if (typeof redirectToLogin === "function") {
    redirectToLogin();
  } else {
    window.location.href = "login.html";
  }
}

function playerHandleUnauthorized(response) {
  if (response.status !== 401) {
    return false;
  }

  if (typeof clearAuthentication === "function") {
    clearAuthentication();
  }

  playerLoginRedirect();
  return true;
}

async function playerReadResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(
        `Request failed (${response.status}).`
      );
    }

    return {};
  }
}

function playerSafeImage(url) {
  if (typeof url !== "string" || !url.trim()) {
    return PLAYER_FALLBACK_COVER;
  }

  try {
    const parsed = new URL(url, window.location.href);

    if (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    ) {
      return parsed.href;
    }
  } catch {
    // Invalid image URL.
  }

  return PLAYER_FALLBACK_COVER;
}

function playerRelease(song) {
  return song?.releaseId &&
    typeof song.releaseId === "object"
    ? song.releaseId
    : {};
}

function playerReleaseId(song) {
  const release = song?.releaseId;

  return typeof release === "string"
    ? release
    : release?._id || null;
}

function playerSetImage(image, url) {
  if (!image) return;

  image.onerror = () => {
    image.onerror = null;
    image.src = PLAYER_FALLBACK_COVER;
  };

  image.src = playerSafeImage(url);
}

/* =========================================================
   4. LOAD PLAYER COMPONENT
========================================================= */

async function loadPlayerComponent() {
  if (playerLoaded) {
    return;
  }

  if (playerLoadingPromise) {
    return playerLoadingPromise;
  }

  playerLoadingPromise = (async () => {
    const container = playerElement("playerContainer");

    if (!container) {
      console.warn(
        "playerContainer was not found on this page."
      );
      return;
    }

    const response = await fetch(
      "components/player.html"
    );

    if (!response.ok) {
      throw new Error(
        "Unable to load player component."
      );
    }

    const html = await response.text();

    container.innerHTML = html;

    if (!initializePlayer()) {
      throw new Error(
        "Player component is incomplete."
      );
    }

    playerLoaded = true;

    // Likes are optional for public listening.
    loadLikedSongs().catch(console.error);
  })();

  try {
    await playerLoadingPromise;
  } catch (error) {
    console.error(
      "Player component error:",
      error
    );
  } finally {
    playerLoadingPromise = null;
  }
}

/* =========================================================
   5. INITIALIZE PLAYER
========================================================= */

function initializePlayer() {
  musicPlayer = playerElement("musicPlayer");
  audioPlayer = playerElement("audioPlayer");

  playerCover = playerElement("playerCover");
  playerSongTitle = playerElement("playerSongTitle");
  playerArtist = playerElement("playerArtist");

  playPauseButton = playerElement("playPauseButton");
  previousButton = playerElement("previousButton");
  nextButton = playerElement("nextButton");

  playerProgress = playerElement("playerProgress");
  currentTime = playerElement("currentTime");
  durationTime = playerElement("durationTime");
  volumeSlider = playerElement("volumeSlider");

  playerExpandButton = playerElement("playerExpandButton");
  playerExpandIconButton = playerElement(
    "playerExpandIconButton"
  );

  nowPlayingOverlay = playerElement("nowPlayingOverlay");
  closeNowPlayingButton = playerElement(
    "closeNowPlayingButton"
  );

  expandedPlayerCover = playerElement(
    "expandedPlayerCover"
  );

  expandedSongTitle = playerElement(
    "expandedSongTitle"
  );

  expandedArtistName = playerElement(
    "expandedArtistName"
  );

  expandedPreviousButton = playerElement(
    "expandedPreviousButton"
  );

  expandedPlayPauseButton = playerElement(
    "expandedPlayPauseButton"
  );

  expandedNextButton = playerElement(
    "expandedNextButton"
  );

  expandedProgress = playerElement("expandedProgress");

  expandedCurrentTime = playerElement(
    "expandedCurrentTime"
  );

  expandedDurationTime = playerElement(
    "expandedDurationTime"
  );

  expandedVolumeSlider = playerElement(
    "expandedVolumeSlider"
  );

  queueToggleButton = playerElement("queueToggleButton");
  queuePanel = playerElement("queuePanel");
  queueList = playerElement("queueList");
  closeQueueButton = playerElement("closeQueueButton");

  miniLikeButton = playerElement("miniLikeButton");
  expandedLikeButton = playerElement(
    "expandedLikeButton"
  );

  shuffleButton = playerElement("shuffleButton");
  repeatButton = playerElement("repeatButton");
  moreSongButton = playerElement("moreSongButton");

  songMoreModal = playerElement("songMoreModal");
  closeSongMoreModal = playerElement(
    "closeSongMoreModal"
  );

  songMoreTitle = playerElement("songMoreTitle");
  songMoreMessage = playerElement("songMoreMessage");

  moreAddToPlaylist = playerElement(
    "moreAddToPlaylist"
  );

  moreGoToArtist = playerElement("moreGoToArtist");
  moreGoToRelease = playerElement("moreGoToRelease");
  moreShareSong = playerElement("moreShareSong");

  playerPlaylistModal = playerElement(
    "playerPlaylistModal"
  );

  closePlayerPlaylistModal = playerElement(
    "closePlayerPlaylistModal"
  );

  playerPlaylistList = playerElement(
    "playerPlaylistList"
  );

  playerPlaylistMessage = playerElement(
    "playerPlaylistMessage"
  );

  playerPlaylistSongName = playerElement(
    "playerPlaylistSongName"
  );

  if (
    !musicPlayer ||
    !audioPlayer ||
    !playPauseButton
  ) {
    return false;
  }

  audioPlayer.volume = 0.8;

  playerSetValue(volumeSlider, 0.8);
  playerSetValue(expandedVolumeSlider, 0.8);

  setupPlayerEvents();

  return true;
}

/* =========================================================
   6. PLAYER EVENTS
========================================================= */

function setupPlayerEvents() {
  playerOn(
    playPauseButton,
    "click",
    togglePlayPause
  );

  playerOn(
    expandedPlayPauseButton,
    "click",
    togglePlayPause
  );

  playerOn(nextButton, "click", playNextSong);
  playerOn(expandedNextButton, "click", playNextSong);

  playerOn(previousButton, "click", playPreviousSong);
  playerOn(
    expandedPreviousButton,
    "click",
    playPreviousSong
  );

  playerOn(
    playerExpandButton,
    "click",
    openNowPlaying
  );

  playerOn(
    playerExpandIconButton,
    "click",
    openNowPlaying
  );

  playerOn(
    closeNowPlayingButton,
    "click",
    closeNowPlaying
  );

  playerOn(queueToggleButton, "click", openQueue);
  playerOn(closeQueueButton, "click", closeQueue);

  playerOn(playerProgress, "input", () => {
    seekAudio(playerProgress.value);
  });

  playerOn(expandedProgress, "input", () => {
    seekAudio(expandedProgress.value);
  });

  playerOn(volumeSlider, "input", () => {
    setVolume(volumeSlider.value);
  });

  playerOn(expandedVolumeSlider, "input", () => {
    setVolume(expandedVolumeSlider.value);
  });

  playerOn(audioPlayer, "play", () => {
    EmnetSecureMedia.setPlayingState(true);
    resetListeningPosition();
    updatePlayButtons();
  });

  playerOn(audioPlayer, "pause", () => {
    EmnetSecureMedia.setPlayingState(false);
    resetListeningPosition();
    updatePlayButtons();
  });

  playerOn(audioPlayer, "timeupdate", () => {
    updateProgress();
    trackSongListeningTime();
  });

  playerOn(audioPlayer, "loadedmetadata", updateProgress);

  playerOn(audioPlayer, "ended", () => {
    finishSongListeningSession();
    playNextSong();
  });

  playerOn(audioPlayer, "error", async () => {
    if (!currentSong) return;

    console.warn(
      "Audio error detected. Attempting recovery."
    );

    const recovered =
      await EmnetSecureMedia.recoverPlayback(
        audioPlayer
      );

    if (!recovered) {
      console.warn(
        "Audio recovery was unsuccessful."
      );
    }
  });

  playerOn(
    audioPlayer,
    "seeking",
    resetListeningPosition
  );

  playerOn(
    audioPlayer,
    "seeked",
    resetListeningPosition
  );

  playerOn(
    miniLikeButton,
    "click",
    toggleCurrentSongLike
  );

  playerOn(
    expandedLikeButton,
    "click",
    toggleCurrentSongLike
  );

  // Deferred features from the original player.
  playerOn(shuffleButton, "click", () => {
    console.log(
      "Shuffle functionality will be added later."
    );
  });

  playerOn(repeatButton, "click", () => {
    console.log(
      "Repeat functionality will be added later."
    );
  });

  playerOn(
    moreSongButton,
    "click",
    openSongMoreMenu
  );

  playerOn(
    closeSongMoreModal,
    "click",
    closeSongMoreMenu
  );

  playerOn(songMoreModal, "click", (event) => {
    if (event.target === songMoreModal) {
      closeSongMoreMenu();
    }
  });

  playerOn(moreAddToPlaylist, "click", () => {
    closeSongMoreMenu();
    openAddToPlaylistModal();
  });

  playerOn(
    moreGoToArtist,
    "click",
    goToCurrentSongArtist
  );

  playerOn(
    moreGoToRelease,
    "click",
    goToCurrentSongRelease
  );

  playerOn(
    moreShareSong,
    "click",
    shareCurrentSong
  );

  playerOn(
    closePlayerPlaylistModal,
    "click",
    closeAddToPlaylistModal
  );

  playerOn(
    playerPlaylistModal,
    "click",
    (event) => {
      if (event.target === playerPlaylistModal) {
        closeAddToPlaylistModal();
      }
    }
  );
}

/* =========================================================
   7. PLAY SONG — SECURE R2
========================================================= */

async function playSong(song, queue = []) {
  if (!song?._id) {
    console.error("Invalid song information.");
    return;
  }

  // Increment before awaiting component loading.
  const selectionId = ++emnetSongSelectionId;

  if (!playerLoaded) {
    await loadPlayerComponent();
  }

  if (selectionId !== emnetSongSelectionId) {
    return;
  }

  if (!musicPlayer || !audioPlayer) {
    console.error("Music player is not ready.");
    return;
  }

  // Preserve the previous song's listening session.
  finishSongListeningSession();

  // Cancel previous R2 requests and renewal timers.
  EmnetSecureMedia.cancelPendingPlayback();

  audioPlayer.pause();
  audioPlayer.removeAttribute("src");
  audioPlayer.load();

  currentSong = song;

  if (Array.isArray(queue) && queue.length) {
    currentQueue = queue.filter(
      (item) => item && item._id
    );
  } else {
    currentQueue = [song];
  }

  currentSongIndex = currentQueue.findIndex(
    (item) =>
      String(item._id) === String(song._id)
  );

  if (currentSongIndex < 0) {
    currentQueue = [song, ...currentQueue];
    currentSongIndex = 0;
  }

  activeSongPlaySession = null;

  updateSongInformation(song);
  renderQueue();
  resetProgress();

  musicPlayer.classList.add("active");

  try {
    const playback =
      await EmnetSecureMedia.prepareSong(
        song,
        audioPlayer
      );

    if (
      !playback ||
      selectionId !== emnetSongSelectionId
    ) {
      return;
    }

    audioPlayer.src = playback.url;

    const session = createSongPlaySession(song);
    activeSongPlaySession = session;

    // Start backend session without blocking playback.
    beginSongPlaySession(session);

    await audioPlayer.play();

    if (
      selectionId === emnetSongSelectionId &&
      activeSongPlaySession === session
    ) {
      EmnetSecureMedia.setPlayingState(true);
      resetListeningPosition();
    }

  } catch (error) {
    if (selectionId !== emnetSongSelectionId) {
      return;
    }

    if (error.name !== "AbortError") {
      console.error(
        "Unable to play song:",
        error.message
      );
    }

    if (!audioPlayer.src) {
      activeSongPlaySession = null;
    }
  }
}

/* =========================================================
   8. UPDATE SONG INFORMATION
========================================================= */

function updateSongInformation(song) {
  const release = playerRelease(song);
  const releaseId = playerReleaseId(song);

  const artistName =
    getPlayerArtistNames(song.primaryArtists) ||
    "Artist";

  const fallbackCover = playerSafeImage(
    release.coverImage ||
    song.coverImage ||
    PLAYER_FALLBACK_COVER
  );

  playerSetText(
    playerSongTitle,
    song.title || "Untitled"
  );

  playerSetText(playerArtist, artistName);

  playerSetText(
    expandedSongTitle,
    song.title || "Untitled"
  );

  playerSetText(
    expandedArtistName,
    artistName
  );

  const images = [
    playerCover,
    expandedPlayerCover
  ].filter(Boolean);

  images.forEach((image) => {
    image.dataset.emnetReleaseId =
      String(releaseId || "");

    playerSetImage(image, fallbackCover);
  });

  if (releaseId) {
    EmnetSecureMedia.setArtwork(
      releaseId,
      images,
      fallbackCover
    );
  }

  updateLikeButtons();
}

/* =========================================================
   9. PLAY / PAUSE
========================================================= */

async function togglePlayPause() {
  if (!currentSong || !audioPlayer) {
    return;
  }

  try {
    if (audioPlayer.paused) {
      await audioPlayer.play();
    } else {
      audioPlayer.pause();
    }
  } catch (error) {
    console.error(
      "Playback error:",
      error
    );
  }
}

function updatePlayButtons() {
  if (!audioPlayer) return;

  const icon = audioPlayer.paused
    ? "▶"
    : "❚❚";

  playerSetText(playPauseButton, icon);
  playerSetText(expandedPlayPauseButton, icon);

  updateLikeButtons();
}

/* =========================================================
   10. PROGRESS AND SEEKING
========================================================= */

function updateProgress() {
  if (!audioPlayer) return;

  const duration = audioPlayer.duration;
  const position = audioPlayer.currentTime;

  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return;
  }

  const progress = Math.min(
    100,
    Math.max(0, (position / duration) * 100)
  );

  playerSetValue(playerProgress, progress);
  playerSetValue(expandedProgress, progress);

  playerSetText(
    currentTime,
    formatTime(position)
  );

  playerSetText(
    expandedCurrentTime,
    formatTime(position)
  );

  playerSetText(
    durationTime,
    formatTime(duration)
  );

  playerSetText(
    expandedDurationTime,
    formatTime(duration)
  );
}

function seekAudio(value) {
  if (!audioPlayer) return;

  const duration = audioPlayer.duration;

  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return;
  }

  const percent = Math.min(
    100,
    Math.max(0, Number(value) || 0)
  );

  audioPlayer.currentTime =
    (percent / 100) * duration;

  resetListeningPosition();
}

function resetProgress() {
  playerSetValue(playerProgress, 0);
  playerSetValue(expandedProgress, 0);

  playerSetText(currentTime, "0:00");
  playerSetText(expandedCurrentTime, "0:00");

  playerSetText(durationTime, "0:00");
  playerSetText(expandedDurationTime, "0:00");
}

/* =========================================================
   11. VOLUME
========================================================= */

function setVolume(value) {
  if (!audioPlayer) return;

  const volume = Math.min(
    1,
    Math.max(0, Number(value) || 0)
  );

  audioPlayer.volume = volume;

  playerSetValue(volumeSlider, volume);
  playerSetValue(expandedVolumeSlider, volume);
}

/* =========================================================
   12. NEXT / PREVIOUS
========================================================= */

function playNextSong() {
  if (!currentQueue.length) {
    return;
  }

  const nextIndex = currentSongIndex + 1;

  if (nextIndex >= currentQueue.length) {
    return;
  }

  playSong(
    currentQueue[nextIndex],
    currentQueue
  );
}

function playPreviousSong() {
  if (!currentQueue.length) {
    return;
  }

  const previousIndex =
    currentSongIndex - 1;

  if (previousIndex < 0) {
    return;
  }

  playSong(
    currentQueue[previousIndex],
    currentQueue
  );
}

/* =========================================================
   13. EXPANDED PLAYER
========================================================= */

function openNowPlaying() {
  if (!currentSong || !nowPlayingOverlay) {
    return;
  }

  nowPlayingOverlay.classList.add("active");

  nowPlayingOverlay.setAttribute(
    "aria-hidden",
    "false"
  );

  document.body.style.overflow = "hidden";
}

function closeNowPlaying() {
  if (!nowPlayingOverlay) return;

  nowPlayingOverlay.classList.remove("active");

  nowPlayingOverlay.setAttribute(
    "aria-hidden",
    "true"
  );

  closeQueue();

  document.body.style.overflow = "";
}

/* =========================================================
   14. QUEUE
========================================================= */


/* ========================================
   OPEN QUEUE
======================================== */

function openQueue() {
  if (!queuePanel) return;

  renderQueue();

  queuePanel.classList.add("active");

  if (queueToggleButton) {
    queueToggleButton.setAttribute(
      "aria-expanded",
      "true"
    );
  }
}


/* ========================================
   CLOSE QUEUE
======================================== */

function closeQueue() {
  if (!queuePanel) return;

  queuePanel.classList.remove("active");

  if (queueToggleButton) {
    queueToggleButton.setAttribute(
      "aria-expanded",
      "false"
    );
  }
}


/* ========================================
   RENDER QUEUE — SECURE R2 ARTWORK
======================================== */

function renderQueue() {
  if (!queueList) return;

  queueList.replaceChildren();

  // Display an empty message when
  // no songs are available.
  if (!currentQueue.length) {
    const empty = document.createElement("div");

    empty.className = "queue-empty";
    empty.textContent = "Your queue is empty.";

    queueList.appendChild(empty);

    return;
  }

  currentQueue.forEach((song, index) => {

    if (!song || !song._id) {
      return;
    }

    // Create queue item.
    const item = document.createElement("button");

    item.type = "button";
    item.className = "queue-item";

    // Highlight currently playing song.
    if (index === currentSongIndex) {
      item.classList.add("active");
    }

    // Get release information.
    const release = playerRelease(song);
    const releaseId = playerReleaseId(song);

    // Create artwork image.
    const cover = document.createElement("img");

    cover.alt = "";
    cover.loading = "lazy";

    // Important:
    // Identifies the release associated
    // with this artwork element.
    cover.dataset.emnetReleaseId =
      String(releaseId || "");

    // Display legacy artwork or placeholder
    // while secure artwork is loading.
    const fallbackCover = playerSafeImage(
      release.coverImage ||
      PLAYER_FALLBACK_COVER
    );

    playerSetImage(
      cover,
      fallbackCover
    );

    // Create song details container.
    const details = document.createElement("div");

    // Song title.
    const title = document.createElement("h4");

    title.textContent =
      song.title || "Untitled";

    // Artist name.
    const artist = document.createElement("p");

    artist.textContent =
      getPlayerArtistNames(song.primaryArtists) ||
      "Artist";

    details.append(title, artist);

    // Currently playing indicator.
    const indicator = document.createElement("span");

    indicator.className = "queue-playing";

    indicator.textContent =
      index === currentSongIndex
        ? "●"
        : "";

    // Add elements to queue item.
    item.append(
      cover,
      details,
      indicator
    );

    // Play selected song from queue.
    item.addEventListener("click", () => {
      playSong(song, currentQueue);
    });

    // Display queue item.
    queueList.appendChild(item);

    // Retrieve signed artwork URL
    // from the backend.
    if (releaseId) {
      EmnetSecureMedia.setArtwork(
        releaseId,
        [cover],
        fallbackCover
      );
    }

  });
}


/* =========================================================
   15. LOAD LIKED SONGS
========================================================= */

async function loadLikedSongs() {
  const token = playerToken();

  if (!token) {
    likedSongIds = new Set();
    updateLikeButtons();
    return;
  }

  try {
    const response = await fetch(
  `${API_BASE_URL}/api/listener/likes`,
  {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
);

    if (playerHandleUnauthorized(response)) {
      return;
    }

    if (!response.ok) {
      console.warn(
        "Unable to load liked songs."
      );
      return;
    }

    const data = await playerReadResponse(response);

    const likes =
      data.likes || data.songs || [];

    if (!Array.isArray(likes)) {
      return;
    }

    likedSongIds = new Set();

    likes.forEach((item) => {
      const song = item?.songId || item;

      const id = typeof song === "string"
        ? song
        : song?._id;

      if (id) {
        likedSongIds.add(String(id));
      }
    });

    updateLikeButtons();

  } catch (error) {
    console.error(
      "Unable to load liked songs:",
      error
    );
  }
}

/* =========================================================
   16. LIKE / UNLIKE
========================================================= */

async function toggleCurrentSongLike() {
  if (!currentSong || likeRequestPending) {
    return;
  }

  const token = playerToken();

  if (!token) {
    playerLoginRedirect();
    return;
  }

  const songId = String(currentSong._id);

  const alreadyLiked =
    likedSongIds.has(songId);

  likeRequestPending = true;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api//listener/likes/${encodeURIComponent(
        songId
      )}`,
      {
        method: alreadyLiked
          ? "DELETE"
          : "POST",

        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (playerHandleUnauthorized(response)) {
      return;
    }

    const data = await playerReadResponse(response);

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to update like."
      );
    }

    if (alreadyLiked) {
      likedSongIds.delete(songId);
    } else {
      likedSongIds.add(songId);
    }

    updateLikeButtons();

  } catch (error) {
    console.error("Like error:", error);
  } finally {
    likeRequestPending = false;
  }
}

function updateLikeButtons() {
  const liked = currentSong
    ? likedSongIds.has(String(currentSong._id))
    : false;

  if (miniLikeButton) {
    miniLikeButton.textContent =
      liked ? "♥" : "♡";

    miniLikeButton.classList.toggle(
      "liked",
      liked
    );
  }

  if (expandedLikeButton) {
    const icon =
      expandedLikeButton.querySelector("span");

    if (icon) {
      icon.textContent =
        liked ? "♥" : "♡";
    }

    expandedLikeButton.classList.toggle(
      "liked",
      liked
    );
  }
}

/* =========================================================
   17. MORE SONG MENU
========================================================= */

function openSongMoreMenu() {
  if (!currentSong || !songMoreModal) {
    return;
  }

  playerSetText(
    songMoreTitle,
    currentSong.title || "Song"
  );

  if (songMoreMessage) {
    songMoreMessage.textContent = "";
    songMoreMessage.classList.remove("active");
  }

  songMoreModal.classList.add("active");

  songMoreModal.setAttribute(
    "aria-hidden",
    "false"
  );
}

function closeSongMoreMenu() {
  if (!songMoreModal) return;

  songMoreModal.classList.remove("active");

  songMoreModal.setAttribute(
    "aria-hidden",
    "true"
  );
}

function showSongMoreMessage(message) {
  if (!songMoreMessage) return;

  songMoreMessage.textContent = message;
  songMoreMessage.classList.add("active");
}

/* =========================================================
   18. ARTIST AND RELEASE NAVIGATION
========================================================= */

function goToCurrentSongArtist() {
  if (!currentSong) return;

  const artists = currentSong.primaryArtists;

  const firstArtist =
    Array.isArray(artists)
      ? artists[0]
      : null;

  const artistId =
    typeof firstArtist === "string"
      ? firstArtist
      : firstArtist?._id;

  if (!artistId) {
    showSongMoreMessage(
      "Artist information is unavailable."
    );
    return;
  }

  window.location.href =
    `/artist?id=${encodeURIComponent(
      artistId
    )}`;
}

function goToCurrentSongRelease() {
  if (!currentSong) return;

  const releaseId =
    playerReleaseId(currentSong);

  if (!releaseId) {
    showSongMoreMessage(
      "Release information is unavailable."
    );
    return;
  }

  window.location.href =
    `/release?id=${encodeURIComponent(
      releaseId
    )}`;
}

/* =========================================================
   19. SHARE SONG
========================================================= */

async function shareCurrentSong() {
  if (!currentSong) return;

  const artistName =
    getPlayerArtistNames(
      currentSong.primaryArtists
    ) || "EmnetMusic";

  const shareTitle =
    currentSong.title || "EmnetMusic";

  const shareText =
    `Listen to ${shareTitle} by ${artistName} on EmnetMusic.`;

  // Preserve existing page-sharing behavior.
  const shareUrl = window.location.href;

  try {
    if (navigator.share) {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl
      });

      closeSongMoreMenu();
      return;
    }

    await navigator.clipboard.writeText(
      `${shareText} ${shareUrl}`
    );

    showSongMoreMessage(
      "Share link copied."
    );

  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.error("Share error:", error);

    showSongMoreMessage(
      "Unable to share this song."
    );
  }
}

/* =========================================================
   20. ADD TO PLAYLIST MODAL
========================================================= */

async function openAddToPlaylistModal() {
  if (!currentSong) return;

  if (!playerLoggedIn()) {
    playerLoginRedirect();
    return;
  }

  if (
    !playerPlaylistModal ||
    !playerPlaylistList
  ) {
    console.error(
      "Playlist modal was not found."
    );
    return;
  }

  playerPlaylistSongId =
    String(currentSong._id);

  const requestId = ++playerPlaylistRequestId;

  if (playerPlaylistMessage) {
    playerPlaylistMessage.className =
      "player-playlist-message";

    playerPlaylistMessage.textContent = "";
  }

  playerSetText(
    playerPlaylistSongName,
    `Add "${currentSong.title || "this song"}" to:`
  );

  playerPlaylistList.replaceChildren();

  const loading = document.createElement("div");

  loading.className = "player-playlist-loading";
  loading.textContent = "Loading playlists...";

  playerPlaylistList.appendChild(loading);

  playerPlaylistModal.classList.add("active");

  playerPlaylistModal.setAttribute(
    "aria-hidden",
    "false"
  );

  await loadPlayerPlaylists(requestId);
}

function closeAddToPlaylistModal() {
  ++playerPlaylistRequestId;

  playerPlaylistSongId = null;

  if (playerPlaylistModal) {
    playerPlaylistModal.classList.remove("active");

    playerPlaylistModal.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  if (playerPlaylistMessage) {
    playerPlaylistMessage.className =
      "player-playlist-message";

    playerPlaylistMessage.textContent = "";
  }
}

/* =========================================================
   21. LOAD USER PLAYLISTS
========================================================= */

async function loadPlayerPlaylists(
  requestId = playerPlaylistRequestId
) {
  const token = playerToken();

  if (!token) {
    playerLoginRedirect();
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/playlists`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (playerHandleUnauthorized(response)) {
      return;
    }

    const data = await playerReadResponse(response);

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to load playlists."
      );
    }

    if (
      requestId !== playerPlaylistRequestId ||
      !playerPlaylistModal?.classList.contains(
        "active"
      )
    ) {
      return;
    }

    renderPlayerPlaylists(
      Array.isArray(data.playlists)
        ? data.playlists
        : []
    );

  } catch (error) {
    console.error(
      "Player playlist error:",
      error
    );

    if (
      requestId !== playerPlaylistRequestId ||
      !playerPlaylistList
    ) {
      return;
    }

    playerPlaylistList.replaceChildren();

    const empty = document.createElement("div");

    empty.className = "player-playlist-empty";

    empty.textContent =
      error.message ||
      "Unable to load playlists.";

    playerPlaylistList.appendChild(empty);
  }
}

/* =========================================================
   22. RENDER USER PLAYLISTS
========================================================= */

function renderPlayerPlaylists(playlists) {
  if (!playerPlaylistList) return;

  playerPlaylistList.replaceChildren();

  if (!playlists.length) {
    const empty = document.createElement("div");

    empty.className = "player-playlist-empty";

    const message = document.createElement("p");

    message.textContent =
      "You don't have any playlists yet.";

    const link = document.createElement("a");

    link.href = "playlists.html";
    link.textContent = "Create a playlist";

    link.style.color = "#35e67a";
    link.style.textDecoration = "none";
    link.style.fontWeight = "800";

    empty.append(message, link);

    playerPlaylistList.appendChild(empty);
    return;
  }

  playlists.forEach((playlist) => {
    if (!playlist?._id) return;

    const count = Array.isArray(playlist.songs)
      ? playlist.songs.length
      : 0;

    const button = document.createElement("button");

    button.type = "button";
    button.className = "player-playlist-item";

    const icon = document.createElement("div");

    icon.className = "player-playlist-icon";
    icon.textContent = "♪";

    const details = document.createElement("div");

    details.className = "player-playlist-details";

    const title = document.createElement("h4");

    title.textContent =
      playlist.name || "Playlist";

    const description = document.createElement("p");

    description.textContent =
      `${count} ${count === 1 ? "song" : "songs"}` +
      (playlist.isPublic
        ? " • Public"
        : " • Private");

    details.append(title, description);

    const addIcon = document.createElement("span");

    addIcon.className = "player-playlist-add";
    addIcon.textContent = "+";

    button.append(icon, details, addIcon);

    button.addEventListener("click", () => {
      addCurrentSongToPlaylist(
        playlist._id,
        button
      );
    });

    playerPlaylistList.appendChild(button);
  });
}

/* =========================================================
   23. ADD SONG TO SELECTED PLAYLIST
========================================================= */

async function addCurrentSongToPlaylist(
  playlistId,
  button
) {
  const songId = playerPlaylistSongId;
  const token = playerToken();

  if (
    !songId ||
    !playlistId ||
    !token ||
    playerPlaylistBusy
  ) {
    if (!token) {
      playerLoginRedirect();
    }

    return;
  }

  playerPlaylistBusy = true;

  button.disabled = true;

  const addIcon =
    button.querySelector(".player-playlist-add");

  if (addIcon) {
    addIcon.textContent = "...";
  }

  if (playerPlaylistMessage) {
    playerPlaylistMessage.className =
      "player-playlist-message";

    playerPlaylistMessage.textContent = "";
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/playlists/${encodeURIComponent(
        playlistId
      )}/songs/${encodeURIComponent(songId)}`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (playerHandleUnauthorized(response)) {
      return;
    }

    const data = await playerReadResponse(response);

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to add song to playlist."
      );
    }

    if (playerPlaylistMessage) {
      playerPlaylistMessage.className =
        "player-playlist-message success";

      playerPlaylistMessage.textContent =
        "Song added to playlist.";
    }

    if (addIcon) {
      addIcon.textContent = "✓";
    }

    // Keep the original successful-add behavior.
    const modalRequestId = playerPlaylistRequestId;

    setTimeout(() => {
      if (
        modalRequestId === playerPlaylistRequestId
      ) {
        closeAddToPlaylistModal();
      }
    }, 900);

  } catch (error) {
    console.error(
      "Add song to playlist error:",
      error
    );

    if (playerPlaylistMessage) {
      playerPlaylistMessage.className =
        "player-playlist-message error";

      playerPlaylistMessage.textContent =
        error.message ||
        "Unable to add song to playlist.";
    }

    if (addIcon) {
      addIcon.textContent = "+";
    }

  } finally {
    playerPlaylistBusy = false;
    button.disabled = false;
  }
}

/* =========================================================
   24. GUEST IDENTIFIER
========================================================= */

function getOrCreateMusicGuestId() {
  const key = "emnetGuestId";

  const validGuestId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let guestId = null;

  try {
    guestId = localStorage.getItem(key);

    if (!guestId || !validGuestId.test(guestId)) {
      guestId = crypto.randomUUID();

      localStorage.setItem(key, guestId);
    }
  } catch (error) {
    console.warn(
      "Unable to persist guest identifier:",
      error
    );

    if (typeof crypto.randomUUID === "function") {
      guestId = crypto.randomUUID();
    }
  }

  return guestId;
}

/* =========================================================
   25. CREATE PLAY SESSION
========================================================= */

function createSongPlaySession(song) {
  const token = playerToken();

  return {
    songId: String(song._id),
    token,
    guestId: token
      ? null
      : getOrCreateMusicGuestId(),

    sessionToken: null,
    minimumSeconds: 30,

    listenedSeconds: 0,
    lastMediaTime: 0,
    lastWallTime: Date.now(),

    submitted: false,
    submitting: false,
    ended: false
  };
}

/* =========================================================
   26. START BACKEND PLAY SESSION
========================================================= */

async function beginSongPlaySession(session) {
  if (!session) return;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/plays/songs/${encodeURIComponent(
        session.songId
      )}/start`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          ...(session.token
            ? {
                Authorization:
                  `Bearer ${session.token}`
              }
            : {})
        },

        body: JSON.stringify(
          session.token
            ? {}
            : { guestId: session.guestId }
        )
      }
    );

    const data = await playerReadResponse(response);

    if (!response.ok) {
      console.warn(
        "Unable to start song play session:",
        data.message
      );
      return;
    }

    session.sessionToken =
      data.sessionToken || null;

    session.minimumSeconds =
      Number(data.minimumSeconds) > 0
        ? Number(data.minimumSeconds)
        : 30;

    if (session.ended) {
      setTimeout(() => {
        submitQualifiedSongPlay(session);
      }, 1500);
    } else {
      submitQualifiedSongPlay(session);
    }

  } catch (error) {
    console.error(
      "Song play session error:",
      error
    );
  }
}

/* =========================================================
   27. RESET LISTENING REFERENCE
========================================================= */

function resetListeningPosition() {
  const session = activeSongPlaySession;

  if (!session || !audioPlayer) {
    return;
  }

  session.lastMediaTime =
    audioPlayer.currentTime;

  session.lastWallTime = Date.now();
}

/* =========================================================
   28. TRACK ACTUAL LISTENING TIME
========================================================= */

function trackSongListeningTime() {
  const session = activeSongPlaySession;

  if (
    !session ||
    !audioPlayer ||
    session.ended
  ) {
    return;
  }

  const mediaTime = audioPlayer.currentTime;
  const now = Date.now();

  const mediaDelta =
    mediaTime - session.lastMediaTime;

  const wallDelta =
    (now - session.lastWallTime) / 1000;

  session.lastMediaTime = mediaTime;
  session.lastWallTime = now;

  if (
    audioPlayer.paused ||
    audioPlayer.seeking ||
    mediaDelta <= 0 ||
    wallDelta <= 0
  ) {
    return;
  }

  const creditedSeconds = Math.max(
    0,
    Math.min(
      mediaDelta,
      wallDelta + 0.25
    )
  );

  session.listenedSeconds +=
    creditedSeconds;

  submitQualifiedSongPlay(session);
}

/* =========================================================
   29. FINISH SONG LISTENING SESSION
========================================================= */

function finishSongListeningSession() {
  const session = activeSongPlaySession;

  if (!session || session.ended) {
    return;
  }

  session.ended = true;

  // Allow time for the backend's elapsed-time check.
  setTimeout(() => {
    submitQualifiedSongPlay(session);
  }, 1500);
}

/* =========================================================
   30. SUBMIT QUALIFIED SONG PLAY
========================================================= */

async function submitQualifiedSongPlay(session) {
  if (
    !session ||
    !session.sessionToken ||
    session.submitted ||
    session.submitting
  ) {
    return;
  }

  const requiredSeconds = session.ended
    ? Math.max(
        0,
        session.minimumSeconds - 0.75
      )
    : session.minimumSeconds + 1;

  if (
    session.listenedSeconds < requiredSeconds
  ) {
    return;
  }

  session.submitting = true;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/plays/songs/${encodeURIComponent(
        session.songId
      )}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          ...(session.token
            ? {
                Authorization:
                  `Bearer ${session.token}`
              }
            : {})
        },

        body: JSON.stringify({
          sessionToken: session.sessionToken,

          ...(session.token
            ? {}
            : {
                guestId: session.guestId
              })
        })
      }
    );

    const data = await playerReadResponse(response);

    if (!response.ok) {
      console.warn(
        "Song play was not counted:",
        data.message
      );
      return;
    }

    session.submitted = true;

    if (data.counted) {
      console.log(
        "Song play counted:",
        session.songId
      );
    }

  } catch (error) {
    console.error(
      "Unable to submit song play:",
      error
    );
  } finally {
    session.submitting = false;
  }
}

/* =========================================================
   31. FORMAT TIME
========================================================= */

function formatTime(seconds) {
  if (
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);

  const remainingSeconds =
    Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

/* =========================================================
   32. GET ARTIST NAMES
========================================================= */

function getPlayerArtistNames(artists) {
  if (!Array.isArray(artists)) {
    return "";
  }

  return artists
    .map((artist) => {
      if (
        !artist ||
        typeof artist === "string"
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

/* =========================================================
   33. ESCAPE HTML
========================================================= */

function escapePlayerHTML(value) {
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
