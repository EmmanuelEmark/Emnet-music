
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("videoUploadForm");

  const titleInput = document.getElementById("videoTitle");
  const typeInput = document.getElementById("videoType");
  const urlInput = document.getElementById("videoUrl");
  const thumbnailInput = document.getElementById("thumbnailUrl");
  const durationInput = document.getElementById("videoDuration");
  const durationHelp = document.getElementById("durationHelp");

  const linkedSongInput = document.getElementById("linkedSong");
  const linkedReleaseInput = document.getElementById("linkedRelease");
  const rightsInput = document.getElementById("rightsConfirmed");

  const saveButton = document.getElementById("saveDraftButton");
  const submitButton = document.getElementById("submitVideoButton");
  const messageBox = document.getElementById("uploadMessage");

  const previewImage = document.getElementById("previewImage");
  const placeholder = document.getElementById("thumbnailPlaceholder");
  const previewTitle = document.getElementById("previewTitle");
  const previewDuration = document.getElementById("previewDuration");

  let savedVideoId = null;
  let busy = false;
  let submitted = false;
  let metadataRequest = 0;


  const editVideoId = new URLSearchParams(
  window.location.search
  ).get("edit");


  const apiBase = typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL.replace(/\/$/, "")
    : "http://localhost:5000/api";

  function authToken() {
    if (typeof getToken === "function") {
      return getToken();
    }

    return localStorage.getItem("token");
  }

  const token = authToken();

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  if (typeof getStoredUser === "function") {
    const user = getStoredUser();

    if (user && user.role !== "artist") {
      window.location.href = "home";
      return;
    }
  }

  function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.className = `form-message ${type}`;
  }

  function clearMessage() {
    messageBox.textContent = "";
    messageBox.className = "form-message";
  }

  function setBusy(value) {
    busy = value;

    saveButton.disabled = value || Boolean(savedVideoId);
    submitButton.disabled = value || submitted;

    if (value) {
      saveButton.textContent = "Please wait...";
      submitButton.textContent = "Please wait...";
    } else {
      saveButton.textContent = savedVideoId
        ? "Draft Saved"
        : "Save Draft";

      submitButton.textContent = submitted
        ? "Submitted"
        : "Submit for Review";
    }
  }

  function lockDetails() {
    form.querySelectorAll(
      'input:not([type="checkbox"]), select'
    ).forEach(input => {
      input.disabled = true;
    });
  }

  function validHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ||
             url.protocol === "http:";
    } catch {
      return false;
    }
  }

  function formatDuration(seconds) {
    const total = Math.round(Number(seconds));

    if (!Number.isFinite(total) || total <= 0) {
      return "—";
    }

    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remaining = total % 60;

    if (hours > 0) {
      return [
        hours,
        String(minutes).padStart(2, "0"),
        String(remaining).padStart(2, "0")
      ].join(":");
    }

    return `${minutes}:${String(remaining).padStart(2, "0")}`;
  }

  function updateDurationPreview() {
    previewDuration.textContent =
      `Duration: ${formatDuration(durationInput.value)}`;
  }

  titleInput.addEventListener("input", () => {
    previewTitle.textContent =
      titleInput.value.trim() || "Your video title";
  });

  durationInput.addEventListener("input", updateDurationPreview);

  thumbnailInput.addEventListener("input", () => {
    const url = thumbnailInput.value.trim();

    previewImage.hidden = true;
    previewImage.removeAttribute("src");
    placeholder.hidden = false;

    if (validHttpUrl(url)) {
      previewImage.src = url;
    }
  });

  previewImage.addEventListener("load", () => {
    previewImage.hidden = false;
    placeholder.hidden = true;
  });

  previewImage.addEventListener("error", () => {
    previewImage.hidden = true;
    placeholder.hidden = false;
  });

  // Detect duration from a direct video URL where supported.
  urlInput.addEventListener("change", () => {
    const url = urlInput.value.trim();
    const requestId = ++metadataRequest;

    if (!validHttpUrl(url)) {
      return;
    }

    durationHelp.textContent =
      "Checking video duration. You can enter it manually.";

    const video = document.createElement("video");
    video.preload = "metadata";

    function cleanup() {
      video.removeAttribute("src");
      video.load();
    }

    video.onloadedmetadata = () => {
      if (requestId !== metadataRequest) {
        cleanup();
        return;
      }

      if (
        Number.isFinite(video.duration) &&
        video.duration > 0
      ) {
        durationInput.value = Math.ceil(video.duration);
        updateDurationPreview();

        durationHelp.textContent =
          "Duration detected automatically. You can adjust it.";
      } else {
        durationHelp.textContent =
          "Enter the duration manually in seconds.";
      }

      cleanup();
    };

    video.onerror = () => {
      if (requestId === metadataRequest) {
        durationHelp.textContent =
          "Automatic detection unavailable. Enter seconds manually.";
      }

      cleanup();
    };

    video.src = url;
  });

  function collectVideoData() {
    const title = titleInput.value.trim();
    const videoUrl = urlInput.value.trim();
    const thumbnailUrl = thumbnailInput.value.trim();
    const duration = Number(durationInput.value);

    if (!title) {
      throw new Error("Please enter the video title.");
    }

    if (!validHttpUrl(videoUrl)) {
      throw new Error("Please enter a valid video URL.");
    }

    if (!validHttpUrl(thumbnailUrl)) {
      throw new Error("Please enter a valid thumbnail URL.");
    }

    if (!Number.isInteger(duration) || duration <= 0) {
      throw new Error(
        "Please enter the video duration in whole seconds."
      );
    }

    const data = {
      title,
      videoType: typeInput.value,
      videoUrl,
      thumbnailUrl,
      duration
    };

    const linkedSong = linkedSongInput.value.trim();
    const linkedRelease = linkedReleaseInput.value.trim();

    if (linkedSong) {
      data.linkedSong = linkedSong;
    }

    if (linkedRelease) {
      data.linkedRelease = linkedRelease;
    }

    return data;
  }

  async function apiRequest(path, method, body) {
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    let result;

    try {
      result = await response.json();
    } catch {
      throw new Error("Invalid response from server.");
    }

    if (!response.ok || result.success === false) {
      throw new Error(
        result.message || "The request could not be completed."
      );
    }

    return result;
  }



async function loadVideoForEditing() {
  if (!editVideoId) return;

  const result = await apiRequest(
    "/videos/mine",
    "GET"
  );

  const video = (result.videos || []).find(
    item => item._id === editVideoId
  );

  if (!video) {
    throw new Error(
      "Video not found in your artist account."
    );
  }

  if (!["draft", "rejected"].includes(video.status)) {
    throw new Error(
      "Only draft or rejected videos can be edited."
    );
  }

  titleInput.value = video.title || "";
  typeInput.value = video.videoType || "music_video";
  urlInput.value = video.videoUrl || "";
  thumbnailInput.value = video.thumbnailUrl || "";
  durationInput.value = video.duration || "";

  linkedSongInput.value =
    video.linkedSong?._id ||
    video.linkedSong ||
    "";

  linkedReleaseInput.value =
    video.linkedRelease?._id ||
    video.linkedRelease ||
    "";

  rightsInput.checked = false;

  previewTitle.textContent =
    video.title || "Your video title";

  updateDurationPreview();

  thumbnailInput.dispatchEvent(
    new Event("input")
  );

  if (video.status === "rejected") {
    showMessage(
      video.moderationReason
        ? `Previous rejection reason: ${video.moderationReason}`
        : "Edit the rejected video and submit it again.",
      "error"
    );
  } else {
    showMessage(
      "You are editing an existing draft.",
      "success"
    );
  }
}





async function createDraft() {
  if (savedVideoId) {
    return savedVideoId;
  }

  const data = collectVideoData();

  let result;

  if (editVideoId) {
    // Update the existing video.
    result = await apiRequest(
      `/videos/${encodeURIComponent(editVideoId)}`,
      "PATCH",
      data
    );
  } else {
    // Create a new video.
    result = await apiRequest(
      "/videos",
      "POST",
      data
    );
  }

  const videoId = result.video?._id;

  if (!videoId) {
    throw new Error(
      "The server did not return a video ID."
    );
  }

  savedVideoId = videoId;

  lockDetails();

  return videoId;
}




  saveButton.addEventListener("click", async () => {
    if (busy || savedVideoId || submitted) return;

    clearMessage();

    if (!form.reportValidity()) return;

    setBusy(true);

    try {
      await createDraft();

      showMessage(
        "Your video draft has been saved successfully.",
        "success"
      );
    } catch (error) {
      showMessage(error.message);
    } finally {
      setBusy(false);
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (busy || submitted) return;

    clearMessage();

    if (!rightsInput.checked) {
      showMessage(
        "You must confirm that you own the video or have permission to distribute it."
      );
      return;
    }

    if (!savedVideoId && !form.reportValidity()) {
      return;
    }

    setBusy(true);

    try {
      const videoId = await createDraft();

      await apiRequest(
        `/videos/${encodeURIComponent(videoId)}/submit`,
        "PATCH",
        {
          rightsConfirmed: true
        }
      );

      submitted = true;
      rightsInput.disabled = true;

      showMessage(
        "Your video has been submitted for review successfully. It will become public after admin approval.",
        "success"
      );
    } catch (error) {
      const extra = savedVideoId
        ? " Your draft is saved. You can try submitting it again."
        : "";

      showMessage(error.message + extra);
    } finally {
      setBusy(false);
    }
  });

if (editVideoId) {
  setBusy(true);

  loadVideoForEditing()
    .then(() => {
      setBusy(false);
    })
    .catch(error => {
      setBusy(false);

      saveButton.disabled = true;
      submitButton.disabled = true;

      showMessage(error.message);
    });
}

});
