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

  window.location.href =
    "home";

  throw new Error(
    "Artist access required."
  );

}


/* ========================================
   ELEMENTS
======================================== */

const artistReleaseGrid =
  document.getElementById(
    "artistReleaseGrid"
  );


const releaseLoading =
  document.getElementById(
    "releaseLoading"
  );


const releaseEmpty =
  document.getElementById(
    "releaseEmpty"
  );


const releasePageMessage =
  document.getElementById(
    "releasePageMessage"
  );


const allReleaseCount =
  document.getElementById(
    "allReleaseCount"
  );


const draftReleaseCount =
  document.getElementById(
    "draftReleaseCount"
  );


const pendingReleaseCount =
  document.getElementById(
    "pendingReleaseCount"
  );


const approvedReleaseCount =
  document.getElementById(
    "approvedReleaseCount"
  );


const submitModal =
  document.getElementById(
    "submitModal"
  );


const submitModalClose =
  document.getElementById(
    "submitModalClose"
  );


const submitReleaseTitle =
  document.getElementById(
    "submitReleaseTitle"
  );


const rightsConfirmed =
  document.getElementById(
    "rightsConfirmed"
  );


const submitReleaseButton =
  document.getElementById(
    "submitReleaseButton"
  );


const submitMessage =
  document.getElementById(
    "submitMessage"
  );


const artistLogoutButton =
  document.getElementById(
    "artistLogoutButton"
  );


let selectedReleaseId =
  null;


/* ========================================
   LOAD RELEASES
======================================== */

loadMyReleases();


async function loadMyReleases() {

  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login";

    return;

  }


  try {

    releaseLoading.style.display =
      "block";


    releaseEmpty.style.display =
      "none";


    releasePageMessage.style.display =
      "none";


    artistReleaseGrid.innerHTML =
      "";


    const response =
      await fetch(

        `${API_BASE_URL}/releases/mine`,

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
      "My releases response:",
      data
    );


    if (!response.ok) {

      throw new Error(

        data.message ||
        "Unable to load releases."

      );

    }


    const releases =
      Array.isArray(
        data.releases
      )
        ? data.releases
        : [];


    updateStats(
      releases
    );


    renderReleases(
      releases
    );


  } catch (error) {

    console.error(
      "Load releases error:",
      error
    );


    releasePageMessage.style.display =
      "block";


    releasePageMessage.textContent =
      error.message ||
      "Unable to load releases.";


  } finally {

    releaseLoading.style.display =
      "none";

  }

}


/* ========================================
   UPDATE STATS
======================================== */

function updateStats(
  releases
) {

  allReleaseCount.textContent =
    releases.length;


  draftReleaseCount.textContent =
    releases.filter(

      (release) =>
        release.status ===
        "draft"

    ).length;


  pendingReleaseCount.textContent =
    releases.filter(

      (release) =>
        release.status ===
        "pending"

    ).length;


  approvedReleaseCount.textContent =
    releases.filter(

      (release) =>
        release.status ===
        "approved"

    ).length;

}


/* ========================================
   RENDER RELEASES
======================================== */

function renderReleases(
  releases
) {

  artistReleaseGrid.innerHTML =
    "";


  if (
    releases.length === 0
  ) {

    releaseEmpty.style.display =
      "block";

    return;

  }


  releaseEmpty.style.display =
    "none";


  releases.forEach(
    (release) => {

      const card =
        document.createElement(
          "article"
        );


      card.className =
        "release-card";


      const releaseDate =
        release.releaseDate
          ? new Date(
              release.releaseDate
            ).toLocaleDateString(
              undefined,
              {
                day: "numeric",
                month: "short",
                year: "numeric",
              }
            )
          : "No date";


      const songCount =
        Number(
          release.songCount ||
          0
        );


      /*
        Cover
      */

      let coverHtml =
        `

          <div class="release-cover-placeholder">
            ♫
          </div>

        `;


      if (
        release.coverImage
      ) {

        coverHtml =
          `

            <img
              src="${escapeHtml(
                release.coverImage
              )}"
              alt="${escapeHtml(
                release.title
              )}"
              class="release-cover"
            >

          `;

      }


      /*
        Actions
      */

      let actions = "";

      const manageReleaseLink = `
        <a
          href="artist-manage-release.html?releaseId=${encodeURIComponent(release._id)}"
          class="release-action-button"
        >
          Manage Release
        </a>
      `;

      if (release.status === "draft") {
        actions = `
          ${manageReleaseLink}

          <a
            href="artist-add-song?releaseId=${encodeURIComponent(release._id)}"
            class="release-action-button"
          >
            + Add Song
          </a>

          <button
            type="button"
            class="release-action-button primary submit-release-trigger"
            data-id="${release._id}"
            data-title="${escapeHtml(release.title)}"
          >
            Submit for Review
          </button>
        `;
      }

      if (release.status === "pending") {
        actions = `
          ${manageReleaseLink}

          <span class="release-action-button">
            Waiting for review
          </span>
        `;
      }

      if (release.status === "approved") {
        actions = `
          ${manageReleaseLink}

          <a
            href="release?id=${encodeURIComponent(release._id)}"
            class="release-action-button primary"
          >
            View Release
          </a>
        `;
      }

      if (release.status === "rejected") {
        actions = `
          ${manageReleaseLink}

          <span class="release-action-button">
            Rejected
          </span>
        `;
      }

      if (
        !["draft", "pending", "approved", "rejected"]
          .includes(release.status)
      ) {
        actions = manageReleaseLink;
      }


      card.innerHTML =
        `

          <div class="release-cover-wrapper">

            ${coverHtml}

          </div>


          <div class="release-card-content">

            <div class="release-card-top">

              <span class="release-type">

                ${formatType(
                  release.releaseType
                )}

              </span>


              <span
                class="release-status ${escapeHtml(
                  release.status
                )}"
              >

                ${escapeHtml(
                  release.status
                )}

              </span>

            </div>


            <h2>

              ${escapeHtml(
                release.title
              )}

            </h2>


            <div class="release-meta">

              ${songCount}
              song${songCount === 1 ? "" : "s"}

              ·

              ${releaseDate}

            </div>


            <div class="release-actions">

              ${actions}

            </div>

          </div>

        `;


      artistReleaseGrid.appendChild(
        card
      );

    }
  );


  attachSubmitButtons();

}


/* ========================================
   SUBMIT BUTTONS
======================================== */

function attachSubmitButtons() {

  const buttons =
    document.querySelectorAll(
      ".submit-release-trigger"
    );


  buttons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          selectedReleaseId =
            button.dataset.id;


          submitReleaseTitle.textContent =
            `Submit "${button.dataset.title}"`;


          rightsConfirmed.checked =
            false;


          submitMessage.style.display =
            "none";


          submitMessage.textContent =
            "";


          submitModal.classList.add(
            "active"
          );

        }
      );

    }
  );

}


/* ========================================
   CLOSE MODAL
======================================== */

if (submitModalClose) {

  submitModalClose.addEventListener(
    "click",
    closeSubmitModal
  );

}


submitModal.addEventListener(
  "click",
  (event) => {

    if (
      event.target ===
      submitModal
    ) {

      closeSubmitModal();

    }

  }
);


function closeSubmitModal() {

  submitModal.classList.remove(
    "active"
  );


  selectedReleaseId =
    null;


  rightsConfirmed.checked =
    false;


  submitMessage.style.display =
    "none";


  submitMessage.textContent =
    "";

}


/* ========================================
   SUBMIT RELEASE
======================================== */

submitReleaseButton.addEventListener(
  "click",
  submitRelease
);


async function submitRelease() {

  if (
    !selectedReleaseId
  ) {

    return;

  }


  if (
    !rightsConfirmed.checked
  ) {

    submitMessage.style.display =
      "block";


    submitMessage.textContent =
      "You must confirm that you own the content or have permission to distribute it.";


    return;

  }


  try {

    submitReleaseButton.disabled =
      true;


    submitReleaseButton.textContent =
      "Submitting...";


    submitMessage.style.display =
      "none";


    const response =
      await fetch(

        `${API_BASE_URL}/releases/${selectedReleaseId}/submit`,

        {

          method:
            "PATCH",

          headers: {

            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${getToken()}`,

          },

          body:
            JSON.stringify({

              rightsConfirmed:
                true,

            }),

        }

      );


    const data =
      await response.json();


    console.log(
      "Submit release response:",
      data
    );


    if (!response.ok) {

      throw new Error(

        data.message ||
        "Unable to submit release."

      );

    }


    closeSubmitModal();


    await loadMyReleases();


  } catch (error) {

    console.error(
      "Submit release error:",
      error
    );


    submitMessage.style.display =
      "block";


    submitMessage.textContent =
      error.message ||
      "Unable to submit release.";


  } finally {

    submitReleaseButton.disabled =
      false;


    submitReleaseButton.textContent =
      "Submit for Review";

  }

}


/* ========================================
   FORMAT TYPE
======================================== */

function formatType(
  value
) {

  if (
    value === "ep"
  ) {

    return "EP";

  }


  if (
    value === "single"
  ) {

    return "Single";

  }


  if (
    value === "album"
  ) {

    return "Album";

  }


  return value ||
    "Release";

}


/* ========================================
   ESCAPE HTML
======================================== */

function escapeHtml(
  value
) {

  const div =
    document.createElement(
      "div"
    );


  div.textContent =
    value || "";


  return div.innerHTML;

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