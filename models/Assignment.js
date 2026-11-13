
const mongoose = require("mongoose");

// =====================================================
// ABS CUT FASHION ACADEMY — ASSIGNMENT MODEL
// =====================================================

const assignmentResourceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    url: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["pdf", "document", "image", "link", "other"],
      default: "other",
    },
  },
  { _id: true }
);

const assignmentSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },

    // References the _id of a module inside Course.modules.
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    instructions: {
      type: String,
      required: true,
      trim: true,
    },

    submissionType: {
      type: String,
      enum: ["image", "video", "document", "mixed"],
      default: "image",
    },

    resources: {
      type: [assignmentResourceSchema],
      default: [],
    },

    totalMarks: {
      type: Number,
      default: 100,
      min: 1,
    },

    passingMarks: {
      type: Number,
      default: 50,
      min: 0,
    },

    dueDate: {
      type: Date,
      default: null,
    },

    allowResubmission: {
      type: Boolean,
      default: true,
    },

    // Maximum number of submissions, including the first.
    maxSubmissions: {
      type: Number,
      default: 3,
      min: 1,
    },

    status: {
      type: String,
      enum: ["draft", "published", "closed"],
      default: "draft",
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// =====================================================
// VALIDATION
// =====================================================

assignmentSchema.pre("validate", function () {
  if (this.passingMarks > this.totalMarks) {
    this.invalidate(
      "passingMarks",
      "Passing marks cannot exceed total marks."
    );
  }

  if (
    this.dueDate &&
    Number.isNaN(new Date(this.dueDate).getTime())
  ) {
    this.invalidate("dueDate", "Invalid assignment due date.");
  }
});

// =====================================================
// INDEXES
// =====================================================

assignmentSchema.index({
  course: 1,
  status: 1,
  dueDate: 1,
});

assignmentSchema.index({
  course: 1,
  moduleId: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Assignment", assignmentSchema);
