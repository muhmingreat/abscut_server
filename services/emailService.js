 const axios = require("axios");

// =====================================================
// ABS CUT — EMAIL SERVICE
// Resend API
// =====================================================

const RESEND_API_URL =
  "https://api.resend.com/emails";

// =====================================================
// CHECK EMAIL CONFIGURATION
// =====================================================

function isEmailConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY &&
    process.env.EMAIL_FROM
  );
}

// =====================================================
// SEND EMAIL
// =====================================================

async function sendEmail({
  to,
  subject,
  html,
  text = "",
}) {
  // -----------------------------------------------
  // CHECK RECIPIENT
  // -----------------------------------------------

  if (!to) {
    console.warn(
      "📧 Email skipped: recipient is missing."
    );

    return {
      success: false,
      skipped: true,
      reason: "missing-recipient",
    };
  }

  // -----------------------------------------------
  // CHECK ENVIRONMENT VARIABLES
  // -----------------------------------------------

  if (!isEmailConfigured()) {
    console.warn(
      "📧 Email skipped: RESEND_API_KEY or EMAIL_FROM is not configured."
    );

    return {
      success: false,
      skipped: true,
      reason: "not-configured"

    };
  }

  // -----------------------------------------------
  // SEND EMAIL
  // -----------------------------------------------

  try {
    const response =
      await axios.post(
        RESEND_API_URL,
        {
          from:
            process.env.EMAIL_FROM,

          to:
            Array.isArray(to)
              ? to
              : [to],

          subject,

          html,

          text,
        },
        {
          headers: {
            Authorization:
              `Bearer ${process.env.RESEND_API_KEY}`,

            "Content-Type":
              "application/json",
          },

          timeout:
            15000,
        }
      );

    console.log(
      "✅ EMAIL SENT:",
      response.data?.id ||
        "No message ID"
    );

    return {
      success: true,

      id:
        response.data?.id ||
        null,

      provider:
        "resend",
    };

  } catch (error) {
    const providerMessage =
      error.response?.data?.message ||
      error.response?.data?.name ||
      error.message;

    console.error(
      "❌ EMAIL SEND FAILED:",
      providerMessage
    );

    return {
      success: false,

      skipped: false,

      provider:
        "resend",

      error:
        providerMessage,
    };
  }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  sendEmail,
  isEmailConfigured,
};