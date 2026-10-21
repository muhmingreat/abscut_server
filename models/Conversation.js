
const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    subject: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "ABS CUT Customer Support",
    },

    status: {
      type: String,
      enum: ["open", "resolved", "closed"],
      default: "open",
      index: true,
    },

    lastMessage: {
      type: String,
      default: "",
      maxlength: 2000,
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },

    unreadByAdmin: {
      type: Number,
      default: 0,
      min: 0,
    },

    unreadByCustomer: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

conversationSchema.index({
  customer: 1,
  status: 1,
  updatedAt: -1,
});

module.exports = mongoose.model(
  "Conversation",
  conversationSchema
);
