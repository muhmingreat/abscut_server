
const mongoose = require("mongoose");

const inventoryMovementSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "opening_stock",
        "stock_added",
        "sale",
        "cancellation_return",
        "manual_adjustment",
        "return",
      ],
      required: true,
    },

    // Positive = stock added; negative = stock removed.
    quantityChange: {
      type: Number,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: "Quantity change must be a whole number.",
      },
    },

    stockBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    stockAfter: {
      type: Number,
      required: true,
      min: 0,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
  },
  { timestamps: true }
);

inventoryMovementSchema.index({ createdAt: -1 });

module.exports = mongoose.model(
  "InventoryMovement",
  inventoryMovementSchema
);
