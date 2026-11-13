
const nodemailer = require("nodemailer");

// =====================================================
// ABS CUT — GMAIL SMTP EMAIL SERVICE
// =====================================================

let transporter = null;

function getTransporter() {
  const emailUser = process.env.EMAIL_USER?.trim();
  const emailPass = process.env.EMAIL_PASS?.trim();

  if (!emailUser || !emailPass) {
    throw new Error(
      "Missing EMAIL_USER or EMAIL_PASS. Check server/.env."
    );
  }

  // Initialize only after environment variables are available.
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });
  }

  return transporter;
}

// =====================================================
// SEND EMAIL
// =====================================================

async function sendEmail({ to, subject, text, html }) {
  if (!to) {
    throw new Error("Email recipient is required.");
  }

  try {
    const mailTransporter = getTransporter();

    const result = await mailTransporter.sendMail({
      from: `"ABS CUT" <${process.env.EMAIL_USER.trim()}>`,
      to,
      subject,
      text,
      html: html || undefined,
    });

    console.log(
      `ABS CUT email accepted: ${result.messageId}`
    );

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error("ABS CUT Gmail delivery failed:", {
      message: error.message,
      code: error.code,
      responseCode: error.responseCode,
    });

    throw error;
  }
}

// =====================================================
// VERIFY EMAIL CONNECTION
// =====================================================

async function verifyEmailConnection() {
  try {
    const mailTransporter = getTransporter();

    await mailTransporter.verify();

    console.log(
      "ABS CUT Gmail SMTP connection is ready."
    );

    return true;
  } catch (error) {
    console.error(
      "ABS CUT Gmail SMTP connection failed:",
      error.message
    );

    return false;
  }
}

module.exports = {
  sendEmail,
  verifyEmailConnection,
}

