
const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    // =====================================================
    // USER
    // =====================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // =====================================================
    // PAYMENT PURPOSE
    // =====================================================

    // CourseEnrollment is added without removing existing
    // shop payment types.
    orderType: {
      type: String,
      enum: [
        "Order",
        "CustomOrder",
        "PartyBooking",
        "CourseEnrollment",
      ],
      required: true,
    },

    // For Academy payments, this references CourseEnrollment.
    // For shop payments, it retains its existing meaning.
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // =====================================================
    // PAYMENT PROVIDER
    // =====================================================

    provider: {
      type: String,
      enum: [
        "paystack",
        "flutterwave",
        "bank_transfer",
      ],
      required: true,
    },

    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    transactionId: {
      type: String,
      default: undefined,
      trim: true,
    },

    // =====================================================
    // PAYMENT AMOUNT
    // =====================================================

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    currency: {
      type: String,
      enum: ["NGN"],
      default: "NGN",
      required: true,
    },

    // =====================================================
    // ACADEMY INSTALLMENT DETAILS
    // =====================================================

    // These fields are optional for normal shop payments.

    paymentPlan: {
      type: String,
      enum: ["full", "installment"],
      default: undefined,
    },

    installmentNumber: {
      type: Number,
      min: 1,
      default: undefined,
    },

    totalInstallments: {
      type: Number,
      min: 1,
      default: undefined,
    },

    // =====================================================
    // PAYMENT STATUS
    // =====================================================

    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "awaiting_confirmation",
        "successful",
        "failed",
        "cancelled",
        "rejected",
      ],
      default: "pending",
      required: true,
    },

    rejectionReason: {
      type: String,
      trim: true,
      default: "",
    },

    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    // =====================================================
    // BANK TRANSFER INFORMATION
    // =====================================================

    transferSenderName: {
      type: String,
      trim: true,
      default: "",
    },

    transferAmount: {
      type: Number,
      min: 0.01,
      default: undefined,
    },

    transferDate: {
      type: Date,
      default: null,
    },

    transferTransactionId: {
      type: String,
      trim: true,
      default: "",
    },

    receiptUrl: {
      type: String,
      trim: true,
      default: "",
    },

    evidenceSubmittedAt: {
      type: Date,
      default: null,
    },

    // =====================================================
    // VERIFICATION
    // =====================================================

    verifiedAt: {
      type: Date,
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    confirmedAt: {
      type: Date,
      default: null,
    },

    // =====================================================
    // ADDITIONAL INFORMATION
    // =====================================================

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// =====================================================
// INDEXES
// =====================================================

// Prevent duplicate payment references.
paymentSchema.index(
  {
    reference: 1,
  },
  {
    unique: true,
  }
);

// Prevent duplicate gateway transaction IDs.
paymentSchema.index(
  {
    provider: 1,
    transactionId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      transactionId: {
        $type: "string",
      },
    },
  }
);

// Retrieve all payments belonging to an order/enrolment.
paymentSchema.index({
  orderType: 1,
  orderId: 1,
  createdAt: -1,
});

// Retrieve a user's payment history.
paymentSchema.index({
  user: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Payment", paymentSchema);
