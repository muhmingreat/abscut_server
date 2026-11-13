
const cloudinary = require("../config/cloudinary");
const fs = require("fs/promises");

// =====================================================
// ABS CUT FASHION ACADEMY — COURSE IMAGE UPLOAD
// =====================================================

const uploadAcademyCourseImage = async (req, res) => {
  const temporaryFile = req.file?.path;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a course image.",
      });
    }

    const result = await cloudinary.uploader.upload(temporaryFile, {
      resource_type: "image",
      folder: "abs-cut/academy/thumbnails",
    });

    return res.status(200).json({
      success: true,
      message: "Course image uploaded successfully.",
      imageUrl: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    console.error("Academy image upload error:", error);

    return res.status(500).json({
      success: false,
      message: "Course image upload failed.",
    });
  } finally {
    if (temporaryFile) {
      try {
        await fs.unlink(temporaryFile);
      } catch (error) {
        console.error("Image cleanup error:", error.message);
      }
    }
  }
};

module.exports = {
  uploadAcademyCourseImage,
};
