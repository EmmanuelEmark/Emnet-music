
/* =========================================================
   EMNET MUSIC — VIDEO DETAILS & SECURE PLAYBACK
   Cloudflare R2 + Legacy Media Support
========================================================= */

/* =========================================================
   1. VIDEO ID
========================================================= */

const params = new URLSearchParams(window.location.search);
const videoId = params.get("id");

/* =========================================================
   2. PAGE ELEMENTS
========================================================= */

const videoLoading = document.getElementById("videoLoading");
const videoError = document.getElementById("videoError");
const videoContent = document.getElementById("videoContent");

const mainVideoPlayer = document.getElementById("mainVideoPlayer");

const videoType = document.getElementById("videoType");
const videoTitle = document.getElementById("videoTitle");
const videoArtist = document.getElementById("videoArtist");
const videoViews = document.getElementById("videoViews");
const videoDuration = document.getElementById("videoDuration");

const linkedReleaseSection =
  document.getElementById("linkedReleaseSection");
const linkedReleaseCard =
  document.getElementById("linkedReleaseCard");
const linkedReleaseCover =
  document.getElementById("linkedReleaseCover");
const linkedReleaseTitle =
  document.getElementById("linkedReleaseTitle");
const linkedReleaseType =
  document.getElementById("linkedReleaseType");

const linkedSongSection =
  document.getElementById("linkedSongSection");
const linkedSongTitle =
  document.getElementById("linkedSongTitle");
const linkedSongGenre =
  document.getElementById("linkedSongGenre");
const linkedSongDuration =
  document.getElementById("linkedSongDuration");

const logoutButton = document.getElementById("logoutButton");
const guestLoginLink = document.getElementById("guestLoginLink");

const shareVideoButton =
  document.getElementById("shareVideoButton");
const videoShareMessage =
  document.getElementById("videoShareMessage");

const likeVideoButton =
  document.getElementById("likeVideoButton");
const videoLikeIcon =
  document.getElementById("videoLikeIcon");
const videoLikeCount =
  document.getElementById("videoLikeCount");
const videoLikeMessage =
  document.getElementById("videoLikeMessage");

const relatedVideosGrid =
  document.getElementById("relatedVideosGrid");
const relatedVideosMessage =
  document.getElementById("relatedVideosMessage");

/* =========================================================
   3. GLOBAL STATE
========================================================= */

let currentVideo = null;

const VIDEO_PLACEHOLDER =
  "https://placehold.co/1280x720/111612/35e67a?text=EmnetMusic";

const ARTWORK_PLACEHOLDER =
  "https://placehold.co/600x600/111612/35e67a?text=EmnetMusic";

let secureVideoUrl = null;
let secureVideoExpiresAt = null;

let videoPlaybackRequestId = 0;
let videoRecoveryAttempts = 0;
let videoRecoveryInProgress = false;
let videoPlaybackRequested = false;
let videoPlaybackWanted = false;
let videoSourceChanging = false;

const MAX_VIDEO_RECOVERY_ATTEMPTS = 2;

/* =========================================================
   4. AUTHENTICATION HELPERS
========================================================= */

function getVideoToken() {
  if (typeof getToken === "function") {
    return getToken();
  }

  return localStorage.getItem("token");
}

function getVideoUser() {
  if (typeof getStoredUser === "function") {
    return getStoredUser();
  }

  return null;
}

function getVideoReturnUrl() {
  return window.location.pathname + window.location.search;
}

function redirectVideoLogin() {
  window.location.href =
    `login.html?redirect=${encodeURIComponent(
      getVideoReturnUrl()
    )}`;
}

function updateVideoNavigation() {
  const loggedIn = Boolean(getVideoToken());

  if (logoutButton) {
    logoutButton.hidden = !loggedIn;
  }

  if (guestLoginLink) {
    guestLoginLink.hidden = loggedIn;

    guestLoginLink.href =
      `login.html?redirect=${encodeURIComponent(
        getVideoReturnUrl()
      )}`;
  }
}

if (logoutButton) {
  logoutButton.addEventListener("click", logout);
}


/* =========================================================
   5. START VIDEO PAGE
========================================================= */

startVideoPage();

async function startVideoPage() {
  updateVideoNavigation();

  if (!videoId) {
    showVideoError("Video ID is missing.");
    return;
  }

  if (!mainVideoPlayer) {
    showVideoError("Video player element was not found.");
    return;
  }

  setupVideoPlayerEvents();

  // Load video details immediately.
  // Do not wait for the music player component.
  await loadVideo();

  // Initialize the music player independently.
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
}

/* =========================================================
   6. LOAD VIDEO DETAILS
========================================================= */

async function loadVideo() {
  try {
    if (videoLoading) {
      videoLoading.style.display = "";
    }

    if (videoError) {
      videoError.style.display = "none";
      videoError.textContent = "";
    }

    const response = await fetch(
      `${API_BASE_URL}/api/videos/${encodeURIComponent(videoId)}`
    );

    if (!response.ok) {
      throw new Error(
        `Unable to load video (${response.status}).`
      );
    }

    const data = await response.json();

    if (!data.video) {
      throw new Error(
        "Video information was not returned."
      );
    }

    currentVideo = data.video;

    if (
      currentVideo.status !== "approved" ||
      (
        currentVideo.visibilityStatus != null &&
        currentVideo.visibilityStatus !== "visible"
      )
    ) {
      throw new Error(
        "This video is not available for public viewing."
      );
    }

    renderVideo();

    if (videoLoading) {
      videoLoading.style.display = "none";
    }

    if (videoError) {
      videoError.style.display = "none";
    }

    if (videoContent) {
      videoContent.classList.add("active");
    }

    loadVideoLikes();
    loadRelatedVideos();

    await loadSecureVideoPlayback();

  } catch (error) {
    console.error("Video page error:", error);

    showVideoError(
      error.message || "Unable to load video."
    );
  }
}

/* =========================================================
   7. RENDER VIDEO DETAILS
========================================================= */

function renderVideo() {
  if (!currentVideo) return;

  document.title =
    `${currentVideo.title || "Video"} | EmnetMusic`;

  if (videoType) {
    videoType.textContent =
      formatVideoType(currentVideo.videoType);
  }

  if (videoTitle) {
    videoTitle.textContent =
      currentVideo.title || "Untitled Video";
  }

  if (videoArtist) {
    videoArtist.textContent =
      getVideoArtistNames(
        currentVideo.primaryArtists
      ) || "Artist";
  }

  updateVideoViewDisplay(currentVideo.viewCount);

  if (videoDuration) {
    videoDuration.textContent =
      formatDuration(currentVideo.duration);
  }

  if (mainVideoPlayer) {
    mainVideoPlayer.poster =
      safeVideoImage(currentVideo.thumbnailUrl);
  }

  renderArtistLink();
  renderLinkedRelease();
  renderLinkedSong();

  loadSecureVideoThumbnail();
}

/* =========================================================
   8. SECURE MEDIA REQUESTS
========================================================= */

async function requestVideoMedia(endpoint) {
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      method: "GET",
      cache: "no-store"
    }
  );

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "The media server returned an invalid response."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      `Media request failed (${response.status}).`
    );
  }

  const mediaUrl =
    data.playbackUrl ||
    data.mediaUrl ||
    null;

  if (!mediaUrl) {
    throw new Error(
      "The media server did not return a URL."
    );
  }

  return {
    url: mediaUrl,
    source: data.source || "unknown",
    expiresIn: data.expiresIn
  };
}

function getVideoDocumentId(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    return value._id || value.id || null;
  }

  return null;
}

/* =========================================================
   9. SECURE VIDEO PLAYBACK
========================================================= */

async function requestSecureVideoUrl() {
  return requestVideoMedia(
    `/api/media/videos/${encodeURIComponent(
      videoId
    )}/play`
  );
}

async function loadSecureVideoPlayback() {
  const requestId = ++videoPlaybackRequestId;

  videoPlaybackRequested = true;
  videoRecoveryAttempts = 0;

  try {
    const result = await requestSecureVideoUrl();

    if (requestId !== videoPlaybackRequestId) {
      return;
    }

    secureVideoUrl = result.url;

    secureVideoExpiresAt =
      Number.isFinite(result.expiresIn) &&
      result.expiresIn > 0
        ? Date.now() + result.expiresIn * 1000
        : null;

    videoSourceChanging = true;

    mainVideoPlayer.src = result.url;
    mainVideoPlayer.load();

    videoSourceChanging = false;

    clearVideoPlaybackMessage();

  } catch (error) {
    videoSourceChanging = false;

    if (requestId !== videoPlaybackRequestId) {
      return;
    }

    console.error(
      "Secure video playback error:",
      error
    );

    showVideoPlaybackMessage(
      "This video is temporarily unavailable."
    );
  }
}

/* =========================================================
   10. SECURE VIDEO THUMBNAIL
========================================================= */


async function loadSecureVideoThumbnail() {
  if (!currentVideo || !mainVideoPlayer) {
    return;
  }

  try {
    const result = await requestVideoMedia(
      `/api/media/videos/${encodeURIComponent(
        videoId
      )}/thumbnail`
    );

    if (currentVideo) {
      mainVideoPlayer.poster =
        safeVideoImage(result.url);
    }

  } catch (error) {
    console.warn(
      "Video thumbnail unavailable:",
      error.message
    );
  }
}

/* =========================================================
   11. SECURE RELEASE ARTWORK
========================================================= */

async function applySecureReleaseArtwork(
  image,
  release
) {
  const releaseId = getVideoDocumentId(release);

  if (!image || !releaseId) {
    return;
  }

  try {
    const result = await requestVideoMedia(
      `/api/media/releases/${encodeURIComponent(
        releaseId
      )}/artwork`
    );

    if (image.isConnected) {
      image.src = safeVideoImage(result.url);
    }

  } catch (error) {
    console.warn(
      "Linked release artwork unavailable:",
      error.message
    );
  }
}

/* =========================================================
   12. VIDEO PLAYBACK RECOVERY
========================================================= */

async function recoverSecureVideoPlayback() {
  if (
    !currentVideo ||
    !mainVideoPlayer ||
    videoRecoveryInProgress ||
    videoRecoveryAttempts >=
      MAX_VIDEO_RECOVERY_ATTEMPTS
  ) {
    if (
      videoRecoveryAttempts >=
      MAX_VIDEO_RECOVERY_ATTEMPTS
    ) {
      showVideoPlaybackMessage(
        "Video playback failed. Please reload the page."
      );
    }

    return;
  }

  videoRecoveryInProgress = true;
  videoRecoveryAttempts += 1;

  const requestId = ++videoPlaybackRequestId;

  const previousTime =
    Number.isFinite(mainVideoPlayer.currentTime)
      ? mainVideoPlayer.currentTime
      : 0;

  const shouldResume = videoPlaybackWanted;

  try {
    const result = await requestSecureVideoUrl();

    if (requestId !== videoPlaybackRequestId) {
      return;
    }

    secureVideoUrl = result.url;

    secureVideoExpiresAt =
      Number.isFinite(result.expiresIn) &&
      result.expiresIn > 0
        ? Date.now() + result.expiresIn * 1000
        : null;

    videoSourceChanging = true;

    await new Promise((resolve, reject) => {
      let settled = false;

      const timeout = setTimeout(() => {
        finish(
          new Error("Video loading timed out.")
        );
      }, 15000);

      function cleanup() {
        clearTimeout(timeout);

        mainVideoPlayer.removeEventListener(
          "loadedmetadata",
          onLoaded
        );

        mainVideoPlayer.removeEventListener(
          "error",
          onError
        );
      }

      function finish(error = null) {
        if (settled) return;

        settled = true;
        cleanup();

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }

      function onLoaded() {
        finish();
      }

      function onError() {
        finish(
          new Error(
            "The replacement video source could not load."
          )
        );
      }

      mainVideoPlayer.addEventListener(
        "loadedmetadata",
        onLoaded
      );

      mainVideoPlayer.addEventListener(
        "error",
        onError
      );

      mainVideoPlayer.src = result.url;
      mainVideoPlayer.load();
    });

    if (requestId !== videoPlaybackRequestId) {
      return;
    }

    if (previousTime > 0) {
      try {
        const duration = mainVideoPlayer.duration;

        const restoreTime =
          Number.isFinite(duration)
            ? Math.min(
                previousTime,
                Math.max(duration - 0.25, 0)
              )
            : previousTime;

        mainVideoPlayer.currentTime = restoreTime;

      } catch (error) {
        console.warn(
          "Could not restore playback position:",
          error
        );
      }
    }

    videoSourceChanging = false;

    if (shouldResume) {
      try {
        await mainVideoPlayer.play();
      } catch (error) {
        console.warn(
          "Automatic resume was blocked:",
          error.message
        );
      }
    }

    clearVideoPlaybackMessage();

  } catch (error) {
    console.error(
      "Video playback recovery failed:",
      error
    );

    showVideoPlaybackMessage(
      "Playback was interrupted. Please try again."
    );

  } finally {
    videoSourceChanging = false;
    videoRecoveryInProgress = false;
  }
}

/* =========================================================
   13. PLAYER EVENT LISTENERS
========================================================= */

function setupVideoPlayerEvents() {
  if (!mainVideoPlayer) return;

  mainVideoPlayer.addEventListener("play", () => {
    videoPlaybackWanted = true;

    if (!viewSessionToken && !viewStartPromise) {
      beginVideoViewSession();
    }

    lastVideoPlaybackTime =
      mainVideoPlayer.currentTime;
  });

  mainVideoPlayer.addEventListener("pause", () => {
    if (
      !videoSourceChanging &&
      !videoRecoveryInProgress &&
      !mainVideoPlayer.ended
    ) {
      videoPlaybackWanted = false;
    }
  });

  mainVideoPlayer.addEventListener(
    "timeupdate",
    trackVideoWatchTime
  );

  mainVideoPlayer.addEventListener("seeking", () => {
    lastVideoPlaybackTime = null;
  });

  mainVideoPlayer.addEventListener("seeked", () => {
    lastVideoPlaybackTime =
      mainVideoPlayer.currentTime;
  });

  mainVideoPlayer.addEventListener("ended", () => {
    videoPlaybackWanted = false;

    if (
      watchedVideoSeconds >=
      requiredWatchSeconds - 1
    ) {
      watchedVideoSeconds = Math.max(
        watchedVideoSeconds,
        requiredWatchSeconds
      );

      setTimeout(recordVideoView, 1200);
    }
  });

  mainVideoPlayer.addEventListener("error", () => {
    if (
      !videoPlaybackRequested ||
      videoSourceChanging ||
      videoRecoveryInProgress
    ) {
      return;
    }

    recoverSecureVideoPlayback();
  });
}

/* =========================================================
   14. VIDEO PLAYER MESSAGES
========================================================= */

function showVideoPlaybackMessage(message) {
  if (videoError) {
    videoError.textContent = message;
    videoError.style.display = "block";
  }
}

function clearVideoPlaybackMessage() {
  if (videoError) {
    videoError.textContent = "";
    videoError.style.display = "none";
  }
}

function showVideoError(message) {
  if (videoLoading) {
    videoLoading.style.display = "none";
  }

  if (videoContent) {
    videoContent.classList.remove("active");
  }

  if (videoError) {
    videoError.style.display = "block";
    videoError.textContent =
      message || "Unable to load video.";
  }
}

/* =========================================================
   15. ARTIST LINK
========================================================= */

function renderArtistLink() {
  if (!videoArtist || !currentVideo) {
    return;
  }

  const artist = Array.isArray(
    currentVideo.primaryArtists
  )
    ? currentVideo.primaryArtists[0]
    : null;

  const artistId = getVideoDocumentId(artist);

  if (!artistId) {
    videoArtist.style.cursor = "default";
    return;
  }

  videoArtist.style.cursor = "pointer";

  videoArtist.onclick = () => {
    window.location.href =
      `/artist?id=${encodeURIComponent(
        artistId
      )}`;
  };
}

/* =========================================================
   16. LINKED RELEASE
========================================================= */

function renderLinkedRelease() {
  const release = currentVideo?.linkedRelease;

  if (!linkedReleaseSection) return;

  if (!release) {
    linkedReleaseSection.style.display = "none";
    return;
  }

  linkedReleaseSection.style.display = "";

  if (linkedReleaseCover) {
    linkedReleaseCover.src =
      safeVideoImage(
        release.coverImage,
        ARTWORK_PLACEHOLDER
      );

    linkedReleaseCover.onerror = () => {
      linkedReleaseCover.onerror = null;
      linkedReleaseCover.src =
        ARTWORK_PLACEHOLDER;
    };

    applySecureReleaseArtwork(
      linkedReleaseCover,
      release
    );
  }

  if (linkedReleaseTitle) {
    linkedReleaseTitle.textContent =
      release.title || "Release";
  }

  if (linkedReleaseType) {
    linkedReleaseType.textContent =
      release.releaseType || "Release";
  }

  const releaseId =
    getVideoDocumentId(release);

  if (linkedReleaseCard && releaseId) {
    linkedReleaseCard.style.cursor = "pointer";

    linkedReleaseCard.onclick = () => {
      window.location.href =
        `/release?id=${encodeURIComponent(
          releaseId
        )}`;
    };
  }
}

/* =========================================================
   17. LINKED SONG
========================================================= */

function renderLinkedSong() {
  const song = currentVideo?.linkedSong;

  if (!linkedSongSection) return;

  if (!song) {
    linkedSongSection.style.display = "none";
    return;
  }

  linkedSongSection.style.display = "";

  if (linkedSongTitle) {
    linkedSongTitle.textContent =
      song.title || "Song";
  }

  if (linkedSongGenre) {
    linkedSongGenre.textContent =
      song.genre || "Music";
  }

  if (linkedSongDuration) {
    linkedSongDuration.textContent =
      formatDuration(song.duration);
  }
}

/* =========================================================
   18. FORMAT HELPERS
========================================================= */

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

function formatVideoType(value) {
  if (!value) return "VIDEO";

  return String(value)
    .replaceAll("_", " ")
    .toUpperCase();
}

function formatViews(value) {
  const views = Number(value) || 0;

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

function formatDuration(seconds) {
  const total = Number(seconds);

  if (
    !Number.isFinite(total) ||
    total < 0
  ) {
    return "0:00";
  }

  const minutes = Math.floor(total / 60);

  const remaining = Math.floor(total % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${remaining}`;
}

function safeVideoImage(
  imageUrl,
  fallback = VIDEO_PLACEHOLDER
) {
  if (
    typeof imageUrl !== "string" ||
    !imageUrl.trim()
  ) {
    return fallback;
  }

  try {
    const url = new URL(
      imageUrl,
      window.location.href
    );

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return fallback;
    }

    return url.href;
  } catch {
    return fallback;
  }
}

function updateVideoViewDisplay(count) {
  if (!videoViews) return;

  const value = Number(count) || 0;

  videoViews.textContent =
    `${formatViews(value)} ${
      value === 1 ? "view" : "views"
    }`;
}

/* =========================================================
   19. VIDEO VIEW TRACKING
========================================================= */

const GUEST_VIEW_TOKEN_KEY =
  "emnetGuestVideoToken";

let viewSessionToken = null;
let viewStartPromise = null;
let viewSubmissionPending = false;
let viewSubmitted = false;

let watchedVideoSeconds = 0;
let lastVideoPlaybackTime = null;
let requiredWatchSeconds = 30;

function getVideoViewHeaders() {
  const token = getVideoToken();

  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    const guestToken = localStorage.getItem(
      GUEST_VIEW_TOKEN_KEY
    );

    if (guestToken) {
      headers["X-Emnet-Guest"] = guestToken;
    }
  }

  return headers;
}

async function beginVideoViewSession() {
  if (viewSessionToken) {
    return;
  }

  if (viewStartPromise) {
    return viewStartPromise;
  }

  viewStartPromise = (async () => {
    const url =
      `${API_BASE_URL}/api/views/videos/${encodeURIComponent(
        videoId
      )}/start`;

    let response = await fetch(url, {
      method: "POST",
      headers: getVideoViewHeaders()
    });

    if (
      response.status === 401 &&
      !getVideoToken()
    ) {
      localStorage.removeItem(
        GUEST_VIEW_TOKEN_KEY
      );

      response = await fetch(url, {
        method: "POST",
        headers: getVideoViewHeaders()
      });
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.message ||
        "Could not start video view."
      );
    }

    viewSessionToken = data.viewSessionToken;

    requiredWatchSeconds =
      Number(data.requiredWatchSeconds) || 30;

    if (data.guestToken) {
      localStorage.setItem(
        GUEST_VIEW_TOKEN_KEY,
        data.guestToken
      );
    }

    if (
      watchedVideoSeconds >=
      requiredWatchSeconds - 0.5
    ) {
      await recordVideoView();
    }
  })();

  try {
    await viewStartPromise;
  } catch (error) {
    console.error(
      "Video view session error:",
      error.message
    );
  } finally {
    viewStartPromise = null;
  }
}

function trackVideoWatchTime() {
  if (!mainVideoPlayer) return;

  const currentTime =
    mainVideoPlayer.currentTime;

  if (
    lastVideoPlaybackTime === null ||
    mainVideoPlayer.seeking ||
    mainVideoPlayer.paused
  ) {
    lastVideoPlaybackTime = currentTime;
    return;
  }

  const difference =
    currentTime - lastVideoPlaybackTime;

  lastVideoPlaybackTime = currentTime;

  if (
    difference > 0 &&
    difference <= 3
  ) {
    watchedVideoSeconds += difference;
  }

  if (
    watchedVideoSeconds >=
    requiredWatchSeconds - 0.5
  ) {
    recordVideoView();
  }
}

async function recordVideoView() {
  if (
    viewSubmitted ||
    viewSubmissionPending ||
    !viewSessionToken ||
    watchedVideoSeconds <
      requiredWatchSeconds - 0.5
  ) {
    return;
  }

  viewSubmissionPending = true;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/views/videos/${encodeURIComponent(
        videoId
      )}`,
      {
        method: "POST",
        headers: getVideoViewHeaders(),
        body: JSON.stringify({
          viewSessionToken
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      if (response.status !== 400) {
        console.error(
          "Video view error:",
          data.message
        );
      }

      return;
    }

    viewSubmitted = true;

    if (typeof data.viewCount === "number") {
      if (currentVideo) {
        currentVideo.viewCount = data.viewCount;
      }

      updateVideoViewDisplay(data.viewCount);
    }

  } catch (error) {
    console.error(
      "Video view request failed:",
      error.message
    );
  } finally {
    viewSubmissionPending = false;
  }
}

/* =========================================================
   20. SHARE VIDEO
========================================================= */

if (shareVideoButton) {
  shareVideoButton.addEventListener(
    "click",
    shareCurrentVideo
  );
}

async function shareCurrentVideo() {
  if (!currentVideo || !videoId) {
    return;
  }

  const title =
    currentVideo.title || "Music video";

  const artistName =
    getVideoArtistNames(
      currentVideo.primaryArtists
    ) || "EmnetMusic";

  const shareUrl = new URL(
    "video.html",
    window.location.href
  );

  shareUrl.search = "";
  shareUrl.searchParams.set("id", videoId);

  const shareText =
    `Watch ${title} by ${artistName} on EmnetMusic.`;

  if (videoShareMessage) {
    videoShareMessage.textContent = "";
  }

  try {
    if (navigator.share) {
      await navigator.share({
        title,
        text: shareText,
        url: shareUrl.href
      });

      return;
    }

    if (!navigator.clipboard?.writeText) {
      throw new Error(
        "Clipboard sharing is unavailable."
      );
    }

    await navigator.clipboard.writeText(
      shareUrl.href
    );

    if (videoShareMessage) {
      videoShareMessage.textContent =
        "Video link copied successfully.";
    }

  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    console.error(
      "Video sharing error:",
      error
    );

    if (videoShareMessage) {
      videoShareMessage.textContent =
        "Unable to copy automatically. Copy the page URL to share.";
    }
  }
}

/* =========================================================
   21. VIDEO LIKES
========================================================= */

let currentVideoLiked = false;
let videoLikeBusy = false;

function getVideoLikeToken() {
  return getVideoToken();
}

function updateVideoLikeButton(liked, count) {
  currentVideoLiked = Boolean(liked);

  const total = Number(count) || 0;

  if (videoLikeIcon) {
    videoLikeIcon.textContent =
      liked ? "♥" : "♡";
  }

  if (videoLikeCount) {
    videoLikeCount.textContent =
      `${total} ${
        total === 1 ? "like" : "likes"
      }`;
  }

  if (likeVideoButton) {
    likeVideoButton.classList.toggle(
      "liked",
      Boolean(liked)
    );

    likeVideoButton.setAttribute(
      "aria-pressed",
      String(Boolean(liked))
    );
  }
}

async function loadVideoLikes() {
  if (!videoId) return;

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/video-likes/${encodeURIComponent(
        videoId
      )}`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to load video likes."
      );
    }

    const likeCount =
      Number(data.likeCount) || 0;

    updateVideoLikeButton(false, likeCount);

    const token = getVideoLikeToken();
    const user = getVideoUser();

    if (
      !token ||
      user?.role !== "listener"
    ) {
      return;
    }

    const myResponse = await fetch(
      `${API_BASE_URL}/api/video-likes/${encodeURIComponent(
        videoId
      )}/me`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!myResponse.ok) return;

    const myData = await myResponse.json();

    updateVideoLikeButton(
      Boolean(myData.liked),
      likeCount
    );

  } catch (error) {
    console.error(
      "Load video likes error:",
      error
    );

    if (videoLikeMessage) {
      videoLikeMessage.textContent =
        "Unable to load video likes.";
    }
  }
}

async function toggleVideoLike() {
  if (
    !videoId ||
    videoLikeBusy ||
    !likeVideoButton
  ) {
    return;
  }

  const token = getVideoLikeToken();

  if (!token) {
    redirectVideoLogin();
    return;
  }

  const user = getVideoUser();

  if (user?.role !== "listener") {
    if (videoLikeMessage) {
      videoLikeMessage.textContent =
        "Video likes are available to listener accounts.";
    }

    return;
  }

  videoLikeBusy = true;
  likeVideoButton.disabled = true;

  if (videoLikeMessage) {
    videoLikeMessage.textContent = "";
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/video-likes/${encodeURIComponent(
        videoId
      )}`,
      {
        method: currentVideoLiked
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
        "Unable to update video like."
      );
    }

    updateVideoLikeButton(
      Boolean(data.liked),
      data.likeCount
    );

  } catch (error) {
    console.error(
      "Video like error:",
      error
    );

    if (videoLikeMessage) {
      videoLikeMessage.textContent =
        error.message;
    }

  } finally {
    videoLikeBusy = false;
    likeVideoButton.disabled = false;
  }
}

if (likeVideoButton) {
  likeVideoButton.addEventListener(
    "click",
    toggleVideoLike
  );
}

/* =========================================================
   22. RELATED VIDEO HELPERS
========================================================= */

function getRelatedArtistIds(video) {
  if (
    !Array.isArray(video?.primaryArtists)
  ) {
    return [];
  }

  return video.primaryArtists
    .map((artist) => {
      if (typeof artist === "string") {
        return artist;
      }

      return artist?._id;
    })
    .filter(Boolean)
    .map(String);
}

function safeRelatedThumbnail(url) {
  return safeVideoImage(url);
}

/* =========================================================
   23. SECURE RELATED THUMBNAILS
========================================================= */

async function loadRelatedVideoThumbnail(
  image,
  relatedVideo
) {
  const relatedId =
    getVideoDocumentId(relatedVideo);

  if (!relatedId || !image) {
    return;
  }

  try {
    const result = await requestVideoMedia(
      `/api/media/videos/${encodeURIComponent(
        relatedId
      )}/thumbnail`
    );

    if (image.isConnected) {
      image.src =
        safeRelatedThumbnail(result.url);
    }

  } catch (error) {
    console.warn(
      "Related video thumbnail unavailable:",
      relatedId,
      error.message
    );
  }
}

/* =========================================================
   24. CREATE RELATED VIDEO CARD
========================================================= */

function createRelatedVideoCard(video) {
  const card = document.createElement("a");

  card.className = "related-video-card";

  card.href =
    `video.html?id=${encodeURIComponent(
      video._id
    )}`;

  const thumbnailWrapper =
    document.createElement("div");

  thumbnailWrapper.className =
    "related-video-thumbnail";

  const image = document.createElement("img");

  image.src =
    safeRelatedThumbnail(
      video.thumbnailUrl
    );

  image.alt =
    video.title || "Related video";

  image.loading = "lazy";

  image.addEventListener("error", () => {
    if (image.src !== VIDEO_PLACEHOLDER) {
      image.src = VIDEO_PLACEHOLDER;
    }
  });

  const duration =
    document.createElement("span");

  duration.className =
    "related-video-duration";

  duration.textContent =
    formatDuration(video.duration || 0);

  thumbnailWrapper.appendChild(image);
  thumbnailWrapper.appendChild(duration);

  const information =
    document.createElement("div");

  information.className =
    "related-video-information";

  const title = document.createElement("h3");

  title.textContent =
    video.title || "Untitled Video";

  const artist = document.createElement("p");

  artist.className =
    "related-video-artist";

  artist.textContent =
    getVideoArtistNames(
      video.primaryArtists
    ) || "EmnetMusic Artist";

  const views = document.createElement("p");

  views.className =
    "related-video-views";

  const count =
    Number(video.viewCount) || 0;

  views.textContent =
    `${formatViews(count)} ${
      count === 1 ? "view" : "views"
    }`;

  information.appendChild(title);
  information.appendChild(artist);
  information.appendChild(views);

  card.appendChild(thumbnailWrapper);
  card.appendChild(information);

  loadRelatedVideoThumbnail(image, video);

  return card;
}

/* =========================================================
   25. LOAD RELATED VIDEOS
========================================================= */

async function loadRelatedVideos() {
  if (
    !currentVideo ||
    !relatedVideosGrid ||
    !relatedVideosMessage
  ) {
    return;
  }

  relatedVideosMessage.textContent =
    "Loading related videos...";

  relatedVideosGrid.replaceChildren();

  try {
    const response = await fetch(
     `${API_BASE_URL}/api/videos`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
        "Unable to load related videos."
      );
    }

    const allVideos =
      Array.isArray(data.videos)
        ? data.videos
        : [];

    const availableVideos =
      allVideos.filter((video) => {
        return (
          video._id &&
          String(video._id) !==
            String(currentVideo._id) &&
          video.status === "approved" &&
          (
            video.visibilityStatus === "visible" ||
            video.visibilityStatus == null
          )
        );
      });

    const currentArtistIds = new Set(
      getRelatedArtistIds(currentVideo)
    );

    const sameArtistVideos = [];
    const otherVideos = [];

    availableVideos.forEach((video) => {
      const artistIds =
        getRelatedArtistIds(video);

      const sameArtist =
        artistIds.some((id) =>
          currentArtistIds.has(id)
        );

      if (sameArtist) {
        sameArtistVideos.push(video);
      } else {
        otherVideos.push(video);
      }
    });

    const relatedVideos = [
      ...sameArtistVideos,
      ...otherVideos
    ].slice(0, 6);

    if (!relatedVideos.length) {
      relatedVideosMessage.textContent =
        "More videos are coming soon.";

      return;
    }

    const fragment =
      document.createDocumentFragment();

    relatedVideos.forEach((video) => {
      fragment.appendChild(
        createRelatedVideoCard(video)
      );
    });

    relatedVideosGrid.appendChild(fragment);

    relatedVideosMessage.textContent = "";

  } catch (error) {
    console.error(
      "Related videos error:",
      error
    );

    relatedVideosMessage.textContent =
      "Related videos are temporarily unavailable.";
  }
}
