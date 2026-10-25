
const EmailVerification = require("../models/EmailVerification");

const {
  generateOtp,
  hashOtp,
  sendVerificationOtp,
} = require("./emailVerificationService");

async function issueEmailOtp(user, { enforceCooldown = true } = {}) {
  const email = user.email.toLowerCase().trim();
  const now = Date.now();

  const existing = await EmailVerification.findOne({ email });

  // Enforce the resend cooldown.
  // if (
  //   enforceCooldown &&
  //   existing?.lastSentAt &&
  //   now - new Date(existing.lastSentAt).getTime() < 60_000
  // ) {
  //   const error = new Error(
  //     "Please wait one minute before requesting another code."
  //   );

  //   error.statusCode = 429;
  //   throw error;
  // }
  // =====================================================
// RESEND COOLDOWN CHECK
// =====================================================

const lastSentTime = existing?.lastSentAt
  ? new Date(existing.lastSentAt).getTime()
  : 0;

const elapsedMs = now - lastSentTime;

console.log("ABS CUT OTP COOLDOWN CHECK:", {
  email,
  verificationRecordFound: Boolean(existing),
  lastSentAt: existing?.lastSentAt ?? null,
  elapsedMs: existing?.lastSentAt ? elapsedMs : null,
  cooldownActive:
    enforceCooldown &&
    Number.isFinite(lastSentTime) &&
    lastSentTime > 0 &&
    elapsedMs >= 0 &&
    elapsedMs < 60_000,
});

if (
  enforceCooldown &&
  Number.isFinite(lastSentTime) &&
  lastSentTime > 0 &&
  elapsedMs >= 0 &&
  elapsedMs < 60_000
) {
  const error = new Error(
    "Please wait one minute before requesting another code."
  );

  error.statusCode = 429;
  throw error;
}

  const otp = generateOtp();
  const codeHash = hashOtp(otp);

  // Store the OTP before sending, so a delivered code can be verified.
  await EmailVerification.findOneAndUpdate(
    { email },
    {
      $set: {
        codeHash,
        expiresAt: new Date(now + 10 * 60 * 1000),
        attempts: 0,
        lastSentAt: new Date(now),
      },
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
    }
  );

  try {
    await sendVerificationOtp({
      email,
      firstName: user.firstName,
      otp,
    });
  } catch (error) {
    // Log diagnostic details, never the OTP or email credentials.
    console.error("ABS CUT EMAIL DELIVERY FAILED:", {
      message: error.message,
      code: error.code,
      responseCode: error.responseCode,
      command: error.command,
    });

    // Remove the cooldown only if this is still the failed attempt.
    // This avoids clearing a newer request's cooldown.
    try {
      await EmailVerification.updateOne(
        { email, codeHash },
        { $unset: { lastSentAt: 1 } }
      );
    } catch (cleanupError) {
      console.error(
        "ABS CUT OTP COOLDOWN CLEANUP FAILED:",
        cleanupError.message
      );
    }

    const sendError = new Error(
      "We could not send your verification email. Please check your email configuration and try again."
    );

    sendError.statusCode = 502;
    throw sendError;
  }

  console.log("ABS CUT verification email accepted for delivery.");

  return { success: true };
}

module.exports = { issueEmailOtp };

