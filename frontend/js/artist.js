if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


const params =
  new URLSearchParams(
    window.location.search
  );


const artistIdFromUrl =
  params.get("id");


const artistIdFromStorage =
  sessionStorage.getItem(
    "selectedArtistId"
  );


const artistId =
  artistIdFromUrl ||
  artistIdFromStorage;


const artistLoading =
  document.getElementById(
    "artistLoading"
  );


const artistError =
  document.getElementById(
    "artistError"
  );


const artistContent =
  document.getElementById(
    "artistContent"
  );


const artistCoverBackground =
  document.getElementById(
    "artistCoverBackground"
  );


const artistProfileImage =
  document.getElementById(
    "artistProfileImage"
  );


const artistStageName =
  document.getElementById(
    "artistStageName"
  );


const verifiedBadge =
  document.getElementById(
    "verifiedBadge"
  );


const artistFollowers =
  document.getElementById(
    "artistFollowers"
  );


const followArtistButton =
  document.getElementById(
    "followArtistButton"
  );


const playArtistButton =
  document.getElementById(
    "playArtistButton"
  );


const artistSongList =
  document.getElementById(
    "artistSongList"
  );


const artistReleaseGrid =
  document.getElementById(
    "artistReleaseGrid"
  );


const artistVideoGrid =
  document.getElementById(
    "artistVideoGrid"
  );


const artistSongsSection =
  document.getElementById(
    "artistSongsSection"
  );


const artistReleasesSection =
  document.getElementById(
    "artistReleasesSection"
  );


const artistVideosSection =
  document.getElementById(
    "artistVideosSection"
  );


const logoutButton =
  document.getElementById(
    "logoutButton"
  );


let currentArtist = null;

let artistSongs = [];

let artistReleases = [];

let artistVideos = [];

let isFollowingArtist = false;


/* ========================================
   START PAGE
======================================== */

startArtistPage();


async function startArtistPage() {

  await loadPlayerComponent();


  if (!artistId) {

    showArtistError(
      "Artist ID is missing."
    );

    return;

  }


  await loadArtistProfile();

}


logoutButton.addEventListener(
  "click",
  logout
);


/* ========================================
   LOAD ARTIST
======================================== */

async function loadArtistProfile() {

  try {

    const response =
      await fetch(
        `${API_BASE_URL}/artists/profile/${artistId}`
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load artist."
      );

    }


    currentArtist =
      data.artist;


    artistSongs =
      data.songs || [];


    artistReleases =
      data.releases || [];


    artistVideos =
      data.videos || [];


    renderArtist();


    artistLoading.style.display =
      "none";


    artistContent.classList.add(
      "active"
    );


  } catch (error) {

    console.error(
      "Artist profile error:",
      error
    );


    showArtistError(
      error.message
    );

  }

}


/* ========================================
   RENDER ARTIST
======================================== */

function renderArtist() {

  if (!currentArtist) {
    return;
  }


  document.title =
    `${currentArtist.stageName || "Artist"} | EmnetMusic`;


  artistStageName.textContent =
    currentArtist.stageName ||
    "Artist";


  artistFollowers.textContent =
    currentArtist.followersCount ||
    0;


  const profileImage =
    safeArtistImage(
      currentArtist.profileImage
    );


  const coverImage =
    currentArtist.coverImage ||
    currentArtist.profileImage ||
    "";


  artistProfileImage.src =
    profileImage;


  artistCoverBackground.style.backgroundImage =
    coverImage
      ? `url("${coverImage}")`
      : `
        radial-gradient(
          circle at 35% 35%,
          rgba(53, 230, 122, 0.20),
          transparent 40%
        )
      `;


  verifiedBadge.style.display =
    currentArtist.verified
      ? ""
      : "none";


  renderArtistSongs();

  renderArtistReleases();

  renderArtistVideos();

}


/* ========================================
   SONGS
======================================== */

function renderArtistSongs() {

  artistSongList.innerHTML =
    "";


  artistSongsSection.style.display =
    artistSongs.length
      ? ""
      : "none";


  artistSongs.forEach(
    (song, index) => {

      const row =
        document.createElement(
          "div"
        );


      row.className =
        "artist-song-row";


      const release =
        song.releaseId || {};


      row.innerHTML = `
        <div class="artist-song-number">
          ${index + 1}
        </div>

        <img
          class="artist-song-cover"
          src="${safeArtistImage(
            release.coverImage
          )}"
          alt="${escapeArtistHTML(
            song.title
          )}"
        >

        <div class="artist-song-meta">

          <h3>
            ${escapeArtistHTML(
              song.title ||
              "Untitled"
            )}
          </h3>

          <p>
            ${escapeArtistHTML(
              song.genre ||
              "Music"
            )}
          </p>

        </div>

        <div class="artist-song-release">
          ${escapeArtistHTML(
            release.title ||
            ""
          )}
        </div>

        <button
          type="button"
          class="artist-song-play"
          data-song-id="${song._id}"
          aria-label="Play song"
        >
          ▶
        </button>
      `;


      artistSongList.appendChild(
        row
      );

    }
  );


  artistSongList
    .querySelectorAll(
      ".artist-song-play"
    )
    .forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            const song =
              artistSongs.find(
                (item) =>
                  item._id ===
                  button.dataset.songId
              );


            if (!song) {
              return;
            }


            playSong(
              song,
              artistSongs
            );

          }
        );

      }
    );

}


/* ========================================
   RELEASES
======================================== */

function renderArtistReleases() {

  artistReleaseGrid.innerHTML =
    "";


  artistReleasesSection.style.display =
    artistReleases.length
      ? ""
      : "none";


  artistReleases.forEach(
    (release) => {

      const card =
        document.createElement(
          "a"
        );


      card.className =
        "artist-release-card";


      card.href =
        `release.html?id=${release._id}`;


      card.innerHTML = `
        <img
          src="${safeArtistImage(
            release.coverImage
          )}"
          alt="${escapeArtistHTML(
            release.title
          )}"
        >

        <h3>
          ${escapeArtistHTML(
            release.title ||
            "Untitled"
          )}
        </h3>

        <p>
          ${escapeArtistHTML(
            release.releaseType ||
            "Release"
          )}
        </p>
      `;


      artistReleaseGrid.appendChild(
        card
      );

    }
  );

}


/* ========================================
   VIDEOS
======================================== */

function renderArtistVideos() {

  artistVideoGrid.innerHTML =
    "";


  artistVideosSection.style.display =
    artistVideos.length
      ? ""
      : "none";


  artistVideos.forEach(
    (video) => {

      const card =
        document.createElement(
          "a"
        );


      card.className =
        "artist-video-card";


      card.href =
        `video.html?id=${video._id}`;


      card.innerHTML = `
        <div class="artist-video-thumbnail">

          <img
            src="${safeArtistImage(
              video.thumbnailUrl
            )}"
            alt="${escapeArtistHTML(
              video.title
            )}"
          >

          <div class="artist-video-play">
            <span>▶</span>
          </div>

        </div>

        <h3>
          ${escapeArtistHTML(
            video.title ||
            "Video"
          )}
        </h3>

        <p>
          Music video
        </p>
      `;


      artistVideoGrid.appendChild(
        card
      );

    }
  );

}


/* ========================================
   PLAY ARTIST
======================================== */

playArtistButton.addEventListener(
  "click",
  () => {

    if (!artistSongs.length) {
      return;
    }


    playSong(
      artistSongs[0],
      artistSongs
    );

  }
);


/* ========================================
   FOLLOW / UNFOLLOW
======================================== */

followArtistButton.addEventListener(
  "click",
  toggleArtistFollow
);


async function toggleArtistFollow() {

  if (!currentArtist) {
    return;
  }


  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  try {

    followArtistButton.disabled =
      true;


    const response =
      await fetch(
        `${API_BASE_URL}/listener/follows/${artistId}`,
        {
          method:
            isFollowingArtist
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

      throw new Error(
        data.message ||
        "Unable to update follow."
      );

    }


    isFollowingArtist =
      !isFollowingArtist;


    if (
      typeof data.followersCount ===
      "number"
    ) {

      currentArtist.followersCount =
        data.followersCount;


      artistFollowers.textContent =
        data.followersCount;

    }


    updateFollowButton();


  } catch (error) {

    console.error(
      "Follow error:",
      error
    );

  } finally {

    followArtistButton.disabled =
      false;

  }

}


/* ========================================
   FOLLOW BUTTON
======================================== */

function updateFollowButton() {

  followArtistButton.textContent =
    isFollowingArtist
      ? "Following"
      : "Follow";


  followArtistButton.classList.toggle(
    "following",
    isFollowingArtist
  );

}


/* ========================================
   ERROR
======================================== */

function showArtistError(
  message
) {

  artistLoading.style.display =
    "none";


  artistContent.classList.remove(
    "active"
  );


  artistError.style.display =
    "block";


  artistError.textContent =
    message ||
    "Unable to load artist.";

}


/* ========================================
   IMAGE
======================================== */

function safeArtistImage(
  imageUrl
) {

  if (
    imageUrl &&
    typeof imageUrl === "string"
  ) {

    return imageUrl;

  }


  return (
    "https://placehold.co/" +
    "600x600/111612/" +
    "35e67a?text=EmnetMusic"
  );

}


/* ========================================
   ESCAPE HTML
======================================== */

function escapeArtistHTML(
  value
) {

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