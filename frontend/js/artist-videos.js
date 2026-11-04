
document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("videosGrid");
  const loadingState = document.getElementById("loadingState");
  const emptyState = document.getElementById("emptyState");
  const emptyDescription = document.getElementById("emptyDescription");
  const messageBox = document.getElementById("videoMessage");
  const statusFilter = document.getElementById("statusFilter");

  const totalVideos = document.getElementById("totalVideos");
  const approvedVideos = document.getElementById("approvedVideos");
  const pendingVideos = document.getElementById("pendingVideos");
  const draftVideos = document.getElementById("draftVideos");

  
const apiBase =
  typeof API_BASE_URL !== "undefined"
    ? `${API_BASE_URL.replace(/\/$/, "")}/api`
    : "http://localhost:5000/api";


  const token = typeof getToken === "function"
    ? getToken()
    : localStorage.getItem("token");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  if (typeof getStoredUser === "function") {
    const user = getStoredUser();

    if (user && user.role !== "artist") {
  window.location.href = "home.html";
  return;
}
  }

  let allVideos = [];

  function showMessage(text, isError = false) {
    messageBox.textContent = text;
    messageBox.classList.toggle("error", isError);
  }

  function formatDuration(seconds) {
    const total = Math.round(Number(seconds));

    if (!Number.isFinite(total) || total < 0) {
      return "—";
    }

    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remaining = total % 60;

    if (hours) {
      return [
        hours,
        String(minutes).padStart(2, "0"),
        String(remaining).padStart(2, "0")
      ].join(":");
    }

    return `${minutes}:${String(remaining).padStart(2, "0")}`;
  }

  function formatDate(dateValue) {
    if (!dateValue) return "Date unavailable";

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return date.toLocaleDateString("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function statusLabel(status) {
    const labels = {
      draft: "Draft",
      pending: "Pending Review",
      approved: "Approved",
      rejected: "Rejected"
    };

    return labels[status] || "Unknown";
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) element.className = className;

    if (text !== undefined) {
      element.textContent = text;
    }

    return element;
  }

  function createVideoCard(video) {
    const card = createElement("article", "video-card");

    const thumbnail = createElement(
      "div",
      "video-thumbnail"
    );

    const fallback = createElement(
      "div",
      "thumbnail-fallback",
      "▶"
    );

    const image = document.createElement("img");
    image.alt = video.title || "Video thumbnail";
    image.loading = "lazy";
    image.hidden = true;

    image.addEventListener("load", () => {
      image.hidden = false;
      fallback.hidden = true;
    });

    image.addEventListener("error", () => {
      image.hidden = true;
      fallback.hidden = false;
    });

    if (
      typeof video.thumbnailUrl === "string" &&
      /^https?:\/\//i.test(video.thumbnailUrl)
    ) {
      image.src = video.thumbnailUrl;
    }

    thumbnail.append(fallback, image);

    thumbnail.appendChild(
      createElement(
        "span",
        "video-duration",
        formatDuration(video.duration)
      )
    );

    const content = createElement("div", "video-content");

    content.appendChild(
      createElement(
        "h3",
        "",
        video.title || "Untitled Video"
      )
    );

    const meta = createElement("div", "video-meta");

    meta.appendChild(
      createElement(
        "span",
        "",
        video.videoType === "music_video"
          ? "Music Video"
          : video.videoType || "Video"
      )
    );

    meta.appendChild(
      createElement(
        "span",
        "",
        formatDate(video.createdAt)
      )
    );

    content.appendChild(meta);

    const allowedStatuses = [
      "draft",
      "pending",
      "approved",
      "rejected"
    ];

    const status = allowedStatuses.includes(video.status)
      ? video.status
      : "unknown";

    content.appendChild(
      createElement(
        "span",
        `status status-${status}`,
        statusLabel(video.status)
      )
    );

    const actions = createElement("div", "video-actions");

    if (video.status === "draft") {
      const rightsLabel = createElement(
        "label",
        "rights-label"
      );

      const rightsCheckbox = document.createElement("input");
      rightsCheckbox.type = "checkbox";

      const rightsText = createElement(
        "span",
        "",
        "I own this video or have permission to distribute it."
      );

      rightsLabel.append(rightsCheckbox, rightsText);

      const submitButton = createElement(
        "button",
        "card-button",
        "Submit for Review"
      );

      submitButton.type = "button";

      submitButton.addEventListener("click", async () => {
        if (!rightsCheckbox.checked) {
          showMessage(
            "Please confirm your distribution rights first.",
            true
          );
          return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";

        try {
          await submitVideo(video._id);

          showMessage(
            `"${video.title}" has been submitted for review.`
          );

          await loadVideos();
        } catch (error) {
          showMessage(error.message, true);

          submitButton.disabled = false;
          submitButton.textContent = "Submit for Review";
        }
      });

      actions.append(rightsLabel, submitButton);
    }

    if (video.status === "pending") {
      actions.appendChild(
        createElement(
          "p",
          "",
          "Your video is waiting for admin review."
        )
      );
    }

    if (video.status === "approved") {
      const viewLink = createElement(
        "a",
        "card-button",
        "Watch Video"
      );

      viewLink.href =
        `video.html?id=${encodeURIComponent(video._id)}`;

      actions.appendChild(viewLink);
    }

    
if (video.status === "rejected") {
  const rejectionMessage = createElement(
    "p",
    "video-rejection-message",
    "This video was not approved."
  );

  actions.appendChild(rejectionMessage);

  if (video.moderationReason) {
    const reasonBox = createElement(
      "div",
      "video-rejection-reason"
    );

    reasonBox.appendChild(
      createElement(
        "strong",
        "",
        "Reason for rejection:"
      )
    );

    reasonBox.appendChild(
      createElement(
        "p",
        "",
        video.moderationReason
      )
    );

    actions.appendChild(reasonBox);
  }

  const editLink = createElement(
  "a",
  "card-button",
  "Edit & Resubmit"
);

editLink.href =
  `artist-upload-video.html?edit=${encodeURIComponent(video._id)}`;

actions.appendChild(editLink);
}


    content.appendChild(actions);
    card.append(thumbnail, content);

    return card;
  }

  function updateStats() {
    totalVideos.textContent = allVideos.length;

    approvedVideos.textContent = allVideos.filter(
      video => video.status === "approved"
    ).length;

    pendingVideos.textContent = allVideos.filter(
      video => video.status === "pending"
    ).length;

    draftVideos.textContent = allVideos.filter(
      video => video.status === "draft"
    ).length;
  }

  function renderVideos() {
    const selectedStatus = statusFilter.value;

    const filtered = selectedStatus === "all"
      ? allVideos
      : allVideos.filter(
          video => video.status === selectedStatus
        );

    grid.replaceChildren();

    emptyState.hidden = filtered.length > 0;

    if (!filtered.length) {
      emptyDescription.textContent = allVideos.length
        ? "There are no videos with this status."
        : "Your uploaded videos will appear here.";

      return;
    }

    const fragment = document.createDocumentFragment();

    filtered.forEach(video => {
      fragment.appendChild(createVideoCard(video));
    });

    grid.appendChild(fragment);
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers
      }
    });

    
let result;

const contentType =
  response.headers.get("content-type") || "";

if (!contentType.includes("application/json")) {
  throw new Error(
    `Unable to load videos. Server returned HTTP ${response.status}.`
  );
}

try {
  result = await response.json();
} catch {
  throw new Error(
    "Unable to read the server response. Please try again."
  );
}



    if (!response.ok || result.success === false) {
      throw new Error(
        result.message || "Unable to complete the request."
      );
    }

    return result;
  }

  async function submitVideo(videoId) {
    await apiRequest(
      `/videos/${encodeURIComponent(videoId)}/submit`,
      {
        method: "PATCH",
        body: JSON.stringify({
          rightsConfirmed: true
        })
      }
    );
  }

  async function loadVideos() {
    loadingState.hidden = false;

    try {
      const result = await apiRequest("/videos/mine");

      allVideos = Array.isArray(result.videos)
        ? result.videos
        : [];

      updateStats();
      renderVideos();
    } catch (error) {
      showMessage(error.message, true);
    } finally {
      loadingState.hidden = true;
    }
  }

  statusFilter.addEventListener("change", renderVideos);

  await loadVideos();
});
