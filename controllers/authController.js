const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const {
  notifyWelcome,
} = require("../services/notificationService");

// =====================================================
// REGISTER USER
// =====================================================

const registerUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
    } = req.body;

    // ===================================================
    // VALIDATE REQUIRED FIELDS
    // ===================================================

    if (
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please fill in all required fields.",
      });
    }

    // ===================================================
    // NORMALIZE INPUT
    // ===================================================

    const normalizedEmail =
      email.toLowerCase().trim();

    const normalizedFirstName =
      firstName.trim();

    const normalizedLastName =
      lastName.trim();

    const normalizedPhone =
      phone.trim();

    // ===================================================
    // CHECK EXISTING USER
    // ===================================================

    const existingUser =
      await User.findOne({
        email: normalizedEmail,
      });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message:
          "An account with this email already exists.",
      });
    }

    // ===================================================
    // HASH PASSWORD
    // ===================================================

    const hashedPassword =
      await bcrypt.hash(
        password,
        12
      );

    // ===================================================
    // CREATE CUSTOMER
    // ===================================================

    const user =
      await User.create({
        firstName:
          normalizedFirstName,

        lastName:
          normalizedLastName,

        email:
          normalizedEmail,

        phone:
          normalizedPhone,

        password:
          hashedPassword,

        // Public registration can ONLY
        // create customer accounts.
        role: "customer",
      });

    // ===================================================
    // SEND WELCOME EMAIL + SMS
    // ===================================================
    //
    // Important:
    // Notification failure must NOT cause the
    // registration request to fail because the
    // MongoDB user has already been created.
    //
    // ===================================================

    Promise.allSettled([
      notifyWelcome({
        name:
          `${user.firstName} ${user.lastName}`,

        email:
          user.email,

        phone:
          user.phone,
      }),
    ]).then((results) => {
      console.log(
        "ABS CUT welcome notification results:",
        results
      );
    });

    // ===================================================
    // RETURN SAFE USER DATA
    // ===================================================

    return res.status(201).json({
      success: true,

      message:
        "Account created successfully.",

      user: {
        id: user._id,

        firstName:
          user.firstName,

        lastName:
          user.lastName,

        email:
          user.email,

        phone:
          user.phone,

        role:
          user.role,
      },
    });

  } catch (error) {
    console.error(
      "Register error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Something went wrong while creating your account.",
    });
  }
};


// =====================================================
// LOGIN USER
// =====================================================

const loginUser = async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;

    // ===================================================
    // VALIDATE
    // ===================================================

    if (
      !email ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please enter your email and password."
      });
    }

    // ===================================================
    // NORMALIZE EMAIL
    // ===================================================

    const normalizedEmail =
      email.toLowerCase().trim();

    // ===================================================
    // FIND USER
    // ===================================================

    const user =
      await User.findOne({
        email:
          normalizedEmail,
      });

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Incorrect email or password.",
      });
    }

    // ===================================================
    // COMPARE PASSWORD
    // ===================================================

    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message:
          "Incorrect email or password.",
      });
    }

    // ===================================================
    // CREATE JWT
    // ===================================================

    const token =
      jwt.sign(
        {
          userId:
            user._id,
        },

        process.env.JWT_SECRET,

        {
          expiresIn:
            "7d",
        }
      );

    // ===================================================
    // RESPONSE
    // ===================================================

    return res.status(200).json({
      success: true,

      message:
        "Login successful.",

      token,

      user: {
        id:
          user._id,

        firstName:
          user.firstName,

        lastName:
          user.lastName,

        email:
          user.email,

        phone:
          user.phone,

        role:
          user.role,
      },
    });

  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Something went wrong while logging in.",
    });
  }
};


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  registerUser,
  loginUser,
};