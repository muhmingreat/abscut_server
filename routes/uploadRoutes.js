
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");

const authMiddleware = require("../middleware/authMiddleware");

const {
  uploadProductImage,
  uploadProductVideo,
  uploadCustomReference,
} = require("../controllers/uploadController");

const router = express.Router();

const protect = authMiddleware;
const { adminOnly } = authMiddleware;

// Vercel allows temporary file writes under the OS temp directory.
// These files are not permanent storage.
const uploadDir = path.join(os.tmpdir(), "abs-cut-uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const createUpload = ({ maxSize, imagesOnly = false }) =>
  multer({
    dest: uploadDir,
    limits: {
      fileSize: maxSize,
    },
    fileFilter: (req, file, cb) => {
      const isImage = file.mimetype.startsWith("image/");
      const isVideo = file.mimetype.startsWith("video/");

      if (imagesOnly ? isImage : isImage || isVideo) {
        return cb(null, true);
      }

      return cb(
        new Error(
          imagesOnly
            ? "Only image files are allowed."
            : "Only image and video files are allowed."
        )
      );
    },
  });

// Product image: admin only
router.post(
  "/product-image",
  protect,
  adminOnly,
  createUpload({ maxSize: 50 * 1024 * 1024 }).single("image"),
  uploadProductImage
);

// Product video: admin only
router.post(
  "/product-video",
  protect,
  adminOnly,
  createUpload({ maxSize: 50 * 1024 * 1024 }).single("video"),
  uploadProductVideo
);

// Custom-order reference image: authenticated customer
router.post(
  "/custom-reference",
  protect,
  createUpload({
    maxSize: 5 * 1024 * 1024,
    imagesOnly: true,
  }).single("image"),
  uploadCustomReference
);

module.exports = router;

