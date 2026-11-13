
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const multer = require("multer");
const Activity = require("../models/Activity");
const ActivityComment = require("../models/ActivityComment");
const cloudinary = require("../config/cloudinary");


const upload = multer({
  dest: path.join(os.tmpdir(), "abs-cut-activity-uploads"),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/");

    cb(ok ? null : new Error("Only image and video files are allowed."), ok);
  },
});

const isAdmin = (req) => req.user?.role === "admin";

const getUserId = (req) => req.user?._id || req.user?.id;

const isOwner = (ownerId, userId) =>
  String(ownerId) === String(userId);

function normalizePostType(data) {
  if (data.postType) return data.postType;

  if (data.mediaType === "video") return "video";
  if (data.mediaType === "image" || data.mediaUrl) return "image";

  return "text";
}

function validatePost(data) {
  const postType = normalizePostType(data);

  if (!["text", "image", "video"].includes(postType)) {
    return "Choose a valid post type.";
  }

  if (!String(data.title || "").trim()) {
    return "Post title is required.";
  }

  if (!String(data.header || "").trim()) {
    return "Post header is required.";
  }

  if (!String(data.content || data.caption || "").trim()) {
    return "Post content is required.";
  }

  if (postType === "image") {
    if (!data.mediaUrl || data.mediaType !== "image") {
      return "Image posts require an uploaded image.";
    }
  }

  if (postType === "video") {
    if (!data.mediaUrl || data.mediaType !== "video") {
      return "Video posts require an uploaded video.";
    }
  }

  return null;
}

function normalizePostData(data) {
  const postType = normalizePostType(data);
  const content = String(data.content ?? data.caption ?? "").trim();

  return {
    postType,
    title: String(data.title || "").trim(),
    header: String(data.header || "").trim(),
    content,
    caption: content,

    mediaUrl: postType === "text" ? "" : String(data.mediaUrl || "").trim(),
    mediaPublicId:
      postType === "text" ? "" : String(data.mediaPublicId || "").trim(),
    mediaType:
      postType === "text"
        ? "none"
        : postType === "image"
          ? "image"
          : "video",
  };
}

// --------------------------------------------
// MEDIA UPLOAD
// --------------------------------------------

async function uploadActivityFile(req, res) {
  let filePath;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Choose an image or video to upload.",
      });
    }

    filePath = req.file.path;

    const isVideo = req.file.mimetype.startsWith("video/");

    const result = await cloudinary.uploader.upload(filePath, {
      folder: "abs-cut/activities",
      resource_type: isVideo ? "video" : "image",
      ...(isVideo ? { eager_async: true } : {}),
    });

    if (isVideo && Number(result.duration || 0) > 60) {
      await cloudinary.uploader
        .destroy(result.public_id, { resource_type: "video" })
        .catch(() => {});

      return res.status(400).json({
        success: false,
        message: "Activity videos must be 60 seconds or shorter.",
      });
    }

    return res.status(201).json({
      success: true,
      media: {
        url: result.secure_url,
        publicId: result.public_id,
        type: isVideo ? "video" : "image",
      },
    });
  } catch (error) {
    console.error("Activity media upload failed:", error);

    return res.status(500).json({
      success: false,
      message: "Activity media upload failed. Check Cloudinary configuration.",
    });
  } finally {
    if (filePath) await fs.unlink(filePath).catch(() => {});
  }
}

// --------------------------------------------
// LIST POSTS
// --------------------------------------------

async function listActivities(req, res) {
  try {
    const filter =
      isAdmin(req) && req.query.all === "true"
        ? {}
        : { published: true };

    const activities = await Activity.find(filter)
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const userId = getUserId(req);

    const enriched = await Promise.all(
      activities.map(async (activity) => {
        const commentCount = await ActivityComment.countDocuments({
          activity: activity._id,
        });

        return {
          ...activity,
          content: activity.content || activity.caption || "",
          postType: normalizePostType(activity),
          likesCount: activity.likes?.length || 0,
          likedByMe: userId
            ? activity.likes?.some((id) => String(id) === String(userId))
            : false,
          commentsCount: commentCount,
        };
      })
    );

    return res.json({ success: true, activities: enriched });
  } catch (error) {
    console.error("List activities failed:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load activities.",
    });
  }
}

// --------------------------------------------
// CREATE POST
// --------------------------------------------

async function createActivity(req, res) {
  try {
    const data = normalizePostData(req.body);
    const error = validatePost({ ...req.body, ...data });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const published =
      req.body.published === undefined
        ? true
        : req.body.published === true || req.body.published === "true";

    const activity = await Activity.create({
      ...data,
      published,
      createdBy: getUserId(req),
    });

    return res.status(201).json({ success: true, activity });
  } catch (error) {
    console.error("Create activity failed:", error);

    return res.status(500).json({
      success: false,
      message: "Could not create activity.",
    });
  }
}

// --------------------------------------------
// UPDATE POST
// --------------------------------------------

async function updateActivity(req, res) {
  try {
    const activity = await Activity.findById(req.params.id);

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: "Activity not found.",
      });
    }

    const userId = getUserId(req);

    if (!isAdmin(req) && !isOwner(activity.createdBy, userId)) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own posts.",
      });
    }

    const incoming = {
      postType: req.body.postType ?? activity.postType,
      title: req.body.title ?? activity.title,
      header: req.body.header ?? activity.header,
      content: req.body.content ?? req.body.caption ?? activity.content ?? activity.caption,
      mediaUrl: req.body.mediaUrl ?? activity.mediaUrl,
      mediaPublicId: req.body.mediaPublicId ?? activity.mediaPublicId,
      mediaType: req.body.mediaType ?? activity.mediaType,
    };

    const data = normalizePostData(incoming);
    const error = validatePost({ ...incoming, ...data });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    Object.assign(activity, data);

    // Only admins may publish/unpublish posts.
    if (isAdmin(req) && req.body.published !== undefined) {
      activity.published =
        req.body.published === true || req.body.published === "true";
    }

    await activity.save();

    return res.json({ success: true, activity });
  } catch (error) {
    console.error("Update activity failed:", error);

    return res.status(500).json({
      success: false,
      message: "Could not update activity.",
    });
  }
}

// --------------------------------------------
// DELETE POST
// --------------------------------------------

async function deleteActivity(req, res) {
  try {
    const activity = await Activity.findById(req.params.id);

    if (!activity) {
      return res.status(404).json({
        success: false,
        message: "Activity not found.",
      });
    }

    const userId = getUserId(req);

    if (!isAdmin(req) && !isOwner(activity.createdBy, userId)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own posts.",
      });
    }

    await ActivityComment.deleteMany({ activity: activity._id });
    await activity.deleteOne();

    if (activity.mediaPublicId && process.env.CLOUDINARY_CLOUD_NAME) {
      await cloudinary.uploader
        .destroy(activity.mediaPublicId, {
          resource_type: activity.mediaType === "video" ? "video" : "image",
        })
        .catch((err) =>
          console.error("Cloudinary cleanup failed:", err.message)
        );
    }

    return res.json({
      success: true,
      message: "Activity deleted.",
    });
  } catch (error) {
    console.error("Delete activity failed:", error);

    return res.status(500).json({
      success: false,
      message: "Could not delete activity.",
    });
  }
}

// --------------------------------------------
// LIKE / UNLIKE POST
// --------------------------------------------

async function toggleActivityLike(req, res) {
  try {
    const activity = await Activity.findById(req.params.id);

    if (!activity || !activity.published) {
      return res.status(404).json({
        success: false,
        message: "Activity not found.",
      });
    }

    const userId = getUserId(req);
    const alreadyLiked = activity.likes.some(
      (id) => String(id) === String(userId)
    );

    if (alreadyLiked) {
      activity.likes.pull(userId);
    } else {
      activity.likes.addToSet(userId);
    }

    await activity.save();

    return res.json({
      success: true,
      liked: !alreadyLiked,
      likesCount: activity.likes.length,
    });
  } catch (error) {
    console.error("Activity like failed:", error);

    return res.status(500).json({
      success: false,
      message: "Could not update like.",
    });
  }
}

// --------------------------------------------
// LIST COMMENTS / REPLIES
// --------------------------------------------

async function listActivityComments(req, res) {
  try {
    const activity = await Activity.findById(req.params.id);

    if (!activity || !activity.published) {
      return res.status(404).json({
        success: false,
        message: "Activity not found.",
      });
    }

    const comments = await ActivityComment.find({
      activity: activity._id,
    })
      .populate("user", "name")
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ success: true, comments });
  } catch (error) {
    console.error("List activity comments failed:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load comments.",
    });
  }
}

// --------------------------------------------
// CREATE COMMENT / REPLY
// --------------------------------------------

async function createActivityComment(req, res) {
  try {
    const activity = await Activity.findById(req.params.id);

    if (!activity || !activity.published) {
      return res.status(404).json({
        success: false,
        message: "Activity not found.",
      });
    }

    const content = String(req.body.content || "").trim();

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Write a comment before submitting.",
      });
    }

    if (content.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Comments cannot exceed 2,000 characters.",
      });
    }

    let parentComment = null;

    if (req.body.parentComment) {
      parentComment = await ActivityComment.findById(req.body.parentComment);

      if (
        !parentComment ||
        String(parentComment.activity) !== String(activity._id)
      ) {
        return res.status(400).json({
          success: false,
          message: "The comment you are replying to is invalid.",
        });
      }
    }

    const comment = await ActivityComment.create({
      activity: activity._id,
      user: getUserId(req),
      content,
      parentComment: parentComment?._id || null,
    });

    await comment.populate("user", "name");

    return res.status(201).json({
      success: true,
      comment,
    });
  } catch (error) {
    console.error("Create activity comment failed:", error);

    return res.status(500).json({
      success: false,
      message: "Could not create comment.",
    });
  }
}

// --------------------------------------------
// UPDATE COMMENT
// --------------------------------------------

async function updateActivityComment(req, res) {
  try {
    const comment = await ActivityComment.findById(req.params.commentId);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found.",
      });
    }

    if (!isAdmin(req) && !isOwner(comment.user, getUserId(req))) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own comments.",
      });
    }

    const content = String(req.body.content || "").trim();

    if (!content || content.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Comment must contain 1–2,000 characters.",
      });
    }

    comment.content = content;
    await comment.save();
    await comment.populate("user", "name");

    return res.json({ success: true, comment });
  } catch (error) {
    console.error("Update activity comment failed:", error);

    return res.status(500).json({
      success: false,
      message: "Could not update comment.",
    });
  }
}

// --------------------------------------------
// DELETE COMMENT / REPLIES
// --------------------------------------------

async function deleteActivityComment(req, res) {
  try {
    const comment = await ActivityComment.findById(req.params.commentId);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found.",
      });
    }

    if (!isAdmin(req) && !isOwner(comment.user, getUserId(req))) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own comments.",
      });
    }

    // Remove replies belonging to this comment as well.
    await ActivityComment.deleteMany({
      parentComment: comment._id,
    });

    await comment.deleteOne();

    return res.json({
      success: true,
      message: "Comment deleted.",
    });
  } catch (error) {
    console.error("Delete activity comment failed:", error);

    return res.status(500).json({
      success: false,
      message: "Could not delete comment.",
    });
  }
}

module.exports = {
  upload,
  uploadActivityFile,
  listActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  toggleActivityLike,
  listActivityComments,
  createActivityComment,
  updateActivityComment,
  deleteActivityComment,
};

