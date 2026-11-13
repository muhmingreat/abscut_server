const express = require("express");

const protect = require("../middleware/authMiddleware");

const {
  enrollInCourse,
  getMyEnrollments,
  getEnrolledCourse,
} = require("../controllers/academyEnrollmentController");

const router = express.Router();

router.post(
  "/enrollments/:courseId",
  protect,
  enrollInCourse
);

router.get(
  "/enrollments/me",
  protect,
  getMyEnrollments
);

router.get(
  "/enrollments/:enrollmentId/course",
  protect,
  getEnrolledCourse
);

module.exports = router;