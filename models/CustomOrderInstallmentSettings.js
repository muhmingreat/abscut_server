
const mongoose = require("mongoose");

const customOrderInstallmentSettingsSchema =
  new mongoose.Schema(
    {
      // Keep one settings document for ABS CUT.
      settingsKey: {
        type: String,
        default: "custom-order-installments",
        unique: true,
        immutable: true,
      },

      enabled: {
        type: Boolean,
        default: true,
        required: true,
      },

      minimumDepositType: {
        type: String,
        enum: ["percentage", "fixed"],
        default: "percentage",
        required: true,
      },

      // Percentage or fixed amount in NGN, depending on the type.
      minimumDepositValue: {
        type: Number,
        default: 30,
        min: 0,
        required: true,
      },

      // Total payments allowed, including the initial deposit.
      maxInstallments: {
        type: Number,
        default: 4,
        min: 2,
        max: 12,
        required: true,
      },

      requireDepositBeforeProduction: {
        type: Boolean,
        default: true,
        required: true,
      },
    },
    { timestamps: true }
  );

module.exports = mongoose.model(
  "CustomOrderInstallmentSettings",
  customOrderInstallmentSettingsSchema
);
