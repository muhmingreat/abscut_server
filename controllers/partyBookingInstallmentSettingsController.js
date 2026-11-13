
const PartyBookingInstallmentSettings = require(
  "../models/PartyBookingInstallmentSettings"
);

// =====================================================
// DEFAULT SETTINGS
// =====================================================

const DEFAULT_SETTINGS = {
  settingsKey: "party-booking-installments",
  enabled: true,
  minimumDepositType: "percentage",
  minimumDepositValue: 50,
  maxInstallments: 4,
  customerChoosesPaymentDates: true,
  requireFullPaymentBeforeFulfilment: true,
  bankTransferEnabled: true,
  paystackEnabled: true,
  flutterwaveEnabled: true,
};


// =====================================================
// GET SETTINGS
// =====================================================

exports.getPartyBookingInstallmentSettings = async (
  req,
  res
) => {
  try {
    const settings =
      await PartyBookingInstallmentSettings.findOneAndUpdate(
        { settingsKey: "party-booking-installments" },
        {
          $setOnInsert: DEFAULT_SETTINGS,
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
        }
      );

    return res.status(200).json({
      success: true,
      settings,
    });

  } catch (error) {
    console.error(
      "Get party booking installment settings error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to load party booking payment settings.",
    });
  }
};


// =====================================================
// UPDATE SETTINGS
// ADMIN ONLY THROUGH ROUTE MIDDLEWARE
// =====================================================

exports.updatePartyBookingInstallmentSettings = async (
  req,
  res
) => {
  try {
    const {
      enabled,
      minimumDepositType,
      minimumDepositValue,
      maxInstallments,
      customerChoosesPaymentDates,
      requireFullPaymentBeforeFulfilment,
      bankTransferEnabled,
      paystackEnabled,
      flutterwaveEnabled,
    } = req.body;

    // -----------------------------------------------
    // BOOLEAN VALIDATION
    // -----------------------------------------------

    const booleanFields = {
      enabled,
      customerChoosesPaymentDates,
      requireFullPaymentBeforeFulfilment,
      bankTransferEnabled,
      paystackEnabled,
      flutterwaveEnabled,
    };

    for (const [field, value] of Object.entries(booleanFields)) {
      if (value !== undefined && typeof value !== "boolean") {
        return res.status(400).json({
          success: false,
          message: `${field} must be true or false.`,
        });
      }
    }

    // -----------------------------------------------
    // DEPOSIT TYPE
    // -----------------------------------------------

    if (
      minimumDepositType !== undefined &&
      !["percentage", "fixed"].includes(minimumDepositType)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid minimum deposit type.",
      });
    }

    // -----------------------------------------------
    // DEPOSIT VALUE
    // -----------------------------------------------

    if (minimumDepositValue !== undefined) {
      if (
        typeof minimumDepositValue !== "number" ||
        !Number.isFinite(minimumDepositValue) ||
        minimumDepositValue <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Minimum deposit value must be greater than zero.",
        });
      }

      const depositType =
        minimumDepositType ||
        (
          await PartyBookingInstallmentSettings.findOne({
            settingsKey: "party-booking-installments",
          })
        )?.minimumDepositType ||
        "percentage";

      if (
        depositType === "percentage" &&
        minimumDepositValue > 100
      ) {
        return res.status(400).json({
          success: false,
          message: "Percentage deposit cannot exceed 100%.",
        });
      }
    }

    // -----------------------------------------------
    // MAXIMUM INSTALLMENTS
    // -----------------------------------------------

    if (maxInstallments !== undefined) {
      if (
        !Number.isInteger(maxInstallments) ||
        maxInstallments < 2 ||
        maxInstallments > 12
      ) {
        return res.status(400).json({
          success: false,
          message: "Maximum installments must be between 2 and 12.",
        });
      }
    }

    // -----------------------------------------------
    // PAYMENT METHOD VALIDATION
    // -----------------------------------------------

    const current =
      await PartyBookingInstallmentSettings.findOne({
        settingsKey: "party-booking-installments",
      });

    const methods = {
      bankTransferEnabled:
        bankTransferEnabled ?? current?.bankTransferEnabled ?? true,

      paystackEnabled:
        paystackEnabled ?? current?.paystackEnabled ?? true,

      flutterwaveEnabled:
        flutterwaveEnabled ?? current?.flutterwaveEnabled ?? true,
    };

    if (!Object.values(methods).some(Boolean)) {
      return res.status(400).json({
        success: false,
        message: "At least one payment method must remain enabled.",
      });
    }

    // -----------------------------------------------
    // BUILD SAFE UPDATE
    // -----------------------------------------------

    const updates = {};

    const allowedFields = [
      "enabled",
      "minimumDepositType",
      "minimumDepositValue",
      "maxInstallments",
      "customerChoosesPaymentDates",
      "requireFullPaymentBeforeFulfilment",
      "bankTransferEnabled",
      "paystackEnabled",
      "flutterwaveEnabled",
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const settings =
      await PartyBookingInstallmentSettings.findOneAndUpdate(
        { settingsKey: "party-booking-installments" },
        {
          $setOnInsert: DEFAULT_SETTINGS,
          $set: updates,
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
        }
      );

    return res.status(200).json({
      success: true,
      message: "Party booking payment settings updated successfully.",
      settings,
    });

  } catch (error) {
    console.error(
      "Update party booking installment settings error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to update party booking payment settings.",
    });
  }
};
