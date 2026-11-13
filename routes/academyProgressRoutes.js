
const express = require("express");
const router = express.Router();

const  protect  = require("../middleware/authMiddleware");

const {
  getCourseProgress,
  completeLesson,
} = require("../controllers/academyProgressController");

// Get progress for one enrollment
router.get(
  "/enrollments/:enrollmentId/progress",
  protect,
  getCourseProgress
);

// Mark a lesson completed
router.post(
  "/enrollments/:enrollmentId/lessons/:lessonId/complete",
  protect,
  completeLesson
);

module.exports = router;
