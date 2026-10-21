const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    orderType: {
      type: String,
      enum: ["Order", "CustomOrder"],
      required: true,
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    provider: {
      type: String,
      enum: ["paystack", "flutterwave", "bank_transfer"],
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

    transferSenderName: {
      type: String,
      default: "",
      trim: true,
    },

    receiptUrl: {
      type: String,
      default: "",
      trim: true,
    },

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

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

// Declare this compound index only once.
paymentSchema.index(
  { provider: 1, transactionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      transactionId: { $type: "string" },
    },
  },
);

module.exports = mongoose.model("Payment", paymentSchema);
