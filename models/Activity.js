
const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    postType: {
      type: String,
      enum: ["text", "image", "video"],
      default: "text",
      index: true,
    },

    title: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },

    header: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },

    content: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },

    // Legacy compatibility
    caption: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },

    mediaUrl: {
      type: String,
      trim: true,
      default: "",
    },

    mediaPublicId: {
      type: String,
      trim: true,
      default: "",
    },

    mediaType: {
      type: String,
      enum: ["none", "image", "video"],
      default: "none",
    },

    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    published: {
      type: Boolean,
      default: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

activitySchema.index({ published: 1, createdAt: -1 });

module.exports = mongoose.model("Activity", activitySchema);
