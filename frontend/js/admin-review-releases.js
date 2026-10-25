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

const releasesLoading =
  document.getElementById(
    "releasesLoading"
  );


const releasesError =
  document.getElementById(
    "releasesError"
  );


const releasesEmpty =
  document.getElementById(
    "releasesEmpty"
  );


const releaseReviewList =
  document.getElementById(
    "releaseReviewList"
  );


const pendingReleaseCount =
  document.getElementById(
    "pendingReleaseCount"
  );


const refreshReleasesButton =
  document.getElementById(
    "refreshReleasesButton"
  );


const adminLogoutButton =
  document.getElementById(
    "adminLogoutButton"
  );


/* ========================================
   STATE
======================================== */

let pendingReleases = [];


/* ========================================
   START
======================================== */

loadPendingReleases();


/* ========================================
   LOAD RELEASES
======================================== */

async function loadPendingReleases() {

  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  try {

    releasesLoading.style.display =
      "block";


    releasesError.style.display =
      "none";


    releasesEmpty.style.display =
      "none";


    releaseReviewList.innerHTML =
      "";


    const response =
      await fetch(
        `${API_BASE_URL}/releases/pending`,
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
      "Pending releases:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load pending releases."
      );

    }


    pendingReleases =
      Array.isArray(
        data.releases
      )
        ? data.releases
        : [];


    releasesLoading.style.display =
      "none";


    renderPendingReleases();


  } catch (error) {

    console.error(
      "Pending releases error:",
      error
    );


    releasesLoading.style.display =
      "none";


    releasesError.style.display =
      "block";


    releasesError.textContent =
      error.message ||
      "Unable to load pending releases.";

  }

}


/* ========================================
   RENDER RELEASES
======================================== */

function renderPendingReleases() {

  releaseReviewList.innerHTML =
    "";


  pendingReleaseCount.textContent =
    pendingReleases.length;


  if (
    pendingReleases.length === 0
  ) {

    releasesEmpty.style.display =
      "block";

    return;

  }


  releasesEmpty.style.display =
    "none";


  pendingReleases.forEach(
    (release) => {

      const primaryArtists =
        Array.isArray(
          release.primaryArtists
        )
          ? release.primaryArtists
          : [];


      const collaboratingArtists =
        Array.isArray(
          release.collaboratingArtists
        )
          ? release.collaboratingArtists
          : [];


      const primaryArtistNames =
        primaryArtists
          .map(
            (artist) =>
              artist.stageName
          )
          .filter(Boolean)
          .join(", ") ||
        "Unknown artist";


      const collaboratingNames =
        collaboratingArtists
          .map(
            (artist) =>
              artist.stageName
          )
          .filter(Boolean)
          .join(", ");


      const submittedBy =
        release.submittedBy ||
        {};


      const releaseDate =
        formatReleaseDate(
          release.releaseDate
        );


      const createdDate =
        formatReleaseDate(
          release.createdAt
        );


      const releaseType =
        release.releaseType ||
        "release";


      const title =
        release.title ||
        "Untitled Release";


      const card =
        document.createElement(
          "article"
        );


      card.className =
        "release-review-card";


      card.innerHTML = `

        <div class="release-cover">

          ${
            release.coverImage
              ? `
                <img
                  src="${escapeReleaseHTML(
                    release.coverImage
                  )}"
                  alt="${escapeReleaseHTML(
                    title
                  )} cover"
                >
              `
              : `
                <div
                  class="release-cover-placeholder"
                >
                  ♫
                </div>
              `
          }

        </div>


        <div class="release-review-body">

          <div class="release-review-top">

            <div>

              <p class="release-type">
                ${escapeReleaseHTML(
                  releaseType
                )}
              </p>


              <h2 class="release-review-title">
                ${escapeReleaseHTML(
                  title
                )}
              </h2>

            </div>


            <span
              class="release-pending-badge"
            >
              Pending
            </span>

          </div>


          <div class="release-artists">

            Primary artist:

            <strong>
              ${escapeReleaseHTML(
                primaryArtistNames
              )}
            </strong>

          </div>


          ${
            collaboratingNames
              ? `
                <div class="release-artists">

                  Collaborating artist:

                  <strong>
                    ${escapeReleaseHTML(
                      collaboratingNames
                    )}
                  </strong>

                </div>
              `
              : ""
          }


          <div class="release-detail-grid">

            <div class="release-detail-box">

              <small>
                Release date
              </small>

              <strong>
                ${escapeReleaseHTML(
                  releaseDate
                )}
              </strong>

            </div>


            <div class="release-detail-box">

              <small>
                Submitted by
              </small>

              <strong>
                ${escapeReleaseHTML(
                  submittedBy.fullName ||
                  "Unknown user"
                )}
              </strong>

            </div>


            <div class="release-detail-box">

              <small>
                Email
              </small>

              <strong>
                ${escapeReleaseHTML(
                  submittedBy.email ||
                  "Not available"
                )}
              </strong>

            </div>


            <div class="release-detail-box">

              <small>
                Submitted
              </small>

              <strong>
                ${escapeReleaseHTML(
                  createdDate
                )}
              </strong>

            </div>


            <div class="release-detail-box">

              <small>
                Source
              </small>

              <strong>
                ${escapeReleaseHTML(
                  release.sourceType ||
                  "artist"
                )}
              </strong>

            </div>


            <div class="release-detail-box">

              <small>
                Status
              </small>

              <strong>
                Pending review
              </strong>

            </div>

          </div>


          <div class="release-rights">

            Rights confirmation:

            <strong>
              ${
                release.rightsConfirmed
                  ? "Confirmed"
                  : "Not confirmed"
              }
            </strong>

          </div>


          <div class="release-review-actions">

            <button
              type="button"
              class="release-action-button reject"
              data-action="reject"
              data-id="${release._id}"
            >
              Reject
            </button>


            <button
              type="button"
              class="release-action-button approve"
              data-action="approve"
              data-id="${release._id}"
            >
              Approve release
            </button>

          </div>

        </div>
      `;


      releaseReviewList.appendChild(
        card
      );

    }
  );


  connectReleaseActions();

}


/* ========================================
   BUTTON EVENTS
======================================== */

function connectReleaseActions() {

  const buttons =
    releaseReviewList
      .querySelectorAll(
        ".release-action-button"
      );


  buttons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        async () => {

          const releaseId =
            button.dataset.id;


          const action =
            button.dataset.action;


          if (
            !releaseId ||
            !action
          ) {

            return;

          }


          if (
            action === "approve"
          ) {

            await approvePendingRelease(
              releaseId,
              button
            );

          }


          if (
            action === "reject"
          ) {

            await rejectPendingRelease(
              releaseId,
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

async function approvePendingRelease(
  releaseId,
  button
) {

  const confirmed =
    window.confirm(
      "Approve this release? All songs inside this release will also be approved."
    );


  if (!confirmed) {

    return;

  }


  await runReleaseAction(
    `${API_BASE_URL}/releases/${releaseId}/approve`,
    button,
    "Approving..."
  );

}


/* ========================================
   REJECT
======================================== */

async function rejectPendingRelease(
  releaseId,
  button
) {

  const confirmed =
    window.confirm(
      "Reject this release? The songs inside the release will also be rejected."
    );


  if (!confirmed) {

    return;

  }


  await runReleaseAction(
    `${API_BASE_URL}/releases/${releaseId}/reject`,
    button,
    "Rejecting..."
  );

}


/* ========================================
   RUN ACTION
======================================== */

async function runReleaseAction(
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
      ".release-review-card"
    );


  const cardButtons =
    card
      ? card.querySelectorAll(
          ".release-action-button"
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
      "Release moderation response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to review release."
      );

    }


    alert(
      data.message ||
      "Release updated successfully."
    );


    await loadPendingReleases();


  } catch (error) {

    console.error(
      "Release moderation error:",
      error
    );


    alert(
      error.message ||
      "Unable to review release."
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
   FORMAT DATE
======================================== */

function formatReleaseDate(
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

refreshReleasesButton.addEventListener(
  "click",
  async () => {

    refreshReleasesButton.disabled =
      true;


    refreshReleasesButton.textContent =
      "Refreshing...";


    await loadPendingReleases();


    refreshReleasesButton.disabled =
      false;


    refreshReleasesButton.textContent =
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

function escapeReleaseHTML(
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