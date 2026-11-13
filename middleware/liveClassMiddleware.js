
const LiveClass = require("../models/LiveClass");

// =====================================================
// ABS CUT LIVE — INSTRUCTOR AUTHORIZATION
// =====================================================

// Admin or assigned instructor may manage the class.
const authorizeLiveClassInstructor = async (req, res, next) => {
  try {
    const { liveClassId } = req.params;

    if (!liveClassId) {
      return res.status(400).json({
        success: false,
        message: "Live class ID is required.",
      });
    }

    const liveClass = await LiveClass.findById(liveClassId);

    if (!liveClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found.",
      });
    }

    const userId = String(req.user._id);
    const isAdmin = req.user.role === "admin";
    const isAssignedInstructor =
      String(liveClass.instructor) === userId;

    if (!isAdmin && !isAssignedInstructor) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to manage this live class.",
      });
    }

    req.liveClass = liveClass;

    next();
  } catch (error) {
    console.error("Live class authorization error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to authorize live class access.",
    });
  }
};

// Staff instructors cannot create or assign classes.
// Admin-only class creation will use adminOnly directly.

module.exports = {
  authorizeLiveClassInstructor,
};
