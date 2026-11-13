const mongoose = require("mongoose");

// =====================================================
// ABS CUT FASHION ACADEMY — COURSE MODEL
// =====================================================

const resourceSchema = new mongoose.Schema(
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

// -----------------------------------------------------
// LESSON
// -----------------------------------------------------

const lessonSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    lessonType: {
      type: String,
      enum: ["video", "article", "live"],
      default: "video",
    },

    videoUrl: {
      type: String,
      default: "",
      trim: true,
    },

    durationSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },

    content: {
      type: String,
      default: "",
    },

    resources: {
      type: [resourceSchema],
      default: [],
    },

    isPreview: {
      type: Boolean,
      default: false,
    },

    order: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { _id: true }
);

// -----------------------------------------------------
// COURSE MODULE
// -----------------------------------------------------

const moduleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    lessons: {
      type: [lessonSchema],
      default: [],
    },

    order: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { _id: true }
);

// -----------------------------------------------------
// COURSE
// -----------------------------------------------------

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    shortDescription: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    level: {
      type: String,
      enum: [
        "beginner",
        "intermediate",
        "advanced",
        "all-levels",
      ],
      default: "beginner",
    },

    language: {
      type: String,
      default: "English",
      trim: true,
    },

    thumbnail: {
      type: String,
      default: "",
      trim: true,
    },

    instructorName: {
      type: String,
      default: "ABS CUT",
      trim: true,
    },

    instructorBio: {
      type: String,
      default: "",
      trim: true,
    },

    price: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
    },

    isFree: {
      type: Boolean,
      default: false,
    },

    modules: {
      type: [moduleSchema],
      default: [],
    },

    requirements: {
      type: [String],
      default: [],
    },

    learningOutcomes: {
      type: [String],
      default: [],
    },

    estimatedDurationHours: {
      type: Number,
      default: 0,
      min: 0,
    },

    certificateEnabled: {
      type: Boolean,
      default: true,
    },

    accessDurationDays: {
      type: Number,
      default: null,
      min: 1,
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },

    publishedAt: {
      type: Date,
      default: null,
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

courseSchema.pre("validate", function () {
  if (this.isFree) {
    this.price = 0;
  }

  if (!this.isFree && this.price <= 0) {
    this.invalidate(
      "price",
      "Paid courses must have a price greater than zero."
    );
  }

  if (this.status === "published" && !this.publishedAt) {
    this.publishedAt = new Date();
  }
});

// =====================================================
// INDEXES
// =====================================================

courseSchema.index({
  status: 1,
  category: 1,
  createdAt: -1,
});

courseSchema.index({
  title: "text",
  shortDescription: "text",
  description: "text",
});

// =====================================================
// EXPORT
// =====================================================

module.exports = mongoose.model("Course", courseSchema);