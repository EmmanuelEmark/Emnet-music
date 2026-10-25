const nodemailer = require("nodemailer");

const sendEmail = async ({
  to,
  subject,
  html,
}) => {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure:
      process.env.EMAIL_SECURE === "true",

    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const info = await transporter.sendMail({
    from: `"EmnetMusic" <${process.env.EMAIL_FROM}>`,
    to,
    subject,
    html,
  });

  return info;
};

module.exports = sendEmail;