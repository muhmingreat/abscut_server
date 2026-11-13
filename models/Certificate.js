
const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema(
  {
    certificateNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },

    enrollment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseEnrollment",
      required: true,
      unique: true,
    },

    studentName: {
      type: String,
      required: true,
      trim: true,
    },

    courseTitle: {
      type: String,
      required: true,
      trim: true,
    },

    instructorName: {
      type: String,
      trim: true,
      default: "ABS CUT Fashion Academy",
    },

    issuedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    certificateUrl: {
      type: String,
      trim: true,
      default: "",
    },

    verificationStatus: {
      type: String,
      enum: ["valid", "revoked"],
      default: "valid",
      index: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    revocationReason: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },

    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

certificateSchema.index({ student: 1, issuedAt: -1 });
certificateSchema.index({ verificationStatus: 1, issuedAt: -1 });

module.exports = mongoose.model("Certificate", certificateSchema)
