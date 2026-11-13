
const express = require("express");
const multer = require("multer");
const os = require("os");

const authMiddleware = require("../middleware/authMiddleware");

const {
  getPublishedCourses,
  getPublishedCourse,
  getAdminCourses,
  createCourse,
  updateCourse,
  publishCourse,
  archiveCourse,
} = require("../controllers/academyCourseController");

const {
  uploadAcademyLessonVideo,
} = require("../controllers/academyVideoUploadController");
const {
  uploadAcademyCourseImage,
} = require("../controllers/academyImageUploadController");

const router = express.Router();

const protect = authMiddleware;
const { adminOnly } = authMiddleware;

// =====================================================
// ACADEMY VIDEO UPLOAD CONFIGURATION
// =====================================================

const academyVideoUpload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ];

    const allowedExtensions = [".mp4", ".mov", ".webm"];

    const extension = require("path")
      .extname(file.originalname)
      .toLowerCase();

    if (
      allowedMimeTypes.includes(file.mimetype) ||
      allowedExtensions.includes(extension)
    ) {
      return cb(null, true);
    }

    return cb(
      new Error("Only MP4, MOV, and WebM videos are allowed.")
    );
  },
});


// =====================================================
// ACADEMY COURSE IMAGE UPLOAD CONFIGURATION
// =====================================================

const academyImageUpload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      return cb(null, true);
    }

    return cb(
      new Error("Only JPG, PNG, and WebP images are allowed.")
    );
  },
});
// =====================================================
// PUBLIC COURSE CATALOG
// =====================================================

router.get("/courses", getPublishedCourses);
router.get("/courses/:slug", getPublishedCourse);

// =====================================================
// ADMIN — ACADEMY LESSON VIDEO UPLOAD
// =====================================================

router.post(
  "/admin/lessons/upload-video",
  protect,
  adminOnly,
  academyVideoUpload.single("video"),
  uploadAcademyLessonVideo
);

// =====================================================
// ADMIN COURSE MANAGEMENT
// =====================================================

router.get(
  "/admin/courses",
  protect,
  adminOnly,
  getAdminCourses
);

router.post(
  "/admin/courses",
  protect,
  adminOnly,
  createCourse
);

router.put(
  "/admin/courses/:id",
  protect,
  adminOnly,
  updateCourse
);

router.patch(
  "/admin/courses/:id/publish",
  protect,
  adminOnly,
  publishCourse
);

router.patch(
  "/admin/courses/:id/archive",
  protect,
  adminOnly,
  archiveCourse
);

// =====================================================
// ADMIN — ACADEMY COURSE IMAGE UPLOAD
// =====================================================

router.post(
  "/admin/courses/upload-image",
  protect,
  adminOnly,
  academyImageUpload.single("image"),
  uploadAcademyCourseImage
);

module.exports = router;



