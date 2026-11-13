

const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    // physical or digital purchase
    purchaseMode: {
      type: String,
      enum: ["physical", "digital"],
      default: "physical",
    },

    // piece, yard, or design
    priceUnit: {
      type: String,
      enum: ["piece", "yard", "design"],
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0.5,
    },
  },
  {
    _id: true,
  }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Cart", cartSchema);
