
const CustomOrderInstallmentSettings = require(
  "../models/CustomOrderInstallmentSettings"
);

const SETTINGS_KEY = "custom-order-installments";

const getCustomOrderInstallmentSettings =
  async (req, res) => {
    try {
      let settings =
        await CustomOrderInstallmentSettings.findOne({
          settingsKey: SETTINGS_KEY,
        });

      if (!settings) {
        settings =
          await CustomOrderInstallmentSettings.create({
            settingsKey: SETTINGS_KEY,
          });
      }

      return res.status(200).json({
        success: true,
        settings,
      });
    } catch (error) {
      console.error(
        "Get installment settings error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Unable to load installment settings.",
      });
    }
  };

const updateCustomOrderInstallmentSettings =
  async (req, res) => {
    try {
      const {
        enabled,
        minimumDepositType,
        minimumDepositValue,
        maxInstallments,
        requireDepositBeforeProduction,
      } = req.body;

      if (typeof enabled !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "Installment enabled must be true or false.",
        });
      }

      if (
        !["percentage", "fixed"].includes(
          minimumDepositType
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid minimum deposit type.",
        });
      }

      const depositValue = Number(minimumDepositValue);

      if (
        !Number.isFinite(depositValue) ||
        depositValue <= 0 ||
        (
          minimumDepositType === "percentage" &&
          depositValue > 100
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            minimumDepositType === "percentage"
              ? "Deposit percentage must be greater than 0 and no more than 100."
              : "Fixed deposit must be greater than zero.",
        });
      }

      const installmentCount = Number(maxInstallments);

      if (
        !Number.isInteger(installmentCount) ||
        installmentCount < 2 ||
        installmentCount > 12
      ) {
        return res.status(400).json({
          success: false,
          message: "Maximum installments must be between 2 and 12.",
        });
      }

      if (
        typeof requireDepositBeforeProduction !== "boolean"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Production deposit requirement must be true or false.",
        });
      }

      const settings =
        await CustomOrderInstallmentSettings.findOneAndUpdate(
          { settingsKey: SETTINGS_KEY },
          {
            $set: {
              enabled,
              minimumDepositType,
              minimumDepositValue: depositValue,
              maxInstallments: installmentCount,
              requireDepositBeforeProduction,
            },
            $setOnInsert: {
              settingsKey: SETTINGS_KEY,
            },
          },
          {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          }
        );

      return res.status(200).json({
        success: true,
        message: "Installment settings saved successfully.",
        settings,
      });
    } catch (error) {
      console.error(
        "Update installment settings error:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Unable to save installment settings.",
      });
    }
  };

module.exports = {
  getCustomOrderInstallmentSettings,
  updateCustomOrderInstallmentSettings,
};
