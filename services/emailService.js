
const nodemailer = require("nodemailer");

// =====================================================
// ABS CUT — GMAIL SMTP EMAIL SERVICE
// =====================================================

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// =====================================================
// SEND EMAIL
// =====================================================

async function sendEmail({ to, subject, text, html }) {
  if (!to) {
    throw new Error("Email recipient is required.");
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error(
      "Missing EMAIL_USER or EMAIL_PASS environment variables."
    );
  }

  try {
    const result = await transporter.sendMail({
      from: `"ABS CUT" <${process.env.EMAIL_USER}>`,
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
    await transporter.verify();

    console.log("ABS CUT Gmail SMTP connection is ready.");

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
};

