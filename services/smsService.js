const axios = require("axios");

// =====================================================
// ABS CUT — SMS SERVICE
// Termii
// =====================================================

const DEFAULT_TERMII_BASE_URL =
  "https://api.ng.termii.com";

// =====================================================
// CHECK SMS CONFIGURATION
// =====================================================

function isSmsConfigured() {
  return Boolean(
    process.env.TERMII_API_KEY &&
    process.env.TERMII_SENDER_ID
  );
}

// =====================================================
// NORMALIZE NIGERIAN PHONE NUMBER
// =====================================================

function normalizeNigeriaPhone(
  phone
) {
  if (!phone) {
    return "";
  }

  const raw =
    String(phone)
      .trim()
      .replace(
        /[\s()-]/g,
        ""
      );

  // +2348012345678
  if (
    raw.startsWith("+234")
  ) {
    return raw.slice(1);
  }

  // 2348012345678
  if (
    raw.startsWith("234")
  ) {
    return raw;
  }

  // 08012345678
  if (
    raw.startsWith("0") &&
    raw.length === 11
  ) {
    return (
      "234" +
      raw.slice(1)
    );
  }

  return raw;
}

// =====================================================
// SEND SMS
// =====================================================

async function sendSms({
  to,
  message,
}) {
  // -----------------------------------------------
  // CHECK INPUT
  // -----------------------------------------------

  if (
    !to ||
    !message
  ) {
    console.warn(
      "📱 SMS skipped: recipient or message is missing."
    );

    return {
      success: false,

      skipped: true,

      reason:
        "missing-recipient-or-message",
    };
  }

  // -----------------------------------------------
  // CHECK CONFIGURATION
  // -----------------------------------------------

  if (!isSmsConfigured()) {
    console.warn(
      "📱 SMS skipped: TERMII_API_KEY or TERMII_SENDER_ID is not configured."
    );

    return {
      success: false,

      skipped: true,

      reason:
        "not-configured",
    };
  }

  // -----------------------------------------------
  // NORMALIZE PHONE
  // -----------------------------------------------

  const normalizedPhone =
    normalizeNigeriaPhone(
      to
    );

  if (!normalizedPhone) {
    console.warn(
      "📱 SMS skipped: invalid phone number."
    );

    return {
      success: false,

      skipped: true,

      reason:
        "invalid-phone",
    };
  }

  // -----------------------------------------------
  // GET BASE URL
  // -----------------------------------------------

  const baseUrl =
    (
      process.env.TERMII_BASE_URL ||
      DEFAULT_TERMII_BASE_URL
    ).replace(
      /\/$/,
      ""
    );

  // -----------------------------------------------
  // SEND SMS
  // -----------------------------------------------

  try {
    const response =
      await axios.post(
        `${baseUrl}/api/sms/send`,

        {
          to:
            normalizedPhone,

          from:
            process.env
              .TERMII_SENDER_ID,

          sms:
            message,

          type:
            "plain",

          channel:
            process.env
              .TERMII_CHANNEL ||
            "generic",

          api_key:
            process.env
              .TERMII_API_KEY,
        },

        {
          headers: {
            "Content-Type":
              "application/json",
          },

          timeout:
            15000,
        }
      );

    console.log(
      "✅ SMS SENT:",
      response.data?.message_id ||
        "No message ID"
    );

    return {
      success: true,

      id:
        response.data?.message_id ||
        null,

      provider:
        "termii",
    };

  } catch (error) {
    const providerMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;

    console.error(
      "❌ SMS SEND FAILED:",
      providerMessage
    );

    return {
      success: false,

      skipped: false,

      provider:
        "termii",

      error:
        providerMessage,
    };
  }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  sendSms,
  normalizeNigeriaPhone,
  isSmsConfigured,
};