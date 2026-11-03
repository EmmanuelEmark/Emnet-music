
/* ==========================================================
   EMNET MUSIC — PROFILE & ACCOUNT
   Profile Details, Email Preferences, Password and Logout
========================================================== */

/* ==========================================================
   1. AUTHENTICATION
========================================================== */

const profilePageAuthorized =
  typeof protectPage === "function"
    ? protectPage()
    : Boolean(
        typeof getToken === "function" &&
        getToken()
      );

/* ==========================================================
   2. PAGE ELEMENTS
========================================================== */

const profileLoading =
  document.getElementById("profileLoading");

const profileError =
  document.getElementById("profileError");

const profileContent =
  document.getElementById("profileContent");

const profileAvatar =
  document.getElementById("profileAvatar");

const profileAvatarPlaceholder =
  document.getElementById("profileAvatarPlaceholder");

const profileName =
  document.getElementById("profileName");

const profileEmail =
  document.getElementById("profileEmail");

const profileRole =
  document.getElementById("profileRole");

const verificationBadge =
  document.getElementById("verificationBadge");

const profileForm =
  document.getElementById("profileForm");

const fullName =
  document.getElementById("fullName");

const profileEmailField =
  document.getElementById("profileEmailField");

const dateOfBirth =
  document.getElementById("dateOfBirth");

const profileImage =
  document.getElementById("profileImage");

const profileFormMessage =
  document.getElementById("profileFormMessage");

const saveProfileButton =
  document.getElementById("saveProfileButton");

const passwordForm =
  document.getElementById("passwordForm");

const currentPassword =
  document.getElementById("currentPassword");

const newPassword =
  document.getElementById("newPassword");

const confirmNewPassword =
  document.getElementById("confirmNewPassword");

const passwordFormMessage =
  document.getElementById("passwordFormMessage");

const changePasswordButton =
  document.getElementById("changePasswordButton");

const logoutButton =
  document.getElementById("logoutButton");

const profileLogoutButton =
  document.getElementById("profileLogoutButton");

/* ==========================================================
   3. EMAIL PREFERENCES ELEMENTS
========================================================== */

const emailPreferencesForm =
  document.getElementById("emailPreferencesForm");

const birthdayGreetings =
  document.getElementById("birthdayGreetings");

const monthlyGreetings =
  document.getElementById("monthlyGreetings");

const emailPreferencesMessage =
  document.getElementById("emailPreferencesMessage");

const saveEmailPreferencesButton =
  document.getElementById("saveEmailPreferencesButton");

/* ==========================================================
   4. STATE
========================================================== */

let currentUserAccount = null;

let updatingProfile = false;
let updatingPassword = false;
let updatingEmailPreferences = false;

const PROFILE_BUTTON_TEXT =
  saveProfileButton?.textContent?.trim() ||
  "Save profile";

const PASSWORD_BUTTON_TEXT =
  changePasswordButton?.textContent?.trim() ||
  "Change password";

const EMAIL_BUTTON_TEXT =
  saveEmailPreferencesButton?.textContent?.trim() ||
  "Save email preferences";

/* ==========================================================
   5. START PAGE
========================================================== */

if (profilePageAuthorized) {
  startProfilePage();
}

async function startProfilePage() {
  setupProfileEvents();

  if (typeof loadPlayerComponent === "function") {
    try {
      await loadPlayerComponent();
    } catch (error) {
      console.warn(
        "Music player component unavailable:",
        error
      );
    }
  }

  await loadAccount();
}

/* ==========================================================
   6. AUTHENTICATION HELPERS
========================================================== */

function getProfileToken() {
  if (typeof getToken === "function") {
    return getToken();
  }

  return null;
}

function redirectProfileLogin() {
  window.location.href =
    `login.html?redirect=${encodeURIComponent(
      window.location.pathname +
      window.location.search
    )}`;
}

function handleProfileAuthentication(response) {
  if (response.status === 401) {
    redirectProfileLogin();
    return false;
  }

  return true;
}

/* ==========================================================
   7. AUTHENTICATED ACCOUNT REQUEST
========================================================== */

async function profileRequest(
  endpoint,
  options = {}
) {
  const token = getProfileToken();

  if (!token) {
    redirectProfileLogin();

    throw new Error(
      "Authentication required."
    );
  }

  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      ...options,

      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!handleProfileAuthentication(response)) {
    throw new Error(
      "Your session has expired."
    );
  }

  const responseText = await response.text();

  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        "Unexpected server response."
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      `Request failed (${response.status}).`
    );
  }

  return data;
}

/* ==========================================================
   8. LOAD ACCOUNT
========================================================== */

async function loadAccount() {
  try {
    const data = await profileRequest(
      "/account/me"
    );

    if (
      !data.user ||
      typeof data.user !== "object"
    ) {
      throw new Error(
        "Account information was not returned."
      );
    }

    currentUserAccount = data.user;

    renderAccount();

    if (profileLoading) {
      profileLoading.style.display = "none";
    }

    if (profileError) {
      profileError.style.display = "none";
    }

    if (profileContent) {
      profileContent.classList.add(
        "active"
      );
    }

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

/* ==========================================================
   9. RENDER ACCOUNT
========================================================== */

function renderAccount() {
  if (!currentUserAccount) {
    return;
  }

  const user = currentUserAccount;

  const name =
    user.fullName || "EmnetMusic User";

  if (profileName) {
    profileName.textContent = name;
  }

  if (profileEmail) {
    profileEmail.textContent =
      user.email || "";
  }

  if (profileRole) {
    profileRole.textContent =
      formatRole(user.role);
  }

  if (fullName) {
    fullName.value =
      user.fullName || "";
  }

  if (profileEmailField) {
    profileEmailField.value =
      user.email || "";
  }

  if (dateOfBirth) {
    dateOfBirth.value =
      formatDateForInput(
        user.dateOfBirth
      );
  }

  if (profileImage) {
    profileImage.value =
      user.profileImage || "";
  }

  renderProfileImage(
    user.profileImage,
    name
  );

  renderVerification(
    user.emailVerified
  );

  renderEmailPreferences(
    user.emailPreferences
  );
}

/* ==========================================================
   10. PROFILE IMAGE
========================================================== */

function renderProfileImage(imageUrl, name) {
  if (
    !profileAvatar ||
    !profileAvatarPlaceholder
  ) {
    return;
  }

  const firstLetter =
    name
      ? name.trim().charAt(0).toUpperCase()
      : "E";

  profileAvatarPlaceholder.textContent =
    firstLetter || "E";

  const safeUrl =
    safeProfileImageUrl(imageUrl);

  if (!safeUrl) {
    profileAvatar.style.display = "none";

    profileAvatarPlaceholder.style.display =
      "grid";

    profileAvatar.removeAttribute("src");

    return;
  }

  profileAvatar.onerror = () => {
    profileAvatar.style.display = "none";

    profileAvatarPlaceholder.style.display =
      "grid";
  };

  profileAvatar.onload = () => {
    profileAvatar.style.display = "block";

    profileAvatarPlaceholder.style.display =
      "none";
  };

  profileAvatar.src = safeUrl;
}

function safeProfileImageUrl(url) {
  if (
    typeof url !== "string" ||
    !url.trim()
  ) {
    return null;
  }

  try {
    const parsed = new URL(
      url,
      window.location.href
    );

    if (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:"
    ) {
      return parsed.href;
    }

  } catch {
    // Invalid URL.
  }

  return null;
}

/* ==========================================================
   11. EMAIL VERIFICATION STATUS
========================================================== */

function renderVerification(emailVerified) {
  if (!verificationBadge) {
    return;
  }

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

/* ==========================================================
   12. EMAIL PREFERENCES
========================================================== */

function renderEmailPreferences(preferences) {
  const saved =
    preferences &&
    typeof preferences === "object"
      ? preferences
      : {};

  if (birthdayGreetings) {
    birthdayGreetings.checked =
      saved.birthdayGreetings !== false;
  }

  if (monthlyGreetings) {
    monthlyGreetings.checked =
      saved.monthlyGreetings === true;
  }
}

/* ==========================================================
   13. SET UP FORM EVENTS
========================================================== */

function setupProfileEvents() {
  if (profileForm) {
    profileForm.addEventListener(
      "submit",
      updateProfile
    );
  }

  if (passwordForm) {
    passwordForm.addEventListener(
      "submit",
      changePassword
    );
  }

  if (emailPreferencesForm) {
    emailPreferencesForm.addEventListener(
      "submit",
      updateEmailPreferences
    );
  }

  if (
    logoutButton &&
    typeof logout === "function"
  ) {
    logoutButton.addEventListener(
      "click",
      logout
    );
  }

  if (
    profileLogoutButton &&
    typeof logout === "function"
  ) {
    profileLogoutButton.addEventListener(
      "click",
      logout
    );
  }
}

/* ==========================================================
   14. UPDATE PROFILE
========================================================== */

async function updateProfile(event) {
  event.preventDefault();

  if (updatingProfile) {
    return;
  }

  const newFullName =
    fullName?.value.trim() || "";

  if (!newFullName) {
    showProfileMessage(
      profileFormMessage,
      "Full name cannot be empty.",
      "error"
    );

    return;
  }

  updatingProfile = true;

  setProfileButtonLoading(
    saveProfileButton,
    true,
    "Saving...",
    PROFILE_BUTTON_TEXT
  );

  clearProfileMessage(
    profileFormMessage
  );

  try {
    const changes = {
      fullName: newFullName,

      dateOfBirth:
        dateOfBirth?.value || "",

      profileImage:
        profileImage?.value.trim() || ""
    };

    const data = await profileRequest(
      "/account/profile",
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify(changes)
      }
    );

    currentUserAccount = {
      ...currentUserAccount,
      ...changes,
      ...(data.user || {})
    };

    renderAccount();

    updateStoredUser(
      currentUserAccount
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
    updatingProfile = false;

    setProfileButtonLoading(
      saveProfileButton,
      false,
      "Saving...",
      PROFILE_BUTTON_TEXT
    );
  }
}

/* ==========================================================
   15. UPDATE EMAIL PREFERENCES
========================================================== */

async function updateEmailPreferences(event) {
  event.preventDefault();

  if (updatingEmailPreferences) {
    return;
  }

  updatingEmailPreferences = true;

  setProfileButtonLoading(
    saveEmailPreferencesButton,
    true,
    "Saving...",
    EMAIL_BUTTON_TEXT
  );

  if (emailPreferencesMessage) {
    emailPreferencesMessage.textContent = "";
  }

  try {
    const changes = {
      birthdayGreetings:
        Boolean(birthdayGreetings?.checked),

      monthlyGreetings:
        Boolean(monthlyGreetings?.checked)
    };

    const data = await profileRequest(
      "/account/email-preferences",
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify(changes)
      }
    );

    currentUserAccount = {
      ...currentUserAccount,

      emailPreferences:
        data.emailPreferences || changes
    };

    updateStoredUser(
      currentUserAccount
    );

    renderEmailPreferences(
      currentUserAccount.emailPreferences
    );

    showProfileMessage(
      emailPreferencesMessage,
      data.message ||
      "Email preferences saved successfully.",
      "success"
    );

  } catch (error) {
    console.error(
      "Email preferences error:",
      error
    );

    showProfileMessage(
      emailPreferencesMessage,
      error.message ||
      "Unable to save preferences.",
      "error"
    );

  } finally {
    updatingEmailPreferences = false;

    setProfileButtonLoading(
      saveEmailPreferencesButton,
      false,
      "Saving...",
      EMAIL_BUTTON_TEXT
    );
  }
}

/* ==========================================================
   16. CHANGE PASSWORD
========================================================== */

async function changePassword(event) {
  event.preventDefault();

  if (updatingPassword) {
    return;
  }

  const oldPassword =
    currentPassword?.value || "";

  const password =
    newPassword?.value || "";

  const confirmation =
    confirmNewPassword?.value || "";

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

  if (password !== confirmation) {
    showProfileMessage(
      passwordFormMessage,
      "New passwords do not match.",
      "error"
    );

    return;
  }

  updatingPassword = true;

  setProfileButtonLoading(
    changePasswordButton,
    true,
    "Changing...",
    PASSWORD_BUTTON_TEXT
  );

  clearProfileMessage(
    passwordFormMessage
  );

  try {
    const data = await profileRequest(
      "/account/password",
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          currentPassword: oldPassword,
          newPassword: password
        })
      }
    );

    if (passwordForm) {
      passwordForm.reset();
    }

    showProfileMessage(
      passwordFormMessage,
      data.message ||
      "Password changed successfully.",
      "success"
    );

  } catch (error) {
    console.error(
      "Change password error:",
      error
    );

    showProfileMessage(
      passwordFormMessage,
      error.message ||
      "Unable to change password.",
      "error"
    );

  } finally {
    updatingPassword = false;

    setProfileButtonLoading(
      changePasswordButton,
      false,
      "Changing...",
      PASSWORD_BUTTON_TEXT
    );
  }
}

/* ==========================================================
   17. UPDATE STORED USER
========================================================== */

function updateStoredUser(updatedUser) {
  try {
    const storedUser =
      typeof getStoredUser === "function"
        ? getStoredUser()
        : JSON.parse(
            localStorage.getItem("emnetUser") ||
            "null"
          );

    const combinedUser = {
      ...(storedUser || {}),
      ...(updatedUser || {})
    };

    localStorage.setItem(
      "emnetUser",
      JSON.stringify(combinedUser)
    );

  } catch (error) {
    console.error(
      "Unable to update stored user:",
      error
    );
  }
}

/* ==========================================================
   18. DATE FORMAT
========================================================== */

function formatDateForInput(dateValue) {
  if (!dateValue) {
    return "";
  }

  if (typeof dateValue === "string") {
    const match = dateValue.match(
      /^\d{4}-\d{2}-\d{2}/
    );

    if (match) {
      return match[0];
    }
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

/* ==========================================================
   19. FORMAT ROLE
========================================================== */

function formatRole(role) {
  if (!role) {
    return "Listener";
  }

  return String(role)
    .replaceAll("_", " ")
    .replace(
      /\b\w/g,
      (letter) => letter.toUpperCase()
    );
}

/* ==========================================================
   20. FORM MESSAGE HELPERS
========================================================== */

function showProfileMessage(
  element,
  message,
  type
) {
  if (!element) {
    return;
  }

  element.textContent = message;

  element.className =
    `profile-form-message ${type}`;
}

function clearProfileMessage(element) {
  if (!element) {
    return;
  }

  element.textContent = "";

  element.className =
    "profile-form-message";
}

/* ==========================================================
   21. BUTTON LOADING HELPER
========================================================== */

function setProfileButtonLoading(
  button,
  loading,
  loadingText,
  normalText
) {
  if (!button) {
    return;
  }

  button.disabled = loading;

  button.textContent =
    loading
      ? loadingText
      : normalText;
}

/* ==========================================================
   22. PAGE ERROR
========================================================== */

function showProfileError(message) {
  if (profileLoading) {
    profileLoading.style.display = "none";
  }

  if (profileContent) {
    profileContent.classList.remove(
      "active"
    );
  }

  if (profileError) {
    profileError.style.display = "block";

    profileError.textContent =
      message ||
      "Unable to load your account.";
  }
}
