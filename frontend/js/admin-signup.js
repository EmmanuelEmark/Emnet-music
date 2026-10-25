const params =
  new URLSearchParams(
    window.location.search
  );


const inviteToken =
  params.get("token");


const inviteChecking =
  document.getElementById(
    "inviteChecking"
  );


const inviteInvalid =
  document.getElementById(
    "inviteInvalid"
  );


const adminSignupContent =
  document.getElementById(
    "adminSignupContent"
  );


const invitedName =
  document.getElementById(
    "invitedName"
  );


const invitedEmail =
  document.getElementById(
    "invitedEmail"
  );


const inviteCountdown =
  document.getElementById(
    "inviteCountdown"
  );


const adminSignupForm =
  document.getElementById(
    "adminSignupForm"
  );


const adminDateOfBirth =
  document.getElementById(
    "adminDateOfBirth"
  );


const adminPassword =
  document.getElementById(
    "adminPassword"
  );


const adminConfirmPassword =
  document.getElementById(
    "adminConfirmPassword"
  );


const signupMessage =
  document.getElementById(
    "signupMessage"
  );


const adminSignupButton =
  document.getElementById(
    "adminSignupButton"
  );


let invitationExpiresAt = null;

let countdownInterval = null;


verifyInvitation();


async function verifyInvitation() {

  if (!inviteToken) {

    showInvalidInvitation(
      "Invitation token is missing."
    );

    return;

  }


  try {

    const response =
      await fetch(
        `${API_BASE_URL}/auth/admin-invite/${encodeURIComponent(
          inviteToken
        )}`
      );


    const data =
      await response.json();


    console.log(
      "Invite verification:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "This invitation is invalid."
      );

    }


    invitedName.textContent =
      data.invitation.fullName;


    invitedEmail.textContent =
      data.invitation.email;


    invitationExpiresAt =
      new Date(
        data.invitation.expiresAt
      );


    inviteChecking.style.display =
      "none";


    adminSignupContent.classList.add(
      "active"
    );


    startCountdown();


  } catch (error) {

    showInvalidInvitation(
      error.message
    );

  }

}


/* ========================================
   COUNTDOWN
======================================== */

function startCountdown() {

  updateCountdown();


  countdownInterval =
    setInterval(
      updateCountdown,
      1000
    );

}


function updateCountdown() {

  if (!invitationExpiresAt) {

    return;

  }


  const remaining =
    invitationExpiresAt.getTime() -
    Date.now();


  if (remaining <= 0) {

    clearInterval(
      countdownInterval
    );


    inviteCountdown.textContent =
      "Expired";


    adminSignupContent.classList.remove(
      "active"
    );


    showInvalidInvitation(
      "This invitation link has expired."
    );


    return;

  }


  const totalSeconds =
    Math.floor(
      remaining / 1000
    );


  const minutes =
    Math.floor(
      totalSeconds / 60
    );


  const seconds =
    String(
      totalSeconds % 60
    ).padStart(
      2,
      "0"
    );


  inviteCountdown.textContent =
    `${minutes}:${seconds}`;

}


/* ========================================
   CREATE ADMIN ACCOUNT
======================================== */

adminSignupForm.addEventListener(
  "submit",
  createAdminAccount
);


async function createAdminAccount(
  event
) {

  event.preventDefault();


  const dateOfBirth =
    adminDateOfBirth.value;


  const password =
    adminPassword.value;


  const confirmPassword =
    adminConfirmPassword.value;


  if (
    !dateOfBirth ||
    !password ||
    !confirmPassword
  ) {

    showSignupMessage(
      "Please complete all fields.",
      "error"
    );

    return;

  }


  if (password.length < 8) {

    showSignupMessage(
      "Password must be at least 8 characters.",
      "error"
    );

    return;

  }


  if (
    password !==
    confirmPassword
  ) {

    showSignupMessage(
      "Passwords do not match.",
      "error"
    );

    return;

  }


  try {

    adminSignupButton.disabled =
      true;


    adminSignupButton.textContent =
      "Creating account...";


    const response =
      await fetch(
        `${API_BASE_URL}/auth/admin-invite/${encodeURIComponent(
          inviteToken
        )}/accept`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              password,
              dateOfBirth,
            }),
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to create admin account."
      );

    }


    localStorage.setItem(
      "emnetToken",
      data.token
    );


    localStorage.setItem(
      "emnetUser",
      JSON.stringify(
        data.user
      )
    );


    showSignupMessage(
      "Admin account created successfully.",
      "success"
    );


    clearInterval(
      countdownInterval
    );


    setTimeout(
      () => {

        window.location.href =
          "admin-dashboard.html";

      },
      900
    );


  } catch (error) {

    console.error(
      "Admin signup error:",
      error
    );


    showSignupMessage(
      error.message ||
      "Unable to create admin account.",
      "error"
    );


  } finally {

    adminSignupButton.disabled =
      false;


    adminSignupButton.textContent =
      "Create admin account";

  }

}


/* ========================================
   MESSAGES
======================================== */

function showSignupMessage(
  message,
  type
) {

  signupMessage.textContent =
    message;


  signupMessage.className =
    `signup-message ${type}`;

}


function showInvalidInvitation(
  message
) {

  inviteChecking.style.display =
    "none";


  adminSignupContent.classList.remove(
    "active"
  );


  inviteInvalid.style.display =
    "block";


  inviteInvalid.textContent =
    message;

}