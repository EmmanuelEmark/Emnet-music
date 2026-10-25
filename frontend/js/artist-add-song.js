/* ========================================
   AUTH
======================================== */

if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


const artistUser =
  getStoredUser();


if (
  !artistUser ||
  artistUser.role !== "artist"
) {

  alert(
    "Artist access required."
  );


  window.location.href =
    "home.html";


  throw new Error(
    "Artist access required."
  );

}


/* ========================================
   RELEASE ID
======================================== */

/*
  First check URL:

  artist-add-song?releaseId=123

  If no ID is in the URL,
  use the release we just created.
*/

const params =
  new URLSearchParams(
    window.location.search
  );


let releaseId =
  params.get("releaseId");


if (!releaseId) {

  releaseId =
    localStorage.getItem(
      "emnetCurrentReleaseId"
    );

}


/* ========================================
   ELEMENTS
======================================== */

const selectedReleaseId =
  document.getElementById(
    "selectedReleaseId"
  );


const songPageError =
  document.getElementById(
    "songPageError"
  );


const addSongForm =
  document.getElementById(
    "addSongForm"
  );


const songTitle =
  document.getElementById(
    "songTitle"
  );


const songGenre =
  document.getElementById(
    "songGenre"
  );


const songAudioUrl =
  document.getElementById(
    "songAudioUrl"
  );


const songDuration =
  document.getElementById(
    "songDuration"
  );


const trackNumber =
  document.getElementById(
    "trackNumber"
  );


const songIsrc =
  document.getElementById(
    "songIsrc"
  );


const songFormMessage =
  document.getElementById(
    "songFormMessage"
  );


const addSongButton =
  document.getElementById(
    "addSongButton"
  );


const previewSongTitle =
  document.getElementById(
    "previewSongTitle"
  );


const previewGenre =
  document.getElementById(
    "previewGenre"
  );


const previewDuration =
  document.getElementById(
    "previewDuration"
  );


const previewTrackNumber =
  document.getElementById(
    "previewTrackNumber"
  );


const songCreatedCard =
  document.getElementById(
    "songCreatedCard"
  );


const createdSongTitle =
  document.getElementById(
    "createdSongTitle"
  );


const createdSongId =
  document.getElementById(
    "createdSongId"
  );


const artistLogoutButton =
  document.getElementById(
    "artistLogoutButton"
  );


/* ========================================
   VERIFY RELEASE ID EXISTS
======================================== */

if (!releaseId) {

  selectedReleaseId.textContent =
    "No release selected";


  songPageError.style.display =
    "block";


  songPageError.textContent =
    "No release was selected. Create a release first or open this page from one of your releases.";


  addSongButton.disabled =
    true;

} else {

  selectedReleaseId.textContent =
    releaseId;

}


/* ========================================
   LIVE PREVIEW
======================================== */

songTitle.addEventListener(
  "input",
  updateSongPreview
);


songGenre.addEventListener(
  "input",
  updateSongPreview
);


songDuration.addEventListener(
  "input",
  updateSongPreview
);


trackNumber.addEventListener(
  "input",
  updateSongPreview
);


function updateSongPreview() {

  previewSongTitle.textContent =
    songTitle.value.trim() ||
    "Your song";


  previewGenre.textContent =
    songGenre.value.trim() ||
    "—";


  previewDuration.textContent =
    formatDuration(
      songDuration.value
    );


  previewTrackNumber.textContent =
    trackNumber.value ||
    "1";

}


/* ========================================
   ADD SONG
======================================== */

addSongForm.addEventListener(
  "submit",
  addSongToRelease
);


async function addSongToRelease(
  event
) {

  event.preventDefault();


  clearSongMessage();


  songCreatedCard.classList.remove(
    "active"
  );


  if (!releaseId) {

    showSongMessage(
      "No release is selected.",
      "error"
    );

    return;

  }


  const title =
    songTitle
      .value
      .trim();


  const genre =
    songGenre
      .value
      .trim();


  const audioUrl =
    songAudioUrl
      .value
      .trim();


  const duration =
    Number(
      songDuration.value
    );


  const track =
    Number(
      trackNumber.value
    );


  const isrc =
    songIsrc
      .value
      .trim();


  if (
    !title ||
    !genre ||
    !audioUrl ||
    !duration ||
    !track
  ) {

    showSongMessage(
      "Please complete all required fields.",
      "error"
    );

    return;

  }


  if (
    duration <= 0
  ) {

    showSongMessage(
      "Song duration must be greater than zero.",
      "error"
    );

    return;

  }


  if (
    track <= 0
  ) {

    showSongMessage(
      "Track number must be at least 1.",
      "error"
    );

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

    addSongButton.disabled =
      true;


    addSongButton.textContent =
      "Adding song...";


    const response =
      await fetch(
        `${API_BASE_URL}/songs/release/${releaseId}`,
        {
          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,

          },

          body:
            JSON.stringify({

              title,

              genre,

              audioUrl,

              duration,

              trackNumber:
                track,

              isrc,

            }),
        }
      );


    const data =
      await response.json();


    console.log(
      "Add song response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to add song."
      );

    }


    if (!data.song) {

      throw new Error(
        "Song was added but the server did not return its details."
      );

    }


    showSongMessage(
      "Song added successfully.",
      "success"
    );


    createdSongTitle.textContent =
      data.song.title ||
      title;


    createdSongId.textContent =
      `Song ID: ${data.song._id}`;


    songCreatedCard.classList.add(
      "active"
    );


    /*
      Store the most recently
      created song.
    */

    localStorage.setItem(
      "emnetCurrentSongId",
      data.song._id
    );


    /*
      If this is an EP or album,
      the artist may add another song.

      We don't automatically redirect yet.
    */

    addSongForm.reset();


    trackNumber.value =
      track + 1;


    resetSongPreview();


    window.scrollTo({
      top:
        document.body.scrollHeight,

      behavior:
        "smooth",
    });


  } catch (error) {

    console.error(
      "Add song error:",
      error
    );


    showSongMessage(
      error.message ||
      "Unable to add song.",
      "error"
    );


  } finally {

    addSongButton.disabled =
      false;


    addSongButton.textContent =
      "Add song";

  }

}


/* ========================================
   FORMAT DURATION
======================================== */

function formatDuration(
  value
) {

  const totalSeconds =
    Number(value);


  if (
    !totalSeconds ||
    totalSeconds <= 0
  ) {

    return "--:--";

  }


  const minutes =
    Math.floor(
      totalSeconds / 60
    );


  const seconds =
    Math.floor(
      totalSeconds % 60
    );


  return `${minutes}:${String(
    seconds
  ).padStart(2, "0")}`;

}


/* ========================================
   RESET PREVIEW
======================================== */

function resetSongPreview() {

  previewSongTitle.textContent =
    "Your song";


  previewGenre.textContent =
    "—";


  previewDuration.textContent =
    "--:--";


  previewTrackNumber.textContent =
    trackNumber.value ||
    "1";

}


/* ========================================
   MESSAGE
======================================== */

function showSongMessage(
  message,
  type
) {

  songFormMessage.textContent =
    message;


  songFormMessage.className =
    `song-form-message ${type}`;

}


function clearSongMessage() {

  songFormMessage.textContent =
    "";


  songFormMessage.className =
    "song-form-message";

}


/* ========================================
   LOGOUT
======================================== */

if (artistLogoutButton) {

  artistLogoutButton.addEventListener(
    "click",
    logout
  );

}