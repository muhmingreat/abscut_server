
const express = require("express");
const protect = require("../middleware/authMiddleware");
const cloudinary = require("../config/cloudinary");

const router = express.Router();

// =============================================
// GET AUTHENTICATED USER PROFILE
// =============================================

router.get("/profile", protect, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});

// =============================================
// UPDATE CUSTOMER USERNAME
// =============================================

router.patch("/username", protect, async (req, res) => {
  try {
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();

    const usernamePattern = /^[a-z0-9][a-z0-9._-]{2,29}$/;

    if (!usernamePattern.test(username)) {
      return res.status(400).json({
        success: false,
        message:
          "Username must be 3–30 characters and contain only letters, numbers, dots, underscores or hyphens.",
      });
    }

    const existingUser = await req.user.constructor.findOne({
      username,
      _id: { $ne: req.user._id },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "That username is already taken.",
      });
    }

    req.user.username = username;
    await req.user.save();

    return res.status(200).json({
      success: true,
      message: "Username updated successfully.",
      user: {
        id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        username: req.user.username,
        email: req.user.email,
        phone: req.user.phone,
        avatar: req.user.avatar,
        avatarPublicId: req.user.avatarPublicId,
        role: req.user.role,
      },
    });
  } catch (error) {
    console.error("Username update error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "That username is already taken.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update your username.",
    });
  }
});

// =============================================
// REMOVE CUSTOMER AVATAR
// =============================================

router.delete("/avatar", protect, async (req, res) => {
  try {
    const previousPublicId = req.user.avatarPublicId;

    // Update the database first.
    req.user.avatar = "";
    req.user.avatarPublicId = "";

    await req.user.save();

    // Remove the old Cloudinary image if its public ID is available.
    if (previousPublicId) {
      try {
        await cloudinary.uploader.destroy(previousPublicId, {
          resource_type: "image",
        });
      } catch (cleanupError) {
        console.error("Avatar removal cleanup error:", cleanupError);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Profile image removed successfully.",
      user: {
        id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        username: req.user.username,
        email: req.user.email,
        phone: req.user.phone,
        avatar: "",
        avatarPublicId: "",
        role: req.user.role,
      },
    });
  } catch (error) {
    console.error("Avatar removal error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to remove your profile image.",
    });
  }
});

module.exports = router;
