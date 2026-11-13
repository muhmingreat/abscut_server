
const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/authMiddleware");

const {
  initializeAcademyPayment,
  verifyAcademyPayment,
  getAcademyBankTransferDetails,
  initializeAcademyBankTransfer,
  submitAcademyBankTransferEvidence,
  confirmAcademyBankTransfer,
  rejectAcademyBankTransfer,
} = require("../controllers/academyCoursePaymentController");

// =============================================
// STUDENT PAYMENT ROUTES
// =============================================

// Initialize Paystack or Flutterwave payment
router.post(
  "/payments/initialize",
  protect,
  initializeAcademyPayment
);

// Verify gateway payment
router.post(
  "/payments/verify",
  protect,
  verifyAcademyPayment
);

// Get bank account details
router.get(
  "/payments/bank-details",
  protect,
  getAcademyBankTransferDetails
);

// Initialize bank transfer
router.post(
  "/payments/bank-transfer/initialize",
  protect,
  initializeAcademyBankTransfer
);

// Submit bank transfer evidence
router.post(
  "/payments/bank-transfer/submit",
  protect,
  submitAcademyBankTransferEvidence
);

// =============================================
// ADMIN BANK TRANSFER ROUTES
// =============================================

// Confirm bank transfer
router.post(
  "/payments/bank-transfer/confirm",
  
  protect,
  adminOnly,
  confirmAcademyBankTransfer
);

// Reject bank transfer
router.post(
  "/admin/payments/bank-transfer/reject",
  protect,
  adminOnly,
  rejectAcademyBankTransfer
);

module.exports = router;
