
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


// =====================================================
// ADMIN — UPLOAD DAILY ACTIVITY IMAGE OR VIDEO
// =====================================================

const uploadActivityMedia = async (req, res) => {
  let temporaryFile = null;
  let uploadedPublicId = null;
  let uploadedResourceType = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select an image or video.",
      });
    }

    temporaryFile = req.file.path;

    const isImage = req.file.mimetype.startsWith("image/");
    const isVideo = req.file.mimetype.startsWith("video/");

    if (!isImage && !isVideo) {
      return res.status(400).json({
        success: false,
        message: "Only images and videos are allowed.",
      });
    }

    const resourceType = isVideo ? "video" : "image";

    const result = await cloudinary.uploader.upload(
      temporaryFile,
      {
        folder: "abs-cut/activities",
        resource_type: resourceType,
      }
    );

    uploadedPublicId = result.public_id;
    uploadedResourceType = resourceType;

    // Keep the activity video limit consistent with
    // the existing 60-second product-video policy.
    const duration = Number(result.duration) || 0;

    if (isVideo && duration > 180) {
      await cloudinary.uploader.destroy(result.public_id, {
        resource_type: "video",
      });

      uploadedPublicId = null;

      return res.status(400).json({
        success: false,
        message: "Activity videos must be 60 seconds or less.",
      });
    }

    res.status(201).json({
      success: true,
      message: "Activity media uploaded successfully.",
      media: {
        url: result.secure_url,
        publicId: result.public_id,
        resourceType,
        duration: isVideo ? duration : null,
      },
    });
  } catch (error) {
    console.error("Activity media upload error:", error);

    if (uploadedPublicId && uploadedResourceType) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId, {
          resource_type: uploadedResourceType,
        });
      } catch (cleanupError) {
        console.error("Cloudinary cleanup error:", cleanupError);
      }
    }

    if (temporaryFile) {
      try {
        await fs.unlink(temporaryFile);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error("Temporary file cleanup error:", cleanupError);
        }
      }
    }

    return res.status(500).json({
      success: false,
      message: "Unable to upload activity media.",
    });
  } finally {
    if (temporaryFile) {
      try {
        await fs.unlink(temporaryFile);
      } catch (error) {
        if (error.code !== "ENOENT") {
          console.error("Temporary file cleanup error:", error);
        }
      }
    }
  }
};


// =====================================================
// ADMIN — UPLOAD PRIVATE DIGITAL EMBROIDERY FILE
// =====================================================

const uploadDigitalEmbroideryFile = async (req, res) => {
  let temporaryFile = null;
  let uploadedPublicId = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select an embroidery file.",
      });
    }

    temporaryFile = req.file.path;

    // Supported embroidery formats.
    const allowedFormats = ["DST", "PES", "JEF", "EXP"];

    const originalName = String(req.file.originalname || "")
      .replace(/\\/g, "/")
      .split("/")
      .pop();

    const extension = originalName
      .split(".")
      .pop()
      .toUpperCase();

    if (!allowedFormats.includes(extension)) {
      return res.status(400).json({
        success: false,
        message: "Only DST, PES, JEF, and EXP files are allowed.",
      });
    }

    // Enforce the file-size limit on the server too.
    if (req.file.size > 20 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Embroidery files cannot exceed 20 MB.",
      });
    }

    // Upload as a private authenticated raw asset.
    const uploadResult = await cloudinary.uploader.upload(
      temporaryFile,
      {
        folder: "abs-cut/digital-embroidery",
        resource_type: "raw",
        type: "authenticated",
        use_filename: true,
        unique_filename: true,
      }
    );

    uploadedPublicId = uploadResult.public_id;

    // Remove the temporary server file.
    await fs.unlink(temporaryFile);
    temporaryFile = null;

    return res.status(201).json({
      success: true,
      message: "Digital embroidery file uploaded successfully.",
      digitalFile: {
        format: extension,
        storageKey: uploadResult.public_id,
        originalName,
        fileSize: uploadResult.bytes || req.file.size,
      },
    });
  } catch (error) {
    console.error("Digital embroidery upload error:", error);

    // Remove an uploaded Cloudinary asset if a later step fails.
    if (uploadedPublicId) {
      try {
        await cloudinary.uploader.destroy(uploadedPublicId, {
          resource_type: "raw",
          type: "authenticated",
        });
      } catch (cleanupError) {
        console.error(
          "Digital embroidery Cloudinary cleanup error:",
          cleanupError
        );
      }
    }

    return res.status(500).json({
      success: false,
      message: "Unable to upload digital embroidery file.",
    });
  } finally {
    if (temporaryFile) {
      try {
        await fs.unlink(temporaryFile);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error(
            "Digital embroidery temporary-file cleanup error:",
            cleanupError
          );
        }
      }
    }
  }
};


/*
  ==========================================
  ACADEMY BANK TRANSFER RECEIPT UPLOAD
  ==========================================
*/

const uploadAcademyPaymentReceipt = async (req, res) => {
  let temporaryFile = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a payment receipt.",
      });
    }

    temporaryFile = req.file.path;

    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Only JPG, PNG and WebP receipts are allowed.",
      });
    }

    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Receipt images cannot exceed 5MB.",
      });
    }

    const uploadResult = await cloudinary.uploader.upload(
      temporaryFile,
      {
        folder: "abs-cut/academy/payment-receipts",
        resource_type: "image",
      }
    );

    await fs.unlink(temporaryFile);
    temporaryFile = null;

    return res.status(201).json({
      success: true,
      message: "Payment receipt uploaded successfully.",
      receipt: {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
      },
      receiptUrl: uploadResult.secure_url,
    });
  } catch (error) {
    console.error("Academy receipt upload error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to upload payment receipt.",
    });
  } finally {
    if (temporaryFile) {
      try {
        await fs.unlink(temporaryFile);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error(
            "Academy receipt temporary-file cleanup error:",
            cleanupError
          );
        }
      }
    }
  }
}


// =====================================================
// PUBLIC — REGISTRATION AVATAR UPLOAD
// =====================================================

const uploadRegistrationAvatar = async (req, res) => {
  let temporaryFile = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a profile image.",
      });
    }

    temporaryFile = req.file.path;

    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Only JPG, PNG and WebP images are allowed.",
      });
    }

    if (req.file.size > 2 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Profile images cannot exceed 2MB.",
      });
    }

    const uploadResult = await cloudinary.uploader.upload(
      temporaryFile,
      {
        folder: "abs-cut/avatars",
        resource_type: "image",
        transformation: [
          {
            width: 500,
            height: 500,
            crop: "fill",
            gravity: "auto",
          },
        ],
      }
    );

    return res.status(201).json({
      success: true,
      message: "Profile image uploaded successfully.",
      avatar: {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
      },
    });
  } catch (error) {
    console.error("Registration avatar upload error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to upload your profile image.",
    });
  } finally {
    if (temporaryFile) {
      try {
        await fs.unlink(temporaryFile);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error(
            "Registration avatar cleanup error:",
            cleanupError
          );
        }
      }
    }
  }
};


// =====================================================
// CUSTOMER — UPDATE ACCOUNT AVATAR
// =====================================================

const uploadAccountAvatar = async (req, res) => {
  let temporaryFile = null;
  let newPublicId = null;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a profile image.",
      });
    }

    temporaryFile = req.file.path;

    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Only JPG, PNG and WebP images are allowed.",
      });
    }

    if (req.file.size > 2 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Profile images cannot exceed 2MB.",
      });
    }

    // Upload the new avatar to Cloudinary.
    const uploadResult = await cloudinary.uploader.upload(
      temporaryFile,
      {
        folder: "abs-cut/avatars",
        resource_type: "image",
        transformation: [
          {
            width: 500,
            height: 500,
            crop: "fill",
            gravity: "auto",
          },
        ],
      }
    );

    newPublicId = uploadResult.public_id;

    // Remember the previous avatar before replacing it.
    const previousPublicId = req.user.avatarPublicId;

    // Save the new avatar to the authenticated user's account.
    req.user.avatar = uploadResult.secure_url;
    req.user.avatarPublicId = uploadResult.public_id;

    await req.user.save();

    // Delete the previous Cloudinary image after saving succeeds.
    if (
      previousPublicId &&
      previousPublicId !== newPublicId
    ) {
      try {
        await cloudinary.uploader.destroy(previousPublicId, {
          resource_type: "image",
        });
      } catch (cleanupError) {
        console.error(
          "Previous avatar cleanup error:",
          cleanupError
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Profile image updated successfully.",
      user: {
        id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        username: req.user.username,
        email: req.user.email,
        phone: req.user.phone,
        avatar: req.user.avatar,
        avatarPublicId: req.user.avatarPublicId,
        role: req.user.role,
      },
    });
  } catch (error) {
    console.error("Account avatar upload error:", error);

    // Roll back the new Cloudinary image if the update fails.
    if (newPublicId) {
      try {
        await cloudinary.uploader.destroy(newPublicId, {
          resource_type: "image",
        });
      } catch (cleanupError) {
        console.error(
          "New avatar rollback error:",
          cleanupError
        );
      }
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update your profile image.",
    });
  } finally {
    if (temporaryFile) {
      try {
        await fs.unlink(temporaryFile);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error(
            "Account avatar temporary-file cleanup error:",
            cleanupError
          );
        }
      }
    }
  }
};

module.exports = {
  uploadProductImage,
  uploadProductVideo,
  uploadCustomReference,
  uploadRegistrationAvatar,
    uploadActivityMedia,
    uploadAcademyPaymentReceipt,
     uploadDigitalEmbroideryFile,
     uploadAccountAvatar,
}