const mongoose = require("mongoose");

// =====================================================
// ABS CUT — USER MODEL
// =====================================================

const userSchema = new mongoose.Schema(
  {
    // ===================================================
    // FIRST NAME
    // ===================================================

    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    // ===================================================
    // LAST NAME
    // ===================================================

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    // ===================================================
    // EMAIL
    // ===================================================

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // ===================================================
    // PHONE
    // ===================================================

    // Social providers may not give us a phone number.
    // Customers using normal registration can still
    // provide one.

    phone: {
      type: String,
      default: "",
      trim: true,
    },

    // ===================================================
    // PASSWORD
    // ===================================================

    // Required only for normal/local accounts.
    // Google/Facebook/LinkedIn accounts do not need
    // an ABS CUT password.

    password: {
      type: String,

      required: function () {
        return this.authProvider === "local";
      },
    },

    // ===================================================
    // AUTH PROVIDER
    // ===================================================

    authProvider: {
      type: String,

      enum: [
        "local",
        "google",
        "facebook",
        "linkedin",
      ],

      default: "local",
    },

    // ===================================================
    // PROVIDER USER ID
    // ===================================================

    // Google/Facebook/LinkedIn unique account ID.

    authProviderId: {
      type: String,
      default: null,
      trim: true,
    },

    // ===================================================
    // PROFILE IMAGE
    // ===================================================

    avatar: {
      type: String,
      default: "",
      trim: true,
    },

    // ===================================================
    // EMAIL VERIFIED
    // ===================================================

    emailVerified: {
      type: Boolean,
      default: false,
    },

    // ===================================================
    // ROLE
    // ===================================================

    role: {
      type: String,

      enum: [
        "customer",
        "admin",
        "staff",
      ],

      default: "customer",
    },
  },

  {
    timestamps: true,
  }
);


// =====================================================
// SOCIAL PROVIDER INDEX
// =====================================================
//
// Prevent the same Google/Facebook/LinkedIn identity
// from being registered more than once.
//
// =====================================================

userSchema.index(
  {
    authProvider: 1,
    authProviderId: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);


// =====================================================
// EXPORT
// =====================================================

module.exports =
  mongoose.model(
    "User",
    userSchema
  );









// const mongoose = require("mongoose");

// const userSchema = new mongoose.Schema(
//   {
//     firstName: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     lastName: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     email: {
//       type: String,
//       required: true,
//       unique: true,
//       lowercase: true,
//       trim: true,
//     },

//     phone: {
//       type: String,
//       required: true,
//       trim: true,
//     },

//     password: {
//       type: String,
//       required: true,
//     },
//     role: { type: String, enum: ["customer", "admin", "staff"], default: "customer", },
//   },
//   {
//     timestamps: true,
//   }
// );

// module.exports = mongoose.model("User", userSchema);