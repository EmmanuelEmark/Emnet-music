if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


/* ========================================
   GET VIDEO ID
======================================== */

const params =
  new URLSearchParams(
    window.location.search
  );


const videoId =
  params.get("id");


/* ========================================
   ELEMENTS
======================================== */

const videoLoading =
  document.getElementById(
    "videoLoading"
  );


const videoError =
  document.getElementById(
    "videoError"
  );


const videoContent =
  document.getElementById(
    "videoContent"
  );


const mainVideoPlayer =
  document.getElementById(
    "mainVideoPlayer"
  );


const videoType =
  document.getElementById(
    "videoType"
  );


const videoTitle =
  document.getElementById(
    "videoTitle"
  );


const videoArtist =
  document.getElementById(
    "videoArtist"
  );


const videoViews =
  document.getElementById(
    "videoViews"
  );


const videoDuration =
  document.getElementById(
    "videoDuration"
  );


const linkedReleaseSection =
  document.getElementById(
    "linkedReleaseSection"
  );


const linkedReleaseCard =
  document.getElementById(
    "linkedReleaseCard"
  );


const linkedReleaseCover =
  document.getElementById(
    "linkedReleaseCover"
  );


const linkedReleaseTitle =
  document.getElementById(
    "linkedReleaseTitle"
  );


const linkedReleaseType =
  document.getElementById(
    "linkedReleaseType"
  );


const linkedSongSection =
  document.getElementById(
    "linkedSongSection"
  );


const linkedSongTitle =
  document.getElementById(
    "linkedSongTitle"
  );


const linkedSongGenre =
  document.getElementById(
    "linkedSongGenre"
  );


const linkedSongDuration =
  document.getElementById(
    "linkedSongDuration"
  );


const logoutButton =
  document.getElementById(
    "logoutButton"
  );

  let viewRecordedForThisLoad =
  false;

let currentVideo = null;


/* ========================================
   START
======================================== */

startVideoPage();


async function startVideoPage() {

  await loadPlayerComponent();


  if (!videoId) {

    showVideoError(
      "Video ID is missing."
    );

    return;

  }


  await loadVideo();

}


/* ========================================
   LOGOUT
======================================== */

if (logoutButton) {

  logoutButton.addEventListener(
    "click",
    logout
  );

}


/* ========================================
   LOAD SINGLE VIDEO
======================================== */

async function loadVideo() {

  try {

    const response =
      await fetch(
        `${API_BASE_URL}/videos/${videoId}`
      );


    const data =
      await response.json();


    console.log(
      "Video response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load video."
      );

    }


    if (!data.video) {

      throw new Error(
        "Video information was not returned."
      );

    }


    currentVideo =
      data.video;


    renderVideo();


    videoLoading.style.display =
      "none";


    videoError.style.display =
      "none";


    videoContent.classList.add(
      "active"
    );


  } catch (error) {

    console.error(
      "Video page error:",
      error
    );


    showVideoError(
      error.message
    );

  }

}


/* ========================================
   RENDER VIDEO
======================================== */

function renderVideo() {

  if (!currentVideo) {
    return;
  }


  document.title =
    `${currentVideo.title || "Video"} | EmnetMusic`;


  /*
    Actual video file.
  */

  mainVideoPlayer.src =
    currentVideo.videoUrl || "";


  mainVideoPlayer.poster =
    safeVideoImage(
      currentVideo.thumbnailUrl
    );


  videoType.textContent =
    formatVideoType(
      currentVideo.videoType
    );


    mainVideoPlayer.addEventListener(
  "play",
  recordVideoView,
  {
    once: true,
  }
);



  videoTitle.textContent =
    currentVideo.title ||
    "Untitled Video";


  const artistName =
    getVideoArtistNames(
      currentVideo.primaryArtists
    );


  videoArtist.textContent =
    artistName ||
    "Artist";


  videoViews.textContent =
    `${formatViews(
      currentVideo.viewCount
    )} ${
      Number(currentVideo.viewCount) === 1
        ? "view"
        : "views"
    }`;


  videoDuration.textContent =
    formatDuration(
      currentVideo.duration
    );


  renderArtistLink();

  renderLinkedRelease();

  renderLinkedSong();

}


/* ========================================
   ARTIST
======================================== */

function renderArtistLink() {

  const artist =
    Array.isArray(
      currentVideo.primaryArtists
    )
      ? currentVideo.primaryArtists[0]
      : null;


  if (
    !artist ||
    !artist._id
  ) {

    videoArtist.style.cursor =
      "default";

    return;

  }


  videoArtist.addEventListener(
    "click",
    () => {

      window.location.href =
        `/artist?id=${encodeURIComponent(
          artist._id
        )}`;

    }
  );

}


/* ========================================
   LINKED RELEASE
======================================== */

function renderLinkedRelease() {

  const release =
    currentVideo.linkedRelease;


  if (!release) {

    linkedReleaseSection.style.display =
      "none";

    return;

  }


  linkedReleaseCover.src =
    safeVideoImage(
      release.coverImage
    );


  linkedReleaseTitle.textContent =
    release.title ||
    "Release";


  linkedReleaseType.textContent =
    release.releaseType ||
    "Release";


  if (release._id) {

    linkedReleaseCard.addEventListener(
      "click",
      () => {

        window.location.href =
          `/release?id=${encodeURIComponent(
            release._id
          )}`;

      }
    );

  }

}


/* ========================================
   LINKED SONG
======================================== */

function renderLinkedSong() {

  const song =
    currentVideo.linkedSong;


  if (!song) {

    linkedSongSection.style.display =
      "none";

    return;

  }


  linkedSongTitle.textContent =
    song.title ||
    "Song";


  linkedSongGenre.textContent =
    song.genre ||
    "Music";


  linkedSongDuration.textContent =
    formatDuration(
      song.duration
    );

}


/* ========================================
   ARTIST NAMES
======================================== */

function getVideoArtistNames(
  artists
) {

  if (!Array.isArray(artists)) {

    return "";

  }


  return artists
    .map(
      (artist) => {

        if (
          typeof artist ===
          "string"
        ) {

          return "";

        }


        return (
          artist.stageName ||
          artist.fullName ||
          ""
        );

      }
    )
    .filter(Boolean)
    .join(", ");

}


/* ========================================
   VIDEO TYPE
======================================== */

function formatVideoType(
  value
) {

  if (!value) {

    return "VIDEO";

  }


  return value
    .replaceAll(
      "_",
      " "
    )
    .toUpperCase();

}


/* ========================================
   VIEW COUNT
======================================== */

function formatViews(
  value
) {

  const views =
    Number(value) || 0;


  if (views >= 1000000) {

    return (
      views / 1000000
    )
      .toFixed(1)
      .replace(
        ".0",
        ""
      ) + "M";

  }


  if (views >= 1000) {

    return (
      views / 1000
    )
      .toFixed(1)
      .replace(
        ".0",
        ""
      ) + "K";

  }


  return views.toString();

}


/* ========================================
   DURATION
======================================== */

function formatDuration(
  seconds
) {

  const total =
    Number(seconds);


  if (
    !Number.isFinite(total) ||
    total < 0
  ) {

    return "0:00";

  }


  const minutes =
    Math.floor(
      total / 60
    );


  const remaining =
    Math.floor(
      total % 60
    )
      .toString()
      .padStart(
        2,
        "0"
      );


  return `${minutes}:${remaining}`;

}


/* ========================================
   IMAGE
======================================== */

function safeVideoImage(
  imageUrl
) {

  if (
    imageUrl &&
    typeof imageUrl ===
      "string"
  ) {

    return imageUrl;

  }


  return (
    "https://placehold.co/" +
    "1280x720/111612/" +
    "35e67a?text=EmnetMusic"
  );

}



/* ========================================
   RECORD VIDEO VIEW
======================================== */

async function recordVideoView() {

  if (viewRecordedForThisLoad) {
    return;
  }


  if (!videoId) {
    return;
  }


  const token =
    getToken();


  if (!token) {
    return;
  }


  try {

    viewRecordedForThisLoad =
      true;


    const response =
      await fetch(
        `${API_BASE_URL}/views/videos/${videoId}`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );


    const data =
      await response.json();


    console.log(
      "Video view response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to record video view."
      );

    }


    /*
      If backend counted the view,
      update the number immediately.
    */

    if (
      data.counted === true &&
      typeof data.viewCount ===
        "number"
    ) {

      currentVideo.viewCount =
        data.viewCount;


      videoViews.textContent =
        `${formatViews(
          data.viewCount
        )} ${
          data.viewCount === 1
            ? "view"
            : "views"
        }`;

    }


  } catch (error) {

    console.error(
      "Video view error:",
      error
    );

  }

}



/* ========================================
   ERROR
======================================== */

function showVideoError(
  message
) {

  videoLoading.style.display =
    "none";


  videoContent.classList.remove(
    "active"
  );


  videoError.style.display =
    "block";


  videoError.textContent =
    message ||
    "Unable to load video.";

}