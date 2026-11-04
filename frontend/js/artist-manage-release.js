
document.addEventListener("DOMContentLoaded", async () => {
    const loading = document.getElementById("releaseLoading");
    const errorBox = document.getElementById("releaseError");
    const content = document.getElementById("releaseContent");
    const messageBox = document.getElementById("releaseFormMessage");

    const releaseId = new URLSearchParams(window.location.search)
        .get("releaseId");

    const token = typeof getToken === "function" ? getToken() : null;

    function showError(message) {
        loading.hidden = true;
        errorBox.hidden = false;
        errorBox.textContent = message;
    }

    function showMessage(message, isError = false) {
        messageBox.hidden = false;
        messageBox.textContent = message;
        messageBox.classList.toggle("error-message", isError);
        messageBox.classList.toggle("success-message", !isError);
    }

    function formatDuration(seconds) {
        const value = Number(seconds);

        if (!Number.isFinite(value) || value < 0) {
            return "Duration unavailable";
        }

        const minutes = Math.floor(value / 60);
        const remainingSeconds = Math.floor(value % 60);

        return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
    }

    function formatDate(value) {
        if (!value) {
            return "Not specified";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Not specified";
        }

        return date.toLocaleDateString(undefined, {
            day: "numeric",
            month: "long",
            year: "numeric"
        });
    }

    function normaliseStatus(status) {
        return String(status || "draft")
            .toLowerCase()
            .replace(/_/g, "-");
    }

    function renderTracks(songs) {
        const container = document.getElementById("tracksContainer");
        const emptyState = document.getElementById("emptyTracks");

        container.replaceChildren();

        document.getElementById("trackCount").textContent =
            `${songs.length} ${songs.length === 1 ? "track" : "tracks"}`;

        emptyState.hidden = songs.length !== 0;

        songs.forEach((song, index) => {
            const row = document.createElement("article");
            row.className = "track-row";

            const number = document.createElement("div");
            number.className = "track-number";
            number.textContent = song.trackNumber || index + 1;

            const info = document.createElement("div");
            info.className = "track-info";

            const title = document.createElement("h3");
            title.className = "track-title";
            title.textContent = song.title || "Untitled track";

            const subtitle = document.createElement("p");
            subtitle.className = "track-subtitle";

            const details = [
                song.genre || "Genre not specified",
                song.status || "Status unavailable"
            ];

            subtitle.textContent = details.join(" · ");

            const duration = document.createElement("span");
            duration.className = "track-duration";
            duration.textContent = formatDuration(song.duration);

            info.append(title, subtitle);
            row.append(number, info, duration);
            container.appendChild(row);
        });
    }

    function updateActions(release, songs) {
        const status = normaliseStatus(release.status);
        const isDraft = status === "draft";
        const isSingle = String(release.releaseType || "").toLowerCase() === "single";

        const addTrackButton = document.getElementById("addTrackButton");
        const submitButton = document.getElementById("submitReleaseButton");
        const actionDescription = document.getElementById("actionDescription");

        addTrackButton.href =
            `artist-add-song.html?releaseId=${encodeURIComponent(release._id)}`;

        addTrackButton.hidden = !isDraft || isSingle;

        submitButton.hidden = !isDraft;
        submitButton.disabled = songs.length === 0;

        if (!isDraft) {
            actionDescription.textContent =
                "This release has already left draft status. Its actions are no longer available here.";
        } else if (songs.length === 0) {
            actionDescription.textContent =
                "Add at least one track before submitting this release.";
        } else {
            actionDescription.textContent =
                "Review your release information and tracks before submitting.";
        }
    }

    async function loadRelease() {
        if (typeof protectPage === "function") {
            await protectPage();
        }

        if (!token) {
            showError("Your login session could not be found. Please log in again.");
            return;
        }

        if (!releaseId) {
            showError("No release ID was provided. Open this page from My Releases.");
            return;
        }

        try {
             
            const response = await fetch(
                `${API_BASE_URL}/api/releases/mine/${encodeURIComponent(releaseId)}`,
                {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                }
            );


           
                    const contentType =
                        response.headers.get("content-type") || "";

                    if (!contentType.includes("application/json")) {
                        throw new Error(
                            `Unable to load this release. Server returned HTTP ${response.status}.`
                        );
                    }

                    const data = await response.json();


            if (!response.ok) {
                throw new Error(
                    data.message || "Unable to load this release."
                );
            }

            const release = data.release;
            const songs = Array.isArray(data.songs) ? data.songs : [];

            if (!release) {
                throw new Error("The server did not return release details.");
            }

            document.getElementById("releaseTitle").textContent =
                release.title || "Untitled release";

            document.getElementById("releaseType").textContent =
                release.releaseType || "Release";

            const statusElement = document.getElementById("releaseStatus");
            statusElement.textContent = release.status || "draft";
            statusElement.className =
                `status-chip ${normaliseStatus(release.status)}`;

            document.getElementById("releaseDate").textContent =
                formatDate(release.releaseDate);

            document.getElementById("releaseDescription").textContent =
                `${songs.length} ${songs.length === 1 ? "track" : "tracks"} in this release.`;

            const cover = document.getElementById("releaseCover");
            const fallback = document.getElementById("coverFallback");

            if (release.coverImage) {
                cover.onload = () => {
                    cover.hidden = false;
                    fallback.hidden = true;
                };

                cover.onerror = () => {
                    cover.hidden = true;
                    fallback.hidden = false;
                };

                cover.src = release.coverImage;
            } else {
                cover.hidden = true;
                fallback.hidden = false;
            }

            renderTracks(songs);
            updateActions(release, songs);

            loading.hidden = true;
            errorBox.hidden = true;
            content.hidden = false;
        } catch (error) {
            showError(error.message || "An error occurred while loading the release.");
        }
    }

    document.getElementById("submitReleaseButton")
        .addEventListener("click", async () => {
            if (!releaseId || !token) {
                showMessage("Your session or release ID is missing.", true);
                return;
            }

            const button = document.getElementById("submitReleaseButton");

            button.disabled = true;
            button.textContent = "Submitting...";

            try {
               
                    const response = await fetch(
                        `${API_BASE_URL}/api/releases/${encodeURIComponent(releaseId)}/submit`,
                        {
                            method: "PATCH",
                            headers: {
                                "Authorization": `Bearer ${token}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                rightsConfirmed: true
                            })
                        }
                    );


                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(data.message || "Could not submit the release.");
                }

                showMessage(data.message || "Your release has been submitted for review.");

                // Refresh the release information after submission.
                await loadRelease();
            } catch (error) {
                showMessage(error.message || "Submission failed.", true);
            } finally {
                button.textContent = "Submit for Review";
                button.disabled = false;
            }
        });

    document.getElementById("artistLogoutButton")
        .addEventListener("click", () => {
            if (typeof logout === "function") {
                logout();
            } else {
                window.location.href = "login.html";
            }
        });

    await loadRelease();
});
