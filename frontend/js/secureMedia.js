
/* ==========================================================
   EMNET MUSIC — SECURE MEDIA DELIVERY

   Supports:
   - Private Cloudflare R2 audio
   - Legacy audio URLs returned by backend
   - Secure release artwork
   - Secure video thumbnails
   - Secure video playback URLs
   - Signed URL renewal
   - Audio playback recovery
   - Request cancellation
   - Protection against stale requests

   Uses API_BASE_URL from config.js
========================================================== */

const EmnetSecureMedia = (() => {

  /* ========================================================
     1. CONFIGURATION
  ======================================================== */

  const AUDIO_REFRESH_MARGIN_MS =
    60 * 1000;

  const URL_EXPIRY_MARGIN_MS =
    30 * 1000;

  const DEFAULT_ARTWORK_CACHE_MS =
    5 * 60 * 1000;

  const DEFAULT_VIDEO_CACHE_MS =
    5 * 60 * 1000;

  const RENEWAL_RETRY_MS =
    15 * 1000;

  /* ========================================================
     2. PLAYBACK STATE
  ======================================================== */

  let playbackRequestId = 0;

  let playbackAbortController = null;

  let renewalTimer = null;

  let currentPlaybackInfo = null;

  let renewalInProgress = false;

  let recoveryInProgress = false;

  /* ========================================================
     3. MEDIA CACHES
  ======================================================== */

  const artworkCache = new Map();

  const thumbnailCache = new Map();

  const pendingArtworkRequests = new Map();

  const pendingThumbnailRequests = new Map();

  // Artist profile and cover image caches
  const artistImageCache = new Map();
  const pendingArtistImageRequests = new Map();

  // Track unfinished media requests for cancellation.
const pendingMediaControllers = new Set();

// Identify the current generation of cached media.
let mediaCacheGeneration = 0;
  const artistImageStates = new WeakMap();

  // Track automatic renewal for release artwork
const artworkImageStates = new WeakMap();

const ARTWORK_REFRESH_MARGIN_MS = 60 * 1000;
const ARTWORK_RETRY_MS = 30 * 1000;

// Video thumbnail automatic renewal
const thumbnailImageStates = new WeakMap();

const THUMBNAIL_REFRESH_MARGIN_MS = 60 * 1000;
const THUMBNAIL_RETRY_MS = 30 * 1000;



  /* ========================================================
     4. API URL
  ======================================================== */

  function apiUrl(path) {

    if (
      typeof API_BASE_URL === "undefined" ||
      !API_BASE_URL
    ) {
      throw new Error(
        "API_BASE_URL is not configured."
      );
    }

    return (
      API_BASE_URL.replace(/\/$/, "") +
      path
    );

  }

  /* ========================================================
     5. MEDIA REQUEST
  ======================================================== */

  async function requestMedia(
    path,
    signal
  ) {

    const response = await fetch(
      apiUrl(path),
      {
        method: "GET",
        cache: "no-store",
        signal
      }
    );

    let data = {};

    try {
      data = await response.json();
    } catch (error) {
      // Preserve the HTTP error handling below.
    }

    if (
      !response.ok ||
      data.success === false
    ) {
      throw new Error(
        data.message ||
        "Media is unavailable."
      );
    }

    return data;

  }

  /* ========================================================
     6. SIGNED URL HELPERS
  ======================================================== */

  function getMediaUrl(data) {

    return (
      data?.playbackUrl ||
      data?.mediaUrl ||
      null
    );

  }

  function getExpiresAt(
    data,
    defaultCacheMs = null
  ) {

    const expiresIn =
      Number(data?.expiresIn);

    if (
      Number.isFinite(expiresIn) &&
      expiresIn > 0
    ) {
      return (
        Date.now() +
        expiresIn * 1000
      );
    }

    if (defaultCacheMs !== null) {
      return (
        Date.now() +
        defaultCacheMs
      );
    }

    return null;

  }

  function isCacheValid(entry) {

    return Boolean(
      entry &&
      entry.url &&
      entry.expiresAt &&
      entry.expiresAt >
        Date.now() +
        URL_EXPIRY_MARGIN_MS
    );

  }

  /* ========================================================
     7. CLEAR RENEWAL TIMER
  ======================================================== */

  function clearRenewalTimer() {

    if (renewalTimer !== null) {

      clearTimeout(renewalTimer);

      renewalTimer = null;

    }

  }

  /* ========================================================
     8. CANCEL PENDING PLAYBACK
  ======================================================== */

  function cancelPendingPlayback() {

    playbackRequestId += 1;

    if (playbackAbortController) {

      playbackAbortController.abort();

      playbackAbortController = null;

    }

    clearRenewalTimer();

    currentPlaybackInfo = null;

    renewalInProgress = false;

    recoveryInProgress = false;

  }

  /* ========================================================
     9. GET SECURE AUDIO URL
  ======================================================== */

  async function getAudioUrl(
    songId,
    signal
  ) {

    if (!songId) {
      throw new Error(
        "Song ID is required."
      );
    }

    return requestMedia(
    `/api/media/songs/${encodeURIComponent(songId)}/play`,
      signal
    );

  }

  /* ========================================================
     10. GET SECURE ARTWORK URL
  ======================================================== */

  async function getArtworkUrl(
    releaseId,
    forceRefresh = false
  ) {

    if (!releaseId) {
      throw new Error(
        "Release ID is required."
      );
    }

    const key = String(releaseId);

    const cached =
      artworkCache.get(key);

    if (!forceRefresh && isCacheValid(cached)) {
    return cached.url;
    }

    if (
      pendingArtworkRequests.has(key)
    ) {
      return pendingArtworkRequests.get(
        key
      );
    }

   const controller = new AbortController();

  const generation = mediaCacheGeneration;

  pendingMediaControllers.add(controller);

  const request = (async () => {

  const data = await requestMedia(
    `/api/media/releases/${encodeURIComponent(key)}/artwork`,
    controller.signal
  );

      const url = getMediaUrl(data);

      if (!url) {
        throw new Error(
          "Artwork URL is missing."
        );
      }

     const expiresIn = Number(data.expiresIn);

    const isSigned = Number.isFinite(expiresIn) && expiresIn > 0;

   if (generation === mediaCacheGeneration) {
  artworkCache.set(key, {
    url,
    expiresAt: getExpiresAt(data, DEFAULT_ARTWORK_CACHE_MS),
    isSigned
  });
}

      return url;

    })();

       pendingArtworkRequests.set(key, request);

    try {
      return await request;

    } finally {
      pendingMediaControllers.delete(controller);

      if (pendingArtworkRequests.get(key) === request) {
        pendingArtworkRequests.delete(key);
      }
    }
  }

 function getArtworkExpiry(releaseId) {
  if (!releaseId) {
    return null;
  }

  const cached = artworkCache.get(String(releaseId));

  if (!cached || !cached.isSigned) {
    return null;
  }

  return cached.expiresAt ?? null;
}



function stopArtworkRenewal(imageElement) {
  const state = artworkImageStates.get(imageElement);

  if (!state) return;

  state.stopped = true;

  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  artworkImageStates.delete(imageElement);
}

function scheduleArtworkRenewal(imageElement, state) {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  if (
    state.stopped ||
    artworkImageStates.get(imageElement) !== state ||
    !imageElement.isConnected
  ) {
    return;
  }

  const expiresAt = getArtworkExpiry(state.releaseId);

  if (!expiresAt) return;

  const delay = Math.max(
    1000,
    expiresAt - Date.now() - ARTWORK_REFRESH_MARGIN_MS
  );

  state.timer = setTimeout(
    () => renewArtworkImage(imageElement, state),
    delay
  );
}

async function renewArtworkImage(imageElement, state) {
  if (
    state.stopped ||
    artworkImageStates.get(imageElement) !== state ||
    !imageElement.isConnected
  ) {
    stopArtworkRenewal(imageElement);
    return;
  }

  try {
   const cached = artworkCache.get(state.releaseId);

const shouldRefresh =
  !cached ||
  !isCacheValid(cached);

const url = await getArtworkUrl(
  state.releaseId,
  shouldRefresh
);

    if (
      state.stopped ||
      artworkImageStates.get(imageElement) !== state ||
      !imageElement.isConnected
    ) {
      return;
    }

    if (imageElement.src !== url) {
      imageElement.src = url;
    }

    scheduleArtworkRenewal(imageElement, state);
  } catch (error) {
    console.warn(
      "Unable to renew release artwork:",
      state.releaseId,
      error.message
    );

    if (
      !state.stopped &&
      artworkImageStates.get(imageElement) === state &&
      imageElement.isConnected
    ) {
      state.timer = setTimeout(
        () => renewArtworkImage(imageElement, state),
        ARTWORK_RETRY_MS
      );
    }
  }
}

  /* ========================================================
     11. SET ARTWORK ON IMAGE ELEMENTS
  ======================================================== */

 async function setArtwork(
  releaseId,
  imageElements,
  fallbackUrl
) {
  const elements = Array.isArray(imageElements)
    ? imageElements.filter(Boolean)
    : [imageElements].filter(Boolean);

  const releaseKey = releaseId
    ? String(releaseId)
    : "";

  // Stop previous renewal timers when images are reused.
  elements.forEach((element) => {
    stopArtworkRenewal(element);

    element.dataset.emnetReleaseId = releaseKey;

    if (fallbackUrl) {
      element.src = fallbackUrl;
    }
  });

  if (!releaseKey || elements.length === 0) {
    return;
  }

  // Create a separate renewal state for each image.
  const imageStates = elements.map((element) => {
    const state = {
      releaseId: releaseKey,
      timer: null,
      stopped: false
    };

    artworkImageStates.set(element, state);

    return { element, state };
  });

  try {
    const url = await getArtworkUrl(releaseKey);

    imageStates.forEach(({ element, state }) => {
      // Ignore outdated requests and removed images.
      if (
        state.stopped ||
        artworkImageStates.get(element) !== state ||
        element.dataset.emnetReleaseId !== releaseKey ||
        !element.isConnected
      ) {
        return;
      }

      element.src = url;

      // Schedule renewal before the signed URL expires.
      scheduleArtworkRenewal(element, state);
    });
  } catch (error) {
    console.warn(
      "Unable to load secure artwork:",
      releaseKey,
      error.message
    );
  }
}

  /* ========================================================
     12. GET SECURE VIDEO THUMBNAIL
  ======================================================== */

  async function getVideoThumbnailUrl(
  videoId,
  forceRefresh = false
) {

    if (!videoId) {
      throw new Error(
        "Video ID is required."
      );
    }

    const key = String(videoId);

    const cached =
      thumbnailCache.get(key);

   if (!forceRefresh && isCacheValid(cached)) {
    return cached.url;
    }

    if (
      pendingThumbnailRequests.has(key)
    ) {
      return pendingThumbnailRequests.get(
        key
      );
    }

   const controller = new AbortController();

const generation = mediaCacheGeneration;

pendingMediaControllers.add(controller);

const request = (async () => {

  const data = await requestMedia(
    `/api/media/videos/${encodeURIComponent(key)}/thumbnail`,
    controller.signal
  );


      const url = getMediaUrl(data);

      if (!url) {
        throw new Error(
          "Video thumbnail URL is missing."
        );
      }

     const expiresIn = Number(data.expiresIn);

const isSigned =
  Number.isFinite(expiresIn) && expiresIn > 0;

  if (generation === mediaCacheGeneration) {
  thumbnailCache.set(key, {
    url,
    expiresAt: getExpiresAt(data, DEFAULT_VIDEO_CACHE_MS),
    isSigned
  });
}

      return url;

    })();

    pendingThumbnailRequests.set(
      key,
      request
    );

    try {

      return await request;

    } finally {

  pendingMediaControllers.delete(controller);

  if (pendingThumbnailRequests.get(key) === request) {
    pendingThumbnailRequests.delete(key);
  }

}

  }

 function getVideoThumbnailExpiry(videoId) {
  if (!videoId) {
    return null;
  }

  const cached = thumbnailCache.get(String(videoId));

  if (!cached || !cached.isSigned) {
    return null;
  }

  return cached.expiresAt ?? null;
}



function stopThumbnailRenewal(imageElement) {
  const state = thumbnailImageStates.get(imageElement);

  if (!state) return;

  state.stopped = true;

  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  thumbnailImageStates.delete(imageElement);
}

function scheduleThumbnailRenewal(imageElement, state) {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  if (
    state.stopped ||
    thumbnailImageStates.get(imageElement) !== state ||
    !imageElement.isConnected
  ) {
    return;
  }

  const expiresAt = getVideoThumbnailExpiry(state.videoId);

  if (!expiresAt) return;

  const delay = Math.max(
    1000,
    expiresAt - Date.now() - THUMBNAIL_REFRESH_MARGIN_MS
  );

  state.timer = setTimeout(
    () => renewThumbnailImage(imageElement, state),
    delay
  );
}

async function renewThumbnailImage(imageElement, state) {
  if (
    state.stopped ||
    thumbnailImageStates.get(imageElement) !== state ||
    !imageElement.isConnected
  ) {
    stopThumbnailRenewal(imageElement);
    return;
  }

  try {
    const url = await getVideoThumbnailUrl(
      state.videoId,
      true
    );

    if (
      state.stopped ||
      thumbnailImageStates.get(imageElement) !== state ||
      !imageElement.isConnected
    ) {
      return;
    }

    if (imageElement.src !== url) {
      imageElement.src = url;
    }

    scheduleThumbnailRenewal(imageElement, state);
  } catch (error) {
    console.warn(
      "Unable to renew video thumbnail:",
      state.videoId,
      error.message
    );

    if (
      !state.stopped &&
      thumbnailImageStates.get(imageElement) === state &&
      imageElement.isConnected
    ) {
      state.timer = setTimeout(
        () => renewThumbnailImage(imageElement, state),
        THUMBNAIL_RETRY_MS
      );
    }
  }
}


  /* ========================================================
     13. GET SECURE VIDEO PLAYBACK URL
  ======================================================== */

  async function getVideoPlaybackUrl(
    videoId,
    signal
  ) {

    if (!videoId) {
      throw new Error(
        "Video ID is required."
      );
    }

    const data = await requestMedia(
     `/api/media/videos/${encodeURIComponent(videoId)}/play`,
      signal
    );

    const url = getMediaUrl(data);

    if (!url) {
      throw new Error(
        "Video playback URL is missing."
      );
    }

    return {
      ...data,
      playbackUrl: url
    };

  }

  /* ========================================================
     14. SET VIDEO THUMBNAIL
  ======================================================== */

 async function setVideoThumbnail(
  videoId,
  imageElement,
  fallbackUrl
) {
  if (!imageElement) {
    return;
  }

  // Cancel any previous renewal for this image.
  stopThumbnailRenewal(imageElement);

  const videoKey = videoId
    ? String(videoId)
    : "";

  imageElement.dataset.emnetVideoId = videoKey;

  // Display a fallback while loading.
  if (fallbackUrl) {
    imageElement.src = fallbackUrl;
  }

  if (!videoKey) {
    return;
  }

  // Create a renewal state for this image.
  const state = {
    videoId: videoKey,
    timer: null,
    stopped: false
  };

  thumbnailImageStates.set(imageElement, state);

  try {
    const url = await getVideoThumbnailUrl(videoKey);

    // Prevent outdated requests from changing the image.
    if (
      state.stopped ||
      thumbnailImageStates.get(imageElement) !== state ||
      imageElement.dataset.emnetVideoId !== videoKey ||
      !imageElement.isConnected
    ) {
      return;
    }

    imageElement.src = url;

    // Automatically renew before the URL expires.
    scheduleThumbnailRenewal(imageElement, state);

  } catch (error) {
    console.warn(
      "Unable to load secure video thumbnail:",
      videoKey,
      error.message
    );
  }
}

  /* ========================================================
     15. SCHEDULE AUDIO URL RENEWAL
  ======================================================== */

  function scheduleRenewal(
    info,
    audioElement
  ) {

    clearRenewalTimer();

    if (
      !info ||
      !info.expiresAt ||
      currentPlaybackInfo !== info
    ) {
      return;
    }

    const delay = Math.max(
      1000,
      info.expiresAt -
        Date.now() -
        AUDIO_REFRESH_MARGIN_MS
    );

    renewalTimer = setTimeout(
      () => {
        renewAudioUrl(
          info,
          audioElement
        );
      },
      delay
    );

  }

  /* ========================================================
     16. RENEW AUDIO URL
  ======================================================== */

  async function renewAudioUrl(
    info,
    audioElement
  ) {

    if (
      renewalInProgress ||
      currentPlaybackInfo !== info ||
      !audioElement
    ) {
      return;
    }

    renewalInProgress = true;

    try {

      const data = await getAudioUrl(
        info.songId
      );

      if (
        currentPlaybackInfo !== info
      ) {
        return;
      }

      const newUrl = getMediaUrl(
        data
      );

      if (!newUrl) {
        throw new Error(
          "Renewed audio URL is missing."
        );
      }

      info.url = newUrl;

      info.expiresAt =
        getExpiresAt(data);

      /*
        Important:

        Do not replace audioElement.src
        during normal playback.

        Replacing src could restart playback
        and interfere with listening-time
        tracking.

        Store the renewed URL for recovery.
      */

    } catch (error) {

      console.warn(
        "Unable to renew audio URL:",
        error.message
      );

      if (
        currentPlaybackInfo === info
      ) {
        clearRenewalTimer();

        renewalTimer = setTimeout(
          () => {
            renewAudioUrl(
              info,
              audioElement
            );
          },
          RENEWAL_RETRY_MS
        );
      }

      return;

    } finally {

      renewalInProgress = false;

    }

    if (
      currentPlaybackInfo === info
    ) {
      scheduleRenewal(
        info,
        audioElement
      );
    }

  }

  /* ========================================================
     17. RECOVER AUDIO PLAYBACK
  ======================================================== */

  async function recoverPlayback(
    audioElement
  ) {

    const info =
      currentPlaybackInfo;

    if (
      !info ||
      !audioElement ||
      !audioElement.error ||
      recoveryInProgress
    ) {
      return false;
    }

    recoveryInProgress = true;

    const requestId =
      playbackRequestId;

    try {

      /*
        Fetch a fresh signed URL.

        Do not assume the previous URL
        is still valid.
      */

      const data = await getAudioUrl(
        info.songId
      );

      if (
        currentPlaybackInfo !== info ||
        requestId !== playbackRequestId
      ) {
        return false;
      }

      const newUrl = getMediaUrl(
        data
      );

      if (!newUrl) {
        throw new Error(
          "Recovery playback URL is missing."
        );
      }

      const position =
        Number.isFinite(
          audioElement.currentTime
        )
          ? audioElement.currentTime
          : 0;

      const shouldResume =
        info.wasPlaying;

      info.url = newUrl;

      info.expiresAt =
        getExpiresAt(data);

      /*
        Register the listener before
        calling load().
      */

      audioElement.addEventListener(
        "loadedmetadata",
        () => {

          if (
            currentPlaybackInfo !== info ||
            requestId !== playbackRequestId
          ) {
            return;
          }

          if (
            Number.isFinite(
              audioElement.duration
            ) &&
            position <
              audioElement.duration
          ) {
            try {
              audioElement.currentTime =
                position;
            } catch (error) {
              console.warn(
                "Unable to restore playback position:",
                error
              );
            }
          }

          if (shouldResume) {
            audioElement
              .play()
              .catch(console.error);
          }

        },
        { once: true }
      );

      audioElement.src = newUrl;

      audioElement.load();

      scheduleRenewal(
        info,
        audioElement
      );

      return true;

    } catch (error) {

      console.error(
        "Audio playback recovery failed:",
        error
      );

      return false;

    } finally {

      recoveryInProgress = false;

    }

  }

  /* ========================================================
     18. PREPARE SONG
  ======================================================== */

  async function prepareSong(
    song,
    audioElement
  ) {

    if (!song?._id) {
      throw new Error(
        "Song ID is missing."
      );
    }

    cancelPendingPlayback();

    const requestId =
      playbackRequestId;

    const controller =
      new AbortController();

    playbackAbortController =
      controller;

    try {

      const data = await getAudioUrl(
        song._id,
        controller.signal
      );

      if (
        requestId !== playbackRequestId
      ) {
        return null;
      }

      const playbackUrl =
        getMediaUrl(data);

      if (!playbackUrl) {
        throw new Error(
          "Backend did not return a playback URL."
        );
      }

      const info = {
        songId: String(song._id),

        url: playbackUrl,

        expiresAt:
          getExpiresAt(data),

        wasPlaying: true
      };

      currentPlaybackInfo = info;

      scheduleRenewal(
        info,
        audioElement
      );

      return info;

    } catch (error) {

      if (
        error.name === "AbortError" ||
        requestId !== playbackRequestId
      ) {
        return null;
      }

      throw error;

    } finally {

      if (
        playbackAbortController ===
        controller
      ) {
        playbackAbortController = null;
      }

    }

  }

  /* ========================================================
     19. UPDATE PLAYING STATE
  ======================================================== */

  function setPlayingState(
    isPlaying
  ) {

    if (currentPlaybackInfo) {

      currentPlaybackInfo.wasPlaying =
        Boolean(isPlaying);

    }

  }


  
/* ========================================================
   ARTIST PROFILE IMAGES — AUTOMATIC R2 URL RENEWAL
======================================================== */

const ARTIST_IMAGE_REFRESH_MARGIN_MS = 60 * 1000;
const ARTIST_IMAGE_RETRY_MS = 30 * 1000;

function isSafeArtistImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const url = new URL(value, window.location.href);

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );
  } catch {
    return false;
  }
}


async function getArtistImageData(
  artistId,
  type = "profile",
  forceRefresh = false
) {
  const imageType = type === "cover" ? "cover" : "profile";
  const key = `${artistId}:${imageType}`;

  const cached = artistImageCache.get(key);

  if (
    !forceRefresh &&
    cached &&
    (cached.expiresAt === null ||
      cached.expiresAt > Date.now() + URL_EXPIRY_MARGIN_MS)
  ) {
    return cached;
  }

  if (pendingArtistImageRequests.has(key)) {
    return pendingArtistImageRequests.get(key);
  }

 const controller = new AbortController();

const generation = mediaCacheGeneration;

pendingMediaControllers.add(controller);

const request = (async () => {
  const data = await requestMedia(
    `/api/media/artists/${encodeURIComponent(
      artistId
    )}/${imageType}`,
    controller.signal
  );

    const url = getMediaUrl(data);

    if (!url || !isSafeArtistImageUrl(url)) {
      throw new Error("Artist image URL is unavailable.");
    }

    const expiresIn = Number(data.expiresIn);

    const expiresAt =
      Number.isFinite(expiresIn) && expiresIn > 0
        ? Date.now() + expiresIn * 1000
        : null;

    const entry = { url, expiresAt };

   if (generation === mediaCacheGeneration) {
  artistImageCache.set(key, entry);
}
    return entry;
  })();

  pendingArtistImageRequests.set(key, request);

  try {
    return await request;
 } finally {

  pendingMediaControllers.delete(controller);

  if (pendingArtistImageRequests.get(key) === request) {
    pendingArtistImageRequests.delete(key);
  }

}
}


function stopArtistImageRenewal(imageElement) {
  const state = artistImageStates.get(imageElement);

  if (!state) return;

  state.stopped = true;

  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  artistImageStates.delete(imageElement);
}

async function renewArtistImage(imageElement, state) {
  if (
    state.stopped ||
    artistImageStates.get(imageElement) !== state ||
    !imageElement.isConnected
  ) {
    stopArtistImageRenewal(imageElement);
    return;
  }

  try {
   const entry = await getArtistImageData(
  state.artistId,
  state.type,
  true
);

    if (
      state.stopped ||
      artistImageStates.get(imageElement) !== state ||
      !imageElement.isConnected
    ) {
      return;
    }

    // Update the displayed image without refreshing the page.
    if (imageElement.src !== entry.url) {
      imageElement.src = entry.url;
    }

    scheduleArtistImageRenewal(
      imageElement,
      state,
      entry.expiresAt
    );

  } catch (error) {
    console.warn(
      "Artist image renewal failed:",
      state.artistId,
      error.message
    );

    if (
      !state.stopped &&
      artistImageStates.get(imageElement) === state
    ) {
      state.timer = setTimeout(
        () => renewArtistImage(imageElement, state),
        ARTIST_IMAGE_RETRY_MS
      );
    }
  }
}

function scheduleArtistImageRenewal(
  imageElement,
  state,
  expiresAt
) {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }

  // Legacy images do not have a signed URL expiry.
  if (
    !expiresAt ||
    state.stopped ||
    artistImageStates.get(imageElement) !== state
  ) {
    return;
  }

  const delay = Math.max(
    1000,
    expiresAt -
      Date.now() -
      ARTIST_IMAGE_REFRESH_MARGIN_MS
  );

  state.timer = setTimeout(
    () => renewArtistImage(imageElement, state),
    delay
  );
}


async function setArtistImage(
  artistId,
  imageElement,
  fallbackUrl = null,
  type = "profile"
) {
  if (!imageElement) return;

  stopArtistImageRenewal(imageElement);

  if (isSafeArtistImageUrl(fallbackUrl)) {
    imageElement.src = fallbackUrl;
  }

  if (!artistId) return;

  const state = {
    artistId: String(artistId),
    type: type === "cover" ? "cover" : "profile",
    timer: null,
    stopped: false
  };

  artistImageStates.set(imageElement, state);

  try {
    const entry = await getArtistImageData(
      state.artistId,
      state.type
    );

    if (
      state.stopped ||
      artistImageStates.get(imageElement) !== state ||
      !imageElement.isConnected
    ) {
      return;
    }

    imageElement.src = entry.url;

    scheduleArtistImageRenewal(
      imageElement,
      state,
      entry.expiresAt
    );
  } catch (error) {
    console.warn(
      "Unable to load secure artist image:",
      state.artistId,
      error.message
    );
  }
}



  /* ========================================================
     20. CLEAR MEDIA CACHES
  ======================================================== */

function clearMediaCache() {

  // Invalidate all requests started before this clearing.
  mediaCacheGeneration += 1;

  // Cancel unfinished media API requests.
  for (const controller of pendingMediaControllers) {
    controller.abort();
  }

  pendingMediaControllers.clear();

  // Remove cached signed URLs.
  artworkCache.clear();
  thumbnailCache.clear();
  artistImageCache.clear();

  // Remove pending request references.
  pendingArtworkRequests.clear();
  pendingThumbnailRequests.clear();
  pendingArtistImageRequests.clear();

}

  /* ========================================================
     21. PUBLIC METHODS
  ======================================================== */

  return {

    // Audio
    prepareSong,
    cancelPendingPlayback,
    recoverPlayback,
    setPlayingState,

    // Release artwork
    getArtworkUrl,
    setArtwork,

    // Video
    getVideoThumbnailUrl,
    getVideoPlaybackUrl,
    setVideoThumbnail,

   // Artist images
    getArtistImageData,
    setArtistImage,
    stopArtistImageRenewal,

    // Cache
    clearMediaCache

  };

})();
