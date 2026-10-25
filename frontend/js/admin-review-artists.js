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

const artistsLoading =
  document.getElementById(
    "artistsLoading"
  );


const artistsError =
  document.getElementById(
    "artistsError"
  );


const artistsEmpty =
  document.getElementById(
    "artistsEmpty"
  );


const artistReviewList =
  document.getElementById(
    "artistReviewList"
  );


const pendingArtistCount =
  document.getElementById(
    "pendingArtistCount"
  );


const refreshArtistsButton =
  document.getElementById(
    "refreshArtistsButton"
  );


const adminLogoutButton =
  document.getElementById(
    "adminLogoutButton"
  );


/* ========================================
   STATE
======================================== */

let pendingArtists = [];


/* ========================================
   START
======================================== */

loadPendingArtists();


/* ========================================
   LOAD PENDING ARTISTS
======================================== */

async function loadPendingArtists() {

  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  try {

    artistsLoading.style.display =
      "block";


    artistsError.style.display =
      "none";


    artistsEmpty.style.display =
      "none";


    const response =
      await fetch(
        `${API_BASE_URL}/artists/pending`,
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
      "Pending artists:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load artist applications."
      );

    }


    pendingArtists =
      Array.isArray(
        data.artists
      )
        ? data.artists
        : [];


    artistsLoading.style.display =
      "none";


    renderPendingArtists();


  } catch (error) {

    console.error(
      "Pending artists error:",
      error
    );


    artistsLoading.style.display =
      "none";


    artistsError.style.display =
      "block";


    artistsError.textContent =
      error.message ||
      "Unable to load artist applications.";

  }

}


/* ========================================
   RENDER
======================================== */

function renderPendingArtists() {

  artistReviewList.innerHTML =
    "";


  pendingArtistCount.textContent =
    pendingArtists.length;


  if (!pendingArtists.length) {

    artistsEmpty.style.display =
      "block";

    return;

  }


  artistsEmpty.style.display =
    "none";


  pendingArtists.forEach(
    (artist) => {

      const user =
        artist.userId || {};


      const stageName =
        artist.stageName ||
        "Unnamed Artist";


      const applicantName =
        user.fullName ||
        "Unknown user";


      const applicantEmail =
        user.email ||
        "";


      const country =
        artist.country ||
        "Not provided";


      const bio =
        artist.bio ||
        "No artist bio was provided.";


      const card =
        document.createElement(
          "article"
        );


      card.className =
        "artist-review-card";


      card.innerHTML = `
        <div class="artist-review-cover">

          ${
            artist.coverImage
              ? `
                <img
                  src="${escapeArtistHTML(
                    artist.coverImage
                  )}"
                  alt=""
                >
              `
              : `
                <div class="artist-review-cover-placeholder">
                  ♫
                </div>
              `
          }

        </div>


        <div class="artist-review-body">

          <div class="artist-review-top">

            <div class="artist-review-identity">

              <div class="artist-review-avatar">

                ${
                  artist.profileImage
                    ? `
                      <img
                        src="${escapeArtistHTML(
                          artist.profileImage
                        )}"
                        alt=""
                      >
                    `
                    : escapeArtistHTML(
                        stageName
                          .charAt(0)
                          .toUpperCase()
                      )
                }

              </div>


              <div class="artist-review-name">

                <h2>
                  ${escapeArtistHTML(
                    stageName
                  )}
                </h2>

                <p class="artist-review-applicant">
                  Applied by
                  ${escapeArtistHTML(
                    applicantName
                  )}
                </p>

              </div>

            </div>


            <span class="pending-badge">
              Pending
            </span>

          </div>


          <div class="artist-review-info">

            <div class="artist-info-box">

              <small>
                Applicant email
              </small>

              <strong>
                ${escapeArtistHTML(
                  applicantEmail ||
                  "Not available"
                )}
              </strong>

            </div>


            <div class="artist-info-box">

              <small>
                Country
              </small>

              <strong>
                ${escapeArtistHTML(
                  country
                )}
              </strong>

            </div>

          </div>


          <div class="artist-review-bio">

            <small>
              Artist bio
            </small>

            <p>
              ${escapeArtistHTML(
                bio
              )}
            </p>

          </div>


          <div class="artist-review-actions">

            <button
              type="button"
              class="artist-review-button reject"
              data-action="reject"
              data-id="${artist._id}"
            >
              Reject
            </button>


            <button
              type="button"
              class="artist-review-button approve"
              data-action="approve"
              data-id="${artist._id}"
            >
              Approve artist
            </button>

          </div>

        </div>
      `;


      artistReviewList.appendChild(
        card
      );

    }
  );


  connectArtistActions();

}


/* ========================================
   ACTION BUTTONS
======================================== */

function connectArtistActions() {

  const buttons =
    artistReviewList
      .querySelectorAll(
        ".artist-review-button"
      );


  buttons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        async () => {

          const artistId =
            button.dataset.id;


          const action =
            button.dataset.action;


          if (
            !artistId ||
            !action
          ) {

            return;

          }


          if (
            action === "approve"
          ) {

            await approvePendingArtist(
              artistId,
              button
            );

          }


          if (
            action === "reject"
          ) {

            await rejectPendingArtist(
              artistId,
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

async function approvePendingArtist(
  artistId,
  button
) {

  const confirmed =
    window.confirm(
      "Approve this artist application?"
    );


  if (!confirmed) {

    return;

  }


  await runArtistAction(
    `${API_BASE_URL}/artists/${artistId}/approve`,
    button,
    "Approving..."
  );

}


/* ========================================
   REJECT
======================================== */

async function rejectPendingArtist(
  artistId,
  button
) {

  const confirmed =
    window.confirm(
      "Reject this artist application?"
    );


  if (!confirmed) {

    return;

  }


  await runArtistAction(
    `${API_BASE_URL}/artists/${artistId}/reject`,
    button,
    "Rejecting..."
  );

}


/* ========================================
   RUN ACTION
======================================== */

async function runArtistAction(
  url,
  button,
  loadingText
) {

  const token =
    getToken();


  if (!token) {

    return;

  }


  const originalText =
    button.textContent;


  try {

    button.disabled =
      true;


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
      "Artist moderation response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to complete artist review."
      );

    }


    alert(
      data.message ||
      "Artist application updated."
    );


    await loadPendingArtists();


  } catch (error) {

    console.error(
      "Artist moderation error:",
      error
    );


    alert(
      error.message ||
      "Unable to complete artist review."
    );


  } finally {

    button.disabled =
      false;


    button.textContent =
      originalText;

  }

}


/* ========================================
   REFRESH
======================================== */

refreshArtistsButton.addEventListener(
  "click",
  async () => {

    refreshArtistsButton.disabled =
      true;


    refreshArtistsButton.textContent =
      "Refreshing...";


    await loadPendingArtists();


    refreshArtistsButton.disabled =
      false;


    refreshArtistsButton.textContent =
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