const registerForm = document.getElementById("registerForm");

const fullNameInput = document.getElementById("fullName");
const emailInput = document.getElementById("email");
const dateOfBirthInput = document.getElementById("dateOfBirth");
const passwordInput = document.getElementById("password");

const formMessage = document.getElementById("formMessage");
const registerButton = document.getElementById("registerButton");

const passwordToggle = document.getElementById("passwordToggle");


passwordToggle.addEventListener("click", () => {

  const isPassword =
    passwordInput.type === "password";

  passwordInput.type =
    isPassword ? "text" : "password";

  passwordToggle.textContent =
    isPassword ? "Hide" : "Show";
});


registerForm.addEventListener("submit", async (event) => {

  event.preventDefault();

  formMessage.textContent = "";
  formMessage.className = "form-message";

  const fullName = fullNameInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const dateOfBirth = dateOfBirthInput.value;
  const password = passwordInput.value;


  if (!fullName || !email || !dateOfBirth || !password) {

    showMessage(
      "Please complete all fields.",
      "error"
    );

    return;
  }


  if (password.length < 6) {

    showMessage(
      "Password must be at least 6 characters.",
      "error"
    );

    return;
  }


  registerButton.disabled = true;
  registerButton.textContent = "Creating account...";


  try {

    const response = await fetch(
      `${API_BASE_URL}/auth/register`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          fullName,
          email,
          dateOfBirth,
          password,
        }),
      }
    );


    const data = await response.json();


    if (!response.ok) {

      showMessage(
        data.message || "Registration failed.",
        "error"
      );

      return;
    }


    showMessage(
      "Account created successfully. Redirecting to sign in...",
      "success"
    );


    registerForm.reset();


    setTimeout(() => {

      window.location.href = "login.html";

    }, 1200);


  } catch (error) {

    console.error(error);

    showMessage(
      "Unable to connect to EmnetMusic. Make sure the backend is running.",
      "error"
    );

  } finally {

    registerButton.disabled = false;
    registerButton.textContent = "Create account";

  }

});


function showMessage(message, type) {

  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`;

}