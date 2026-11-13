

const express = require("express");
const multer = require("multer");
const os = require("os");
const path = require("path");

const authMiddleware = require("../middleware/authMiddleware");

const {
  createAssignment,
  getAdminAssignments,
  updateAssignment,
  publishAssignment,
  closeAssignment,
  getCourseAssignments,
  getAssignmentDetails,
} = require("../controllers/academyAssignmentController");

const {
  submitAssignment,
  getMySubmissions,
  getAssignmentSubmissions,
  markSubmissionUnderReview,
  gradeSubmission,
  requestResubmission,
} = require("../controllers/academySubmissionController");

const router = express.Router();

const protect = authMiddleware;
const { adminOnly } = authMiddleware;

// =====================================================
// STUDENT FILE UPLOAD CONFIGURATION
// =====================================================

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

const allowedExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".mp4",
  ".mov",
  ".webm",
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
];

const assignmentUpload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const extension = path
      .extname(file.originalname)
      .toLowerCase();

    if (
      allowedMimeTypes.includes(file.mimetype) &&
      allowedExtensions.includes(extension)
    ) {
      return cb(null, true);
    }

    return cb(
      new Error(
        "Unsupported file. Upload JPG, PNG, WebP, MP4, MOV, WebM, PDF, DOC, DOCX, or TXT."
      )
    );
  },
});

// =====================================================
// ADMIN — ASSIGNMENT MANAGEMENT
// =====================================================

router.get(
  "/admin/assignments",
  protect,
  adminOnly,
  getAdminAssignments
);

router.post(
  "/admin/assignments",
  protect,
  adminOnly,
  createAssignment
);

router.put(
  "/admin/assignments/:id",
  protect,
  adminOnly,
  updateAssignment
);

router.patch(
  "/admin/assignments/:id/publish",
  protect,
  adminOnly,
  publishAssignment
);

router.patch(
  "/admin/assignments/:id/close",
  protect,
  adminOnly,
  closeAssignment
);

// =====================================================
// ADMIN — STUDENT SUBMISSIONS
// =====================================================

router.get(
  "/admin/assignments/:assignmentId/submissions",
  protect,
  adminOnly,
  getAssignmentSubmissions
);

router.patch(
  "/admin/submissions/:submissionId/review",
  protect,
  adminOnly,
  markSubmissionUnderReview
);

router.patch(
  "/admin/submissions/:submissionId/grade",
  protect,
  adminOnly,
  gradeSubmission
);

router.patch(
  "/admin/submissions/:submissionId/resubmit",
  protect,
  adminOnly,
  requestResubmission
);

// =====================================================
// STUDENT — COURSE ASSIGNMENTS
// =====================================================

router.get(
  "/courses/:courseId/assignments",
  protect,
  getCourseAssignments
);

router.get(
  "/assignments/:assignmentId",
  protect,
  getAssignmentDetails
);

// =====================================================
// STUDENT — SUBMISSION
// =====================================================

router.post(
  "/assignments/:assignmentId/submit",
  protect,
  assignmentUpload.array("files", 5),
  submitAssignment
);

router.get(
  "/assignments/:assignmentId/my-submissions",
  protect,
  getMySubmissions
);

module.exports = router;
