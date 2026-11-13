const mongoose = require("mongoose");

// =====================================================
// ABS CUT — USER MODEL
// =====================================================

const userSchema = new mongoose.Schema(
  {
    // FIRST NAME
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    // LAST NAME
    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    // USERNAME / NICKNAME
    username: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 30,
      match: [
        /^[a-z0-9][a-z0-9._-]{2,29}$/,
        "Username must be 3–30 characters and contain only letters, numbers, dots, underscores or hyphens.",
      ],
    },

    // EMAIL
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // PHONE
    phone: {
      type: String,
      default: "",
      trim: true,
    },

    // PASSWORD
    password: {
      type: String,
      required: function () {
        return this.authProvider === "local";
      },
    },

    // AUTH PROVIDER
    authProvider: {
      type: String,
      enum: ["local", "google", "facebook", "linkedin"],
      default: "local",
    },

    // PROVIDER USER ID
    authProviderId: {
      type: String,
      default: null,
      trim: true,
    },

    // PROFILE IMAGE
    avatar: {
      type: String,
      default: "",
      trim: true,
    },

    avatarPublicId: {
      type: String,
      default: "",
      trim: true,
    },
    // EMAIL VERIFIED
    emailVerified: {
      type: Boolean,
      default: false,
    },

    // ROLE
    role: {
      type: String,
      enum: ["customer", "admin", "staff"],
      default: "customer",
    },
  },
  {
    timestamps: true,
  },
);

// =====================================================
// AUTOMATIC USERNAME GENERATION
// =====================================================

userSchema.pre("validate", async function () {
  // Only generate when username is empty.
  if (this.username && this.username.trim()) {
    this.username = this.username.trim().toLowerCase();
  } else {
    const cleanName = `${this.firstName}${this.lastName}`
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    const baseUsername = (cleanName || "abscutuser").slice(0, 25);

    let candidate = baseUsername;
    let counter = 2;

    // Check for existing usernames.
    while (
      await mongoose.models.User.exists({
        username: candidate,
        _id: { $ne: this._id },
      })
    ) {
      candidate = `${baseUsername.slice(0, 25 - String(counter).length)}${counter}`;
      counter++;
    }

    this.username = candidate;
  }
});

// =====================================================
// UNIQUE USERNAME INDEX
// =====================================================

userSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: {
      username: { $type: "string" },
    },
  },
);

// =====================================================
// SOCIAL PROVIDER INDEX
// =====================================================

userSchema.index(
  {
    authProvider: 1,
    authProviderId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      authProviderId: {
        $type: "string",
      },
    },
  },
);

// =====================================================
// EXPORT
// =====================================================

module.exports = mongoose.model("User", userSchema);
