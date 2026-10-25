
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const { issueEmailOtp } = require("../services/emailOtpService");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// =====================================================
// CREATE ABS CUT JWT
// =====================================================

// const createAuthToken = (user) => {
//   return jwt.sign(
//     {
//       id: user._id,
//       role: user.role,
//     },
//     process.env.JWT_SECRET,
//     { expiresIn: "7d" },
//   );
// };
const createAuthToken = (user) => {
  return jwt.sign(
    {
      userId: user._id.toString(),
      id: user._id.toString(),
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
};

// =====================================================
// SAFE USER RESPONSE
// =====================================================

const getSafeUser = (user) => ({
  id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  authProvider: user.authProvider,
  avatar: user.avatar,
  emailVerified: user.emailVerified,
});

// =====================================================
// GOOGLE LOGIN / SIGNUP
// POST /api/auth/google
// =====================================================

const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: "Google credential is required.",
      });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        success: false,
        message: "Google authentication is not configured.",
      });
    }

    // Verify the Google ID token.
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({
        success: false,
        message: "Invalid Google account information.",
      });
    }

    const {
      sub,
      email,
      email_verified,
      given_name,
      family_name,
      picture,
    } = payload;

    if (!sub || !email || !email_verified) {
      return res.status(401).json({
        success: false,
        message: "A verified Google email is required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find an account already linked to this Google identity.
    let user = await User.findOne({
      authProvider: "google",
      authProviderId: sub,
    });

    if (user) {
      // Existing Google account must pass ABS CUT verification.
      if (!user.emailVerified) {
        await issueEmailOtp(user);

        return res.status(200).json({
          success: true,
          requiresEmailVerification: true,
          email: user.email,
          message: "Please verify your email to continue.",
        });
      }

      if (picture) user.avatar = picture;
      if (given_name) user.firstName = given_name;
      if (family_name) user.lastName = family_name;

      await user.save();

      return res.status(200).json({
        success: true,
        message: "Google login successful.",
        token: createAuthToken(user),
        user: getSafeUser(user),
      });
    }

    // Do not silently link a different account by email.
    const existingEmailUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingEmailUser) {
      if (!existingEmailUser.emailVerified) {
        await issueEmailOtp(existingEmailUser);

        return res.status(200).json({
          success: true,
          requiresEmailVerification: true,
          email: existingEmailUser.email,
          message:
            "Verify your email, then sign in using your existing sign-in method.",
        });
      }

      return res.status(409).json({
        success: false,
        message:
          "An account already exists with this email. Please log in using your existing sign-in method.",
      });
    }

    // Create a new, unverified Google account.
    user = await User.create({
      firstName: given_name || "ABS CUT",
      lastName: family_name || "Customer",
      email: normalizedEmail,
      phone: "",
      role: "customer",
      authProvider: "google",
      authProviderId: sub,
      avatar: picture || "",
      emailVerified: false,
    });

    await issueEmailOtp(user);

    // Do not return a JWT until the email has been verified.
    return res.status(201).json({
      success: true,
      requiresEmailVerification: true,
      email: user.email,
      message: "We sent a verification code to your email.",
    });
  } catch (error) {
    console.error(
      "ABS CUT Google authentication error:",
      error.response?.data || error.message,
    );

    if (error.statusCode === 429) {
      return res.status(429).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "An account already exists with this email. Please use your existing sign-in method.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Unable to authenticate with Google.",
    });
  }
};

// =====================================================
// FACEBOOK LOGIN / SIGNUP
// POST /api/auth/facebook
// =====================================================

const facebookLogin = async (req, res) => {
  try {
    const {
      accessToken,
      email: submittedEmail,
    } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: "Facebook access token is required.",
      });
    }

    if (
      !process.env.FACEBOOK_APP_ID ||
      !process.env.FACEBOOK_APP_SECRET
    ) {
      return res.status(500).json({
        success: false,
        message: "Facebook authentication is not configured.",
      });
    }

    // Verify the Facebook access token.
    const appAccessToken =
      `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;

    const debugResponse = await axios.get(
      "https://graph.facebook.com/v26.0/debug_token",
      {
        params: {
          input_token: accessToken,
          access_token: appAccessToken,
        },
      },
    );

    const tokenData = debugResponse.data?.data;

    if (!tokenData || !tokenData.is_valid) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired Facebook login.",
      });
    }

    if (
      String(tokenData.app_id) !==
      String(process.env.FACEBOOK_APP_ID)
    ) {
      return res.status(401).json({
        success: false,
        message: "Facebook token does not belong to ABS CUT.",
      });
    }

    if (!tokenData.user_id) {
      return res.status(401).json({
        success: false,
        message: "Facebook user ID could not be verified.",
      });
    }

    // Generate Facebook appsecret_proof.
    const appSecretProof = crypto
      .createHmac("sha256", process.env.FACEBOOK_APP_SECRET)
      .update(accessToken)
      .digest("hex");

    // Retrieve the verified Facebook profile.
    const profileResponse = await axios.get(
      "https://graph.facebook.com/v26.0/me",
      {
        params: {
          fields: "id,first_name,last_name,name,email,picture",
          access_token: accessToken,
          appsecret_proof: appSecretProof,
        },
      },
    );

    const profile = profileResponse.data;

    if (!profile?.id) {
      return res.status(401).json({
        success: false,
        message: "Unable to retrieve your Facebook account information.",
      });
    }

    if (String(profile.id) !== String(tokenData.user_id)) {
      return res.status(401).json({
        success: false,
        message: "Facebook identity verification failed.",
      });
    }

    // Facebook may not provide an email address.
    const facebookEmail =
      typeof profile.email === "string"
        ? profile.email.trim().toLowerCase()
        : "";

    const fallbackEmail =
      typeof submittedEmail === "string"
        ? submittedEmail.trim().toLowerCase()
        : "";

    const email = facebookEmail || fallbackEmail;

    if (!email) {
      return res.status(200).json({
        success: true,
        requiresEmail: true,
        message:
          "Facebook did not share an email address. Please enter an email to continue.",
      });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    // Find an account already linked to this Facebook identity.
    let user = await User.findOne({
      authProvider: "facebook",
      authProviderId: String(profile.id),
    });

    if (user) {
      if (!user.emailVerified) {
        await issueEmailOtp(user);

        return res.status(200).json({
          success: true,
          requiresEmailVerification: true,
          email: user.email,
          message: "Please verify your email to continue.",
        });
      }

      if (profile.picture?.data?.url) {
        user.avatar = profile.picture.data.url;
      }

      if (profile.first_name) {
        user.firstName = profile.first_name;
      }

      if (profile.last_name) {
        user.lastName = profile.last_name;
      }

      await user.save();

      return res.status(200).json({
        success: true,
        message: "Facebook login successful.",
        token: createAuthToken(user),
        user: getSafeUser(user),
      });
    }

    // Do not silently link a different account by email.
    const existingEmailUser = await User.findOne({ email });

    if (existingEmailUser) {
      if (!existingEmailUser.emailVerified) {
        await issueEmailOtp(existingEmailUser);

        return res.status(200).json({
          success: true,
          requiresEmailVerification: true,
          email: existingEmailUser.email,
          message:
            "Verify your email, then sign in using your existing sign-in method.",
        });
      }

      return res.status(409).json({
        success: false,
        message:
          "An account already exists with this email. Please log in using your existing sign-in method.",
      });
    }

    // Create a new, unverified Facebook account.
    user = await User.create({
      firstName: profile.first_name || "ABS CUT",
      lastName: profile.last_name || "Customer",
      email,
      phone: "",
      role: "customer",
      authProvider: "facebook",
      authProviderId: String(profile.id),
      avatar: profile.picture?.data?.url || "",
      emailVerified: false,
    });

    await issueEmailOtp(user);

    // Do not return a JWT until the email has been verified.
    return res.status(201).json({
      success: true,
      requiresEmailVerification: true,
      email: user.email,
      message: "We sent a verification code to your email.",
    });
  } catch (error) {
    console.error(
      "ABS CUT Facebook authentication error:",
      error.response?.data || error.message,
    );

    if (error.statusCode === 429) {
      return res.status(429).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "An account already exists with this email. Please use your existing sign-in method.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Unable to authenticate with Facebook.",
    });
  }
};

module.exports = {
  googleLogin,
  facebookLogin,
};
