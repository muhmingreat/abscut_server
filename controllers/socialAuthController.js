const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* =====================================================
   CREATE ABS CUT JWT
===================================================== */

const createAuthToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );
};

/* =====================================================
   SAFE USER RESPONSE
===================================================== */

const getSafeUser = (user) => {
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    authProvider: user.authProvider,
    avatar: user.avatar,
    emailVerified: user.emailVerified,
  };
};

/* =====================================================
   GOOGLE LOGIN
===================================================== */

const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({
        message: "Google credential is required.",
      });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        message: "Google authentication is not configured.",
      });
    }

    /* -------------------------------------------------
       VERIFY GOOGLE ID TOKEN
    ------------------------------------------------- */

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({
        message: "Invalid Google account information.",
      });
    }

    const { sub, email, email_verified, given_name, family_name, picture } =
      payload;

    if (!sub) {
      return res.status(401).json({
        message: "Google account ID is missing.",
      });
    }

    if (!email || !email_verified) {
      return res.status(401).json({
        message: "Your Google email must be verified before you can continue.",
      });
    }

    /* -------------------------------------------------
       FIND USER BY GOOGLE PROVIDER ID
    ------------------------------------------------- */

    let user = await User.findOne({
      authProvider: "google",
      authProviderId: sub,
    });

    /* -------------------------------------------------
       FALLBACK: FIND EXISTING USER BY EMAIL
    ------------------------------------------------- */

    if (!user) {
      user = await User.findOne({
        email: email.toLowerCase(),
      });
    }

    /* -------------------------------------------------
       CREATE OR UPDATE USER
    ------------------------------------------------- */

    if (user) {
      user.authProvider = "google";
      user.authProviderId = sub;
      user.emailVerified = true;

      if (picture) {
        user.avatar = picture;
      }

      if (given_name) {
        user.firstName = given_name;
      }

      if (family_name) {
        user.lastName = family_name;
      }

      await user.save();
    } else {
      user = await User.create({
        firstName: given_name || "ABS CUT",
        lastName: family_name || "Customer",
        email: email.toLowerCase(),
        phone: "",
        password: undefined,
        role: "customer",
        authProvider: "google",
        authProviderId: sub,
        avatar: picture || "",
        emailVerified: true,
      });
    }

    /* -------------------------------------------------
       CREATE ABS CUT TOKEN
    ------------------------------------------------- */

    const token = createAuthToken(user);

    return res.status(200).json({
      success: true,
      message: "Google login successful.",
      token,
      user: getSafeUser(user),
    });
  } catch (error) {
    console.error(
      "ABS CUT Google authentication error:",
      error.response?.data || error.message,
    );

    return res.status(401).json({
      message:
        error.response?.data?.error?.message ||
        "Unable to authenticate with Google.",
    });
  }
};

/* =====================================================
   FACEBOOK LOGIN
===================================================== */

const facebookLogin = async (req, res) => {
  try {
    
    const {
  accessToken,
  email: submittedEmail,
} = req.body;

    if (!accessToken) {
      return res.status(400).json({
        message: "Facebook access token is required.",
      });
    }

    if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
      return res.status(500).json({
        message: "Facebook authentication is not configured on the server.",
      });
    }

    /* -------------------------------------------------
       STEP 1
       VERIFY FACEBOOK ACCESS TOKEN
    ------------------------------------------------- */

    const appAccessToken = `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`;

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
        message: "Invalid or expired Facebook login.",
      });
    }

    /* -------------------------------------------------
       MAKE SURE TOKEN BELONGS TO ABS CUT APP
    ------------------------------------------------- */

    if (String(tokenData.app_id) !== String(process.env.FACEBOOK_APP_ID)) {
      return res.status(401).json({
        message: "Facebook token does not belong to ABS CUT.",
      });
    }

    if (!tokenData.user_id) {
      return res.status(401).json({
        message: "Facebook user ID could not be verified.",
      });
    }

    /* -------------------------------------------------
       CREATE APP SECRET PROOF
    ------------------------------------------------- */

    const appSecretProof = crypto
      .createHmac("sha256", process.env.FACEBOOK_APP_SECRET)
      .update(accessToken)
      .digest("hex");

    /* -------------------------------------------------
       STEP 2
       GET FACEBOOK USER PROFILE
    ------------------------------------------------- */

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
        message: "Unable to retrieve your Facebook account information."
      });
    }

    /* -------------------------------------------------
       MAKE SURE THE USER ID MATCHES THE VERIFIED TOKEN
    ------------------------------------------------- */

    if (String(profile.id) !== String(tokenData.user_id)) {
      return res.status(401).json({
        message: "Facebook identity verification failed.",
      });
    }

    /* -------------------------------------------------
       FACEBOOK EMAIL
    ------------------------------------------------- */

    // const email = profile.email?.trim().toLowerCase();

    /* =====================================================
   FACEBOOK EMAIL HANDLING
===================================================== */

const facebookEmail =
  profile.email?.trim().toLowerCase() || "";

const fallbackEmail =
  typeof submittedEmail === "string"
    ? submittedEmail.trim().toLowerCase()
    : "";

const email = facebookEmail || fallbackEmail;

/*
  Facebook may not return an email.
  Ask the frontend to collect one instead of rejecting
  the Facebook login immediately.
*/

if (!email) {
  return res.status(200).json({
    requiresEmail: true,
    message:
      "Facebook did not share an email address. Please enter an email to continue.",
  });
}

const emailPattern =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

if (!emailPattern.test(email)) {
  return res.status(400).json({
    message: "Please provide a valid email address.",
  });
}

  

    /* -------------------------------------------------
       FIND USER BY FACEBOOK PROVIDER ID
    ------------------------------------------------- */

    let user = await User.findOne({
      authProvider: "facebook",
      authProviderId: profile.id,
    });

    /* -------------------------------------------------
       FALLBACK: FIND EXISTING USER BY EMAIL
    ------------------------------------------------- */

    if (!user) {
      user = await User.findOne({
        email,
      });
    }

    /* -------------------------------------------------
       CREATE OR UPDATE USER
    ------------------------------------------------- */

    if (user) {
      user.authProvider = "facebook";
      user.authProviderId = profile.id;

      if (profile.email) {
        user.emailVerified = true;
      }

      if (profile.first_name) {
        user.firstName = profile.first_name;
      }

      if (profile.last_name) {
        user.lastName = profile.last_name;
      }

      if (profile.picture?.data?.url) {
        user.avatar = profile.picture.data.url;
      }

      await user.save();
    } else {
      user = await User.create({
        firstName: profile.first_name || "ABS CUT",
        lastName: profile.last_name || "Customer",
        email,
        phone: "",
        password: undefined,
        role: "customer",
        authProvider: "facebook",
        authProviderId: profile.id,
        avatar: profile.picture?.data?.url || "",
        emailVerified: true,
      });
    }

    /* -------------------------------------------------
       CREATE ABS CUT JWT
    ------------------------------------------------- */

    const token = createAuthToken(user);

    return res.status(200).json({
      message: "Facebook login successful.",
      token,
      user: getSafeUser(user),
    });
  } catch (error) {
    console.error(
      "ABS CUT Facebook authentication error:",
      error.response?.data || error.message,
    )


    return res.status(401).json({
      message:
        error.response?.data?.error?.message ||
        "Unable to authenticate with Facebook.",
    });
  }
};

module.exports = {
  googleLogin,
  facebookLogin,
};
