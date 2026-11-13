
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
  uploadActivityMedia,
  uploadDigitalEmbroideryFile,
  uploadAcademyPaymentReceipt,
  uploadRegistrationAvatar,
  uploadAccountAvatar
} = require("../controllers/uploadController");

const router = express.Router();

const protect = authMiddleware;
const { adminOnly } = authMiddleware;

// =============================================
// TEMPORARY UPLOAD DIRECTORY
// =============================================

const uploadDir = path.join(os.tmpdir(), "abs-cut-uploads");

fs.mkdirSync(uploadDir, { recursive: true });

// =============================================
// GENERAL UPLOAD CONFIGURATION
// =============================================

const createUpload = ({ maxSize, imagesOnly = false }) =>
  multer({
    dest: uploadDir,
    limits: {
      fileSize: maxSize,
      files: 1,
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

// =============================================
// DIGITAL EMBROIDERY UPLOAD
// =============================================

const embroideryUpload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const extension = path
      .extname(file.originalname || "")
      .toLowerCase();

    const allowedExtensions = [
      ".dst",
      ".pes",
      ".jef",
      ".exp",
    ];

    if (!allowedExtensions.includes(extension)) {
      return cb(
        new Error(
          "Unsupported embroidery file. Only DST, PES, JEF and EXP are allowed."
        )
      );
    }

    cb(null, true);
  },
});

// =============================================
// ADMIN PRODUCT IMAGE UPLOAD
// =============================================

router.post(
  "/product-image",
  protect,
  adminOnly,
  createUpload({
    maxSize: 50 * 1024 * 1024,
  }).single("image"),
  uploadProductImage
);

// =============================================
// ADMIN PRODUCT VIDEO UPLOAD
// =============================================

router.post(
  "/product-video",
  protect,
  adminOnly,
  createUpload({
    maxSize: 50 * 1024 * 1024,
  }).single("video"),
  uploadProductVideo
);

// =============================================
// ADMIN DIGITAL EMBROIDERY FILE UPLOAD
// =============================================

router.post(
  "/digital-embroidery",
  protect,
  adminOnly,
  embroideryUpload.single("file"),
  uploadDigitalEmbroideryFile
);

// =============================================
// CUSTOMER CUSTOM-ORDER REFERENCE IMAGE
// =============================================

router.post(
  "/custom-reference",
  protect,
  createUpload({
    maxSize: 5 * 1024 * 1024,
    imagesOnly: true,
  }).single("image"),
  uploadCustomReference
);

// =============================================
// ADMIN DAILY ACTIVITY MEDIA
// =============================================

router.post(
  "/activity-media",
  protect,
  adminOnly,
  createUpload({
    maxSize: 50 * 1024 * 1024,
  }).single("media"),
  uploadActivityMedia
);

// =============================================
// ACADEMY BANK TRANSFER RECEIPT
// Authenticated students
// JPG, PNG and WebP images up to 5MB
// =============================================

router.post(
  "/academy-payment-receipt",
  protect,
  createUpload({
    maxSize: 5 * 1024 * 1024,
    imagesOnly: true,
  }).single("receipt"),
  uploadAcademyPaymentReceipt
);

// =============================================
// PUBLIC REGISTRATION AVATAR UPLOAD
// JPG, PNG and WebP — maximum 2MB
// =============================================

router.post(
  "/registration-avatar",
  createUpload({
    maxSize: 2 * 1024 * 1024,
    imagesOnly: true,
  }).single("avatar"),
  uploadRegistrationAvatar
);

router.post(
  "/account-avatar",
  protect,
  createUpload({
    maxSize: 2 * 1024 * 1024,
    imagesOnly: true,
  }).single("avatar"),
  uploadAccountAvatar
);

module.exports = router;
