const express = require("express");

const multer = require("multer");

const authMiddleware = require("../middleware/authMiddleware");

const {
  uploadProductImage,
  uploadProductVideo,
  uploadCustomReference,
} = require("../controllers/uploadController");

const protect = authMiddleware;

const { adminOnly } = authMiddleware;

const router = express.Router();

/*
  Temporary local storage.

  Files are uploaded here first,
  then sent to Cloudinary and removed
  after a successful upload.
*/

const upload = multer({
  dest: "uploads/",

  limits: {
    /*
      Maximum file size:
      50 MB
    */

    fileSize: 50 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/")
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only image and video files are allowed."
        )
      );
    }
  },
});

/*
  PRODUCT IMAGE
*/

router.post(
  "/product-image",
  protect,
  adminOnly,
  upload.single("image"),
  uploadProductImage
);

/*
  PRODUCT VIDEO
*/

router.post(
  "/product-video",
  protect,
  adminOnly,
  upload.single("video"),
  uploadProductVideo
);

/*
  CUSTOM ORDER REFERENCE IMAGE

  Customer can upload an image
  to use as a reference for
  tailoring, embroidery, or monogramming.

  Maximum size:
  5 MB

  Images only.
*/

const customReferenceUpload = multer({
  dest: "uploads/",

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith("image/")
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only image files are allowed."
        )
      );
    }
  },
})

router.post(
  "/custom-reference",
  protect,
  customReferenceUpload.single("image"),
  uploadCustomReference
);

module.exports = router;