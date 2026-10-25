
document.addEventListener("DOMContentLoaded", async () => {
  // --------------------------------------------------
  // 1. GET THE HTML ELEMENTS
  // --------------------------------------------------

  const createReleaseForm = document.getElementById("createReleaseForm");
  const releaseType = document.getElementById("releaseType");
  const releaseTitle = document.getElementById("releaseTitle");
  const releaseTitleGroup = document.getElementById("releaseTitleGroup");
  const releaseTitleLabel = document.getElementById("releaseTitleLabel");
  const releaseTitleHelp = document.getElementById("releaseTitleHelp");
  const releaseDate = document.getElementById("releaseDate");
  const coverImage = document.getElementById("coverImage");

  const tracksContainer = document.getElementById("tracksContainer");
  const addTrackButton = document.getElementById("addTrackButton");
  const saveDraftButton = document.getElementById("saveDraftButton");
  const submitReleaseButton = document.getElementById("submitReleaseButton");

  const createReleaseError = document.getElementById("createReleaseError");
  const releaseFormMessage = document.getElementById("releaseFormMessage");
  const artistLogoutButton = document.getElementById("artistLogoutButton");

  const releaseCoverPreview = document.getElementById("releaseCoverPreview");
  const releaseCoverPlaceholder = document.getElementById("releaseCoverPlaceholder");
  const previewReleaseType = document.getElementById("previewReleaseType");
  const previewReleaseTitle = document.getElementById("previewReleaseTitle");
  const previewReleaseDate = document.getElementById("previewReleaseDate");

  // --------------------------------------------------
  // 2. PAGE STATE
  // --------------------------------------------------

  let releaseId = null;
  let isSaving = false;
  let isSubmitted = false;
  let previousReleaseType = "";

  // --------------------------------------------------
  // 3. ARTIST AUTHENTICATION
  // --------------------------------------------------

  if (typeof protectPage === "function") {
    protectPage();
  }

  const token =
    typeof getToken === "function"
      ? getToken()
      : localStorage.getItem("emnetToken");

  if (!token) {
    window.location.href = "login.html";
    return;
  }

  if (typeof getCurrentUser === "function") {
    try {
      const response = await getCurrentUser();

      const currentUser =
        response?.user ||
        response?.data?.user ||
        response?.data ||
        response;

      if (currentUser?.role && currentUser.role !== "artist") {
        alert("Only artist accounts can upload music.");
        window.location.href = "home.html";
        return;
      }
    } catch (error) {
      console.error("Could not verify the current user:", error);
    }
  }

  // --------------------------------------------------
  // 4. AVAILABLE MUSIC GENRES
  // --------------------------------------------------

  const genres = [
    "Afrobeats",
    "Afrobeat",
    "Afropop",
    "Afro-fusion",
    "Afro-house",
    "Amapiano",
    "Highlife",
    "Igbo Highlife",
    "Fuji",
    "Juju",
    "Apala",
    "Gospel",
    "Contemporary Gospel",
    "Christian Hip-Hop",
    "Christian R&B",
    "Hip-Hop",
    "Rap",
    "Trap",
    "Drill",
    "R&B",
    "Alternative R&B",
    "Neo-Soul",
    "Soul",
    "Pop",
    "Dance-Pop",
    "Indie Pop",
    "Alternative",
    "Indie",
    "Rock",
    "Alternative Rock",
    "Metal",
    "Punk",
    "Reggae",
    "Dancehall",
    "Soca",
    "Calypso",
    "Jazz",
    "Smooth Jazz",
    "Blues",
    "Funk",
    "Disco",
    "Electronic",
    "EDM",
    "House",
    "Afro-house",
    "Deep House",
    "Techno",
    "Trance",
    "Ambient",
    "Drum and Bass",
    "Dubstep",
    "Lo-fi",
    "Chillout",
    "Acoustic",
    "Folk",
    "Country",
    "Classical",
    "Orchestral",
    "Instrumental",
    "Soundtrack",
    "Traditional",
    "World Music",
    "Latin",
    "Latin Pop",
    "Reggaeton",
    "Salsa",
    "K-Pop",
    "J-Pop",
    "Arabic Pop",
    "Spoken Word",
    "Comedy",
    "Children's Music",
    "Other"
  ];

  // Remove duplicate genre labels while preserving their order.
  const uniqueGenres = [...new Set(genres)];

  function buildGenreOptions() {
    return `
      <option value="">Select a genre</option>
      ${uniqueGenres.map((genre) => `
        <option value="${escapeHtml(genre)}">${escapeHtml(genre)}</option>
      `).join("")}
    `;
  }

  // Safely insert genre labels into the dropdown.
  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // --------------------------------------------------
  // 5. MESSAGE HELPERS
  // --------------------------------------------------

  function showError(message) {
    createReleaseError.textContent = message;
    createReleaseError.classList.remove("hidden");
    createReleaseError.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  function clearError() {
    createReleaseError.textContent = "";
    createReleaseError.classList.add("hidden");
  }

  function showMessage(message, type = "info") {
    releaseFormMessage.textContent = message;
    releaseFormMessage.className =
      `release-form-message visible ${type}`;
  }

  function clearMessage() {
    releaseFormMessage.textContent = "";
    releaseFormMessage.className = "release-form-message";
  }

  // --------------------------------------------------
  // 6. DURATION FORMATTING
  // --------------------------------------------------

  function formatDuration(totalSeconds) {
    const seconds = Math.round(Number(totalSeconds));

    if (!Number.isFinite(seconds) || seconds < 0) {
      return "Unknown duration";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  // --------------------------------------------------
  // 7. AUTOMATIC AUDIO DURATION DETECTION
  // --------------------------------------------------

  function detectAudioDuration(card) {
    const audioUrlInput = card.querySelector('[data-field="audioUrl"]');
    const durationInput = card.querySelector('[data-field="duration"]');
    const audioStatus = card.querySelector('[data-field="audioStatus"]');

    const audioUrl = audioUrlInput.value.trim();

    if (!audioUrl) {
      durationInput.value = "";
      durationInput.dataset.sourceUrl = "";

      audioStatus.textContent =
        "Enter a direct audio file URL first.";

      return Promise.resolve(null);
    }

    // Do not load the same URL's metadata again if its duration is known.
    if (
      durationInput.value &&
      durationInput.dataset.sourceUrl === audioUrl
    ) {
      return Promise.resolve(Number(durationInput.value));
    }

    durationInput.value = "";
    durationInput.dataset.sourceUrl = "";

    audioStatus.textContent = "Detecting audio duration...";

    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = "metadata";

      let finished = false;

      const timeout = setTimeout(() => {
        finish(
          null,
          "Duration detection timed out. Check the audio URL and try again."
        );
      }, 15000);

      function finish(seconds, message) {
        if (finished) return;

        finished = true;
        clearTimeout(timeout);

        // The artist may have changed the URL while loading.
        if (audioUrlInput.value.trim() !== audioUrl) {
          resolve(null);
          return;
        }

        if (
          Number.isFinite(seconds) &&
          seconds > 0
        ) {
          const roundedSeconds = Math.round(seconds);

          durationInput.value = roundedSeconds;
          durationInput.dataset.sourceUrl = audioUrl;

          audioStatus.textContent =
            `Duration detected: ${formatDuration(roundedSeconds)} ` +
            `(${roundedSeconds} seconds).`;

          resolve(roundedSeconds);
        } else {
          durationInput.value = "";
          durationInput.dataset.sourceUrl = "";

          audioStatus.textContent = message;
          resolve(null);
        }
      }

      audio.addEventListener("loadedmetadata", () => {
        if (
          Number.isFinite(audio.duration) &&
          audio.duration > 0
        ) {
          finish(audio.duration, "");
        } else {
          finish(
            null,
            "This audio file does not provide a readable duration."
          );
        }
      }, { once: true });

      audio.addEventListener("error", () => {
        finish(
          null,
          "Could not read this audio URL. Use a direct, accessible audio file link."
        );
      }, { once: true });

      audio.src = audioUrl;
      audio.load();
    });
  }

  // --------------------------------------------------
  // 8. ADD A SONG CARD
  // --------------------------------------------------

  function addTrackCard() {
    if (releaseId) {
      showMessage(
        "This release has already been created. You cannot add more tracks to it from this page.",
        "info"
      );
      return;
    }

    if (releaseType.value === "single" && getTrackCards().length >= 1) {
      showMessage(
        "A Single can contain only one song. Select EP or Album to add more songs.",
        "info"
      );
      return;
    }

    const card = document.createElement("div");
    card.className = "track-card";
    card.dataset.saved = "false";

    card.innerHTML = `
      <div class="track-card-header">
        <div class="track-card-title">
          <span class="track-number-badge">1</span>
          <h3>Song 1</h3>
        </div>

        <button
          type="button"
          class="remove-track-button"
          data-action="remove-track"
        >
          Remove
        </button>
      </div>

      <div class="track-fields-grid">

        <div class="release-form-group full-width">
          <label>Song title</label>
          <input
            type="text"
            data-field="title"
            maxlength="150"
            placeholder="Enter song title"
            required
          >
        </div>

        <div class="release-form-group">
          <label>Genre</label>
          <select data-field="genre" required>
            ${buildGenreOptions()}
          </select>
          <small>Select the genre that best describes this song.</small>
        </div>

        <div class="release-form-group">
          <label>Duration</label>
          <input
            type="number"
            data-field="duration"
            min="1"
            placeholder="Detected automatically"
            readonly
            required
          >
          <small>
            Duration is detected from the audio URL.
          </small>
        </div>

        <div class="release-form-group full-width">
          <label>Audio URL</label>
          <input
            type="url"
            data-field="audioUrl"
            placeholder="https://example.com/song.mp3"
            required
          >
          <small data-field="audioStatus" class="audio-status">
            Enter a direct, accessible audio file URL.
          </small>
        </div>

        <div class="release-form-group full-width">
          <label>ISRC (optional)</label>
          <input
            type="text"
            data-field="isrc"
            maxlength="20"
            placeholder="Enter ISRC if available"
          >
          <small>
            Leave blank if the song does not have an ISRC yet.
          </small>
        </div>

      </div>

      <div class="track-save-status"></div>
    `;

    tracksContainer.appendChild(card);

    const titleInput = card.querySelector('[data-field="title"]');
    const audioUrlInput = card.querySelector('[data-field="audioUrl"]');
    const removeButton = card.querySelector('[data-action="remove-track"]');

    titleInput.addEventListener("input", updateReleasePreview);

    audioUrlInput.addEventListener("input", () => {
      const durationInput = card.querySelector('[data-field="duration"]');
      const audioStatus = card.querySelector('[data-field="audioStatus"]');

      durationInput.value = "";
      durationInput.dataset.sourceUrl = "";

      audioStatus.textContent =
        "Duration will be detected when you finish entering the URL.";
    });

    audioUrlInput.addEventListener("change", async () => {
      await detectAudioDuration(card);
    });

    audioUrlInput.addEventListener("blur", async () => {
      if (
        audioUrlInput.value.trim() &&
        !card.querySelector('[data-field="duration"]').value
      ) {
        await detectAudioDuration(card);
      }
    });

    removeButton.addEventListener("click", () => {
      if (releaseId) return;

      const cards = getTrackCards();

      if (cards.length <= 1) {
        showMessage(
          "At least one song is required.",
          "info"
        );
        return;
      }

      card.remove();
      updateTrackNumbers();
      updateReleasePreview();
      updateTitleFields();
      clearMessage();
    });

    updateTrackNumbers();
    updateTitleFields();
    updateReleasePreview();
  }

  function getTrackCards() {
    return [...tracksContainer.querySelectorAll(".track-card")];
  }

  function updateTrackNumbers() {
    const cards = getTrackCards();

    cards.forEach((card, index) => {
      const number = index + 1;
      const badge = card.querySelector(".track-number-badge");
      const heading = card.querySelector(".track-card-title h3");
      const removeButton = card.querySelector(".remove-track-button");

      badge.textContent = number;
      heading.textContent = `Song ${number}`;

      // Do not allow removing the last remaining song.
      removeButton.disabled = cards.length === 1 || Boolean(releaseId);
    });
  }

  // --------------------------------------------------
  // 9. SINGLE, EP AND ALBUM NAME FIELDS
  // --------------------------------------------------

  function updateTitleFields() {
    const type = releaseType.value;

    const isSingle = type === "single";
    const isEp = type === "ep";
    const isAlbum = type === "album";

    // Singles use their song title, so no separate name field is needed.
    releaseTitleGroup.classList.toggle(
      "hidden",
      isSingle || (!isEp && !isAlbum)
    );

    releaseTitle.required = isEp || isAlbum;

    if (isEp) {
      releaseTitleLabel.textContent = "EP name";
      releaseTitle.placeholder = "Enter EP name";
      releaseTitleHelp.textContent = "Enter the name of your EP.";
    }

    if (isAlbum) {
      releaseTitleLabel.textContent = "Album name";
      releaseTitle.placeholder = "Enter album name";
      releaseTitleHelp.textContent = "Enter the name of your album.";
    }

    // A single can have one track only.
    addTrackButton.disabled =
      Boolean(releaseId) ||
      !type ||
      isSingle;

    updateReleasePreview();
  }

  releaseType.addEventListener("change", () => {
    const cards = getTrackCards();

    if (releaseType.value === "single" && cards.length > 1) {
      alert(
        "A Single can contain only one song. Remove the extra songs before selecting Single."
      );

      releaseType.value = previousReleaseType;
      updateTitleFields();
      return;
    }

    previousReleaseType = releaseType.value;

    updateTitleFields();
    clearError();
    clearMessage();
  });

  // --------------------------------------------------
  // 10. RELEASE PREVIEW
  // --------------------------------------------------

  function updateReleasePreview() {
    const type = releaseType.value;

    const firstCard = getTrackCards()[0];
    const firstSongTitle =
      firstCard?.querySelector('[data-field="title"]')?.value.trim() || "";

    let title = "";

    if (type === "single") {
      title = firstSongTitle;
    } else if (type === "ep" || type === "album") {
      title = releaseTitle.value.trim();
    }

    previewReleaseTitle.textContent =
      title ||
      (type === "single"
        ? "Your song title"
        : type === "ep"
          ? "Your EP name"
          : type === "album"
            ? "Your album name"
            : "Your music title");

    previewReleaseType.textContent =
      type ? type.toUpperCase() : "RELEASE";

    if (releaseDate.value) {
      const date = new Date(`${releaseDate.value}T00:00:00`);

      previewReleaseDate.textContent =
        Number.isNaN(date.getTime())
          ? releaseDate.value
          : date.toLocaleDateString(undefined, {
              day: "numeric",
              month: "long",
              year: "numeric"
            });
    } else {
      previewReleaseDate.textContent = "Release date";
    }
  }

  releaseTitle.addEventListener("input", updateReleasePreview);
  releaseDate.addEventListener("change", updateReleasePreview);

  coverImage.addEventListener("input", () => {
    const url = coverImage.value.trim();

    if (!url) {
      releaseCoverPreview.classList.add("hidden");
      releaseCoverPreview.removeAttribute("src");
      releaseCoverPlaceholder.classList.remove("hidden");
      return;
    }

    releaseCoverPreview.onload = () => {
      releaseCoverPreview.classList.remove("hidden");
      releaseCoverPlaceholder.classList.add("hidden");
    };

    releaseCoverPreview.onerror = () => {
      releaseCoverPreview.classList.add("hidden");
      releaseCoverPlaceholder.classList.remove("hidden");
    };

    releaseCoverPreview.src = url;
  });

  // --------------------------------------------------
  // 11. API HELPER
  // --------------------------------------------------

  async function apiRequest(url, options = {}) {
    const currentToken =
      typeof getToken === "function"
        ? getToken()
        : localStorage.getItem("emnetToken");

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentToken}`,
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      throw new Error(
        data.message ||
        data.error ||
        `The request failed with status ${response.status}.`
      );
    }

    return data;
  }

  function extractReleaseId(responseData) {
    const release =
      responseData.release ||
      responseData.data?.release ||
      responseData.data ||
      responseData;

    return (
      release._id ||
      release.id ||
      responseData.releaseId ||
      null
    );
  }

  // --------------------------------------------------
  // 12. VALIDATE TRACKS AND DETECT DURATION BEFORE SAVING
  // --------------------------------------------------

  async function validateTracks() {
    const cards = getTrackCards();

    if (cards.length === 0) {
      throw new Error("Add at least one song.");
    }

    for (let index = 0; index < cards.length; index++) {
      const card = cards[index];

      const title = card.querySelector('[data-field="title"]').value.trim();
      const genre = card.querySelector('[data-field="genre"]').value;
      const audioUrl = card.querySelector('[data-field="audioUrl"]').value.trim();
      const durationInput = card.querySelector('[data-field="duration"]');

      if (!title) {
        throw new Error(`Enter the title for Song ${index + 1}.`);
      }

      if (!genre) {
        throw new Error(`Select a genre for Song ${index + 1}.`);
      }

      if (!audioUrl) {
        throw new Error(`Enter the audio URL for Song ${index + 1}.`);
      }

      // Try detecting duration if it has not been detected for this URL.
      if (
        !durationInput.value ||
        durationInput.dataset.sourceUrl !== audioUrl
      ) {
        await detectAudioDuration(card);
      }

      if (
        !durationInput.value ||
        Number(durationInput.value) <= 0 ||
        durationInput.dataset.sourceUrl !== audioUrl
      ) {
        throw new Error(
          `Could not detect the duration for "${title}". Check that the URL points directly to an accessible audio file, then try again.`
        );
      }
    }

    return cards;
  }

  function lockReleaseFields() {
    releaseType.disabled = true;
    releaseTitle.disabled = true;
    releaseDate.disabled = true;
    coverImage.disabled = true;
    addTrackButton.disabled = true;
  }

  function lockSavedTrack(card) {
    card.dataset.saved = "true";

    card.querySelectorAll("input, select, button").forEach((element) => {
      element.disabled = true;
    });

    const status = card.querySelector(".track-save-status");
    status.textContent = "Song saved successfully as a draft.";
    status.classList.add("visible");
  }

  function allTracksSaved() {
    const cards = getTrackCards();

    return (
      cards.length > 0 &&
      cards.every((card) => card.dataset.saved === "true")
    );
  }

  function updateActionButtons() {
    if (isSubmitted) {
      saveDraftButton.disabled = true;
      submitReleaseButton.disabled = true;
      submitReleaseButton.textContent = "Submitted for review";
      submitReleaseButton.classList.remove("hidden");
      return;
    }

    if (releaseId && allTracksSaved()) {
      submitReleaseButton.classList.remove("hidden");
      saveDraftButton.disabled = true;
      saveDraftButton.textContent = "Draft saved";
    } else {
      submitReleaseButton.classList.add("hidden");
      saveDraftButton.disabled = false;
      saveDraftButton.textContent = releaseId
        ? "Save remaining songs"
        : "Save draft and songs";
    }
  }

  // --------------------------------------------------
  // 13. SAVE RELEASE AND SONGS AS DRAFTS
  // --------------------------------------------------

  createReleaseForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSaving || isSubmitted) return;

    clearError();
    clearMessage();

    isSaving = true;
    saveDraftButton.disabled = true;
    saveDraftButton.textContent = "Saving...";

    try {
      if (!releaseType.value) {
        throw new Error("Select whether you are uploading a Single, EP or Album.");
      }

      if (!releaseDate.value) {
        throw new Error("Choose a release date.");
      }

      if (!coverImage.value.trim()) {
        throw new Error("Enter the cover artwork URL.");
      }

      const cards = await validateTracks();

      const firstSongTitle =
        cards[0].querySelector('[data-field="title"]').value.trim();

      // A Single uses its song title as the release name.
      // An EP uses the EP name; an Album uses the album name.
      let releaseName;

      if (releaseType.value === "single") {
        releaseName = firstSongTitle;
      } else {
        releaseName = releaseTitle.value.trim();
      }

      if (!releaseName) {
        throw new Error(
          releaseType.value === "ep"
            ? "Enter the EP name."
            : "Enter the album name."
        );
      }

      // Create the release only once.
      if (!releaseId) {
        showMessage("Creating your release...", "info");

        const releaseResponse = await apiRequest(
          `${API_BASE_URL}/releases`,
          {
            method: "POST",
            body: JSON.stringify({
              title: releaseName,
              releaseType: releaseType.value,
              coverImage: coverImage.value.trim(),
              releaseDate: releaseDate.value
            })
          }
        );

        releaseId = extractReleaseId(releaseResponse);

        if (!releaseId) {
          throw new Error(
            "The server did not return a release ID. Check the backend response before trying again."
          );
        }

        localStorage.setItem("emnetCurrentReleaseId", releaseId);

        lockReleaseFields();
      }

      // Save each track that has not already been saved.
      const currentCards = getTrackCards();

      for (let index = 0; index < currentCards.length; index++) {
        const card = currentCards[index];

        if (card.dataset.saved === "true") {
          continue;
        }

        const title =
          card.querySelector('[data-field="title"]').value.trim();

        const genre =
          card.querySelector('[data-field="genre"]').value;

        const audioUrl =
          card.querySelector('[data-field="audioUrl"]').value.trim();

        const duration =
          Number(card.querySelector('[data-field="duration"]').value);

        const isrc =
          card.querySelector('[data-field="isrc"]').value.trim();

        showMessage(
          `Saving song ${index + 1} of ${currentCards.length}: ${title}`,
          "info"
        );

        const songPayload = {
          title,
          genre,
          audioUrl,
          duration,
          trackNumber: index + 1,
          ...(isrc ? { isrc } : {})
        };

        await apiRequest(
          `${API_BASE_URL}/songs/release/${releaseId}`,
          {
            method: "POST",
            body: JSON.stringify(songPayload)
          }
        );

        lockSavedTrack(card);
      }

      updateTrackNumbers();
      updateActionButtons();

      showMessage(
        "Your release and all its songs have been saved as drafts. Review the details, then submit for review.",
        "success"
      );

    } catch (error) {
      console.error("Music upload error:", error);

      showError(
        error.message ||
        "Something went wrong while saving your music."
      );

      updateActionButtons();

    } finally {
      isSaving = false;

      if (!isSubmitted && !allTracksSaved()) {
        saveDraftButton.disabled = false;
        saveDraftButton.textContent = releaseId
          ? "Save remaining songs"
          : "Save draft and songs";
      } else {
        updateActionButtons();
      }
    }
  });

  // --------------------------------------------------
  // 14. SUBMIT THE RELEASE FOR REVIEW
  // --------------------------------------------------

  submitReleaseButton.addEventListener("click", async () => {
    if (!releaseId || !allTracksSaved() || isSaving || isSubmitted) {
      return;
    }

    clearError();
    clearMessage();

    isSaving = true;
    submitReleaseButton.disabled = true;
    submitReleaseButton.textContent = "Submitting...";

    try {
      await apiRequest(
        `${API_BASE_URL}/releases/${releaseId}/submit`,
        {
          method: "PATCH",
          body: JSON.stringify({})
        }
      );

      isSubmitted = true;

      submitReleaseButton.textContent = "Submitted for review";
      saveDraftButton.disabled = true;
      submitReleaseButton.disabled = true;

      showMessage(
        "Your release has been submitted for review. You can check its status from your artist dashboard.",
        "success"
      );

    } catch (error) {
      console.error("Release submission error:", error);

      showError(
        error.message ||
        "Could not submit the release. Please try again."
      );

      submitReleaseButton.disabled = false;
      submitReleaseButton.textContent = "Submit for review";

    } finally {
      isSaving = false;
    }
  });

  // --------------------------------------------------
  // 15. ADD TRACK BUTTON
  // --------------------------------------------------

  addTrackButton.addEventListener("click", () => {
    clearError();
    clearMessage();

    if (!releaseType.value) {
      showMessage("Choose Single, EP or Album first.", "info");
      return;
    }

    if (releaseType.value === "single") {
      showMessage(
        "A Single contains one song. Choose EP or Album to add more songs.",
        "info"
      );
      return;
    }

    addTrackCard();
  });

  // --------------------------------------------------
  // 16. LOG OUT
  // --------------------------------------------------

  artistLogoutButton?.addEventListener("click", () => {
    if (typeof logout === "function") {
      logout();
    } else {
      localStorage.removeItem("emnetToken");
      localStorage.removeItem("emnetUser");
      window.location.href = "login.html";
    }
  });

  // --------------------------------------------------
  // 17. INITIALIZE THE PAGE
  // --------------------------------------------------

  addTrackCard();
  updateTitleFields();
  updateReleasePreview();
});
