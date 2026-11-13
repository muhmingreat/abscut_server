
const mongoose = require("mongoose");

const activityCommentSchema = new mongoose.Schema(
  {
    activity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Activity",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    content: {
      type: String,
      trim: true,
      required: true,
      maxlength: 2000,
    },

    // Null means this is a top-level comment.
    // An ObjectId means this is a reply.
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActivityComment",
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

activityCommentSchema.index({ activity: 1, createdAt: 1 });

module.exports = mongoose.model(
  "ActivityComment",
  activityCommentSchema
);
