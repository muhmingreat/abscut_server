const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  yards: { type: Number, min: 0, default: 0 },
  price: { type: Number, min: 0, required: true },
  description: { type: String, trim: true, default: "" },
}, { _id: true });

const partyMaterialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true, index: true },
  variety: { type: String, trim: true, default: "" },
  description: { type: String, trim: true, default: "" },
  image: { type: String, trim: true, default: "" },
  colors: [{ type: String, trim: true }],
  packages: { type: [packageSchema], default: [] },
  headwear: {
    available: { type: Boolean, default: false },
    type: { type: String, enum: ["cap", "gele", "cap-or-gele", ""], default: "" },
    price: { type: Number, min: 0, default: 0 },
    stock: { type: Number, min: 0, default: 0 },
  },
  stock: { type: Number, min: 0, required: true, default: 0 },
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

partyMaterialSchema.index({ active: 1, category: 1, name: 1 });
module.exports = mongoose.model("PartyMaterial", partyMaterialSchema);
