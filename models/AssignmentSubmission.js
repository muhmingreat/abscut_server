
const mongoose = require("mongoose");

// =====================================================
// ABS CUT FASHION ACADEMY — ASSIGNMENT SUBMISSION
// =====================================================

const submissionFileSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },

    publicId: {
      type: String,
      default: "",
    },

    type: {
      type: String,
      enum: ["image", "video", "document", "other"],
      default: "other",
    },

    originalName: {
      type: String,
      default: "",
    },

    format: {
      type: String,
      default: "",
    },

    bytes: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

const assignmentSubmissionSchema = new mongoose.Schema(
  {
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
      index: true,
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    enrollment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseEnrollment",
      required: true,
      index: true,
    },

    files: {
      type: [submissionFileSchema],
      default: [],
    },

    studentComment: {
      type: String,
      default: "",
      trim: true,
      maxlength: 3000,
    },

    submissionNumber: {
      type: Number,
      default: 1,
      min: 1,
    },

    status: {
      type: String,
      enum: [
        "submitted",
        "under_review",
        "graded",
        "resubmission_required",
      ],
      default: "submitted",
      index: true,
    },

    marksAwarded: {
      type: Number,
      default: null,
      min: 0,
    },

    instructorFeedback: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },

    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    gradedAt: {
      type: Date,
      default: null,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// =====================================================
// INDEXES
// =====================================================

assignmentSubmissionSchema.index({
  assignment: 1,
  student: 1,
  submittedAt: -1,
});

// Each submission number must be unique per student
// for the same assignment.
assignmentSubmissionSchema.index(
  {
    assignment: 1,
    student: 1,
    submissionNumber: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "AssignmentSubmission",
  assignmentSubmissionSchema
);
