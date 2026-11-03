const params = new URLSearchParams(
  window.location.search
);

const token = params.get("token");

// Remove the token from the visible address.
window.history.replaceState(
  {},
  "",
  window.location.pathname
);

const button = document.getElementById(
  "unsubscribeButton"
);

const message = document.getElementById(
  "message"
);

if (!token) {
  button.disabled = true;

  message.textContent =
    "This unsubscribe link is invalid.";
}

button.addEventListener("click", async () => {
  button.disabled = true;
  button.textContent = "Processing...";

  try {
    const response = await fetch(
      `${API_BASE_URL}/account/email-preferences/unsubscribe`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({ token }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message || "Unsubscribe failed."
      );
    }

    message.textContent =
      "You have successfully unsubscribed.";

    button.textContent = "Unsubscribed";

  } catch (error) {
    message.textContent =
      error.message || "Please try again.";

    button.disabled = false;
    button.textContent = "Confirm unsubscribe";
  }
});