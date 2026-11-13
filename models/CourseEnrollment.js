const mongoose = require("mongoose");

// =====================================================
// ABS CUT FASHION ACADEMY — COURSE ENROLLMENT MODEL
// =====================================================

const courseEnrollmentSchema = new mongoose.Schema(
  {
    // STUDENT
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // COURSE
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },

    // COURSE DETAILS AT ENROLMENT
    courseSnapshot: {
      title: {
        type: String,
        required: true,
      },
      price: {
        type: Number,
        required: true,
        min: 0,
      },
      currency: {
        type: String,
        default: "NGN",
      },
      isFree: {
        type: Boolean,
        default: false,
      },
    },

    // ENROLMENT STATUS
    status: {
      type: String,
      enum: ["pending_payment", "active", "completed", "cancelled", "refunded"],
      default: "pending_payment",
    },

    // PAYMENT STATUS
    paymentStatus: {
      type: String,
      enum: [
        "not_required",
        "pending",
        "partially_paid",
        "paid",
        "failed",
        "refunded",
      ],
      default: "pending",
    },

    amountDue: {
      type: Number,
      required: true,
      min: 0,
    },

    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
    },

    // PAYMENT PLAN
    paymentPlan: {
      type: String,
      enum: ["full", "installment", null],
      default: null,
    },

    // Number of successfully verified installment payments.
    // Full payment is recorded as 1 payment.
    installmentsPaid: {
      type: Number,
      default: 0,
      min: 0,
      max: 2,
    },

    paymentProvider: {
      type: String,
      enum: ["paystack", "flutterwave", "bank_transfer", null],
      default: null,
    },

    paymentReference: {
      type: String,
      default: null,
      trim: true,
    },

    // LEARNING PROGRESS
    completedLessonIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
      },
    ],

    progressPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    lastAccessedAt: {
      type: Date,
      default: null,
    },

    // IMPORTANT DATES
    enrolledAt: {
      type: Date,
      default: Date.now,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    accessExpiresAt: {
      type: Date,
      default: null,
    },

    // CERTIFICATE
    certificateIssued: {
      type: Boolean,
      default: false,
    },

    certificateIssuedAt: {
      type: Date,
      default: null,
    },
    certificateNumber: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// PREVENT DUPLICATE ENROLMENTS
courseEnrollmentSchema.index(
  {
    user: 1,
    course: 1,
  },
  {
    unique: true,
  },
);

// PAYMENT REFERENCE INDEX
courseEnrollmentSchema.index(
  {
    paymentReference: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      paymentReference: {
        $type: "string",
      },
    },
  },
);
courseEnrollmentSchema.index(
  { certificateNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      certificateNumber: { $type: "string" },
    },
  }
);

// STUDENT DASHBOARD INDEX
courseEnrollmentSchema.index({
  user: 1,
  status: 1,
  enrolledAt: -1,
});

module.exports = mongoose.model("CourseEnrollment", courseEnrollmentSchema);
