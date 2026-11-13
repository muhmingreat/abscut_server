
const cloudinary = require("../config/cloudinary");
const fs = require("fs/promises");
const path = require("path");

// =====================================================
// ABS CUT FASHION ACADEMY — LESSON VIDEO UPLOAD
// =====================================================

const uploadAcademyLessonVideo = async (req, res) => {
  let temporaryFile = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a video to upload.",
      });
    }

    const allowedMimeTypes = [
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ];

    const allowedExtensions = [".mp4", ".mov", ".webm"];

    const extension = path.extname(req.file.originalname).toLowerCase();

    if (
      !allowedMimeTypes.includes(req.file.mimetype) &&
      !allowedExtensions.includes(extension)
    ) {
      return res.status(400).json({
        success: false,
        message: "Only MP4, MOV, and WebM videos are allowed.",
      });
    }

    if (req.file.size > 50 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Video size must not exceed 50 MB.",
      });
    }

    const result = await cloudinary.uploader.upload(temporaryFile, {
      resource_type: "video",
      folder: "abs-cut/academy/lessons",
    });

    return res.status(200).json({
      success: true,
      message: "Academy lesson video uploaded successfully.",
      videoUrl: result.secure_url,
      publicId: result.public_id,
      duration: result.duration || 0,
      format: result.format,
      bytes: result.bytes,
    });
  } catch (error) {
    console.error("Academy video upload error:", error);

    return res.status(500).json({
      success: false,
      message: "Video upload failed. Please try again.",
    });
  } finally {
    if (temporaryFile) {
      try {
        await fs.unlink(temporaryFile);
      } catch (cleanupError) {
        console.error(
          "Temporary Academy video cleanup failed:",
          cleanupError.message
        );
      }
    }
  }
};

module.exports = {
  uploadAcademyLessonVideo,
};
