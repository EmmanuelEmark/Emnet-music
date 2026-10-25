/* ========================================
   AUTH
======================================== */

if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


const moderationUser =
  getStoredUser();


if (
  !moderationUser ||
  ![
    "admin",
    "superadmin",
  ].includes(
    moderationUser.role
  )
) {

  alert(
    "Admin access required."
  );


  window.location.href =
    "home.html";


  throw new Error(
    "Admin access required."
  );

}


/* ========================================
   ELEMENTS
======================================== */

const videosLoading =
  document.getElementById(
    "videosLoading"
  );


const videosError =
  document.getElementById(
    "videosError"
  );


const videosEmpty =
  document.getElementById(
    "videosEmpty"
  );


const videoReviewList =
  document.getElementById(
    "videoReviewList"
  );


const pendingVideoCount =
  document.getElementById(
    "pendingVideoCount"
  );


const refreshVideosButton =
  document.getElementById(
    "refreshVideosButton"
  );


const adminLogoutButton =
  document.getElementById(
    "adminLogoutButton"
  );


/* ========================================
   STATE
======================================== */

let pendingVideos = [];


/* ========================================
   START
======================================== */

loadPendingVideos();


/* ========================================
   LOAD VIDEOS
======================================== */

async function loadPendingVideos() {

  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  try {

    videosLoading.style.display =
      "block";


    videosError.style.display =
      "none";


    videosEmpty.style.display =
      "none";


    videoReviewList.innerHTML =
      "";


    const response =
      await fetch(
        `${API_BASE_URL}/videos/pending`,
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
      "Pending videos:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load pending videos."
      );

    }


    pendingVideos =
      Array.isArray(
        data.videos
      )
        ? data.videos
        : [];


    videosLoading.style.display =
      "none";


    renderPendingVideos();


  } catch (error) {

    console.error(
      "Pending videos error:",
      error
    );


    videosLoading.style.display =
      "none";


    videosError.style.display =
      "block";


    videosError.textContent =
      error.message ||
      "Unable to load pending videos.";

  }

}


/* ========================================
   RENDER
======================================== */

function renderPendingVideos() {

  videoReviewList.innerHTML =
    "";


  pendingVideoCount.textContent =
    pendingVideos.length;


  if (
    pendingVideos.length === 0
  ) {

    videosEmpty.style.display =
      "block";

    return;

  }


  videosEmpty.style.display =
    "none";


  pendingVideos.forEach(
    (video) => {

      const primaryArtists =
        Array.isArray(
          video.primaryArtists
        )
          ? video.primaryArtists
          : [];


      const featuredArtists =
        Array.isArray(
          video.featuredArtists
        )
          ? video.featuredArtists
          : [];


      const primaryNames =
        primaryArtists
          .map(
            (artist) =>
              artist.stageName
          )
          .filter(Boolean)
          .join(", ") ||
        "Unknown artist";


      const featuredNames =
        featuredArtists
          .map(
            (artist) =>
              artist.stageName
          )
          .filter(Boolean)
          .join(", ");


      const submittedBy =
        video.submittedBy ||
        {};


      const linkedSong =
        video.linkedSong;


      const linkedRelease =
        video.linkedRelease;


      const title =
        video.title ||
        "Untitled Video";


      const videoType =
        formatVideoType(
          video.videoType
        );


      const createdDate =
        formatVideoDate(
          video.createdAt
        );


      const card =
        document.createElement(
          "article"
        );


      card.className =
        "video-review-card";


      card.innerHTML = `

        <div class="video-thumbnail">

          ${
            video.thumbnailUrl
              ? `
                <img
                  src="${escapeVideoHTML(
                    video.thumbnailUrl
                  )}"
                  alt="${escapeVideoHTML(
                    title
                  )}"
                >
              `
              : `
                <div class="video-thumbnail-placeholder">
                  ▶
                </div>
              `
          }


          <span class="video-duration">
            ${escapeVideoHTML(
              formatDuration(
                video.duration
              )
            )}
          </span>

        </div>


        <div class="video-review-body">

          <div class="video-review-top">

            <div>

              <p class="video-type">
                ${escapeVideoHTML(
                  videoType
                )}
              </p>


              <h2 class="video-review-title">
                ${escapeVideoHTML(
                  title
                )}
              </h2>

            </div>


            <span class="video-pending-badge">
              Pending
            </span>

          </div>


          <div class="video-artists">

            Primary artist:

            <strong>
              ${escapeVideoHTML(
                primaryNames
              )}
            </strong>

          </div>


          ${
            featuredNames
              ? `
                <div class="video-artists">

                  Featuring:

                  <strong>
                    ${escapeVideoHTML(
                      featuredNames
                    )}
                  </strong>

                </div>
              `
              : ""
          }


          <div class="video-detail-grid">

            <div class="video-detail-box">

              <small>
                Submitted by
              </small>

              <strong>
                ${escapeVideoHTML(
                  submittedBy.fullName ||
                  "Unknown user"
                )}
              </strong>

            </div>


            <div class="video-detail-box">

              <small>
                Email
              </small>

              <strong>
                ${escapeVideoHTML(
                  submittedBy.email ||
                  "Not available"
                )}
              </strong>

            </div>


            <div class="video-detail-box">

              <small>
                Submitted
              </small>

              <strong>
                ${escapeVideoHTML(
                  createdDate
                )}
              </strong>

            </div>


            <div class="video-detail-box">

              <small>
                Linked song
              </small>

              <strong>
                ${escapeVideoHTML(
                  linkedSong?.title ||
                  "None"
                )}
              </strong>

            </div>


            <div class="video-detail-box">

              <small>
                Linked release
              </small>

              <strong>
                ${escapeVideoHTML(
                  linkedRelease?.title ||
                  "None"
                )}
              </strong>

            </div>


            <div class="video-detail-box">

              <small>
                Status
              </small>

              <strong>
                Pending review
              </strong>

            </div>

          </div>


          <div class="video-rights">

            Rights confirmation:

            <strong>
              ${
                video.rightsConfirmed
                  ? "Confirmed"
                  : "Not confirmed"
              }
            </strong>

          </div>


          ${
            video.videoUrl
              ? `
                <a
                  href="${escapeVideoHTML(
                    video.videoUrl
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="video-preview-link"
                >
                  ▶ Preview submitted video
                </a>
              `
              : ""
          }


          <div class="video-review-actions">

            <button
              type="button"
              class="video-action-button reject"
              data-action="reject"
              data-id="${video._id}"
            >
              Reject
            </button>


            <button
              type="button"
              class="video-action-button approve"
              data-action="approve"
              data-id="${video._id}"
            >
              Approve video
            </button>

          </div>

        </div>
      `;


      videoReviewList.appendChild(
        card
      );

    }
  );


  connectVideoActions();

}


/* ========================================
   BUTTON EVENTS
======================================== */

function connectVideoActions() {

  const buttons =
    videoReviewList
      .querySelectorAll(
        ".video-action-button"
      );


  buttons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        async () => {

          const videoId =
            button.dataset.id;


          const action =
            button.dataset.action;


          if (
            !videoId ||
            !action
          ) {

            return;

          }


          if (
            action === "approve"
          ) {

            await approvePendingVideo(
              videoId,
              button
            );

          }


          if (
            action === "reject"
          ) {

            await rejectPendingVideo(
              videoId,
              button
            );

          }

        }
      );

    }
  );

}


/* ========================================
   APPROVE
======================================== */

async function approvePendingVideo(
  videoId,
  button
) {

  const confirmed =
    window.confirm(
      "Approve this video and make it available on EmnetMusic?"
    );


  if (!confirmed) {

    return;

  }


  await runVideoAction(
    `${API_BASE_URL}/videos/${videoId}/approve`,
    button,
    "Approving..."
  );

}


/* ========================================
   REJECT
======================================== */

async function rejectPendingVideo(
  videoId,
  button
) {

  const confirmed =
    window.confirm(
      "Reject this video submission?"
    );


  if (!confirmed) {

    return;

  }


  await runVideoAction(
    `${API_BASE_URL}/videos/${videoId}/reject`,
    button,
    "Rejecting..."
  );

}


/* ========================================
   RUN ACTION
======================================== */

async function runVideoAction(
  url,
  button,
  loadingText
) {

  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  const originalText =
    button.textContent;


  const card =
    button.closest(
      ".video-review-card"
    );


  const cardButtons =
    card
      ? card.querySelectorAll(
          ".video-action-button"
        )
      : [];


  try {

    cardButtons.forEach(
      (item) => {

        item.disabled =
          true;

      }
    );


    button.textContent =
      loadingText;


    const response =
      await fetch(
        url,
        {
          method: "PATCH",

          headers: {

            Authorization:
              `Bearer ${token}`,

          },
        }
      );


    const data =
      await response.json();


    console.log(
      "Video moderation response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to review video."
      );

    }


    alert(
      data.message ||
      "Video updated successfully."
    );


    await loadPendingVideos();


  } catch (error) {

    console.error(
      "Video moderation error:",
      error
    );


    alert(
      error.message ||
      "Unable to review video."
    );


    cardButtons.forEach(
      (item) => {

        item.disabled =
          false;

      }
    );


    button.textContent =
      originalText;

  }

}


/* ========================================
   FORMAT VIDEO TYPE
======================================== */

function formatVideoType(
  value
) {

  if (!value) {

    return "Music Video";

  }


  return String(value)
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );

}


/* ========================================
   FORMAT DURATION
======================================== */

function formatDuration(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return "--:--";

  }


  /*
    If duration is already stored
    as something like "4:20",
    display it as supplied.
  */

  if (
    typeof value === "string" &&
    value.includes(":")
  ) {

    return value;

  }


  const seconds =
    Number(value);


  if (
    Number.isNaN(seconds)
  ) {

    return String(value);

  }


  const minutes =
    Math.floor(
      seconds / 60
    );


  const remainingSeconds =
    Math.floor(
      seconds % 60
    );


  return `${minutes}:${String(
    remainingSeconds
  ).padStart(2, "0")}`;

}


/* ========================================
   FORMAT DATE
======================================== */

function formatVideoDate(
  value
) {

  if (!value) {

    return "Not provided";

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "Not provided";

  }


  return date.toLocaleDateString(
    undefined,
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );

}


/* ========================================
   REFRESH
======================================== */

refreshVideosButton.addEventListener(
  "click",
  async () => {

    refreshVideosButton.disabled =
      true;


    refreshVideosButton.textContent =
      "Refreshing...";


    await loadPendingVideos();


    refreshVideosButton.disabled =
      false;


    refreshVideosButton.textContent =
      "↻ Refresh";

  }
);


/* ========================================
   LOGOUT
======================================== */

if (adminLogoutButton) {

  adminLogoutButton.addEventListener(
    "click",
    logout
  );

}


/* ========================================
   ESCAPE HTML
======================================== */

function escapeVideoHTML(
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