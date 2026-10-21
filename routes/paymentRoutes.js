
const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");
const protect = authMiddleware;
const { adminOnly } = authMiddleware;
const {
  getCustomOrderInstallmentSettings,
  updateCustomOrderInstallmentSettings,
} = require("../controllers/customOrderInstallmentSettingsController");

const {
  // Existing Paystack functions
  initializePayment,
  verifyPayment,
  initializeCustomOrderPayment,
  verifyCustomOrderPayment,
  paystackWebhook,

  // New Flutterwave functions
  initializeFlutterwavePayment,
  verifyFlutterwavePayment,
  flutterwaveWebhook,

  // New bank-transfer functions
  initializeBankTransfer,
  submitBankTransfer,
  confirmBankTransfer,
  getAdminPaymentHistory,
  getPendingBankTransfers,
  rejectBankTransfer,
} = require("../controllers/paymentController");

const router = express.Router()


// =========================================================
// EXISTING PAYSTACK ROUTES — PRESERVED
// =========================================================

router.post("/initialize", protect, initializePayment);

router.get("/verify/:reference", protect, verifyPayment);

router.post(
  "/custom-order/initialize",
  protect,
  initializeCustomOrderPayment
);

router.get("/custom-order/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Custom order payment route is connected.",
  });
});

router.get(
  "/custom-order/verify/:reference",
  protect,
  verifyCustomOrderPayment
);

router.post("/webhook", paystackWebhook);


// =========================================================
// FLUTTERWAVE — NORMAL AND CUSTOM ORDERS
// =========================================================

// Initialize with { orderId } or { customOrderId }.
router.post(
  "/flutterwave/initialize",
  protect,
  initializeFlutterwavePayment
);

// Verify using the reference and transaction_id.
router.get(
  "/flutterwave/verify/:reference",
  protect,
  verifyFlutterwavePayment
);

// Flutterwave calls this endpoint directly.
router.post(
  "/flutterwave/webhook",
  flutterwaveWebhook
);


// =========================================================
// BANK TRANSFER — NORMAL AND CUSTOM ORDERS
// =========================================================

// Initialize with { orderId } or { customOrderId }.
router.post(
  "/bank-transfer/initialize",
  protect,
  initializeBankTransfer
);

// Customer submits { paymentId, transferSenderName, receiptUrl? }.
router.post(
  "/bank-transfer/submit",
  protect,
  submitBankTransfer
);

// Only authenticated administrators can confirm a transfer.
router.post(
  "/bank-transfer/confirm",
  protect,
  adminOnly,
  confirmBankTransfer
);

// Admin bank-transfer management
router.get(
  "/bank-transfer/pending",
  protect,
  adminOnly,
  getPendingBankTransfers
);

router.post(
  "/bank-transfer/reject",
  protect,
  adminOnly,
  rejectBankTransfer
);
router.get(
  "/admin/history",
  protect,
  adminOnly,
  getAdminPaymentHistory
);

// Custom-order installment policy
router.get(
  "/custom-order/installment-settings",
  protect,
  getCustomOrderInstallmentSettings
);

router.put(
  "/custom-order/installment-settings",
  protect,
  adminOnly,
  updateCustomOrderInstallmentSettings
);
module.exports = router;




