
const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const protect = authMiddleware;
const { adminOnly } = authMiddleware;

const {
  getCustomOrderInstallmentSettings,
  updateCustomOrderInstallmentSettings,
} = require("../controllers/customOrderInstallmentSettingsController");

const {
  getPartyBookingInstallmentSettings,
  updatePartyBookingInstallmentSettings,
} = require("../controllers/partyBookingInstallmentSettingsController");

const {
  // Paystack — normal orders
  initializePayment,
  verifyPayment,
  paystackWebhook,

  // Paystack — custom orders
  initializeCustomOrderPayment,
  verifyCustomOrderPayment,

  // Flutterwave
  initializeFlutterwavePayment,
  verifyFlutterwavePayment,
  flutterwaveWebhook,

  // Bank transfers
  initializeBankTransfer,
  submitBankTransfer,
  confirmBankTransfer,
  getPendingBankTransfers,
  rejectBankTransfer,
  getAdminPaymentHistory,

  // Party Bookings
  initializePartyBookingPayment,
  verifyPartyBookingPayment,
} = require("../controllers/paymentController");

const router = express.Router();


// =========================================================
// PAYSTACK — NORMAL ORDERS
// =========================================================

router.post(
  "/initialize",
  protect,
  initializePayment
);

router.get(
  "/verify/:reference",
  protect,
  verifyPayment
);


// =========================================================
// PAYSTACK — CUSTOM ORDERS
// =========================================================

router.post(
  "/custom-order/initialize",
  protect,
  initializeCustomOrderPayment
);

router.get(
  "/custom-order/test",
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Custom order payment route is connected.",
    });
  }
);

router.get(
  "/custom-order/verify/:reference",
  protect,
  verifyCustomOrderPayment
);


// =========================================================
// PAYSTACK WEBHOOK
// =========================================================

router.post(
  "/webhook",
  paystackWebhook
);


// =========================================================
// FLUTTERWAVE — NORMAL AND CUSTOM ORDERS
// =========================================================

router.post(
  "/flutterwave/initialize",
  protect,
  initializeFlutterwavePayment
);

router.get(
  "/flutterwave/verify/:reference",
  protect,
  verifyFlutterwavePayment
);

router.post(
  "/flutterwave/webhook",
  flutterwaveWebhook
);


// =========================================================
// BANK TRANSFER — NORMAL AND CUSTOM ORDERS
// =========================================================

// Initialize a bank transfer.
router.post(
  "/bank-transfer/initialize",
  protect,
  initializeBankTransfer
);

// Customer submits transfer information and evidence.
router.post(
  "/bank-transfer/submit",
  protect,
  submitBankTransfer
);

// Admin confirms a transfer after independently verifying
// the money received in the bank account.
router.post(
  "/bank-transfer/confirm",
  protect,
  adminOnly,
  confirmBankTransfer
);

// Admin retrieves pending bank transfers.
router.get(
  "/bank-transfer/pending",
  protect,
  adminOnly,
  getPendingBankTransfers
);

// Admin rejects a bank transfer.
router.post(
  "/bank-transfer/reject",
  protect,
  adminOnly,
  rejectBankTransfer
);


// =========================================================
// ADMIN PAYMENT HISTORY
// =========================================================

router.get(
  "/admin/history",
  protect,
  adminOnly,
  getAdminPaymentHistory
);


// =========================================================
// CUSTOM ORDER INSTALLMENT SETTINGS
// =========================================================

// Customers can read Custom Order payment rules.
router.get(
  "/custom-order/installment-settings",
  protect,
  getCustomOrderInstallmentSettings
);

// Only administrators can update Custom Order payment rules.
router.put(
  "/custom-order/installment-settings",
  protect,
  adminOnly,
  updateCustomOrderInstallmentSettings
);


// =========================================================
// PARTY BOOKING PAYMENTS
// =========================================================

// Initialize a Party Booking installment payment.
router.post(
  "/party-booking/initialize",
  protect,
  initializePartyBookingPayment
);

// Verify a Party Booking payment.
router.get(
  "/party-booking/verify/:reference",
  protect,
  verifyPartyBookingPayment
);


// =========================================================
// PARTY BOOKING INSTALLMENT SETTINGS
// =========================================================

// Publicly readable payment rules.
router.get(
  "/party-booking/installment-settings",
  getPartyBookingInstallmentSettings
);

// Only administrators can update Party Booking payment rules.
router.put(
  "/party-booking/installment-settings",
  protect,
  adminOnly,
  updatePartyBookingInstallmentSettings
);


// =========================================================
// EXPORT ROUTER
// =========================================================

module.exports = router;
