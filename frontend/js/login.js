const loginForm =
  document.getElementById(
    "loginForm"
  );

const emailInput =
  document.getElementById(
    "email"
  );

const passwordInput =
  document.getElementById(
    "password"
  );

const formMessage =
  document.getElementById(
    "formMessage"
  );

const loginButton =
  document.getElementById(
    "loginButton"
  );

const passwordToggle =
  document.getElementById(
    "passwordToggle"
  );


/* ========================================
   PASSWORD SHOW / HIDE
======================================== */

if (passwordToggle) {

  passwordToggle.addEventListener(
    "click",
    () => {

      const isPassword =
        passwordInput.type ===
        "password";


      passwordInput.type =
        isPassword
          ? "text"
          : "password";


      passwordToggle.textContent =
        isPassword
          ? "Hide"
          : "Show";

    }
  );

}


/* ========================================
   LOGIN FORM
======================================== */

if (loginForm) {

  loginForm.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();


      /*
        Clear previous message.
      */

      formMessage.textContent =
        "";

      formMessage.className =
        "form-message";


      /*
        Get form values.
      */

      const email =
        emailInput
          .value
          .trim()
          .toLowerCase();


      const password =
        passwordInput.value;


      /*
        Basic validation.
      */

      if (
        !email ||
        !password
      ) {

        showMessage(
          "Please enter your email and password.",
          "error"
        );

        return;

      }


      /*
        Prevent double clicking
        while login request is running.
      */

      loginButton.disabled =
        true;

      loginButton.textContent =
        "Signing in...";


      try {

        /*
          Send login request
          to backend.
        */

        const response =
          await fetch(
            `${API_BASE_URL}/auth/login`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  email,
                  password,
                }),
            }
          );


        const data =
          await response.json();


        console.log(
          "Login response:",
          data
        );


        /*
          Login failed.
        */

        if (!response.ok) {

          showMessage(
            data.message ||
            "Unable to sign in.",
            "error"
          );

          return;

        }


        /*
          Make sure backend returned
          the required login information.
        */

        if (
          !data.token ||
          !data.user
        ) {

          showMessage(
            "Invalid login response from server.",
            "error"
          );

          return;

        }


        /* ========================================
           SAVE LOGIN SESSION
        ======================================== */

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


        console.log(
          "Logged-in user:",
          data.user
        );


        console.log(
          "Logged-in role:",
          data.user.role
        );


        showMessage(
          "Signed in successfully.",
          "success"
        );


        /* ========================================
           REDIRECT BY ROLE
        ======================================== */

        setTimeout(
          () => {

            /*
              SUPERADMIN
            */

            if (
              data.user.role ===
              "superadmin"
            ) {

              window.location.href =
                "admin.html";

              return;

            }


            /*
              NORMAL ADMIN
            */

            if (
              data.user.role ===
              "admin"
            ) {

              window.location.href =
                "admin-dashboard.html";

              return;

            }


            /*
              ARTIST
            */

            if (
              data.user.role ===
              "artist"
            ) {

              window.location.href =
                "artist-dashboard.html";

              return;

            }


            /*
              LISTENER
              DISTRIBUTOR
              OR ANY OTHER NORMAL ROLE
            */

            window.location.href =
              "home.html";

          },
          700
        );


      } catch (error) {

        console.error(
          "Login error:",
          error
        );


        showMessage(
          "Unable to connect to EmnetMusic.",
          "error"
        );


      } finally {

        /*
          Restore login button.
        */

        loginButton.disabled =
          false;

        loginButton.textContent =
          "Sign in";

      }

    }
  );

}


/* ========================================
   MESSAGE FUNCTION
======================================== */

function showMessage(
  message,
  type
) {

  if (!formMessage) {

    return;

  }


  formMessage.textContent =
    message;


  formMessage.className =
    `form-message ${type}`;

}