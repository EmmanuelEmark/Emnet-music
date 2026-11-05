
"use strict";

if (protectPage()) {
  const user = getStoredUser();

  if (!user || user.role !== "artist") {
    window.location.replace("home.html");
  } else {
    initializeArtistProfileManager();
  }
}

function initializeArtistProfileManager() {
  const form = document.getElementById("artistProfileForm");
  const loading = document.getElementById("profileLoading");
  const message = document.getElementById("profileMessage");
  const saveButton = document.getElementById("saveProfileButton");

  const fields = {
    stageName: document.getElementById("stageName"),
    bio: document.getElementById("bio"),
    country: document.getElementById("country"),
    profileImage: document.getElementById("profileImage"),
    coverImage: document.getElementById("coverImage"),
  };

  const profilePreview =
    document.getElementById("profileImagePreview");

  const coverPreview =
    document.getElementById("coverImagePreview");

  const apiUrl =
    `${API_BASE_URL.replace(/\/$/, "")}/api/artists/me`;

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
  }

  function updatePreview(input, image) {
    const url = input.value.trim();

    image.hidden = true;
    image.removeAttribute("src");

    if (!url || !/^https:\/\/\S+$/i.test(url)) {
      return;
    }

    image.src = url;
  }

  profilePreview.addEventListener("error", () => {
    profilePreview.hidden = true;
  });

  coverPreview.addEventListener("error", () => {
    coverPreview.hidden = true;
  });

  profilePreview.addEventListener("load", () => {
    profilePreview.hidden = false;
  });

  coverPreview.addEventListener("load", () => {
    coverPreview.hidden = false;
  });

  fields.profileImage.addEventListener("input", () => {
    updatePreview(fields.profileImage, profilePreview);
  });

  fields.coverImage.addEventListener("input", () => {
    updatePreview(fields.coverImage, coverPreview);
  });

  async function artistRequest(options = {}) {
    const token = getToken();

    if (!token) {
      window.location.replace("login.html");
      throw new Error("Please log in again.");
    }

    const response = await fetch(apiUrl, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
      },
    });

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error(
        `Unexpected server response (HTTP ${response.status}).`
      );
    }

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(
        data.message || "Unable to process artist profile."
      );
    }

    return data;
  }

  async function loadProfile() {
    try {
      const data = await artistRequest();

      if (!data.artist) {
        throw new Error("Artist profile was not found.");
      }

      const artist = data.artist;

      for (const field of Object.keys(fields)) {
        fields[field].value = artist[field] || "";
      }

      document.getElementById("approvalStatus").textContent =
        artist.approvalStatus || "Unknown";

      document.getElementById("featuredStatus").textContent =
        artist.featured ? "Yes" : "No";

      updatePreview(fields.profileImage, profilePreview);
      updatePreview(fields.coverImage, coverPreview);

      form.hidden = false;
      loading.hidden = true;
    } catch (error) {
      loading.hidden = true;
      showMessage(error.message, true);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {};

    for (const field of Object.keys(fields)) {
      payload[field] = fields[field].value.trim();
    }

    if (!payload.stageName) {
      showMessage("Stage name is required.", true);
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    showMessage("");

    try {
      const data = await artistRequest({
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      showMessage(
        data.message || "Artist profile updated successfully."
      );
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save changes";
    }
  });

  loadProfile();
}
