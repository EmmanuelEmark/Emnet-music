if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


/* ========================================
   ELEMENTS
======================================== */

const profileLoading =
  document.getElementById(
    "profileLoading"
  );


const profileError =
  document.getElementById(
    "profileError"
  );


const profileContent =
  document.getElementById(
    "profileContent"
  );


const profileAvatar =
  document.getElementById(
    "profileAvatar"
  );


const profileAvatarPlaceholder =
  document.getElementById(
    "profileAvatarPlaceholder"
  );


const profileName =
  document.getElementById(
    "profileName"
  );


const profileEmail =
  document.getElementById(
    "profileEmail"
  );


const profileRole =
  document.getElementById(
    "profileRole"
  );


const verificationBadge =
  document.getElementById(
    "verificationBadge"
  );


const profileForm =
  document.getElementById(
    "profileForm"
  );


const fullName =
  document.getElementById(
    "fullName"
  );


const profileEmailField =
  document.getElementById(
    "profileEmailField"
  );


const dateOfBirth =
  document.getElementById(
    "dateOfBirth"
  );


const profileImage =
  document.getElementById(
    "profileImage"
  );


const profileFormMessage =
  document.getElementById(
    "profileFormMessage"
  );


const saveProfileButton =
  document.getElementById(
    "saveProfileButton"
  );


const passwordForm =
  document.getElementById(
    "passwordForm"
  );


const currentPassword =
  document.getElementById(
    "currentPassword"
  );


const newPassword =
  document.getElementById(
    "newPassword"
  );


const confirmNewPassword =
  document.getElementById(
    "confirmNewPassword"
  );


const passwordFormMessage =
  document.getElementById(
    "passwordFormMessage"
  );


const changePasswordButton =
  document.getElementById(
    "changePasswordButton"
  );


const logoutButton =
  document.getElementById(
    "logoutButton"
  );


const profileLogoutButton =
  document.getElementById(
    "profileLogoutButton"
  );


/* ========================================
   STATE
======================================== */

let currentUserAccount = null;


/* ========================================
   START PAGE
======================================== */

startProfilePage();


async function startProfilePage() {

  await loadPlayerComponent();

  await loadAccount();

}


/* ========================================
   LOAD ACCOUNT
======================================== */

async function loadAccount() {

  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  try {

    const response =
      await fetch(
        `${API_BASE_URL}/account/me`,
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
      "Account response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load account."
      );

    }


    currentUserAccount =
      data.user;


    renderAccount();


    profileLoading.style.display =
      "none";


    profileError.style.display =
      "none";


    profileContent.classList.add(
      "active"
    );


  } catch (error) {

    console.error(
      "Account loading error:",
      error
    );


    showProfileError(
      error.message ||
      "Unable to load your account."
    );

  }

}


/* ========================================
   RENDER ACCOUNT
======================================== */

function renderAccount() {

  if (!currentUserAccount) {

    return;

  }


  const user =
    currentUserAccount;


  const name =
    user.fullName ||
    "EmnetMusic User";


  profileName.textContent =
    name;


  profileEmail.textContent =
    user.email || "";


  profileRole.textContent =
    formatRole(
      user.role
    );


  fullName.value =
    user.fullName || "";


  profileEmailField.value =
    user.email || "";


  profileImage.value =
    user.profileImage || "";


  if (user.dateOfBirth) {

    dateOfBirth.value =
      formatDateForInput(
        user.dateOfBirth
      );

  } else {

    dateOfBirth.value =
      "";

  }


  renderProfileImage(
    user.profileImage,
    name
  );


  renderVerification(
    user.emailVerified
  );

}


/* ========================================
   PROFILE IMAGE
======================================== */

function renderProfileImage(
  imageUrl,
  name
) {

  const firstLetter =
    name
      ? name.charAt(0)
          .toUpperCase()
      : "E";


  profileAvatarPlaceholder.textContent =
    firstLetter;


  if (!imageUrl) {

    profileAvatar.style.display =
      "none";


    profileAvatarPlaceholder.style.display =
      "grid";


    return;

  }


  profileAvatar.src =
    imageUrl;


  profileAvatar.style.display =
    "block";


  profileAvatarPlaceholder.style.display =
    "none";


  profileAvatar.onerror =
    () => {

      profileAvatar.style.display =
        "none";


      profileAvatarPlaceholder.style.display =
        "grid";

    };

}


/* ========================================
   EMAIL VERIFICATION
======================================== */

function renderVerification(
  emailVerified
) {

  verificationBadge.classList.remove(
    "verified"
  );


  if (emailVerified) {

    verificationBadge.textContent =
      "✓ Email verified";


    verificationBadge.classList.add(
      "verified"
    );


  } else {

    verificationBadge.textContent =
      "Email not verified";

  }

}


/* ========================================
   UPDATE PROFILE
======================================== */

profileForm.addEventListener(
  "submit",
  updateProfile
);


async function updateProfile(
  event
) {

  event.preventDefault();


  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  const newFullName =
    fullName.value.trim();


  if (!newFullName) {

    showProfileMessage(
      profileFormMessage,
      "Full name cannot be empty.",
      "error"
    );

    return;

  }


  try {

    saveProfileButton.disabled =
      true;


    saveProfileButton.textContent =
      "Saving...";


    clearProfileMessage(
      profileFormMessage
    );


    const response =
      await fetch(
        `${API_BASE_URL}/account/profile`,
        {
          method: "PATCH",

          headers: {

            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,

          },

          body:
            JSON.stringify({
              fullName:
                newFullName,

              dateOfBirth:
                dateOfBirth.value ||
                "",

              profileImage:
                profileImage.value.trim(),
            }),
        }
      );


    const data =
      await response.json();


    console.log(
      "Profile update:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to update profile."
      );

    }


    currentUserAccount = {
      ...currentUserAccount,
      ...data.user,
    };


    renderAccount();


    updateStoredUser(
      data.user
    );


    showProfileMessage(
      profileFormMessage,
      data.message ||
      "Profile updated successfully.",
      "success"
    );


  } catch (error) {

    console.error(
      "Profile update error:",
      error
    );


    showProfileMessage(
      profileFormMessage,
      error.message ||
      "Unable to update profile.",
      "error"
    );


  } finally {

    saveProfileButton.disabled =
      false;


    saveProfileButton.textContent =
      "Save profile";

  }

}


/* ========================================
   CHANGE PASSWORD
======================================== */

passwordForm.addEventListener(
  "submit",
  changePassword
);


async function changePassword(
  event
) {

  event.preventDefault();


  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  const oldPassword =
    currentPassword.value;


  const password =
    newPassword.value;


  const confirmation =
    confirmNewPassword.value;


  if (
    !oldPassword ||
    !password ||
    !confirmation
  ) {

    showProfileMessage(
      passwordFormMessage,
      "Please complete all password fields.",
      "error"
    );

    return;

  }


  if (password.length < 8) {

    showProfileMessage(
      passwordFormMessage,
      "New password must be at least 8 characters.",
      "error"
    );

    return;

  }


  if (
    password !==
    confirmation
  ) {

    showProfileMessage(
      passwordFormMessage,
      "New passwords do not match.",
      "error"
    );

    return;

  }


  try {

    changePasswordButton.disabled =
      true;


    changePasswordButton.textContent =
      "Changing...";


    clearProfileMessage(
      passwordFormMessage
    );


    const response =
      await fetch(
        `${API_BASE_URL}/account/password`,
        {
          method: "PATCH",

          headers: {

            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,

          },

          body:
            JSON.stringify({
              currentPassword:
                oldPassword,

              newPassword:
                password,
            }),
        }
      );


    const data =
      await response.json();


    console.log(
      "Password response:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to change password."
      );

    }


    passwordForm.reset();


    showProfileMessage(
      passwordFormMessage,
      data.message ||
      "Password changed successfully.",
      "success"
    );


  } catch (error) {

    console.error(
      "Password change error:",
      error
    );


    showProfileMessage(
      passwordFormMessage,
      error.message ||
      "Unable to change password.",
      "error"
    );


  } finally {

    changePasswordButton.disabled =
      false;


    changePasswordButton.textContent =
      "Change password";

  }

}


/* ========================================
   LOCAL STORAGE USER
======================================== */

function updateStoredUser(
  updatedUser
) {

  try {

    const storedUser =
      getStoredUser();


    const combinedUser = {
      ...(storedUser || {}),
      ...(updatedUser || {}),
    };


    localStorage.setItem(
      "emnetUser",
      JSON.stringify(
        combinedUser
      )
    );


  } catch (error) {

    console.error(
      "Unable to update stored user:",
      error
    );

  }

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


if (profileLogoutButton) {

  profileLogoutButton.addEventListener(
    "click",
    logout
  );

}


/* ========================================
   DATE
======================================== */

function formatDateForInput(
  dateValue
) {

  const date =
    new Date(
      dateValue
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "";

  }


  const year =
    date.getFullYear();


  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );


  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );


  return `${year}-${month}-${day}`;

}


/* ========================================
   ROLE
======================================== */

function formatRole(
  role
) {

  if (!role) {

    return "Listener";

  }


  return String(role)
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );

}


/* ========================================
   FORM MESSAGE
======================================== */

function showProfileMessage(
  element,
  message,
  type
) {

  if (!element) {

    return;

  }


  element.textContent =
    message;


  element.className =
    `profile-form-message ${type}`;

}


function clearProfileMessage(
  element
) {

  if (!element) {

    return;

  }


  element.textContent =
    "";


  element.className =
    "profile-form-message";

}


/* ========================================
   PAGE ERROR
======================================== */

function showProfileError(
  message
) {

  profileLoading.style.display =
    "none";


  profileContent.classList.remove(
    "active"
  );


  profileError.style.display =
    "block";


  profileError.textContent =
    message;

}