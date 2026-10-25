if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


/* ========================================
   ELEMENTS
======================================== */

const libraryMessage =
  document.getElementById(
    "libraryMessage"
  );


const likedSongsList =
  document.getElementById(
    "likedSongsList"
  );


const followedArtistsGrid =
  document.getElementById(
    "followedArtistsGrid"
  );


const playlistsGrid =
  document.getElementById(
    "playlistsGrid"
  );


const likedSongsSection =
  document.getElementById(
    "likedSongsSection"
  );


const followedArtistsSection =
  document.getElementById(
    "followedArtistsSection"
  );


const playlistsSection =
  document.getElementById(
    "playlistsSection"
  );


const logoutButton =
  document.getElementById(
    "logoutButton"
  );


/* ========================================
   STATE
======================================== */

let likedSongs = [];

let followedArtists = [];

let myPlaylists = [];


/* ========================================
   START
======================================== */

startLibraryPage();


async function startLibraryPage() {

  await loadPlayerComponent();

  await loadLibrary();

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
   LOAD LIBRARY
======================================== */

async function loadLibrary() {

  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  try {

    const [
      likesResponse,
      followsResponse,
      playlistsResponse,
    ] =
      await Promise.all([

        fetch(
          `${API_BASE_URL}/listener/likes`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        ),

        fetch(
          `${API_BASE_URL}/listener/follows`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        ),

        fetch(
          `${API_BASE_URL}/playlists`,
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        ),

      ]);


    const likesData =
      await likesResponse.json();


    const followsData =
      await followsResponse.json();


    const playlistsData =
      await playlistsResponse.json();


    console.log(
      "Library likes:",
      likesData
    );


    console.log(
      "Library follows:",
      followsData
    );


    console.log(
      "Library playlists:",
      playlistsData
    );


    if (!likesResponse.ok) {

      throw new Error(
        likesData.message ||
        "Unable to load liked songs."
      );

    }


    if (!followsResponse.ok) {

      throw new Error(
        followsData.message ||
        "Unable to load followed artists."
      );

    }


    if (!playlistsResponse.ok) {

      throw new Error(
        playlistsData.message ||
        "Unable to load playlists."
      );

    }


    /*
      We make this flexible because
      your controllers may return
      slightly different property names.
    */

    likedSongs =
      likesData.songs ||
      likesData.likedSongs ||
      likesData.likes ||
      [];


    followedArtists =
      followsData.artists ||
      followsData.followedArtists ||
      followsData.follows ||
      [];


    myPlaylists =
      playlistsData.playlists ||
      playlistsData.data ||
      [];


    renderLikedSongs();

    renderFollowedArtists();

    renderPlaylists();


    libraryMessage.style.display =
      "none";


  } catch (error) {

    console.error(
      "Library error:",
      error
    );


    libraryMessage.textContent =
      error.message ||
      "Unable to load your library.";

  }

}


/* ========================================
   LIKED SONGS
======================================== */

function renderLikedSongs() {

  likedSongsList.innerHTML =
    "";


  if (
    !Array.isArray(likedSongs) ||
    likedSongs.length === 0
  ) {

    likedSongsList.innerHTML = `
      <div class="library-empty">
        You haven't liked any songs yet.
      </div>
    `;

    return;

  }


  likedSongs.forEach(
    (item) => {

      /*
        Some APIs return the Song directly.
        Others may return:
        { songId: populatedSong }
      */

      const song =
        item.songId ||
        item.song ||
        item;


      if (!song) {
        return;
      }


      const release =
        song.releaseId || {};


      const artistName =
        getLibraryArtistNames(
          song.primaryArtists
        );


      const row =
        document.createElement(
          "div"
        );


      row.className =
        "library-song-row";


      row.innerHTML = `
        <img
          class="library-song-cover"
          src="${safeLibraryImage(
            release.coverImage
          )}"
          alt="${escapeLibraryHTML(
            song.title ||
            "Song"
          )}"
        >

        <div class="library-song-main">

          <h3>
            ${escapeLibraryHTML(
              song.title ||
              "Untitled"
            )}
          </h3>

          <p>
            ${escapeLibraryHTML(
              artistName ||
              "Artist"
            )}
          </p>

        </div>

        <div class="library-song-release">
          ${escapeLibraryHTML(
            release.title ||
            ""
          )}
        </div>

        <button
          type="button"
          class="library-song-play"
          data-song-id="${song._id}"
        >
          ▶
        </button>
      `;


      likedSongsList.appendChild(
        row
      );

    }
  );


  likedSongsList
    .querySelectorAll(
      ".library-song-play"
    )
    .forEach(
      (button) => {

        button.addEventListener(
          "click",
          () => {

            const playableSongs =
              likedSongs
                .map(
                  (item) =>
                    item.songId ||
                    item.song ||
                    item
                )
                .filter(Boolean);


            const selectedSong =
              playableSongs.find(
                (song) =>
                  song._id ===
                  button.dataset.songId
              );


            if (!selectedSong) {

              return;

            }


            playSong(
              selectedSong,
              playableSongs
            );

          }
        );

      }
    );

}


/* ========================================
   FOLLOWED ARTISTS
======================================== */

function renderFollowedArtists() {

  followedArtistsGrid.innerHTML =
    "";


  if (
    !Array.isArray(
      followedArtists
    ) ||
    followedArtists.length === 0
  ) {

    followedArtistsGrid.innerHTML = `
      <div class="library-empty">
        You aren't following any artists yet.
      </div>
    `;

    return;

  }


  followedArtists.forEach(
    (item) => {

      const artist =
        item.artistId ||
        item.artist ||
        item;


      if (!artist) {
        return;
      }


      const card =
        document.createElement(
          "div"
        );


      card.className =
        "library-artist-card";


      card.innerHTML = `
        <img
          src="${safeLibraryImage(
            artist.profileImage
          )}"
          alt="${escapeLibraryHTML(
            artist.stageName ||
            "Artist"
          )}"
        >

        <h3>
          ${escapeLibraryHTML(
            artist.stageName ||
            "Artist"
          )}
        </h3>

        <p>
          ${
            artist.verified
              ? "Verified artist"
              : "Artist"
          }
        </p>
      `;


      card.addEventListener(
        "click",
        () => {

          if (!artist._id) {
            return;
          }


          window.location.href =
            `/artist?id=${encodeURIComponent(
              artist._id
            )}`;

        }
      );


      followedArtistsGrid.appendChild(
        card
      );

    }
  );

}


/* ========================================
   PLAYLISTS
======================================== */

function renderPlaylists() {

  playlistsGrid.innerHTML =
    "";


  if (
    !Array.isArray(myPlaylists) ||
    myPlaylists.length === 0
  ) {

    playlistsGrid.innerHTML = `
      <div class="library-empty">
        You haven't created any playlists yet.
      </div>
    `;

    return;

  }


  myPlaylists
    .slice(0, 6)
    .forEach(
      (playlist) => {

        const songCount =
          Array.isArray(
            playlist.songs
          )
            ? playlist.songs.length
            : 0;


        const card =
          document.createElement(
            "div"
          );


        card.className =
          "library-playlist-card";


        card.innerHTML = `
          <div class="library-playlist-cover">
            <span>♪</span>
          </div>

          <h3>
            ${escapeLibraryHTML(
              playlist.name ||
              playlist.title ||
              "Playlist"
            )}
          </h3>

          <p>
            ${songCount} ${
              songCount === 1
                ? "song"
                : "songs"
            }
          </p>
        `;


        card.addEventListener(
          "click",
          () => {

            if (!playlist._id) {
              return;
            }


            window.location.href =
      `/playlist?id=${encodeURIComponent(
        playlist._id
      )}`;

          }
        );


        playlistsGrid.appendChild(
          card
        );

      }
    );

}


/* ========================================
   ARTIST NAMES
======================================== */

function getLibraryArtistNames(
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
   IMAGE
======================================== */

function safeLibraryImage(
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
    "600x600/111612/" +
    "35e67a?text=EmnetMusic"
  );

}


/* ========================================
   ESCAPE HTML
======================================== */

function escapeLibraryHTML(
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