
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const controller = require("../controllers/activityController");

const router = express.Router();

const protect = authMiddleware;
const { adminOnly } = authMiddleware;

// Public published feed
router.get("/", controller.listActivities);

// Admin feed including drafts
router.get("/admin/all", protect, adminOnly, (req, res, next) => {
  req.query.all = "true";
  return controller.listActivities(req, res, next);
});

// Authenticated users may upload media
router.post(
  "/media",
  protect,
  controller.upload.single("media"),
  controller.uploadActivityFile
);

// Create post: authenticated users
router.post("/", protect, controller.createActivity);

// Edit/delete post: owner or admin
router.patch("/:id", protect, controller.updateActivity);
router.delete("/:id", protect, controller.deleteActivity);

// Like/unlike post
router.post("/:id/like", protect, controller.toggleActivityLike);

// Comments and replies
router.get("/:id/comments", controller.listActivityComments);
router.post("/:id/comments", protect, controller.createActivityComment);

// Edit/delete comment or reply
router.patch(
  "/comments/:commentId",
  protect,
  controller.updateActivityComment
);

router.delete(
  "/comments/:commentId",
  protect,
  controller.deleteActivityComment
);

module.exports = router;


