const mongoose = require("mongoose");

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
      required: true,
      trim: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
  },
  { _id: true },
);

const productSchema = new mongoose.Schema(
  {
    // Existing product fields
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    image: { type: String, default: "", trim: true },
    video: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    stock: { type: Number, default: 0, min: 0 },
    featured: { type: Boolean, default: false },
    active: { type: Boolean, default: true },

    // Product classification
    productType: {
      type: String,
      enum: ["ready_to_wear", "raw_material", "monogram", "phoenix_embroidery"],
      default: "ready_to_wear",
    },

    // Pricing unit
    priceUnit: {
      type: String,
      enum: ["piece", "yard", "design"],
      default: "piece",
    },

    // Raw material inventory measured in yards
    stockInYards: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Digital purchase option
    digitalAvailable: {
      type: Boolean,
      default: false,
    },

    digitalPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    digitalFiles: {
      type: [digitalFileSchema],
      default: [],
    },

    // Physical purchase option
    physicalAvailable: {
      type: Boolean,
      default: true,
    },

    physicalPrice: {
      type: Number,
      default: null,
      min: 0,
    },

    // Physical delivery
    deliveryAvailable: {
      type: Boolean,
      default: false,
    },

    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Product", productSchema);
