
const mongoose = require("mongoose");

const aiOutfitPreviewUsageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    dateKey: {
      type: String,
      required: true,
    },

    count: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// One usage record per customer per day.
aiOutfitPreviewUsageSchema.index(
  { user: 1, dateKey: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "AIOutfitPreviewUsage",
  aiOutfitPreviewUsageSchema
);
