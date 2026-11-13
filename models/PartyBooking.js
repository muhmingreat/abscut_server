const mongoose = require("mongoose");

// =====================================================
// BOOKING ITEM
// =====================================================
const isFiniteNumber = (value) => Number.isFinite(value);

const isWholeNumber = (value) => Number.isInteger(value);

const bookingItemSchema = new mongoose.Schema(
  {
    material: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PartyMaterial",
      required: true,
    },

    materialName: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    variety: {
      type: String,
      default: "",
      trim: true,
    },

    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    packageName: {
      type: String,
      required: true,
      trim: true,
    },

    yards: {
      type: Number,
      min: 0,
      default: 0,
    },

    // quantity: {
    //   type: Number,
    //   min: 1,
    //   required: true,
    // },
    quantity: {
      type: Number,
      min: 1,
      required: true,
      validate: {
        validator: isWholeNumber,
        message: "Material quantity must be a whole number.",
      },
    },

    headwearQuantity: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator: isWholeNumber,
        message: "Headwear quantity must be a whole number.",
      },
    },
    unitPrice: {
      type: Number,
      min: 0,
      required: true,
    },

    headwearType: {
      type: String,
      enum: ["none", "cap", "gele"],
      default: "none",
    },

    // headwearQuantity: {
    //   type: Number,
    //   min: 0,
    //   default: 0,
    // },

    headwearUnitPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false },
);

// =====================================================
// INSTALLMENT SCHEDULE
// =====================================================

const installmentSchema = new mongoose.Schema(
  {
    // amount: {
    //   type: Number,
    //   required: true,
    //   min: 0.01,
    // },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
      validate: {
        validator: isFiniteNumber,
        message: "Installment amount must be a finite number.",
      },
    },

    dueDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["scheduled", "paid", "overdue", "cancelled"],
      default: "scheduled",
    },

    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },

    paidAt: {
      type: Date,
      default: null,
    },
  },
  { _id: true },
);

// =====================================================
// PARTY BOOKING
// =====================================================

const partyBookingSchema = new mongoose.Schema(
  {
    // CUSTOMER

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // MATERIALS

    items: {
      type: [bookingItemSchema],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: "A booking must contain at least one material.",
      },
    },

    // EVENT DETAILS

    eventDate: {
      type: Date,
      required: true,
      index: true,
    },

    eventType: {
      type: String,
      trim: true,
      required: true,
      maxlength: 120,
    },

    // partySize: {
    //   type: Number,
    //   min: 1,
    //   required: true,
    // },

    partySize: {
      type: Number,
      min: 1,
      required: true,
      validate: {
        validator: isWholeNumber,
        message: "Party size must be a whole number.",
      },
    },

    // CONTACT DETAILS

    contactName: {
      type: String,
      trim: true,
      required: true,
      maxlength: 120,
    },

    phone: {
      type: String,
      trim: true,
      required: true,
      maxlength: 40,
    },

    // COLLECTION / DELIVERY

    deliveryMethod: {
      type: String,
      enum: ["collection", "delivery"],
      required: true,
    },

    deliveryAddress: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },

    // Actual agreed collection or delivery date.
    // This is deliberately separate from eventDate.

    fulfilmentDate: {
      type: Date,
      default: null,
    },

    // =================================================
    // QUOTATION
    // =================================================

    quotationAmount: {
      type: Number,
      min: 0,
      default: null,
    },

    quotationAcceptedAt: {
      type: Date,
      default: null,
    },

    // =================================================
    // PAYMENT DEADLINE
    // =================================================

    paymentDeadline: {
      type: Date,
      default: null,
    },

    // =================================================
    // INSTALLMENT SCHEDULE
    // =================================================

    installmentSchedule: {
      type: [installmentSchema],
      default: [],
    },

    scheduleStatus: {
      type: String,
      enum: ["not-submitted", "pending-review", "approved", "rejected"],
      default: "not-submitted",
    },

    // =================================================
    // PAYMENT TRACKING
    // These values must only be updated by verified
    // payment processing, never customer input.
    // =================================================

    paymentStatus: {
      type: String,
      enum: ["unpaid", "part-paid", "paid", "refunded"],
      default: "unpaid",
    },

    // amountPaid: {
    //   type: Number,
    //   min: 0,
    //   default: 0,
    // },
    amountPaid: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator: isFiniteNumber,
        message: "Amount paid must be a finite number.",
      },
    },
    // =================================================
    // BOOKING STATUS
    // =================================================

    status: {
      type: String,
      enum: [
        "pending-review",
        "quoted",
        "confirmed",
        "ready",
        "completed",
        "cancelled",
      ],
      default: "pending-review",
      index: true,
    },

    // =================================================
    // INVENTORY TRACKING
    // =================================================

    stockDeducted: {
      type: Boolean,
      default: false,
    },

    // Helps distinguish reserved inventory from
    // inventory that has been fully released.

    stockReservedAt: {
      type: Date,
      default: null,
    },

    // CUSTOMER NOTES

    customerNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },

    // ADMIN NOTES

    adminNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 3000,
    },
  },
  {
    timestamps: true,
  },
);

// =====================================================
// INDEXES
// =====================================================

partyBookingSchema.index({
  status: 1,
  eventDate: 1,
  createdAt: -1,
});

partyBookingSchema.index({
  customer: 1,
  createdAt: -1,
});

partyBookingSchema.index({
  paymentStatus: 1,
  paymentDeadline: 1,
});

// =====================================================
// MODEL
// =====================================================

module.exports = mongoose.model("PartyBooking", partyBookingSchema);
