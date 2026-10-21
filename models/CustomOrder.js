const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    address: {
      type: String,
      default: "",
      trim: true,
    },

    area: {
      type: String,
      default: "",
      trim: true,
    },

    landmark: {
      type: String,
      default: "",
      trim: true,
    },

    // Ready for future map integration
    latitude: {
      type: Number,
      default: null,
    },

    longitude: {
      type: Number,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const customOrderSchema = new mongoose.Schema(
  {
    // =====================================================
    // CUSTOMER
    // =====================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // =====================================================
    // SERVICE TYPE
    // =====================================================

    serviceType: {
      type: String,
      enum: [
        "Custom Tailoring",
        "Embroidery",
        "Monogram",
        "Tailoring & Embroidery",
        "Tailoring & Monogram",
        "Tailoring, Embroidery & Monogram",
      ],
      default: "Custom Tailoring",
    },

    // =====================================================
    // OUTFIT DETAILS
    // =====================================================

    outfitType: {
      type: String,
      required: true,
      trim: true,
    },

    fabric: {
      type: String,
      default: "",
      trim: true,
    },

    color: {
      type: String,
      default: "",
      trim: true,
    },

    // =====================================================
    // MATERIAL
    // =====================================================

    materialSource: {
      type: String,
      enum: ["ABS CUT", "Customer", "Already Made Garment", "Not Required"],
      default: "ABS CUT",
    },

    materialDescription: {
      type: String,
      default: "",
      trim: true,
    },

    // =====================================================
    // MATERIAL PICKUP
    // =====================================================

    pickupRequired: {
      type: Boolean,
      default: false,
    },

    pickupLocation: {
      type: locationSchema,
      default: () => ({}),
    },

    pickupFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    // =====================================================
    // EMBROIDERY
    // =====================================================

    embroidery: {
      type: String,
      enum: ["yes", "no"],
      default: "no",
    },

    embroideryDetails: {
      type: String,
      default: "",
      trim: true,
    },

    // =====================================================
    // MONOGRAM
    // =====================================================

    monogram: {
      type: String,
      enum: ["yes", "no"],
      default: "no",
    },

    monogramText: {
      type: String,
      default: "",
      trim: true,
      maxlength: 50,
    },

    // =====================================================
    // MEASUREMENTS
    // =====================================================

    measurements: {
      type: String,
      default: "",
      trim: true,
    },

    measurementMethod: {
      type: String,
      enum: [
        "Customer Provided",
        "ABS CUT Measurement",
        "To Be Confirmed",
        "Not Required",
      ],
      default: "To Be Confirmed",
    },

    // =====================================================
    // REFERENCE IMAGE
    // =====================================================

    referenceImage: {
      url: {
        type: String,
        default: "",
        trim: true,
      },

      publicId: {
        type: String,
        default: "",
        trim: true,
      },

      originalName: {
        type: String,
        default: "",
        trim: true,
      },
    },

    // =====================================================
    // DELIVERY
    // =====================================================

    deliveryRequired: {
      type: Boolean,
      default: false,
    },

    deliveryLocation: {
      type: locationSchema,
      default: () => ({}),
    },

    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    // =====================================================
    // CUSTOMER NOTES
    // =====================================================

    notes: {
      type: String,
      default: "",
      trim: true,
    },

    // =====================================================
    // PRICING
    // =====================================================

    tailoringFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    materialFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    embroideryFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    monogramFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Total quotation given by ABS CUT
    quotation: {
      type: Number,
      default: null,
      min: 0,
    },

    // =====================================================
    // ADMIN NOTES
    // =====================================================

    adminNotes: {
      type: String,
      default: "",
      trim: true,
    },

    productionNotes: {
      type: String,
      default: "",
      trim: true,
    },

    // =====================================================
    // ORDER STATUS
    // =====================================================

    status: {
      type: String,
      enum: [
        "Pending Review",
        "Under Review",
        "Quote Sent",
        "Awaiting Payment",
        "Confirmed",
        "In Production",
        "Ready",
        "Completed",
        "Cancelled",
      ],
      default: "Pending Review",
    },

    // =====================================================
    // PAYMENT
    // =====================================================

    paymentStatus: {
      type: String,
      enum: ["Not Required", "Pending", "Partially Paid", "Paid", "Refunded"],
      default: "Not Required",
    },

    // amountPaid: {
    //   type: Number,
    //   default: 0,
    //   min: 0,
    // },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymentReference: {
      type: String,
      default: "",
      trim: true,
    },

    paymentTransactionId: {
      type: String,
      default: "",
      trim: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("CustomOrder", customOrderSchema);
