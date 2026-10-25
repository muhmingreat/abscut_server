
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const PasswordReset = require("../models/PasswordReset");

const {
  hashResetCode,
  sendPasswordResetCode,
} = require("../services/passwordResetService");

const GENERIC_MESSAGE =
  "If an eligible account exists for that email, a recovery code will be sent.";

// =====================================================
// REQUEST PASSWORD RESET CODE
// POST /api/auth/forgot-password
// Supports local and verified social accounts.
// =====================================================

const forgotPassword = async (req, res) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // Find the existing account regardless of provider.
    // Do not create another account or change its provider.
    const user = await User.findOne({ email });

    // Keep the response generic for ineligible accounts.
    if (!user || !user.emailVerified) {
      return res.status(200).json({
        success: true,
        message: GENERIC_MESSAGE,
      });
    }

    const existing = await PasswordReset.findOne({ email });
    const now = Date.now();

    // Preserve the existing one-minute cooldown.
    if (
      existing?.lastSentAt &&
      now - new Date(existing.lastSentAt).getTime() < 60_000
    ) {
      return res.status(429).json({
        success: false,
        message: "Please wait one minute before requesting another code.",
      });
    }

    const code = crypto.randomInt(100000, 1000000).toString();

    await PasswordReset.findOneAndUpdate(
      { email },
      {
        $set: {
          codeHash: hashResetCode(code),
          expiresAt: new Date(now + 10 * 60 * 1000),
          attempts: 0,
          lastSentAt: new Date(now),
        },
      },
      {
        upsert: true,
        returnDocument: "after",
        runValidators: true,
      }
    );

    try {
      await sendPasswordResetCode({
        email,
        firstName: user.firstName,
        code,
      });
    } catch (emailError) {
      await PasswordReset.deleteOne({ email });

      console.error(
        "ABS CUT password-reset email error:",
        emailError.message
      );

      return res.status(503).json({
        success: false,
        message: "Unable to send the recovery email. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      message: GENERIC_MESSAGE,
    });
  } catch (error) {
    console.error("ABS CUT forgot-password error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process your request right now.",
    });
  }
};

// =====================================================
// VERIFY CODE AND SET/RESET PASSWORD
// POST /api/auth/reset-password
// Supports existing local and social accounts.
// =====================================================

const resetPassword = async (req, res) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const code =
      typeof req.body.code === "string"
        ? req.body.code.trim()
        : "";

    const newPassword =
      typeof req.body.newPassword === "string"
        ? req.body.newPassword
        : "";

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^\d{6}$/.test(code) ||
      newPassword.length < 8
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter a valid email, the six-digit recovery code, and a password of at least 8 characters.",
      });
    }

    const resetRecord = await PasswordReset.findOne({ email });

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: "The recovery code is invalid or expired.",
      });
    }

    if (
      !resetRecord.expiresAt ||
      resetRecord.expiresAt.getTime() <= Date.now()
    ) {
      await PasswordReset.deleteOne({ email });

      return res.status(400).json({
        success: false,
        message: "The recovery code is invalid or expired.",
      });
    }

    if (resetRecord.attempts >= 5) {
      await PasswordReset.deleteOne({ email });

      return res.status(429).json({
        success: false,
        message: "Too many attempts. Request a new recovery code.",
      });
    }

    const submittedHash = Buffer.from(hashResetCode(code), "hex");
    const storedHash = Buffer.from(resetRecord.codeHash, "hex");

    const validCode =
      submittedHash.length === storedHash.length &&
      submittedHash.length > 0 &&
      crypto.timingSafeEqual(submittedHash, storedHash);

    if (!validCode) {
      resetRecord.attempts += 1;
      await resetRecord.save();

      return res.status(400).json({
        success: false,
        message: "The recovery code is invalid or expired.",
      });
    }

    // The verified recovery code authorizes a password change
    // for this existing account, regardless of authProvider.
    const user = await User.findOne({
      email,
      emailVerified: true,
    });

    if (!user) {
      await PasswordReset.deleteOne({ email });

      return res.status(400).json({
        success: false,
        message: "Unable to reset this account's password.",
      });
    }

    // Keep the same provider, Google ID, and other account data.
    // Only add/update the password.
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    await PasswordReset.deleteOne({ email });

    return res.status(200).json({
      success: true,
      message: "Password set successfully. Please log in.",
    });
  } catch (error) {
    console.error("ABS CUT reset-password error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to reset your password right now.",
    });
  }
};

module.exports = {
  forgotPassword,
  resetPassword,
};
