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

let currentSong = null;
let currentQueue = [];
let currentSongIndex = -1;

let playerLoaded = false;
let likedSongIds = new Set();


/* ========================================
   LOAD PLAYER COMPONENT
======================================== */

async function loadPlayerComponent() {

  if (playerLoaded) {
    return;
  }

  const container =
    document.getElementById(
      "playerContainer"
    );

  if (!container) {

    console.error(
      "playerContainer was not found on this page."
    );

    return;
  }


  try {

    const response = await fetch(
      "components/player.html"
    );


    if (!response.ok) {

      throw new Error(
        "Unable to load player component."
      );

    }


    const html =
      await response.text();


    container.innerHTML =
      html;


    initializePlayer();


    playerLoaded =
      true;

    await loadLikedSongs();


  } catch (error) {

    console.error(
      "Player component error:",
      error
    );

  }

}


/* ========================================
   INITIALIZE PLAYER
======================================== */

function initializePlayer() {

  musicPlayer =
    document.getElementById(
      "musicPlayer"
    );


    playerPlaylistModal =
  document.getElementById(
    "playerPlaylistModal"
  );


closePlayerPlaylistModal =
  document.getElementById(
    "closePlayerPlaylistModal"
  );


playerPlaylistList =
  document.getElementById(
    "playerPlaylistList"
  );


playerPlaylistMessage =
  document.getElementById(
    "playerPlaylistMessage"
  );


playerPlaylistSongName =
  document.getElementById(
    "playerPlaylistSongName"
  );




  audioPlayer =
    document.getElementById(
      "audioPlayer"
    );


  playerCover =
    document.getElementById(
      "playerCover"
    );


  playerSongTitle =
    document.getElementById(
      "playerSongTitle"
    );


  playerArtist =
    document.getElementById(
      "playerArtist"
    );


  playPauseButton =
    document.getElementById(
      "playPauseButton"
    );


  previousButton =
    document.getElementById(
      "previousButton"
    );


  nextButton =
    document.getElementById(
      "nextButton"
    );


  playerProgress =
    document.getElementById(
      "playerProgress"
    );


  currentTime =
    document.getElementById(
      "currentTime"
    );


  durationTime =
    document.getElementById(
      "durationTime"
    );


  volumeSlider =
    document.getElementById(
      "volumeSlider"
    );


  playerExpandButton =
    document.getElementById(
      "playerExpandButton"
    );


  playerExpandIconButton =
    document.getElementById(
      "playerExpandIconButton"
    );


  nowPlayingOverlay =
    document.getElementById(
      "nowPlayingOverlay"
    );


  closeNowPlayingButton =
    document.getElementById(
      "closeNowPlayingButton"
    );


  expandedPlayerCover =
    document.getElementById(
      "expandedPlayerCover"
    );


  expandedSongTitle =
    document.getElementById(
      "expandedSongTitle"
    );


  expandedArtistName =
    document.getElementById(
      "expandedArtistName"
    );


  expandedPreviousButton =
    document.getElementById(
      "expandedPreviousButton"
    );


  expandedPlayPauseButton =
    document.getElementById(
      "expandedPlayPauseButton"
    );


  expandedNextButton =
    document.getElementById(
      "expandedNextButton"
    );


  expandedProgress =
    document.getElementById(
      "expandedProgress"
    );


  expandedCurrentTime =
    document.getElementById(
      "expandedCurrentTime"
    );


  expandedDurationTime =
    document.getElementById(
      "expandedDurationTime"
    );


  expandedVolumeSlider =
    document.getElementById(
      "expandedVolumeSlider"
    );


  queueToggleButton =
    document.getElementById(
      "queueToggleButton"
    );


  queuePanel =
    document.getElementById(
      "queuePanel"
    );


  queueList =
    document.getElementById(
      "queueList"
    );


  closeQueueButton =
    document.getElementById(
      "closeQueueButton"
    );


  miniLikeButton =
    document.getElementById(
      "miniLikeButton"
    );


  expandedLikeButton =
    document.getElementById(
      "expandedLikeButton"
    );


  shuffleButton =
    document.getElementById(
      "shuffleButton"
    );


  repeatButton =
    document.getElementById(
      "repeatButton"
    );


  moreSongButton =
    document.getElementById(
      "moreSongButton"
    );

  songMoreModal =
  document.getElementById(
    "songMoreModal"
  );


closeSongMoreModal =
  document.getElementById(
    "closeSongMoreModal"
  );


songMoreTitle =
  document.getElementById(
    "songMoreTitle"
  );


songMoreMessage =
  document.getElementById(
    "songMoreMessage"
  );


moreAddToPlaylist =
  document.getElementById(
    "moreAddToPlaylist"
  );


moreGoToArtist =
  document.getElementById(
    "moreGoToArtist"
  );


moreGoToRelease =
  document.getElementById(
    "moreGoToRelease"
  );


moreShareSong =
  document.getElementById(
    "moreShareSong"
  );  



  if (
    !musicPlayer ||
    !audioPlayer ||
    !playPauseButton
  ) {

    console.error(
      "Player component is incomplete."
    );

    return;

  }


  audioPlayer.volume =
    0.8;


  if (volumeSlider) {

    volumeSlider.value =
      0.8;

  }


  if (expandedVolumeSlider) {

    expandedVolumeSlider.value =
      0.8;

  }


  setupPlayerEvents();

}


/* ========================================
   PLAYER EVENTS
======================================== */

function setupPlayerEvents() {

  playPauseButton.addEventListener(
    "click",
    togglePlayPause
  );


  expandedPlayPauseButton.addEventListener(
    "click",
    togglePlayPause
  );


  nextButton.addEventListener(
    "click",
    playNextSong
  );


  expandedNextButton.addEventListener(
    "click",
    playNextSong
  );


  previousButton.addEventListener(
    "click",
    playPreviousSong
  );


  expandedPreviousButton.addEventListener(
    "click",
    playPreviousSong
  );


  playerExpandButton.addEventListener(
    "click",
    openNowPlaying
  );


  playerExpandIconButton.addEventListener(
    "click",
    openNowPlaying
  );


  closeNowPlayingButton.addEventListener(
    "click",
    closeNowPlaying
  );


  queueToggleButton.addEventListener(
    "click",
    openQueue
  );


  closeQueueButton.addEventListener(
    "click",
    closeQueue
  );


  playerProgress.addEventListener(
    "input",
    () => {

      seekAudio(
        playerProgress.value
      );

    }
  );


  expandedProgress.addEventListener(
    "input",
    () => {

      seekAudio(
        expandedProgress.value
      );

    }
  );


  volumeSlider.addEventListener(
    "input",
    () => {

      setVolume(
        volumeSlider.value
      );

    }
  );


  expandedVolumeSlider.addEventListener(
    "input",
    () => {

      setVolume(
        expandedVolumeSlider.value
      );

    }
  );


  audioPlayer.addEventListener(
    "play",
    updatePlayButtons
  );


  audioPlayer.addEventListener(
    "pause",
    updatePlayButtons
  );


  audioPlayer.addEventListener(
    "timeupdate",
    updateProgress
  );


  audioPlayer.addEventListener(
    "loadedmetadata",
    updateProgress
  );


  audioPlayer.addEventListener(
    "ended",
    playNextSong
  );


  miniLikeButton.addEventListener(
  "click",
  toggleCurrentSongLike
);


expandedLikeButton.addEventListener(
  "click",
  toggleCurrentSongLike
);

  shuffleButton.addEventListener(
    "click",
    () => {

      console.log(
        "Shuffle functionality will be added later."
      );

    }
  );


  repeatButton.addEventListener(
    "click",
    () => {

      console.log(
        "Repeat functionality will be added later."
      );

    }
  );


moreSongButton.addEventListener(
  "click",
  openSongMoreMenu
);

if (closeSongMoreModal) {

  closeSongMoreModal.addEventListener(
    "click",
    closeSongMoreMenu
  );

}


if (songMoreModal) {

  songMoreModal.addEventListener(
    "click",
    (event) => {

      if (
        event.target ===
        songMoreModal
      ) {

        closeSongMoreMenu();

      }

    }
  );

}


if (moreAddToPlaylist) {

  moreAddToPlaylist.addEventListener(
    "click",
    () => {

      closeSongMoreMenu();

      openAddToPlaylistModal();

    }
  );

}


if (moreGoToArtist) {

  moreGoToArtist.addEventListener(
    "click",
    goToCurrentSongArtist
  );

}


if (moreGoToRelease) {

  moreGoToRelease.addEventListener(
    "click",
    goToCurrentSongRelease
  );

}


if (moreShareSong) {

  moreShareSong.addEventListener(
    "click",
    shareCurrentSong
  );

}

if (closePlayerPlaylistModal) {

  closePlayerPlaylistModal.addEventListener(
    "click",
    closeAddToPlaylistModal
  );

}


if (playerPlaylistModal) {

  playerPlaylistModal.addEventListener(
    "click",
    (event) => {

      if (
        event.target ===
        playerPlaylistModal
      ) {

        closeAddToPlaylistModal();

      }

    }
  );

}

}


/* ========================================
   PLAY SONG
======================================== */

async function playSong(
  song,
  queue = []
) {

  if (!playerLoaded) {

    await loadPlayerComponent();

  }


  if (
    !musicPlayer ||
    !audioPlayer
  ) {

    console.error(
      "Music player is not ready."
    );

    return;

  }


  if (!song) {

    console.error(
      "No song was provided."
    );

    return;

  }


  if (!song.audioUrl) {

    console.error(
      "This song does not have an audio URL."
    );

    return;

  }


  currentSong =
    song;


  if (Array.isArray(queue)) {

    currentQueue =
      queue;


    currentSongIndex =
      queue.findIndex(
        (item) =>
          item._id === song._id
      );

  }


  if (currentSongIndex < 0) {

    currentSongIndex =
      0;

  }


  updateSongInformation(
    song
  );


  renderQueue();


  musicPlayer.classList.add(
    "active"
  );


  resetProgress();


  audioPlayer.src =
    song.audioUrl;


  try {

    await audioPlayer.play();


    await recordSongPlay(
      song._id
    );


  } catch (error) {

    console.error(
      "Unable to play song:",
      error
    );

  }

}


/* ========================================
   UPDATE SONG INFORMATION
======================================== */

function updateSongInformation(song) {

  const release =
    song.releaseId || {};


  const artistName =
    getPlayerArtistNames(
      song.primaryArtists
    ) || "Artist";


  const coverImage =
    release.coverImage ||
    "https://placehold.co/600x600/111612/35e67a?text=EmnetMusic";


  playerSongTitle.textContent =
    song.title ||
    "Untitled";


  playerArtist.textContent =
    artistName;


  playerCover.src =
    coverImage;


  expandedSongTitle.textContent =
    song.title ||
    "Untitled";


  expandedArtistName.textContent =
    artistName;


  expandedPlayerCover.src =
    coverImage;

}


/* ========================================
   PLAY / PAUSE
======================================== */

async function togglePlayPause() {

  if (
    !currentSong ||
    !audioPlayer
  ) {
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


/* ========================================
   UPDATE PLAY BUTTONS
======================================== */

function updatePlayButtons() {

  if (!audioPlayer) {
    return;
  }


  const icon =
    audioPlayer.paused
      ? "▶"
      : "❚❚";


  playPauseButton.textContent =
    icon;


  expandedPlayPauseButton.textContent =
    icon;
  updateLikeButtons();
}


/* ========================================
   PROGRESS
======================================== */

function updateProgress() {

  if (!audioPlayer) {
    return;
  }


  const duration =
    audioPlayer.duration;


  const position =
    audioPlayer.currentTime;


  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {

    return;

  }


  const progress =
    (
      position /
      duration
    ) * 100;


  playerProgress.value =
    progress;


  expandedProgress.value =
    progress;


  currentTime.textContent =
    formatTime(
      position
    );


  expandedCurrentTime.textContent =
    formatTime(
      position
    );


  durationTime.textContent =
    formatTime(
      duration
    );


  expandedDurationTime.textContent =
    formatTime(
      duration
    );

}


/* ========================================
   SEEK
======================================== */

function seekAudio(value) {

  if (
    !audioPlayer ||
    !audioPlayer.duration
  ) {
    return;
  }


  audioPlayer.currentTime =
    (
      Number(value) /
      100
    ) * audioPlayer.duration;

}


/* ========================================
   RESET PROGRESS
======================================== */

function resetProgress() {

  playerProgress.value =
    0;


  expandedProgress.value =
    0;


  currentTime.textContent =
    "0:00";


  expandedCurrentTime.textContent =
    "0:00";


  durationTime.textContent =
    "0:00";


  expandedDurationTime.textContent =
    "0:00";

}


/* ========================================
   VOLUME
======================================== */

function setVolume(value) {

  const volume =
    Number(value);


  if (!audioPlayer) {
    return;
  }


  audioPlayer.volume =
    volume;


  volumeSlider.value =
    volume;


  expandedVolumeSlider.value =
    volume;

}


/* ========================================
   NEXT SONG
======================================== */

function playNextSong() {

  if (!currentQueue.length) {
    return;
  }


  const nextIndex =
    currentSongIndex + 1;


  if (
    nextIndex >=
    currentQueue.length
  ) {
    return;
  }


  playSong(
    currentQueue[nextIndex],
    currentQueue
  );

}


/* ========================================
   PREVIOUS SONG
======================================== */

function playPreviousSong() {

  if (!currentQueue.length) {
    return;
  }


  const previousIndex =
    currentSongIndex - 1;


  if (
    previousIndex < 0
  ) {
    return;
  }


  playSong(
    currentQueue[previousIndex],
    currentQueue
  );

}


/* ========================================
   OPEN NOW PLAYING
======================================== */

function openNowPlaying() {

  if (
    !currentSong ||
    !nowPlayingOverlay
  ) {
    return;
  }


  nowPlayingOverlay.classList.add(
    "active"
  );


  nowPlayingOverlay.setAttribute(
    "aria-hidden",
    "false"
  );


  document.body.style.overflow =
    "hidden";

}


/* ========================================
   CLOSE NOW PLAYING
======================================== */

function closeNowPlaying() {

  if (!nowPlayingOverlay) {
    return;
  }


  nowPlayingOverlay.classList.remove(
    "active"
  );


  nowPlayingOverlay.setAttribute(
    "aria-hidden",
    "true"
  );


  closeQueue();


  document.body.style.overflow =
    "";

}


/* ========================================
   OPEN QUEUE
======================================== */

function openQueue() {

  if (!queuePanel) {
    return;
  }


  renderQueue();


  queuePanel.classList.add(
    "active"
  );

}


/* ========================================
   CLOSE QUEUE
======================================== */

function closeQueue() {

  if (!queuePanel) {
    return;
  }


  queuePanel.classList.remove(
    "active"
  );

}


/* ========================================
   RENDER QUEUE
======================================== */

function renderQueue() {

  if (!queueList) {
    return;
  }


  queueList.innerHTML =
    "";


  if (!currentQueue.length) {

    queueList.innerHTML = `
      <div class="queue-empty">
        Your queue is empty.
      </div>
    `;

    return;

  }


  currentQueue.forEach(
    (song, index) => {

      const item =
        document.createElement(
          "button"
        );


      item.type =
        "button";


      item.className =
        "queue-item";


      if (
        index ===
        currentSongIndex
      ) {

        item.classList.add(
          "active"
        );

      }


      const release =
        song.releaseId || {};


      const artistName =
        getPlayerArtistNames(
          song.primaryArtists
        ) || "Artist";


      const coverImage =
        release.coverImage ||
        "https://placehold.co/600x600/111612/35e67a?text=EmnetMusic";


      item.innerHTML = `
        <img
          src="${coverImage}"
          alt=""
        >

        <div>

          <h4>
            ${escapePlayerHTML(
              song.title ||
              "Untitled"
            )}
          </h4>

          <p>
            ${escapePlayerHTML(
              artistName
            )}
          </p>

        </div>

        <span class="queue-playing">
          ${
            index ===
            currentSongIndex
              ? "●"
              : ""
          }
        </span>
      `;


      item.addEventListener(
        "click",
        () => {

          playSong(
            song,
            currentQueue
          );

        }
      );


      queueList.appendChild(
        item
      );

    }
  );

}


/* ========================================
   LOAD LIKED SONGS
======================================== */

async function loadLikedSongs() {

  const token =
    getToken();


  if (!token) {
    return;
  }


  try {

    const response = await fetch(
      `${API_BASE_URL}/listener/likes`,
      {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      }
    );


    if (!response.ok) {

      console.warn(
        "Unable to load liked songs."
      );

      return;

    }


    const data =
      await response.json();


    const likes =
      data.likes ||
      data.songs ||
      [];


    likedSongIds =
      new Set();


    likes.forEach((item) => {

      /*
        Depending on how your backend
        returns likes, the song may
        either be item.songId or item.
      */

      const song =
        item.songId || item;


      const songId =
        typeof song === "string"
          ? song
          : song?._id;


      if (songId) {

        likedSongIds.add(
          songId
        );

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



/* ========================================
   TOGGLE CURRENT SONG LIKE
======================================== */

async function toggleCurrentSongLike() {

  if (!currentSong) {
    return;
  }


  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  const songId =
    currentSong._id;


  const alreadyLiked =
    likedSongIds.has(songId);


  try {

    const response = await fetch(
      `${API_BASE_URL}/listener/likes/${songId}`,
      {
        method:
          alreadyLiked
            ? "DELETE"
            : "POST",

        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      }
    );


    const data =
      await response.json();


    if (!response.ok) {

      console.error(
        data.message ||
        "Unable to update like."
      );

      return;

    }


    if (alreadyLiked) {

      likedSongIds.delete(
        songId
      );

    } else {

      likedSongIds.add(
        songId
      );

    }


    updateLikeButtons();


  } catch (error) {

    console.error(
      "Like error:",
      error
    );

  }

}



/* ========================================
   UPDATE LIKE BUTTONS
======================================== */

function updateLikeButtons() {

  if (
    !currentSong ||
    !miniLikeButton ||
    !expandedLikeButton
  ) {
    return;
  }


  const liked =
    likedSongIds.has(
      currentSong._id
    );


  miniLikeButton.textContent =
    liked
      ? "♥"
      : "♡";


  const expandedIcon =
    expandedLikeButton.querySelector(
      "span"
    );


  if (expandedIcon) {

    expandedIcon.textContent =
      liked
        ? "♥"
        : "♡";

  }


  miniLikeButton.classList.toggle(
    "liked",
    liked
  );


  expandedLikeButton.classList.toggle(
    "liked",
    liked
  );

}

/* ========================================
   MORE SONG MENU
======================================== */

function openSongMoreMenu() {

  if (!currentSong) {

    return;

  }


  if (!songMoreModal) {

    return;

  }


  if (songMoreTitle) {

    songMoreTitle.textContent =
      currentSong.title ||
      "Song";

  }


  if (songMoreMessage) {

    songMoreMessage.classList.remove(
      "active"
    );

    songMoreMessage.textContent =
      "";

  }


  songMoreModal.classList.add(
    "active"
  );


  songMoreModal.setAttribute(
    "aria-hidden",
    "false"
  );

}


function closeSongMoreMenu() {

  if (!songMoreModal) {

    return;

  }


  songMoreModal.classList.remove(
    "active"
  );


  songMoreModal.setAttribute(
    "aria-hidden",
    "true"
  );

}



/* ========================================
   GO TO ARTIST
======================================== */

function goToCurrentSongArtist() {

  if (!currentSong) {

    return;

  }


  const artists =
    currentSong.primaryArtists;


  if (
    !Array.isArray(artists) ||
    !artists.length
  ) {

    showSongMoreMessage(
      "Artist information is unavailable."
    );

    return;

  }


  const firstArtist =
    artists[0];


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



/* ========================================
   GO TO RELEASE
======================================== */

function goToCurrentSongRelease() {

  if (!currentSong) {

    return;

  }


  const release =
    currentSong.releaseId;


  if (!release) {

    showSongMoreMessage(
      "Release information is unavailable."
    );

    return;

  }


  const releaseId =
    typeof release === "string"
      ? release
      : release?._id;


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



/* ========================================
   SHARE SONG
======================================== */

async function shareCurrentSong() {

  if (!currentSong) {

    return;

  }


  const artistName =
    getPlayerArtistNames(
      currentSong.primaryArtists
    ) || "EmnetMusic";


  const shareTitle =
    currentSong.title ||
    "EmnetMusic";


  const shareText =
    `Listen to ${shareTitle} by ${artistName} on EmnetMusic.`;


  const shareUrl =
    window.location.href;


  try {

    if (navigator.share) {

      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: shareUrl,
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

    if (
      error.name ===
      "AbortError"
    ) {

      return;

    }


    console.error(
      "Share error:",
      error
    );


    showSongMoreMessage(
      "Unable to share this song."
    );

  }

}



/* ========================================
   MORE MENU MESSAGE
======================================== */

function showSongMoreMessage(
  message
) {

  if (!songMoreMessage) {

    return;

  }


  songMoreMessage.textContent =
    message;


  songMoreMessage.classList.add(
    "active"
  );

}

/* ========================================
   OPEN ADD TO PLAYLIST
======================================== */

async function openAddToPlaylistModal() {

  if (!currentSong) {

    return;

  }


  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

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


  playerPlaylistMessage.className =
    "player-playlist-message";


  playerPlaylistMessage.textContent =
    "";


  playerPlaylistSongName.textContent =
    `Add "${currentSong.title || "this song"}" to:`;


  playerPlaylistList.innerHTML = `
    <div class="player-playlist-loading">
      Loading playlists...
    </div>
  `;


  playerPlaylistModal.classList.add(
    "active"
  );


  playerPlaylistModal.setAttribute(
    "aria-hidden",
    "false"
  );


  await loadPlayerPlaylists();

}



/* ========================================
   CLOSE ADD TO PLAYLIST
======================================== */

function closeAddToPlaylistModal() {

  if (!playerPlaylistModal) {

    return;

  }


  playerPlaylistModal.classList.remove(
    "active"
  );


  playerPlaylistModal.setAttribute(
    "aria-hidden",
    "true"
  );


  playerPlaylistMessage.className =
    "player-playlist-message";


  playerPlaylistMessage.textContent =
    "";

}



/* ========================================
   LOAD USER PLAYLISTS
======================================== */

async function loadPlayerPlaylists() {

  const token =
    getToken();


  if (!token) {

    return;

  }


  try {

    const response =
      await fetch(
        `${API_BASE_URL}/playlists`,
        {
          headers: {

            Authorization:
              `Bearer ${token}`,

          },
        }
      );


    const data =
      await response.json();


    console.log(
      "Player playlists:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load playlists."
      );

    }


    const playlists =
      Array.isArray(
        data.playlists
      )
        ? data.playlists
        : [];


    renderPlayerPlaylists(
      playlists
    );


  } catch (error) {

    console.error(
      "Player playlist error:",
      error
    );


    playerPlaylistList.innerHTML = `
      <div class="player-playlist-empty">
        ${escapePlayerHTML(
          error.message ||
          "Unable to load playlists."
        )}
      </div>
    `;

  }

}



/* ========================================
   RENDER USER PLAYLISTS
======================================== */

function renderPlayerPlaylists(
  playlists
) {

  playerPlaylistList.innerHTML =
    "";


  if (!playlists.length) {

    playerPlaylistList.innerHTML = `
      <div class="player-playlist-empty">

        You don't have any playlists yet.

        <br><br>

        <a
          href="playlists.html"
          style="
            color:#35e67a;
            text-decoration:none;
            font-weight:800;
          "
        >
          Create a playlist
        </a>

      </div>
    `;


    return;

  }


  playlists.forEach(
    (playlist) => {

      const songCount =
        Array.isArray(
          playlist.songs
        )
          ? playlist.songs.length
          : 0;


      const button =
        document.createElement(
          "button"
        );


      button.type =
        "button";


      button.className =
        "player-playlist-item";


      button.innerHTML = `
        <div class="player-playlist-icon">
          ♪
        </div>

        <div class="player-playlist-details">

          <h4>
            ${escapePlayerHTML(
              playlist.name ||
              "Playlist"
            )}
          </h4>

          <p>
            ${songCount}
            ${
              songCount === 1
                ? "song"
                : "songs"
            }

            ${
              playlist.isPublic
                ? " • Public"
                : " • Private"
            }
          </p>

        </div>

        <span class="player-playlist-add">
          +
        </span>
      `;


      button.addEventListener(
        "click",
        () => {

          addCurrentSongToPlaylist(
            playlist._id,
            button
          );

        }
      );


      playerPlaylistList.appendChild(
        button
      );

    }
  );

}



/* ========================================
   ADD CURRENT SONG TO PLAYLIST
======================================== */

async function addCurrentSongToPlaylist(
  playlistId,
  button
) {

  if (
    !currentSong ||
    !currentSong._id
  ) {

    return;

  }


  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  if (!playlistId) {

    return;

  }


  const originalHTML =
    button.innerHTML;


  try {

    button.disabled =
      true;


    const addIcon =
      button.querySelector(
        ".player-playlist-add"
      );


    if (addIcon) {

      addIcon.textContent =
        "...";

    }


    playerPlaylistMessage.className =
      "player-playlist-message";


    playerPlaylistMessage.textContent =
      "";


    const response =
      await fetch(
        `${API_BASE_URL}/playlists/${playlistId}/songs/${currentSong._id}`,
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


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to add song to playlist."
      );

    }


    playerPlaylistMessage.className =
      "player-playlist-message success";


    playerPlaylistMessage.textContent =
      "Song added to playlist.";


    const addIconAfter =
      button.querySelector(
        ".player-playlist-add"
      );


    if (addIconAfter) {

      addIconAfter.textContent =
        "✓";

    }


    setTimeout(
      () => {

        closeAddToPlaylistModal();

      },
      900
    );


  } catch (error) {

    console.error(
      "Add song to playlist error:",
      error
    );


    playerPlaylistMessage.className =
      "player-playlist-message error";


    playerPlaylistMessage.textContent =
      error.message ||
      "Unable to add song to playlist.";


    button.innerHTML =
      originalHTML;


  } finally {

    button.disabled =
      false;

  }

}


/* ========================================
   RECORD PLAY
======================================== */

async function recordSongPlay(
  songId
) {

  const token =
    getToken();


  if (
    !token ||
    !songId
  ) {
    return;
  }


  try {

    const response =
      await fetch(
        `${API_BASE_URL}/plays/songs/${songId}`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        }
      );


    if (!response.ok) {

      const data =
        await response.json();


      console.warn(
        "Play was not recorded:",
        data.message
      );

    }


  } catch (error) {

    console.error(
      "Unable to record play:",
      error
    );

  }

}


/* ========================================
   FORMAT TIME
======================================== */

function formatTime(seconds) {

  if (
    !Number.isFinite(seconds)
  ) {

    return "0:00";

  }


  const minutes =
    Math.floor(
      seconds / 60
    );


  const remainingSeconds =
    Math.floor(
      seconds % 60
    )
      .toString()
      .padStart(
        2,
        "0"
      );


  return (
    `${minutes}:${remainingSeconds}`
  );

}


/* ========================================
   GET ARTIST NAMES
======================================== */

function getPlayerArtistNames(
  artists
) {

  if (
    !Array.isArray(artists)
  ) {

    return "";

  }


  return artists
    .map((artist) => {

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

    })
    .filter(Boolean)
    .join(", ");

}


/* ========================================
   ESCAPE HTML
======================================== */

function escapePlayerHTML(value) {

  if (
    value === null ||
    value === undefined
  ) {

    return "";

  }


  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}