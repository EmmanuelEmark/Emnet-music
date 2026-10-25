/* ========================================
   AUTH
======================================== */

if (!protectPage()) {
  throw new Error(
    "Authentication required."
  );
}


const adminUser =
  getStoredUser();


if (
  !adminUser ||
  ![
    "admin",
    "superadmin",
  ].includes(
    adminUser.role
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

const usersLoading =
  document.getElementById(
    "usersLoading"
  );

const usersError =
  document.getElementById(
    "usersError"
  );

const usersEmpty =
  document.getElementById(
    "usersEmpty"
  );

const usersList =
  document.getElementById(
    "usersList"
  );

const totalUsersCount =
  document.getElementById(
    "totalUsersCount"
  );

const activeUsersCount =
  document.getElementById(
    "activeUsersCount"
  );

const suspendedUsersCount =
  document.getElementById(
    "suspendedUsersCount"
  );

const userSearchInput =
  document.getElementById(
    "userSearchInput"
  );

const roleFilter =
  document.getElementById(
    "roleFilter"
  );

const statusFilter =
  document.getElementById(
    "statusFilter"
  );

const refreshUsersButton =
  document.getElementById(
    "refreshUsersButton"
  );

const adminLogoutButton =
  document.getElementById(
    "adminLogoutButton"
  );

const manageAdminsLink =
  document.getElementById(
    "manageAdminsLink"
  );

const dashboardLink =
  document.getElementById(
    "dashboardLink"
  );

const adminRoleLabel =
  document.getElementById(
    "adminRoleLabel"
  );


/* ========================================
   ROLE-SPECIFIC SIDEBAR
======================================== */

if (
  adminUser.role ===
  "superadmin"
) {

  dashboardLink.href =
    "admin.html";

  adminRoleLabel.textContent =
    "Superadmin";

} else {

  manageAdminsLink.style.display =
    "none";

  dashboardLink.href =
    "admin-dashboard.html";

  adminRoleLabel.textContent =
    "Admin";

}


/* ========================================
   STATE
======================================== */

let allUsers = [];


/* ========================================
   START
======================================== */

loadUsers();


/* ========================================
   LOAD USERS
======================================== */

async function loadUsers() {

  const token =
    getToken();


  if (!token) {
    return;
  }


  try {

    usersLoading.style.display =
      "block";

    usersError.style.display =
      "none";

    usersEmpty.style.display =
      "none";

    usersList.innerHTML =
      "";


    const response =
      await fetch(
        `${API_BASE_URL}/admins/users`,
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
      "Platform users:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load users."
      );

    }


    allUsers =
      Array.isArray(
        data.users
      )
        ? data.users
        : [];


    usersLoading.style.display =
      "none";


    updateUserSummary();

    renderUsers();

  } catch (error) {

    console.error(
      "Load users error:",
      error
    );


    usersLoading.style.display =
      "none";


    usersError.style.display =
      "block";


    usersError.textContent =
      error.message ||
      "Unable to load users.";

  }

}


/* ========================================
   SUMMARY
======================================== */

function updateUserSummary() {

  totalUsersCount.textContent =
    allUsers.length;


  activeUsersCount.textContent =
    allUsers.filter(
      (user) =>
        user.accountStatus ===
        "active"
    ).length;


  suspendedUsersCount.textContent =
    allUsers.filter(
      (user) =>
        user.accountStatus ===
        "suspended"
    ).length;

}


/* ========================================
   FILTER
======================================== */

function getFilteredUsers() {

  const search =
    userSearchInput
      .value
      .trim()
      .toLowerCase();


  const selectedRole =
    roleFilter.value;


  const selectedStatus =
    statusFilter.value;


  return allUsers.filter(
    (user) => {

      const name =
        String(
          user.fullName || ""
        ).toLowerCase();


      const email =
        String(
          user.email || ""
        ).toLowerCase();


      const matchesSearch =
        !search ||
        name.includes(search) ||
        email.includes(search);


      const matchesRole =
        selectedRole ===
          "all" ||
        user.role ===
          selectedRole;


      const matchesStatus =
        selectedStatus ===
          "all" ||
        user.accountStatus ===
          selectedStatus;


      return (
        matchesSearch &&
        matchesRole &&
        matchesStatus
      );

    }
  );

}


/* ========================================
   RENDER
======================================== */

function renderUsers() {

  usersList.innerHTML =
    "";


  const users =
    getFilteredUsers();


  if (
    users.length === 0
  ) {

    usersEmpty.style.display =
      "block";

    return;

  }


  usersEmpty.style.display =
    "none";


  users.forEach(
    (user) => {

      const name =
        user.fullName ||
        "Unnamed User";


      const email =
        user.email ||
        "No email";


      const role =
        user.role ||
        "listener";


      const status =
        user.accountStatus ||
        "active";


      const card =
        document.createElement(
          "article"
        );


      card.className =
        "user-card";


      card.innerHTML = `

        <div class="user-avatar">
          ${escapeUsersHTML(
            name
              .charAt(0)
              .toUpperCase()
          )}
        </div>


        <div class="user-main">

          <strong>
            ${escapeUsersHTML(
              name
            )}
          </strong>

          <small>
            ${escapeUsersHTML(
              email
            )}
          </small>

        </div>


        <div class="user-role">
          ${escapeUsersHTML(
            role
          )}
        </div>


        <span
          class="user-status ${escapeUsersHTML(
            status
          )}"
        >
          ${escapeUsersHTML(
            status
          )}
        </span>


        ${buildUserAction(
          user
        )}
      `;


      usersList.appendChild(
        card
      );

    }
  );


  connectUserActions();

}


/* ========================================
   ACTION BUTTON
======================================== */

function buildUserAction(
  user
) {

  if (
    user.accountStatus ===
    "suspended"
  ) {

    return `
      <button
        type="button"
        class="user-action-button reactivate"
        data-action="reactivate"
        data-id="${user._id}"
      >
        Reactivate
      </button>
    `;

  }


  if (
    user.accountStatus ===
    "active"
  ) {

    return `
      <button
        type="button"
        class="user-action-button suspend"
        data-action="suspend"
        data-id="${user._id}"
      >
        Suspend
      </button>
    `;

  }


  return `
    <span></span>
  `;

}


/* ========================================
   CONNECT ACTIONS
======================================== */

function connectUserActions() {

  const buttons =
    usersList.querySelectorAll(
      ".user-action-button"
    );


  buttons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        async () => {

          const userId =
            button.dataset.id;


          const action =
            button.dataset.action;


          if (
            action === "suspend"
          ) {

            await suspendPlatformUser(
              userId,
              button
            );

          }


          if (
            action === "reactivate"
          ) {

            await reactivatePlatformUser(
              userId,
              button
            );

          }

        }
      );

    }
  );

}


/* ========================================
   SUSPEND
======================================== */

async function suspendPlatformUser(
  userId,
  button
) {

  const confirmed =
    window.confirm(
      "Suspend this user account? They will no longer be able to log in while suspended."
    );


  if (!confirmed) {
    return;
  }


  await runUserAction(
    userId,
    "suspend",
    button,
    "Suspending..."
  );

}


/* ========================================
   REACTIVATE
======================================== */

async function reactivatePlatformUser(
  userId,
  button
) {

  const confirmed =
    window.confirm(
      "Reactivate this user account?"
    );


  if (!confirmed) {
    return;
  }


  await runUserAction(
    userId,
    "reactivate",
    button,
    "Reactivating..."
  );

}


/* ========================================
   REQUEST
======================================== */

async function runUserAction(
  userId,
  action,
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
        `${API_BASE_URL}/admins/users/${userId}/${action}`,
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
        "Unable to update user."
      );

    }


    alert(
      data.message ||
      "User updated successfully."
    );


    await loadUsers();

  } catch (error) {

    console.error(
      "User action error:",
      error
    );


    alert(
      error.message ||
      "Unable to update user."
    );


    button.disabled =
      false;


    button.textContent =
      originalText;

  }

}


/* ========================================
   FILTER EVENTS
======================================== */

userSearchInput.addEventListener(
  "input",
  renderUsers
);


roleFilter.addEventListener(
  "change",
  renderUsers
);


statusFilter.addEventListener(
  "change",
  renderUsers
);


/* ========================================
   REFRESH
======================================== */

refreshUsersButton.addEventListener(
  "click",
  async () => {

    refreshUsersButton.disabled =
      true;


    refreshUsersButton.textContent =
      "Refreshing...";


    await loadUsers();


    refreshUsersButton.disabled =
      false;


    refreshUsersButton.textContent =
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

function escapeUsersHTML(
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