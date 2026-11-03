
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
      `/media/songs/${encodeURIComponent(
        songId
      )}/play`,
      signal
    );

  }

  /* ========================================================
     10. GET SECURE ARTWORK URL
  ======================================================== */

  async function getArtworkUrl(
    releaseId
  ) {

    if (!releaseId) {
      throw new Error(
        "Release ID is required."
      );
    }

    const key = String(releaseId);

    const cached =
      artworkCache.get(key);

    if (isCacheValid(cached)) {
      return cached.url;
    }

    if (
      pendingArtworkRequests.has(key)
    ) {
      return pendingArtworkRequests.get(
        key
      );
    }

    const request = (async () => {

      const data = await requestMedia(
        `/media/releases/${encodeURIComponent(
          key
        )}/artwork`
      );

      const url = getMediaUrl(data);

      if (!url) {
        throw new Error(
          "Artwork URL is missing."
        );
      }

      artworkCache.set(key, {
        url,
        expiresAt: getExpiresAt(
          data,
          DEFAULT_ARTWORK_CACHE_MS
        )
      });

      return url;

    })();

    pendingArtworkRequests.set(
      key,
      request
    );

    try {

      return await request;

    } finally {

      pendingArtworkRequests.delete(
        key
      );

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

    const elements =
      Array.isArray(imageElements)
        ? imageElements.filter(Boolean)
        : [imageElements].filter(Boolean);

    const releaseKey =
      releaseId
        ? String(releaseId)
        : "";

    elements.forEach((element) => {

      element.dataset.emnetReleaseId =
        releaseKey;

      if (fallbackUrl) {
        element.src = fallbackUrl;
      }

    });

    if (!releaseKey) {
      return;
    }

    try {

      const url = await getArtworkUrl(
        releaseKey
      );

      elements.forEach((element) => {

        if (
          element.dataset.emnetReleaseId ===
          releaseKey
        ) {
          element.src = url;
        }

      });

    } catch (error) {

      console.warn(
        "Unable to load secure artwork:",
        error.message
      );

    }

  }

  /* ========================================================
     12. GET SECURE VIDEO THUMBNAIL
  ======================================================== */

  async function getVideoThumbnailUrl(
    videoId
  ) {

    if (!videoId) {
      throw new Error(
        "Video ID is required."
      );
    }

    const key = String(videoId);

    const cached =
      thumbnailCache.get(key);

    if (isCacheValid(cached)) {
      return cached.url;
    }

    if (
      pendingThumbnailRequests.has(key)
    ) {
      return pendingThumbnailRequests.get(
        key
      );
    }

    const request = (async () => {

      const data = await requestMedia(
        `/media/videos/${encodeURIComponent(
          key
        )}/thumbnail`
      );

      const url = getMediaUrl(data);

      if (!url) {
        throw new Error(
          "Video thumbnail URL is missing."
        );
      }

      thumbnailCache.set(key, {
        url,
        expiresAt: getExpiresAt(
          data,
          DEFAULT_VIDEO_CACHE_MS
        )
      });

      return url;

    })();

    pendingThumbnailRequests.set(
      key,
      request
    );

    try {

      return await request;

    } finally {

      pendingThumbnailRequests.delete(
        key
      );

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
      `/media/videos/${encodeURIComponent(
        videoId
      )}/play`,
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

    const videoKey =
      videoId
        ? String(videoId)
        : "";

    imageElement.dataset.emnetVideoId =
      videoKey;

    if (fallbackUrl) {
      imageElement.src = fallbackUrl;
    }

    if (!videoKey) {
      return;
    }

    try {

      const url =
        await getVideoThumbnailUrl(
          videoKey
        );

      if (
        imageElement.dataset.emnetVideoId ===
        videoKey
      ) {
        imageElement.src = url;
      }

    } catch (error) {

      console.warn(
        "Unable to load video thumbnail:",
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
     20. CLEAR MEDIA CACHES
  ======================================================== */

  function clearMediaCache() {

    artworkCache.clear();

    thumbnailCache.clear();

    pendingArtworkRequests.clear();

    pendingThumbnailRequests.clear();

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

    // Cache
    clearMediaCache

  };

})();
