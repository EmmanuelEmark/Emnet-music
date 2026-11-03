
const cron = require("node-cron");

const User = require("../models/User");
const EmailDelivery = require("../models/EmailDelivery");
const sendEmail = require("../utils/sendEmail");
const {
  createUnsubscribeUrl,
} = require("../utils/unsubscribe");

const TIMEZONE = "Africa/Lagos";

// ========================================
// GET TODAY'S DATE IN NIGERIAN TIME
// ========================================

function getToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

// ========================================
// PREVENT HTML INJECTION
// ========================================

function escapeHtml(value) {
  return String(value || "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]
  );
}

// ========================================
// GET USER'S FIRST NAME
// ========================================

function getFirstName(user) {
  const firstName = String(user.fullName || "")
    .trim()
    .split(/\s+/)[0];

  return escapeHtml(firstName || "Music Lover");
}

// ========================================
// EMAIL FOOTER WITH UNSUBSCRIBE LINK
// ========================================

function emailFooter(unsubscribeUrl) {
  return `
    <div style="
      margin-top:32px;
      padding-top:20px;
      border-top:1px solid #303a30;
      text-align:center;
    ">
      <p style="
        color:#aab5aa;
        font-size:12px;
        line-height:1.7;
      ">
        You received this email because
        you have an Emnet Music account
        and this greeting preference is enabled.
      </p>

      <p style="font-size:12px;">
        <a
          href="${escapeHtml(unsubscribeUrl)}"
          style="
            color:#36d978;
            text-decoration:underline;
          "
        >
          Unsubscribe from these greetings
        </a>
      </p>

      <p style="
        color:#aab5aa;
        font-size:12px;
      ">
        Emnet Music — Excitement Starts Here.
      </p>
    </div>
  `;
}

// ========================================
// RECORD AND SEND EMAIL
// ========================================

async function deliverGreeting({
  user,
  type,
  occasionKey,
  subject,
  html,
}) {
  let delivery;

  try {
    delivery = await EmailDelivery.create({
      userId: user._id,
      type,
      occasionKey,
      status: "processing",
    });
  } catch (error) {
    if (error.code === 11000) {
      // Prevent duplicate delivery attempts.
      return;
    }

    throw error;
  }

  try {
    await sendEmail({
      to: user.email,
      subject,
      html,
    });

    delivery.status = "sent";
    delivery.sentAt = new Date();

    await delivery.save();

    console.log(
      `${type} greeting sent to ${user.email}`
    );
  } catch (error) {
    delivery.status = "failed";
    delivery.errorMessage = error.message;

    await delivery.save();

    console.error(
      `Greeting email failed for ${user.email}:`,
      error.message
    );
  }
}

// ========================================
// BIRTHDAY GREETINGS
// ========================================

async function sendBirthdayGreetings() {
  const { year, month, day } = getToday();

  const users = User.find({
    emailVerified: true,
    accountStatus: "active",

    role: {
      $in: ["listener", "artist", "distributor"],
    },

    "emailPreferences.birthdayGreetings": {
      $ne: false,
    },

    $expr: {
      $and: [
        {
          $eq: [
            {
              $month: {
                date: "$dateOfBirth",
                timezone: TIMEZONE,
              },
            },
            month,
          ],
        },
        {
          $eq: [
            {
              $dayOfMonth: {
                date: "$dateOfBirth",
                timezone: TIMEZONE,
              },
            },
            day,
          ],
        },
      ],
    },
  }).cursor();

  for await (const user of users) {
    const name = getFirstName(user);

    const unsubscribeUrl = createUnsubscribeUrl(
      user._id,
      "birthday"
    );

    const html = `
      <div style="
        font-family:Arial,sans-serif;
        max-width:600px;
        margin:auto;
        padding:32px;
        background:#101510;
        color:#ffffff;
        border-radius:12px;
        line-height:1.7;
      ">
        <h2 style="color:#36d978;">
          Happy Birthday, ${name}!
        </h2>

        <p>
          Everyone at Emnet Music wishes you
          a wonderful birthday filled with
          happiness, unforgettable moments
          and your favourite songs.
        </p>

        <p>
          May this new chapter bring you
          success, joy and beautiful memories.
        </p>

        <p style="color:#36d978;">
          Keep the music playing!
        </p>

        <p>
          With love,<br>
          The Emnet Music Team
        </p>

        ${emailFooter(unsubscribeUrl)}
      </div>
    `;

    await deliverGreeting({
      user,
      type: "birthday",
      occasionKey: `birthday-${year}`,
      subject: "Happy Birthday from Emnet Music!",
      html,
    });
  }
}

// ========================================
// NEW-MONTH GREETINGS
// ========================================

async function sendNewMonthGreetings() {
  const { year, month } = getToday();

  const monthName = new Intl.DateTimeFormat(
    "en-GB",
    { month: "long" }
  ).format(
    new Date(Date.UTC(year, month - 1, 1))
  );

  const users = User.find({
    emailVerified: true,
    accountStatus: "active",

    role: {
      $in: ["listener", "artist", "distributor"],
    },

    "emailPreferences.monthlyGreetings": true,
  }).cursor();

  for await (const user of users) {
    const name = getFirstName(user);

    const unsubscribeUrl = createUnsubscribeUrl(
      user._id,
      "new_month"
    );

    const html = `
      <div style="
        font-family:Arial,sans-serif;
        max-width:600px;
        margin:auto;
        padding:32px;
        background:#101510;
        color:#ffffff;
        border-radius:12px;
        line-height:1.7;
      ">
        <h2 style="color:#36d978;">
          Happy New Month, ${name}!
        </h2>

        <p>
          Welcome to ${monthName}!
        </p>

        <p>
          We wish you a month filled with
          happiness, exciting opportunities
          and incredible music.
        </p>

        <p>
          Thank you for being part of the
          Emnet Music community.
        </p>

        <p style="color:#36d978;">
          Your next favourite song awaits!
        </p>

        <p>
          With love,<br>
          The Emnet Music Team
        </p>

        ${emailFooter(unsubscribeUrl)}
      </div>
    `;

    await deliverGreeting({
      user,
      type: "new_month",
      occasionKey: `month-${year}-${month}`,
      subject:
        `Happy New Month! Welcome to ${monthName}`,
      html,
    });
  }
}

// ========================================
// START AUTOMATIC SCHEDULES
// ========================================

let greetingJobsStarted = false;

function startGreetingJobs() {
  if (greetingJobsStarted) {
    return;
  }

  if (!process.env.UNSUBSCRIBE_SECRET) {
    throw new Error(
      "UNSUBSCRIBE_SECRET is missing from .env"
    );
  }

  // Every day at 9:00 AM Nigerian time.
  cron.schedule(
    "0 9 * * *",
    () => {
      sendBirthdayGreetings().catch(console.error);
    },
    { timezone: TIMEZONE }
  );

  // First day of every month at 9:15 AM.
  cron.schedule(
    "15 9 1 * *",
    () => {
      sendNewMonthGreetings().catch(console.error);
    },
    { timezone: TIMEZONE }
  );

  greetingJobsStarted = true;

  console.log(
    "Greeting email schedules registered."
  );
}

module.exports = {
  startGreetingJobs,
};
