
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/User");
const EmailVerification = require("../models/EmailVerification");

const { notifyWelcome } = require("../services/notificationService");
const { issueEmailOtp } = require("../services/emailOtpService");
const { hashOtp } = require("../services/emailVerificationService");


const registerUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      username,
      email,
      phone,
      password,
      avatar,
    } = req.body;

    if (
      !firstName?.trim() ||
      !lastName?.trim() ||
      !email?.trim() ||
      !phone?.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all required fields.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Your password must contain at least 8 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    let user = await User.findOne({
      email: normalizedEmail,
    });

    // =====================================================
    // EXISTING ACCOUNT
    // =====================================================

    if (user) {
      if (!user.emailVerified) {
        // Update optional profile details on an unverified account.
        if (typeof username === "string") {
          user.username = username.trim()
            ? username.trim().toLowerCase()
            : undefined;
        }

        if (typeof avatar === "string") {
          user.avatar = avatar.trim();
        }

        await user.save();
        await issueEmailOtp(user);

        return res.status(200).json({
          success: true,
          requiresEmailVerification: true,
          email: user.email,
          message: "Please verify your email to continue.",
        });
      }

      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    // =====================================================
    // CREATE NEW ACCOUNT
    // =====================================================

    const hashedPassword = await bcrypt.hash(password, 12);

    const userData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      password: hashedPassword,

      username:
        typeof username === "string" && username.trim()
          ? username.trim().toLowerCase()
          : undefined,

      avatar:
        typeof avatar === "string"
          ? avatar.trim()
          : "",

      role: "customer",
      emailVerified: false,
    };

    try {
      user = await User.create(userData);
    } catch (createError) {
      // Retry with an automatically generated username
      // if a simultaneous registration causes a collision.
      if (
        createError.code === 11000 &&
        createError.keyPattern?.username
      ) {
        user = await User.create({
          ...userData,
          username: undefined,
        });
      } else {
        throw createError;
      }
    }

    // Send OTP before allowing login.
    await issueEmailOtp(user);

    return res.status(201).json({
      success: true,
      requiresEmailVerification: true,
      email: user.email,
      message: "We sent a verification code to your email.",
    });
  } catch (error) {
    console.error("ABS CUT registration error:", error);

    if (error.statusCode === 429) {
      return res.status(429).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === 11000) {
      const duplicateField = Object.keys(
        error.keyPattern || {},
      )[0];

      return res.status(409).json({
        success: false,
        message:
          duplicateField === "username"
            ? "This username is already taken. Please choose another."
            : "An account with this email already exists.",
      })
    }

    return res.status(500).json({
      success: false,
      message: "Unable to register your account right now.",
    });
  }
};


const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please enter your email and password.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });


    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        message: "Incorrect email or password. If you registered socially, use that sign-in method.",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect email or password.",
      });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        success: false,
        requiresEmailVerification: true,
        email: user.email,
        message: "Please verify your email before logging in.",
      });
    }
// Generate a username for older accounts that do not have one.
if (!user.username) {
  await user.save();
}
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar || "",
        role: user.role,
      },
    });
  } catch (error) {
    console.error("ABS CUT login error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while logging in.",
    });
  }
};

// =====================================================
// VERIFY EMAIL OTP
// POST /api/auth/verify-email
// Accepts { email, otp } or { email, code }
// =====================================================

const verifyEmailOtp = async (req, res) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const code =
      typeof req.body.otp === "string"
        ? req.body.otp.trim()
        : typeof req.body.code === "string"
          ? req.body.code.trim()
          : "";

    if (!email || !/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: "Enter your email and six-digit verification code.",
      });
    }

    const record = await EmailVerification.findOne({ email });

    if (!record || record.expiresAt.getTime() <= Date.now()) {
      return res.status(400).json({
        success: false,
        message: "The verification code is invalid or expired.",
      });
    }

    if (record.attempts >= 5) {
      await EmailVerification.deleteOne({ email });

      return res.status(429).json({
        success: false,
        message: "Too many attempts. Please request a new code.",
      });
    }

    const submittedHash = Buffer.from(hashOtp(code), "hex");
    const storedHash = Buffer.from(record.codeHash, "hex");

    const validCode =
      submittedHash.length === storedHash.length &&
      crypto.timingSafeEqual(submittedHash, storedHash);

    if (!validCode) {
      record.attempts += 1;
      await record.save();

      return res.status(400).json({
        success: false,
        message: "The verification code is incorrect.",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      await EmailVerification.deleteOne({ email });

      return res.status(400).json({
        success: false,
        message: "Unable to verify this account.",
      });
    }

    if (!user.emailVerified) {
      user.emailVerified = true;
      await user.save();

      // Send the welcome notification only after verification.
      Promise.resolve()
        .then(() =>
          notifyWelcome({
            name: `${user.firstName} ${user.lastName}`,
            email: user.email,
            phone: user.phone,
          }),
        )
        .catch((error) => {
          console.error(
            "ABS CUT welcome notification error:",
            error.message,
          );
        });
    }

    await EmailVerification.deleteOne({ email });

    return res.status(200).json({
      success: true,
      message: "Email verified successfully. Please log in.",
    });
  } catch (error) {
    console.error("ABS CUT email verification error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify your email right now.",
    });
  }
};

// =====================================================
// RESEND EMAIL OTP
// POST /api/auth/resend-otp
// =====================================================

const resendEmailOtp = async (req, res) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    const user = await User.findOne({ email });

    if (!user || user.emailVerified) {
      return res.status(200).json({
        success: true,
        message: "If your account needs verification, a code will be sent.",
      });
    }

    await issueEmailOtp(user);

    return res.status(200).json({
      success: true,
      requiresEmailVerification: true,
      email: user.email,
      message: "A new verification code has been sent to your email.",
    });
  } catch (error) {
    if (error.statusCode === 429) {
      return res.status(429).json({
        success: false,
        message: error.message,
      });
    }

    console.error("ABS CUT resend OTP error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to resend the verification code.",
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  registerUser,
  loginUser,
  verifyEmailOtp,
  resendEmailOtp,
};


