
const mongoose = require("mongoose");

const productLikeSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate likes by the same customer.
productLikeSchema.index(
  { product: 1, customer: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "ProductLike",
  productLikeSchema
);
