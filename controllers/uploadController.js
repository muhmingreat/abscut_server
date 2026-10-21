
const fs = require("fs/promises");

const cloudinary = require("../config/cloudinary");


/*
  ==========================================
  PRODUCT IMAGE UPLOAD
  ==========================================
*/

const uploadProductImage = async (req, res) => {
  let temporaryFile = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select an image.",
      });
    }

    temporaryFile = req.file.path;

    const uploadResult =
      await cloudinary.uploader.upload(
        temporaryFile,
        {
          folder: "abs-cut/products",
          resource_type: "image",
        }
      );

    /*
      Remove temporary local file
    */

    await fs.unlink(temporaryFile);

    temporaryFile = null;

    res.status(201).json({
      success: true,
      message:
        "Image uploaded successfully.",
      image: {
        url: uploadResult.secure_url,
        publicId:
          uploadResult.public_id,
      },
    });
  } catch (error) {
    console.error(
      "Cloudinary image upload error:",
      error
    );

    /*
      Try to remove temporary file
      if something went wrong.
    */

    if (temporaryFile) {
      try {
        await fs.unlink(
          temporaryFile
        );
      } catch (cleanupError) {
        console.error(
          "Temporary file cleanup error:",
          cleanupError
        );
      }
    }

    res.status(500).json({
      success: false,
      message:
        "Unable to upload product image.",
    });
  }
};


/*
  ==========================================
  PRODUCT VIDEO UPLOAD
  ==========================================
*/

const uploadProductVideo = async (
  req,
  res
) => {
  let temporaryFile = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a video.",
      });
    }

    /*
      Make sure the uploaded file
      is actually a video.
    */

    if (
      !req.file.mimetype.startsWith(
        "video/"
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please select a valid video file.",
      });
    }

    temporaryFile = req.file.path;

    /*
      Upload to Cloudinary.

      Cloudinary automatically detects
      the video's duration and stores it
      in the upload result.
    */

    const uploadResult =
      await cloudinary.uploader.upload(
        temporaryFile,
        {
          folder: "abs-cut/products/videos",
          resource_type: "video",
        }
      );

    /*
      Cloudinary returns duration in seconds.
    */

    const duration =
      Number(uploadResult.duration) || 0;

    /*
      ABS CUT maximum video duration:
      60 seconds.
    */

    if (duration > 180)
       {
      /*
        Delete the video from Cloudinary
        because it exceeds our limit.
      */

      try {
        await cloudinary.uploader.destroy(
          uploadResult.public_id,
          {
            resource_type: "video",
          }
        );
      } catch (deleteError) {
        console.error(
          "Cloudinary video cleanup error:",
          deleteError
        );
      }

      throw new Error(
        "Product video must be 3 minutes or less."
      );
    }

    /*
      Remove temporary local file.
    */

    await fs.unlink(temporaryFile);

    temporaryFile = null;

    /*
      Return Cloudinary information
      to the frontend.
    */

    res.status(201).json({
      success: true,

      message:
        "Product video uploaded successfully.",

      video: {
        url: uploadResult.secure_url,

        publicId:
          uploadResult.public_id,

        duration,
      },
    });
  } catch (error) {
    console.error(
      "Cloudinary video upload error:",
      error
    );

    /*
      Clean up temporary file if
      something went wrong.
    */

    if (temporaryFile) {
      try {
        await fs.unlink(
          temporaryFile
        );
      } catch (cleanupError) {
        console.error(
          "Temporary file cleanup error:",
          cleanupError
        );
      }
    }

    res.status(500).json({
      success: false,
      message:
        error.message ||
        "Unable to upload product video.",
    });
  }
};

// =====================================================
// CUSTOMER — UPLOAD CUSTOM ORDER REFERENCE IMAGE
// =====================================================

const uploadCustomReference = async (
  req,
  res
) => {
  let temporaryFile = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message:
          "Please select a reference image.",
      });
    }

    if (
      !req.file.mimetype.startsWith("image/")
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only image files are allowed.",
      });
    }

    temporaryFile = req.file.path;

    const uploadResult =
      await cloudinary.uploader.upload(
        temporaryFile,
        {
          folder:
            "abs-cut/custom-orders/references",
          resource_type: "image",
        }
      );

    await fs.unlink(temporaryFile);

    temporaryFile = null;

    res.status(201).json({
      success: true,
      message:
        "Reference image uploaded successfully.",

      image: {
        url: uploadResult.secure_url,
        publicId:
          uploadResult.public_id,
        originalName:
          req.file.originalname,
      },
    });
  } catch (error) {
    console.error(
      "Custom reference image upload error:",
      error
    );

    if (temporaryFile) {
      try {
        await fs.unlink(
          temporaryFile
        );
      } catch (cleanupError) {
        console.error(
          "Reference image cleanup error:",
          cleanupError
        );
      }
    }

    res.status(500).json({
      success: false,
      message:
        "Unable to upload reference image.",
    })
  }
};


module.exports = {
  uploadProductImage,
  uploadProductVideo,
  uploadCustomReference,
};  


