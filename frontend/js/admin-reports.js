/* ========================================
   AUTH
======================================== */

if (!protectPage()) {

  throw new Error(
    "Authentication required."
  );

}


const moderationUser =
  getStoredUser();


if (
  !moderationUser ||
  ![
    "admin",
    "superadmin",
  ].includes(
    moderationUser.role
  )
) {

  alert(
    "Admin access required."
  );


  window.location.href =
    "home.html";


  throw new Error(
    "Admin access required."
  );

}


/* ========================================
   ELEMENTS
======================================== */

const reportsLoading =
  document.getElementById(
    "reportsLoading"
  );


const reportsError =
  document.getElementById(
    "reportsError"
  );


const reportsEmpty =
  document.getElementById(
    "reportsEmpty"
  );


const reportsList =
  document.getElementById(
    "reportsList"
  );


const totalReportsCount =
  document.getElementById(
    "totalReportsCount"
  );


const pendingReportsCount =
  document.getElementById(
    "pendingReportsCount"
  );


const reviewingReportsCount =
  document.getElementById(
    "reviewingReportsCount"
  );


const closedReportsCount =
  document.getElementById(
    "closedReportsCount"
  );


const refreshReportsButton =
  document.getElementById(
    "refreshReportsButton"
  );


const adminLogoutButton =
  document.getElementById(
    "adminLogoutButton"
  );


const reportFilterButtons =
  document.querySelectorAll(
    ".report-filter"
  );


/* ========================================
   MODERATION ELEMENTS
======================================== */

const moderationModal =
  document.getElementById(
    "moderationModal"
  );


const closeModerationButton =
  document.getElementById(
    "closeModerationButton"
  );


const moderationTargetText =
  document.getElementById(
    "moderationTargetText"
  );


const moderationReasonArea =
  document.getElementById(
    "moderationReasonArea"
  );


const moderationReason =
  document.getElementById(
    "moderationReason"
  );


const moderationMessage =
  document.getElementById(
    "moderationMessage"
  );


const submitModerationButton =
  document.getElementById(
    "submitModerationButton"
  );


const moderationOptions =
  document.querySelectorAll(
    ".moderation-option"
  );


/* ========================================
   STATE
======================================== */

let allReports = [];

let currentFilter =
  "all";


let selectedReport =
  null;


let selectedModerationAction =
  null;


/* ========================================
   START
======================================== */

loadReports();


/* ========================================
   LOAD REPORTS
======================================== */

async function loadReports() {

  const token =
    getToken();


  if (!token) {

    window.location.href =
      "login.html";

    return;

  }


  try {

    reportsLoading.style.display =
      "block";


    reportsError.style.display =
      "none";


    reportsEmpty.style.display =
      "none";


    reportsList.innerHTML =
      "";


    const response =
      await fetch(
        `${API_BASE_URL}/reports`,
        {
          headers: {

            Authorization:
              `Bearer ${token}`,

          },
        }
      );


    const data =
      await response.json();


    console.log(
      "Reports:",
      data
    );


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to load reports."
      );

    }


    allReports =
      Array.isArray(
        data.reports
      )
        ? data.reports
        : [];


    reportsLoading.style.display =
      "none";


    updateReportStats();

    renderReports();


  } catch (error) {

    console.error(
      "Reports error:",
      error
    );


    reportsLoading.style.display =
      "none";


    reportsError.style.display =
      "block";


    reportsError.textContent =
      error.message ||
      "Unable to load reports.";

  }

}


/* ========================================
   STATS
======================================== */

function updateReportStats() {

  const pending =
    allReports.filter(
      (report) =>
        report.status ===
        "pending"
    ).length;


  const reviewing =
    allReports.filter(
      (report) =>
        report.status ===
        "reviewing"
    ).length;


  const closed =
    allReports.filter(
      (report) =>
        [
          "resolved",
          "dismissed",
        ].includes(
          report.status
        )
    ).length;


  totalReportsCount.textContent =
    allReports.length;


  pendingReportsCount.textContent =
    pending;


  reviewingReportsCount.textContent =
    reviewing;


  closedReportsCount.textContent =
    closed;

}


/* ========================================
   RENDER REPORTS
======================================== */

function renderReports() {

  reportsList.innerHTML =
    "";


  let visibleReports =
    allReports;


  if (
    currentFilter !==
    "all"
  ) {

    visibleReports =
      allReports.filter(
        (report) =>
          report.status ===
          currentFilter
      );

  }


  if (
    visibleReports.length === 0
  ) {

    reportsEmpty.style.display =
      "block";

    return;

  }


  reportsEmpty.style.display =
    "none";


  visibleReports.forEach(
    (report) => {

      const reporter =
        report.reportedBy ||
        {};


      const reviewer =
        report.reviewedBy ||
        {};


      const status =
        report.status ||
        "pending";


      const targetType =
        report.targetType ||
        "content";


      const reason =
        formatReason(
          report.reason
        );


      const description =
        report.description ||
        "No additional description was provided.";


      const card =
        document.createElement(
          "article"
        );


      card.className =
        "report-card";


      card.innerHTML = `

        <div class="report-card-top">

          <div>

            <p class="report-target-type">
              ${escapeReportHTML(
                targetType
              )} report
            </p>


            <h2>
              ${escapeReportHTML(
                reason
              )}
            </h2>

          </div>


          <span
            class="report-status ${escapeReportHTML(
              status
            )}"
          >
            ${escapeReportHTML(
              status
            )}
          </span>

        </div>


        <div class="report-details-grid">

          <div class="report-detail">

            <small>
              Reported by
            </small>

            <strong>
              ${escapeReportHTML(
                reporter.fullName ||
                "Unknown user"
              )}
            </strong>

          </div>


          <div class="report-detail">

            <small>
              Reporter email
            </small>

            <strong>
              ${escapeReportHTML(
                reporter.email ||
                "Not available"
              )}
            </strong>

          </div>


          <div class="report-detail">

            <small>
              Content type
            </small>

            <strong>
              ${escapeReportHTML(
                formatTargetType(
                  targetType
                )
              )}
            </strong>

          </div>


          <div class="report-detail">

            <small>
              Content ID
            </small>

            <strong>
              ${escapeReportHTML(
                report.targetId ||
                "Not available"
              )}
            </strong>

          </div>


          <div class="report-detail">

            <small>
              Submitted
            </small>

            <strong>
              ${escapeReportHTML(
                formatReportDate(
                  report.createdAt
                )
              )}
            </strong>

          </div>


          <div class="report-detail">

            <small>
              Reviewed by
            </small>

            <strong>
              ${escapeReportHTML(
                reviewer.fullName ||
                "Not yet reviewed"
              )}
            </strong>

          </div>

        </div>


        <div class="report-description">

          <small>
            Description
          </small>

          <p>
            ${escapeReportHTML(
              description
            )}
          </p>

        </div>


        ${buildReportActions(
          report
        )}

      `;


      reportsList.appendChild(
        card
      );

    }
  );


  connectReportActions();

}


/* ========================================
   BUILD ACTION BUTTONS
======================================== */

function buildReportActions(
  report
) {

  const status =
    report.status;


  if (
    status === "resolved" ||
    status === "dismissed"
  ) {

    return "";

  }


  let buttons = `
    <button
      type="button"
      class="report-action moderate"
      data-action="moderate"
      data-report-id="${report._id}"
    >
      Moderate content
    </button>
  `;


  if (
    status === "pending"
  ) {

    buttons += `
      <button
        type="button"
        class="report-action review"
        data-action="review"
        data-report-id="${report._id}"
      >
        Start review
      </button>
    `;

  }


  buttons += `
    <button
      type="button"
      class="report-action dismiss"
      data-action="dismiss"
      data-report-id="${report._id}"
    >
      Dismiss
    </button>


    <button
      type="button"
      class="report-action resolve"
      data-action="resolve"
      data-report-id="${report._id}"
    >
      Resolve
    </button>
  `;


  return `
    <div class="report-actions">
      ${buttons}
    </div>
  `;

}


/* ========================================
   CONNECT ACTIONS
======================================== */

function connectReportActions() {

  const buttons =
    reportsList.querySelectorAll(
      ".report-action"
    );


  buttons.forEach(
    (button) => {

      button.addEventListener(
        "click",
        async () => {

          const reportId =
            button.dataset.reportId;


          const action =
            button.dataset.action;


          const report =
            allReports.find(
              (item) =>
                String(item._id) ===
                String(reportId)
            );


          if (!report) {

            return;

          }


          if (
            action === "review"
          ) {

            await markReportReviewing(
              reportId,
              button
            );

          }


          if (
            action === "resolve"
          ) {

            await closeReport(
              reportId,
              "resolved",
              button
            );

          }


          if (
            action === "dismiss"
          ) {

            await closeReport(
              reportId,
              "dismissed",
              button
            );

          }


          if (
            action === "moderate"
          ) {

            openModerationModal(
              report
            );

          }

        }
      );

    }
  );

}


/* ========================================
   START REVIEW
======================================== */

async function markReportReviewing(
  reportId,
  button
) {

  const confirmed =
    window.confirm(
      "Start reviewing this report?"
    );


  if (!confirmed) {

    return;

  }


  await runReportRequest(
    `${API_BASE_URL}/reports/${reportId}/review`,
    {
      method: "PATCH",
    },
    button,
    "Starting..."
  );

}


/* ========================================
   CLOSE REPORT
======================================== */

async function closeReport(
  reportId,
  decision,
  button
) {

  const message =
    decision === "resolved"
      ? "Mark this report as resolved?"
      : "Dismiss this report without action?";


  const confirmed =
    window.confirm(
      message
    );


  if (!confirmed) {

    return;

  }


  await runReportRequest(
    `${API_BASE_URL}/reports/${reportId}/close`,
    {
      method: "PATCH",

      body:
        JSON.stringify({
          decision,
        }),
    },
    button,
    decision === "resolved"
      ? "Resolving..."
      : "Dismissing..."
  );

}


/* ========================================
   GENERIC REPORT REQUEST
======================================== */

async function runReportRequest(
  url,
  options,
  button,
  loadingText
) {

  const token =
    getToken();


  if (!token) {

    return;

  }


  const originalText =
    button.textContent;


  try {

    button.disabled =
      true;


    button.textContent =
      loadingText;


    const response =
      await fetch(
        url,
        {
          ...options,

          headers: {

            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,

            ...(options.headers || {}),

          },
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to update report."
      );

    }


    alert(
      data.message ||
      "Report updated successfully."
    );


    await loadReports();


  } catch (error) {

    console.error(
      "Report action error:",
      error
    );


    alert(
      error.message ||
      "Unable to update report."
    );


    button.disabled =
      false;


    button.textContent =
      originalText;

  }

}


/* ========================================
   OPEN MODERATION
======================================== */

function openModerationModal(
  report
) {

  selectedReport =
    report;


  selectedModerationAction =
    null;


  moderationReason.value =
    "";


  moderationMessage.classList.remove(
    "active"
  );


  moderationMessage.textContent =
    "";


  moderationReasonArea.classList.remove(
    "active"
  );


  submitModerationButton.disabled =
    true;


  moderationOptions.forEach(
    (button) => {

      button.classList.remove(
        "selected"
      );

    }
  );


  moderationTargetText.textContent =
    `${formatTargetType(
      report.targetType
    )} • ${report.targetId}`;


  moderationModal.classList.add(
    "active"
  );

}


/* ========================================
   MODERATION OPTIONS
======================================== */

moderationOptions.forEach(
  (button) => {

    button.addEventListener(
      "click",
      () => {

        selectedModerationAction =
          button.dataset
            .moderationAction;


        moderationOptions.forEach(
          (item) => {

            item.classList.remove(
              "selected"
            );

          }
        );


        button.classList.add(
          "selected"
        );


        if (
          [
            "hidden",
            "takedown",
          ].includes(
            selectedModerationAction
          )
        ) {

          moderationReasonArea.classList.add(
            "active"
          );

        } else {

          moderationReasonArea.classList.remove(
            "active"
          );

        }


        submitModerationButton.disabled =
          false;

      }
    );

  }
);


/* ========================================
   APPLY MODERATION
======================================== */

submitModerationButton.addEventListener(
  "click",
  applyModeration
);


async function applyModeration() {

  if (
    !selectedReport ||
    !selectedModerationAction
  ) {

    return;

  }


  const reason =
    moderationReason
      .value
      .trim();


  if (
    [
      "hidden",
      "takedown",
    ].includes(
      selectedModerationAction
    ) &&
    !reason
  ) {

    showModerationError(
      "Please enter a moderation reason."
    );

    return;

  }


  const confirmed =
    window.confirm(
      selectedModerationAction ===
      "visible"
        ? "Keep or restore this content as visible?"
        : selectedModerationAction ===
          "hidden"
        ? "Hide this content from public view?"
        : "Take this content down?"
    );


  if (!confirmed) {

    return;

  }


  const token =
    getToken();


  try {

    submitModerationButton.disabled =
      true;


    submitModerationButton.textContent =
      "Applying...";


    const response =
      await fetch(
        `${API_BASE_URL}/reports/moderate/${selectedReport.targetType}/${selectedReport.targetId}`,
        {
          method: "PATCH",

          headers: {

            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`,

          },

          body:
            JSON.stringify({
              action:
                selectedModerationAction,

              reason:
                reason,
            }),
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.message ||
        "Unable to moderate content."
      );

    }


    alert(
      data.message ||
      "Moderation completed successfully."
    );


    closeModerationModal();


  } catch (error) {

    console.error(
      "Moderation error:",
      error
    );


    showModerationError(
      error.message ||
      "Unable to moderate content."
    );


  } finally {

    submitModerationButton.disabled =
      false;


    submitModerationButton.textContent =
      "Apply moderation";

  }

}


/* ========================================
   MODERATION ERROR
======================================== */

function showModerationError(
  message
) {

  moderationMessage.textContent =
    message;


  moderationMessage.classList.add(
    "active"
  );

}


/* ========================================
   CLOSE MODAL
======================================== */

closeModerationButton.addEventListener(
  "click",
  closeModerationModal
);


moderationModal.addEventListener(
  "click",
  (event) => {

    if (
      event.target ===
      moderationModal
    ) {

      closeModerationModal();

    }

  }
);


function closeModerationModal() {

  moderationModal.classList.remove(
    "active"
  );


  selectedReport =
    null;


  selectedModerationAction =
    null;

}


/* ========================================
   FILTERS
======================================== */

reportFilterButtons.forEach(
  (button) => {

    button.addEventListener(
      "click",
      () => {

        currentFilter =
          button.dataset.status;


        reportFilterButtons.forEach(
          (item) => {

            item.classList.remove(
              "active"
            );

          }
        );


        button.classList.add(
          "active"
        );


        renderReports();

      }
    );

  }
);


/* ========================================
   FORMAT REASON
======================================== */

function formatReason(
  reason
) {

  if (!reason) {

    return "Other";

  }


  return String(reason)
    .replaceAll(
      "_",
      " "
    )
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase()
    );

}


/* ========================================
   FORMAT TARGET
======================================== */

function formatTargetType(
  value
) {

  if (!value) {

    return "Content";

  }


  return String(value)
    .charAt(0)
    .toUpperCase() +
    String(value).slice(1);

}


/* ========================================
   DATE
======================================== */

function formatReportDate(
  value
) {

  if (!value) {

    return "Not available";

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return "Not available";

  }


  return date.toLocaleString(
    undefined,
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );

}


/* ========================================
   REFRESH
======================================== */

refreshReportsButton.addEventListener(
  "click",
  async () => {

    refreshReportsButton.disabled =
      true;


    refreshReportsButton.textContent =
      "Refreshing...";


    await loadReports();


    refreshReportsButton.disabled =
      false;


    refreshReportsButton.textContent =
      "↻ Refresh";

  }
);


/* ========================================
   LOGOUT
======================================== */

if (adminLogoutButton) {

  adminLogoutButton.addEventListener(
    "click",
    logout
  );

}


/* ========================================
   ESCAPE HTML
======================================== */

function escapeReportHTML(
  value
) {

  if (
    value === null ||
    value === undefined
  ) {

    return "";

  }


  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );

}