/* ========================================
   PROTECT PAGE
======================================== */

if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


/* ========================================
   SUPERADMIN CHECK
======================================== */

const storedSuperadmin =
  getStoredUser();


if (
  !storedSuperadmin ||
  storedSuperadmin.role !==
    "superadmin"
) {

  alert(
    "Superadmin access required."
  );


  window.location.href =
    "home.html";


  throw new Error(
    "Superadmin access required."
  );

}


const openInviteAdminButton =
  document.getElementById(
    "openInviteAdminButton"
  );


const inviteAdminModal =
  document.getElementById(
    "inviteAdminModal"
  );


const closeInviteAdminButton =
  document.getElementById(
    "closeInviteAdminButton"
  );


const inviteAdminForm =
  document.getElementById(
    "inviteAdminForm"
  );


const inviteAdminName =
  document.getElementById(
    "inviteAdminName"
  );


const inviteAdminEmail =
  document.getElementById(
    "inviteAdminEmail"
  );


const inviteAdminMessage =
  document.getElementById(
    "inviteAdminMessage"
  );


const createInviteButton =
  document.getElementById(
    "createInviteButton"
  );


const inviteResult =
  document.getElementById(
    "inviteResult"
  );


const generatedInviteLink =
  document.getElementById(
    "generatedInviteLink"
  );


const copyInviteLinkButton =
  document.getElementById(
    "copyInviteLinkButton"
  );


const inviteExpiryText =
  document.getElementById(
    "inviteExpiryText"
  );

/* ========================================
   ELEMENTS
======================================== */

const adminsLoading =
  document.getElementById(
    "adminsLoading"
  );


const adminsError =
  document.getElementById(
    "adminsError"
  );


const adminsEmpty =
  document.getElementById(
    "adminsEmpty"
  );


const adminsList =
  document.getElementById(
    "adminsList"
  );


const refreshAdminsButton =
  document.getElementById(
    "refreshAdminsButton"
  );


const adminLogoutButton =
  document.getElementById(
    "adminLogoutButton"
  );


/* ========================================
   STATE
======================================== */

let admins = [];


/* ========================================
   START
======================================== */

loadAdmins();


/* ========================================
   LOAD ADMINS
======================================== */

async function loadAdmins() {

  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  try {

    adminsLoading.style.display =
      "block";


    adminsError.style.display =
      "none";


    adminsEmpty.style.display =
      "none";


    const response =
      await fetch(
        `${API_BASE_URL}/admins`,
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
      "Admins response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load admins."
      );

    }


    admins =
      Array.isArray(
        data.admins
      )
        ? data.admins
        : [];


    adminsLoading.style.display =
      "none";


    renderAdmins();


  } catch (error) {

    console.error(
      "Load admins error:",
      error
    );


    adminsLoading.style.display =
      "none";


    adminsError.style.display =
      "block";


    adminsError.textContent =
      error.message ||
      "Unable to load admins.";

  }

}


/* ========================================
   RENDER ADMINS
======================================== */

function renderAdmins() {

  adminsList.innerHTML =
    "";


  if (!admins.length) {

    adminsEmpty.style.display =
      "block";

    return;

  }


  adminsEmpty.style.display =
    "none";


  admins.forEach(
    (admin) => {

      const status =
        admin.accountStatus ||
        "active";


      const name =
        admin.fullName ||
        "Admin";


      const card =
        document.createElement(
          "div"
        );


      card.className =
        "admin-account-card";


      card.innerHTML = `
        <div class="admin-account-avatar">
          ${escapeAdminHTML(
            name.charAt(0)
              .toUpperCase()
          )}
        </div>


        <div class="admin-account-details">

          <h3>
            ${escapeAdminHTML(
              name
            )}
          </h3>

          <p class="admin-account-email">
            ${escapeAdminHTML(
              admin.email || ""
            )}
          </p>


          <div class="admin-account-meta">

            <span class="admin-badge">
              Admin
            </span>

            <span
              class="admin-badge ${status}"
            >
              ${escapeAdminHTML(
                status
              )}
            </span>

          </div>

        </div>


        <div class="admin-account-actions">

          ${
            status === "suspended"
              ? `
                <button
                  type="button"
                  class="admin-action-button reactivate"
                  data-action="reactivate"
                  data-id="${admin._id}"
                >
                  Reactivate
                </button>
              `
              : `
                <button
                  type="button"
                  class="admin-action-button suspend"
                  data-action="suspend"
                  data-id="${admin._id}"
                >
                  Suspend
                </button>
              `
          }


          <button
            type="button"
            class="admin-action-button remove"
            data-action="remove"
            data-id="${admin._id}"
          >
            Remove admin
          </button>

        </div>
      `;


      adminsList.appendChild(
        card
      );

    }
  );


  connectAdminActions();

}


/* ========================================
   CONNECT ACTION BUTTONS
======================================== */

function connectAdminActions() {

  const buttons =
    adminsList.querySelectorAll(
      ".admin-action-button"
    );


  buttons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        async () => {

          const adminId =
            button.dataset.id;


          const action =
            button.dataset.action;


          if (
            !adminId ||
            !action
          ) {

            return;

          }


          if (
            action === "suspend"
          ) {

            await suspendAdminAccount(
              adminId,
              button
            );

          }


          if (
            action === "reactivate"
          ) {

            await reactivateAdminAccount(
              adminId,
              button
            );

          }


          if (
            action === "remove"
          ) {

            await removeAdminPrivileges(
              adminId,
              button
            );

          }

        }
      );

    }
  );

}


/* ========================================
   SUSPEND ADMIN
======================================== */

async function suspendAdminAccount(
  adminId,
  button
) {

  const confirmed =
    window.confirm(
      "Suspend this admin?"
    );


  if (!confirmed) {

    return;

  }


  await runAdminAction(
    `${API_BASE_URL}/admins/${adminId}/suspend`,
    button,
    "Suspending..."
  );

}


/* ========================================
   REACTIVATE ADMIN
======================================== */

async function reactivateAdminAccount(
  adminId,
  button
) {

  await runAdminAction(
    `${API_BASE_URL}/admins/${adminId}/reactivate`,
    button,
    "Reactivating..."
  );

}


/* ========================================
   REMOVE ADMIN ROLE
======================================== */

async function removeAdminPrivileges(
  adminId,
  button
) {

  const confirmed =
    window.confirm(
      "Remove admin privileges from this user?"
    );


  if (!confirmed) {

    return;

  }


  await runAdminAction(
    `${API_BASE_URL}/admins/${adminId}/remove-role`,
    button,
    "Removing..."
  );

}


/* ========================================
   RUN ADMIN ACTION
======================================== */

async function runAdminAction(
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


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to complete action."
      );

    }


    alert(
      data.message ||
      "Action completed successfully."
    );


    await loadAdmins();


  } catch (error) {

    console.error(
      "Admin action error:",
      error
    );


    alert(
      error.message ||
      "Unable to complete action."
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

refreshAdminsButton.addEventListener(
  "click",
  async () => {

    refreshAdminsButton.disabled =
      true;


    refreshAdminsButton.textContent =
      "Refreshing...";


    await loadAdmins();


    refreshAdminsButton.disabled =
      false;


    refreshAdminsButton.textContent =
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
   OPEN INVITE MODAL
======================================== */

openInviteAdminButton.addEventListener(
  "click",
  () => {

    inviteAdminForm.reset();


    inviteAdminMessage.className =
      "invite-admin-message";


    inviteAdminMessage.textContent =
      "";


    inviteResult.classList.remove(
      "active"
    );


    generatedInviteLink.value =
      "";


    inviteAdminModal.classList.add(
      "active"
    );


    inviteAdminName.focus();

  }
);


/* ========================================
   CLOSE INVITE MODAL
======================================== */

closeInviteAdminButton.addEventListener(
  "click",
  closeInviteAdminModal
);


inviteAdminModal.addEventListener(
  "click",
  (event) => {

    if (
      event.target ===
      inviteAdminModal
    ) {

      closeInviteAdminModal();

    }

  }
);


function closeInviteAdminModal() {

  inviteAdminModal.classList.remove(
    "active"
  );

}


/* ========================================
   CREATE ADMIN INVITATION
======================================== */

inviteAdminForm.addEventListener(
  "submit",
  createAdminInvitation
);


async function createAdminInvitation(
  event
) {

  event.preventDefault();


  const token =
    getToken();


  if (!token) {

    return;

  }


  const fullName =
    inviteAdminName.value.trim();


  const email =
    inviteAdminEmail
      .value
      .trim()
      .toLowerCase();


  if (
    !fullName ||
    !email
  ) {

    showInviteError(
      "Full name and email are required."
    );

    return;

  }


  try {

    createInviteButton.disabled =
      true;


    createInviteButton.textContent =
      "Creating...";


    inviteAdminMessage.className =
      "invite-admin-message";


    inviteAdminMessage.textContent =
      "";


    const response =
      await fetch(
        `${API_BASE_URL}/admins/invitations`,
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
              fullName,
              email,
            }),
        }
      );


    const data =
      await response.json();


    console.log(
      "Admin invite response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to create invitation."
      );

    }


    generatedInviteLink.value =
      data.invitation
        .invitationLink;


    inviteResult.classList.add(
      "active"
    );


    const expiresAt =
      new Date(
        data.invitation.expiresAt
      );


    inviteExpiryText.textContent =
      `Expires at ${expiresAt.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}.`;


  } catch (error) {

    console.error(
      "Create admin invitation error:",
      error
    );


    showInviteError(
      error.message ||
      "Unable to create invitation."
    );


  } finally {

    createInviteButton.disabled =
      false;


    createInviteButton.textContent =
      "Create invitation";

  }

}


/* ========================================
   INVITE ERROR
======================================== */

function showInviteError(
  message
) {

  inviteAdminMessage.textContent =
    message;


  inviteAdminMessage.className =
    "invite-admin-message error";

}


/* ========================================
   COPY INVITE LINK
======================================== */

copyInviteLinkButton.addEventListener(
  "click",
  async () => {

    const link =
      generatedInviteLink.value;


    if (!link) {

      return;

    }


    try {

      await navigator.clipboard.writeText(
        link
      );


      copyInviteLinkButton.textContent =
        "Copied";


      setTimeout(
        () => {

          copyInviteLinkButton.textContent =
            "Copy";

        },
        1500
      );


    } catch (error) {

      generatedInviteLink.select();


      document.execCommand(
        "copy"
      );


      copyInviteLinkButton.textContent =
        "Copied";

    }

  }
);



/* ========================================
   ESCAPE HTML
======================================== */

function escapeAdminHTML(
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