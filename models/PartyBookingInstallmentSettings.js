
const mongoose = require("mongoose");

const partyBookingInstallmentSettingsSchema =
  new mongoose.Schema(
    {
      settingsKey: {
        type: String,
        default: "party-booking-installments",
        unique: true,
        immutable: true,
      },

      enabled: {
        type: Boolean,
        default: true,
      },

      minimumDepositType: {
        type: String,
        enum: ["percentage", "fixed"],
        default: "percentage",
      },

      minimumDepositValue: {
        type: Number,
        min: 0.01,
        default: 50,
      },

      maxInstallments: {
        type: Number,
        min: 2,
        max: 12,
        default: 4,
      },

      customerChoosesPaymentDates: {
        type: Boolean,
        default: true,
      },

      requireFullPaymentBeforeFulfilment: {
        type: Boolean,
        default: true,
      },

      bankTransferEnabled: {
        type: Boolean,
        default: true,
      },

      paystackEnabled: {
        type: Boolean,
        default: true,
      },

      flutterwaveEnabled: {
        type: Boolean,
        default: true,
      },
    },
    {
      timestamps: true,
    }
  );

module.exports = mongoose.model(
  "PartyBookingInstallmentSettings",
  partyBookingInstallmentSettingsSchema
);
