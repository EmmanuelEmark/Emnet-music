
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
  const baseUrl = API_BASE_URL.replace(/\/$/, "");

  const form = document.getElementById("artistProfileForm");
  const loading = document.getElementById("profileLoading");
  const message = document.getElementById("profileMessage");
  const saveButton = document.getElementById("saveProfileButton");
  const uploadStatus = document.getElementById("imageUploadStatus");

  const fields = {
    stageName: document.getElementById("stageName"),
    bio: document.getElementById("bio"),
    country: document.getElementById("country"),
  };

  const images = {
    profile: {
      input: document.getElementById("profileImage"),
      preview: document.getElementById("profileImagePreview"),
      kind: "artistProfile",
      payloadField: "profileImageUploadId",
      legacyField: "profileImage",
      maxWidth: 800,
      maxHeight: 800,
      targetSizeKB: 200,
    },
    cover: {
      input: document.getElementById("coverImage"),
      preview: document.getElementById("coverImagePreview"),
      kind: "artistCover",
      payloadField: "coverImageUploadId",
      legacyField: "coverImage",
      maxWidth: 1920,
      maxHeight: 640,
      targetSizeKB: 500,
    },
  };

  let currentArtist = null;
  const previewUrls = {};

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("error", isError);
  }

  function setPreview(type, url, temporary = false) {
    const image = images[type].preview;

    if (previewUrls[type]) {
      URL.revokeObjectURL(previewUrls[type]);
      delete previewUrls[type];
    }

    image.hidden = true;
    image.removeAttribute("src");

    if (!url) return;

    if (temporary) {
      previewUrls[type] = url;
    }

    image.src = url;
  }

  for (const [type, config] of Object.entries(images)) {
    config.preview.addEventListener("load", () => {
      config.preview.hidden = false;
    });

    config.preview.addEventListener("error", () => {
      config.preview.hidden = true;
    });

    config.input.addEventListener("change", () => {
      const file = config.input.files?.[0];

      if (!file) {
        displaySavedImage(type).catch(console.error);
        return;
      }

      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 25 * 1024 * 1024
      ) {
        config.input.value = "";
        showMessage(
          "Select a JPG, PNG or WebP image under 25 MB.",
          true
        );
        displaySavedImage(type).catch(console.error);
        return;
      }

      const url = URL.createObjectURL(file);
      setPreview(type, url, true);
      showMessage("");
    });
  }

  function getAuthToken() {
    const token = getToken();

    if (!token) {
      window.location.replace("login.html");
      throw new Error("Please log in again.");
    }

    return token;
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
        ...(options.body
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
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
        data.message || "The request could not be completed."
      );
    }

    return data;
  }

  async function displaySavedImage(type) {
    if (!currentArtist) return;

    const config = images[type];

    const uploadId = currentArtist[config.payloadField];

    if (uploadId) {
      const endpoint = type === "profile"
        ? "profile"
        : "cover";

      try {
        const result = await apiRequest(
          `/api/media/artists/${currentArtist._id}/${endpoint}`
        );

        setPreview(type, result.mediaUrl);
        return;
      } catch (error) {
        console.error("Image retrieval error:", error);
        setPreview(type, "");
        return;
      }
    }

    const legacyUrl = currentArtist[config.legacyField];

    setPreview(type, legacyUrl || "");
  }

  async function loadProfile() {
    try {
      const data = await apiRequest("/api/artists/me");

      if (!data.artist) {
        throw new Error("Artist profile was not found.");
      }

      currentArtist = data.artist;

      for (const field of Object.keys(fields)) {
        fields[field].value = currentArtist[field] || "";
      }

      document.getElementById("approvalStatus").textContent =
        currentArtist.approvalStatus || "Unknown";

      document.getElementById("featuredStatus").textContent =
        currentArtist.featured ? "Yes" : "No";

      form.hidden = false;

      await Promise.all([
        displaySavedImage("profile"),
        displaySavedImage("cover"),
      ]);
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      loading.hidden = true;
    }
  }

  async function uploadImage(type) {
    const config = images[type];
    const originalFile = config.input.files?.[0];

    if (!originalFile) return null;

    uploadStatus.textContent =
      `Optimizing ${type} image...`;

    const compressedFile = await compressImage(
      originalFile,
      {
        maxWidth: config.maxWidth,
        maxHeight: config.maxHeight,
        quality: 0.9,
        targetSizeKB: config.targetSizeKB,
      }
    );

    uploadStatus.textContent =
      `Preparing ${type} image upload...`;

    const request = await apiRequest(
      "/api/uploads/request",
      {
        method: "POST",
        body: JSON.stringify({
          kind: config.kind,
          fileName: compressedFile.name,
          mimeType: compressedFile.type,
          size: compressedFile.size,
        }),
      }
    );

    if (!request.uploadUrl || !request.uploadId) {
      throw new Error("Invalid R2 upload response.");
    }

    uploadStatus.textContent =
      `Uploading ${type} image to Cloudflare R2...`;

    // Upload directly to R2, not through Render.
    // Do not send the Emnet Music authorization token to R2.
    const uploadResponse = await fetch(request.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": request.contentType,
      },
      body: compressedFile,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `${type} image upload failed (HTTP ${uploadResponse.status}).`
      );
    }

    uploadStatus.textContent =
      `Verifying ${type} image upload...`;

    const confirmation = await apiRequest(
      `/api/uploads/${request.uploadId}/confirm`,
      {
        method: "POST",
      }
    );

    if (
      confirmation.media?.status !== "ready" ||
      confirmation.media?.uploadId !== request.uploadId
    ) {
      throw new Error(
        `${type} image could not be verified.`
      );
    }

    return request.uploadId;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      stageName: fields.stageName.value.trim(),
      bio: fields.bio.value.trim(),
      country: fields.country.value.trim(),
    };

    if (!payload.stageName || !payload.country) {
      showMessage(
        "Stage name and country are required.",
        true
      );
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    showMessage("");

    try {
      // Upload selected images before saving the profile.
      for (const type of ["profile", "cover"]) {
        if (images[type].input.files?.length) {
          const uploadId = await uploadImage(type);

          if (uploadId) {
            payload[images[type].payloadField] = uploadId;
          }
        }
      }

      uploadStatus.textContent = "Saving artist profile...";

      const result = await apiRequest(
        "/api/artists/me",
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        }
      );

      if (result.artist) {
        currentArtist = result.artist;
      }

      images.profile.input.value = "";
      images.cover.input.value = "";

      uploadStatus.textContent = "";

      showMessage(
        result.message ||
        "Artist profile updated successfully."
      );

      await Promise.all([
        displaySavedImage("profile"),
        displaySavedImage("cover"),
      ]);
    } catch (error) {
      uploadStatus.textContent = "";
      showMessage(error.message, true);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save changes";
    }
  });

  window.addEventListener("pagehide", () => {
    Object.values(previewUrls).forEach((url) => {
      URL.revokeObjectURL(url);
    });
  });

  loadProfile();
}
