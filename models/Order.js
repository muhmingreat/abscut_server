
const mongoose = require("mongoose");

// =====================================================
// DIGITAL FILE SNAPSHOT
// =====================================================

const digitalFileSchema = new mongoose.Schema(
  {
    format: {
      type: String,
      enum: ["DST", "PES", "JEF", "EXP"],
      required: true,
    },
    storageKey: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      default: "",
    },
    fileSize: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

// =====================================================
// ORDER ITEM
// =====================================================

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    image: {
      type: String,
      default: "",
      trim: true,
    },

    video: {
      type: String,
      default: "",
      trim: true,
    },

    productType: {
      type: String,
      enum: [
        "ready_to_wear",
        "raw_material",
        "monogram",
        "phoenix_embroidery",
      ],
      default: "ready_to_wear",
    },

    purchaseMode: {
      type: String,
      enum: ["physical", "digital"],
      default: "physical",
    },

    priceUnit: {
      type: String,
      enum: ["piece", "yard", "design"],
      default: "piece",
    },

    // Price per piece, yard, or design
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0.5,
    },

    digitalFiles: {
      type: [digitalFileSchema],
      default: [],
    },
  },
  { _id: false },
);

// =====================================================
// ORDER
// =====================================================

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "Order must contain at least one item.",
      },
    },

    customer: {
      firstName: {
        type: String,
        required: true,
        trim: true,
      },

      lastName: {
        type: String,
        required: true,
        trim: true,
      },

      phone: {
        type: String,
        required: true,
        trim: true,
      },

      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
      },
    },

    shippingAddress: {
      address: {
        type: String,
        trim: true,
        default: "",
      },

      city: {
        type: String,
        trim: true,
        default: "",
      },

      state: {
        type: String,
        trim: true,
        default: "",
      },

      area: {
        type: String,
        default: "",
      },

      landmark: {
        type: String,
        default: "",
      },
    },

    deliveryMethod: {
      type: String,
      enum: ["delivery", "pickup", "digital"],
      default: "delivery",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    deliveryFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    deliveryZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryZone",
      default: null,
    },

    deliveryZoneName: {
      type: String,
      default: "",
      trim: true,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    paymentReference: {
      type: String,
      trim: true,
      default: "",
    },

    paymentTransactionId: {
      type: String,
      trim: true,
      default: "",
    },

    paidAt: {
      type: Date,
      default: null,
    },

    orderStatus: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Order", orderSchema);

