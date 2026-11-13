
"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");

const paystack = require("../config/paystack")

const Order = require("../models/Order");
const CustomOrder = require("../models/CustomOrder");
const Payment = require("../models/Payment");
const CustomOrderInstallmentSettings = require(
  "../models/CustomOrderInstallmentSettings"
);
const PartyBooking = require("../models/PartyBooking");
const PartyBookingInstallmentSettings = require(
  "../models/PartyBookingInstallmentSettings"
);

const { notifyAdminPayment } = require(
  "../services/notificationService"
);

// ============================================================
// CONSTANTS
// ============================================================

const CURRENCY = "NGN";

const CUSTOM_PAYMENT_STATUSES = {
  PENDING: "Pending",
  PARTIAL: "Partially Paid",
  PAID: "Paid",
};

const ACTIVE_PAYMENT_STATUSES = [
  "pending",
  "processing",
  "awaiting_confirmation",
  "successful",
];

// ============================================================
// GENERAL HELPERS
// ============================================================

const toKobo = (amount) =>
  Math.round(Number(amount) * 100);

const fromKobo = (amount) =>
  Number(amount) / 100;

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

const makeReference = (prefix = "ABS-CUT") =>
  `${prefix}-${Date.now()}-${crypto.randomUUID()}`;

const getFrontendCallbackUrl = () => {
  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    throw new Error("FRONTEND_URL_MISSING");
  }

  return `${frontendUrl.replace(/\/+$/, "")}/payments/callback`;
};

const getUserId = (req) =>
  req.user?._id || req.user?.id;

const getCustomerEmail = (order) =>
  order?.customer?.email ||
  order?.user?.email ||
  order?.email ||
  "";

const getErrorMessage = (error) =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  "An unexpected payment error occurred.";

const getPaymentError = (message) =>
  new Error(message);

// ============================================================
// ERROR RESPONSE HELPER
// ============================================================

const sendError = (res, error, fallbackMessage) => {
  const messages = {
    FRONTEND_URL_MISSING: [
      500,
      "The payment callback URL is not configured.",
    ],

    PAYSTACK_CHECKOUT_URL_MISSING: [
      502,
      "Paystack did not return a checkout link. Please try again.",
    ],

    BANK_TRANSFER_AMOUNT_REQUIRED: [
      400,
      "Enter the exact amount transferred.",
    ],

    BANK_TRANSFER_AMOUNT_MISMATCH: [
      400,
      "The transfer amount must exactly match the amount due for this payment.",
    ],

    BANK_TRANSFER_DATE_REQUIRED: [
      400,
      "Enter the date and time of the bank transfer.",
    ],

    BANK_TRANSFER_DATE_INVALID: [
      400,
      "The transfer date and time are invalid or in the future.",
    ],

    BANK_TRANSFER_RECEIPT_REQUIRED: [
      400,
      "Upload your bank transfer receipt before submitting.",
    ],

    BANK_TRANSFER_TRANSACTION_REQUIRED: [
      400,
      "Enter the transaction ID shown by your bank.",
    ],

    BANK_TRANSFER_EVIDENCE_INCOMPLETE: [
      400,
      "This transfer cannot be reviewed because required evidence is missing.",
    ],

    BANK_TRANSFER_SENDER_REQUIRED: [
      400,
      "Enter the name used to make the bank transfer.",
    ],

    BANK_TRANSFER_DETAILS_MISSING: [
      500,
      "Bank transfer details are not configured.",
    ],

    PARTY_INSTALLMENT_PAYMENT_IN_PROGRESS: [
      409,
      "A payment attempt already exists for this installment. Please check your existing payment before trying again.",
    ],

    INVALID_TRANSACTION_ID: [
      400,
      "A valid transaction ID is required to verify this payment.",
    ],

    ORDER_NOT_FOUND: [404, "Order not found."],
    CUSTOM_ORDER_NOT_FOUND: [404, "Custom order not found."],

    ORDER_CANCELLED: [
      400,
      "This order has been cancelled and cannot be paid.",
    ],

    ORDER_ALREADY_PAID: [
      400,
      "This order has already been paid for.",
    ],

    INVALID_ORDER_TOTAL: [
      400,
      "The order total is invalid.",
    ],

    QUOTATION_NOT_READY: [
      400,
      "A quotation has not been created for this custom order yet.",
    ],

    CUSTOM_ORDER_ALREADY_PAID: [
      400,
      "This custom order has already been fully paid.",
    ],

    INVALID_PAYMENT_AMOUNT: [
      400,
      "Enter a valid payment amount greater than zero.",
    ],

    PAYMENT_EXCEEDS_BALANCE: [
      400,
      "The payment amount exceeds the outstanding balance.",
    ],

    INSTALLMENTS_DISABLED: [
      400,
      "Installment payments are currently disabled for custom orders.",
    ],

    MINIMUM_DEPOSIT_NOT_MET: [
      400,
      "The payment is below the required minimum deposit.",
    ],

    MAX_INSTALLMENTS_REACHED: [
      400,
      "The maximum number of installments has been reached.",
    ],

    PAYMENT_AMOUNT_MISMATCH: [
      400,
      "The verified payment amount does not match the payment record.",
    ],

    PAYMENT_CURRENCY_MISMATCH: [
      400,
      "The payment currency does not match the expected currency.",
    ],

    PAYMENT_REFERENCE_MISMATCH: [
      400,
      "The payment reference does not match.",
    ],

    PAYMENT_NOT_CONFIRMED: [
      400,
      "The payment provider has not confirmed this transaction.",
    ],

    PAYMENT_ALREADY_PROCESSED: [
      409,
      "This payment has already been processed.",
    ],

    PAYMENT_NOT_FOUND: [
      404,
      "Payment record not found.",
    ],

    PAYMENT_NOT_AWAITING_CONFIRMATION: [
      400,
      "This bank transfer is not awaiting confirmation.",
    ],

    INVALID_PAYMENT_PROVIDER: [
      400,
      "Unsupported payment provider.",
    ],

    PARTY_BOOKING_NOT_FOUND: [
      404,
      "Party booking not found.",
    ],

    PARTY_BOOKING_NOT_PAYABLE: [
      400,
      "This party booking is no longer eligible for payment.",
    ],

    PARTY_QUOTATION_NOT_ACCEPTED: [
      400,
      "Accept the party booking quotation before making payment.",
    ],

    PARTY_INSTALLMENT_SCHEDULE_NOT_APPROVED: [
      400,
      "Your installment schedule must be approved before payment.",
    ],

    PARTY_PAYMENT_DEADLINE_PASSED: [
      400,
      "The payment deadline for this booking has passed.",
    ],

    PARTY_BOOKING_ALREADY_PAID: [
      400,
      "This party booking has already been fully paid.",
    ],

    PARTY_INSTALLMENT_NOT_FOUND: [
      404,
      "The selected installment could not be found.",
    ],

    PARTY_INSTALLMENT_ALREADY_PROCESSED: [
      409,
      "This installment has already been processed or is no longer payable.",
    ],

    PARTY_INSTALLMENT_DUE_DATE_PASSED: [
      400,
      "The due date for this installment has passed.",
    ],

    PARTY_INSTALLMENTS_DISABLED: [
      400,
      "Party booking installment payments are currently disabled.",
    ],

    PARTY_PAYMENT_METHOD_DISABLED: [
      400,
      "This payment method is currently disabled for party bookings.",
    ],

    CUSTOMER_EMAIL_REQUIRED: [
      400,
      "A valid customer email address is required for this payment method.",
    ],
  };

  const known = messages[error?.message];

  if (known) {
    return res.status(known[0]).json({
      success: false,
      message: known[1],
    });
  }

  console.error(
    fallbackMessage || "Payment controller error:",
    error?.response?.data ||
      error?.message ||
      error
  );

  return res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Unable to process the payment request."
        : getErrorMessage(error),
  });
};

// ============================================================
// CUSTOMER / ADMIN NOTIFICATION
// ============================================================

const notifyAdminPaymentSafely = async ({
  payment,
  order: suppliedOrder = null,
}) => {
  try {
    if (!payment) {
      console.warn(
        "ABS CUT payment notification skipped: missing payment."
      );
      return;
    }

    let order = suppliedOrder;

    if (!order && payment.orderId) {
      if (payment.orderType === "PartyBooking") {
        order = await PartyBooking.findById(payment.orderId)
          .populate(
            "customer",
            "firstName lastName name email"
          );
      } else {
        const Model =
          payment.orderType === "CustomOrder"
            ? CustomOrder
            : Order;

        order = await Model.findById(payment.orderId)
          .populate(
            "user",
            "firstName lastName name email"
          );
      }
    }

    if (!order) {
      console.warn(
        "ABS CUT payment notification skipped: associated record not found.",
        payment.reference
      );
      return;
    }

    const customer =
      payment.orderType === "PartyBooking"
        ? order.customer || {}
        : order.user || {};

    const buyerName =
      [
        customer.firstName,
        customer.lastName,
      ]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      customer.name ||
      order.contactName ||
      order.name ||
      order.customerName ||
      "Customer";

    const customerEmail =
      customer.email ||
      getCustomerEmail(order) ||
      "";

    const recordLabel =
      payment.orderType === "PartyBooking"
        ? "Party Booking"
        : payment.orderType === "CustomOrder"
          ? "Custom Order"
          : "Order";

    await notifyAdminPayment({
      customerName: buyerName,
      customerEmail,
      orderId: `${recordLabel} #${order._id}`,
      amount: payment.amount,
      paymentReference:
        payment.reference ||
        order.paymentReference ||
        "",
      paymentMethod:
        payment.provider === "bank_transfer"
          ? "Bank Transfer"
          : payment.provider === "flutterwave"
            ? "Flutterwave"
            : "Paystack",
    });

    console.info(
      `ABS CUT admin payment notification sent for ${recordLabel}:`,
      payment.reference
    );
  } catch (error) {
    console.error(
      "ABS CUT admin payment notification failed:",
      error?.message || error
    );
  }
};

// ============================================================
// CUSTOM ORDER INSTALLMENT SETTINGS
// ============================================================

const getInstallmentSettings = async (session = null) => {
  let query = CustomOrderInstallmentSettings.findOne({
    settingsKey: "custom-order-installments",
  });

  if (session) {
    query = query.session(session);
  }

  let settings = await query;

  if (!settings) {
    const created =
      await CustomOrderInstallmentSettings.create([
        {
          settingsKey: "custom-order-installments",
          enabled: true,
          minimumDepositType: "percentage",
          minimumDepositValue: 30,
          maxInstallments: 4,
          requireDepositBeforeProduction: true,
        },
      ]);

    settings = created[0];
  }

  return settings;
};

const calculateMinimumDeposit = (quotation, settings) => {
  if (settings.minimumDepositType === "fixed") {
    return Math.max(
      0,
      Number(settings.minimumDepositValue || 0)
    );
  }

  return (
    Number(quotation) *
    Number(settings.minimumDepositValue || 0)
  ) / 100;
};

// ============================================================
// PARTY BOOKING INSTALLMENT SETTINGS
// ============================================================

const getPartyBookingInstallmentSettings = async () => {
  return PartyBookingInstallmentSettings.findOneAndUpdate(
    {
      settingsKey: "party-booking-installments",
    },
    {
      $setOnInsert: {
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
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

// ============================================================
// PARTY BOOKING PAYMENT VALIDATION
// ============================================================

const getPartyBookingPaymentDetails = async ({
  bookingId,
  installmentId,
  userId,
  provider,
}) => {
  if (
    !bookingId ||
    !installmentId ||
    !mongoose.Types.ObjectId.isValid(bookingId) ||
    !mongoose.Types.ObjectId.isValid(installmentId)
  ) {
    throw getPaymentError("PARTY_INSTALLMENT_NOT_FOUND");
  }

  if (
    !["paystack", "flutterwave", "bank_transfer"].includes(
      provider
    )
  ) {
    throw getPaymentError("INVALID_PAYMENT_PROVIDER");
  }

  const booking = await PartyBooking.findOne({
    _id: bookingId,
    customer: userId,
  }).populate("customer", "email");

  if (!booking) {
    throw getPaymentError("PARTY_BOOKING_NOT_FOUND");
  }

  if (
    booking.status === "cancelled" ||
    booking.status === "completed"
  ) {
    throw getPaymentError("PARTY_BOOKING_NOT_PAYABLE");
  }

  if (!booking.quotationAcceptedAt) {
    throw getPaymentError("PARTY_QUOTATION_NOT_ACCEPTED");
  }

  if (booking.scheduleStatus !== "approved") {
    throw getPaymentError(
      "PARTY_INSTALLMENT_SCHEDULE_NOT_APPROVED"
    );
  }

  const now = Date.now();

  if (
    booking.paymentDeadline &&
    new Date(booking.paymentDeadline).getTime() < now
  ) {
    throw getPaymentError("PARTY_PAYMENT_DEADLINE_PASSED");
  }

  const installment =
    booking.installmentSchedule.id(installmentId);

  if (!installment) {
    throw getPaymentError("PARTY_INSTALLMENT_NOT_FOUND");
  }

  if (installment.status !== "scheduled") {
    throw getPaymentError(
      "PARTY_INSTALLMENT_ALREADY_PROCESSED"
    );
  }

  if (new Date(installment.dueDate).getTime() < now) {
    throw getPaymentError(
      "PARTY_INSTALLMENT_DUE_DATE_PASSED"
    );
  }

  const quotationKobo = toKobo(
    booking.quotationAmount || 0
  );

  const amountPaidKobo = toKobo(
    booking.amountPaid || 0
  );

  const installmentAmountKobo = toKobo(
    installment.amount
  );

  const balanceKobo =
    quotationKobo - amountPaidKobo;

  if (quotationKobo <= 0 || balanceKobo <= 0) {
    throw getPaymentError("PARTY_BOOKING_ALREADY_PAID");
  }

  if (
    installmentAmountKobo <= 0 ||
    installmentAmountKobo > balanceKobo
  ) {
    throw getPaymentError("PAYMENT_AMOUNT_MISMATCH");
  }

  const settings =
    await getPartyBookingInstallmentSettings();

  if (!settings.enabled) {
    throw getPaymentError("PARTY_INSTALLMENTS_DISABLED");
  }

  const providerEnabled = {
    paystack: settings.paystackEnabled,
    flutterwave: settings.flutterwaveEnabled,
    bank_transfer: settings.bankTransferEnabled,
  };

  if (!providerEnabled[provider]) {
    throw getPaymentError("PARTY_PAYMENT_METHOD_DISABLED");
  }

  const customerEmail = booking.customer?.email || "";

  if (
    ["paystack", "flutterwave"].includes(provider) &&
    !customerEmail
  ) {
    throw getPaymentError("CUSTOMER_EMAIL_REQUIRED");
  }

  return {
    booking,
    installment,
    settings,
    amount: fromKobo(installmentAmountKobo),
    balance: fromKobo(balanceKobo),
    customerEmail,
  };
};

// ============================================================
// CUSTOM ORDER PAYMENT AMOUNT VALIDATION
// ============================================================

const getCustomPaymentAmount = async (
  customOrder,
  requestedAmount,
  { session = null } = {}
) => {
  const quotationKobo = toKobo(
    customOrder.quotation || 0
  );

  const amountPaidKobo = toKobo(
    customOrder.amountPaid || 0
  );

  if (quotationKobo <= 0) {
    throw getPaymentError("QUOTATION_NOT_READY");
  }

  const balanceKobo =
    quotationKobo - amountPaidKobo;

  if (balanceKobo <= 0) {
    throw getPaymentError("CUSTOM_ORDER_ALREADY_PAID");
  }

  const settings = await getInstallmentSettings(session);

  const requestedKobo =
    requestedAmount === undefined ||
    requestedAmount === null ||
    requestedAmount === ""
      ? balanceKobo
      : toKobo(requestedAmount);

  if (
    !Number.isFinite(requestedKobo) ||
    requestedKobo <= 0
  ) {
    throw getPaymentError("INVALID_PAYMENT_AMOUNT");
  }

  if (requestedKobo > balanceKobo) {
    throw getPaymentError("PAYMENT_EXCEEDS_BALANCE");
  }

  if (
    !settings.enabled &&
    requestedKobo !== balanceKobo
  ) {
    throw getPaymentError("INSTALLMENTS_DISABLED");
  }

  const completedPaymentsQuery = Payment.countDocuments({
    orderType: "CustomOrder",
    orderId: customOrder._id,
    status: "successful",
  });

  const activePaymentsQuery = Payment.countDocuments({
    orderType: "CustomOrder",
    orderId: customOrder._id,
    status: {
      $in: ACTIVE_PAYMENT_STATUSES,
    },
  });

  if (session) {
    completedPaymentsQuery.session(session);
    activePaymentsQuery.session(session);
  }

  let completedPayments = await completedPaymentsQuery;
  const activePayments = await activePaymentsQuery;

  if (
    amountPaidKobo > 0 &&
    completedPayments === 0
  ) {
    completedPayments = 1;
  }

  if (
    completedPayments >=
    Number(settings.maxInstallments)
  ) {
    throw getPaymentError("MAX_INSTALLMENTS_REACHED");
  }

  if (
    completedPayments + activePayments >=
    Number(settings.maxInstallments)
  ) {
    throw getPaymentError("MAX_INSTALLMENTS_REACHED");
  }

  if (amountPaidKobo === 0) {
    const minimumDeposit = toKobo(
      calculateMinimumDeposit(
        fromKobo(quotationKobo),
        settings
      )
    );

    if (requestedKobo < minimumDeposit) {
      throw getPaymentError("MINIMUM_DEPOSIT_NOT_MET");
    }
  }

  return {
    amount: fromKobo(requestedKobo),
    amountKobo: requestedKobo,
    balance: fromKobo(balanceKobo),
    balanceKobo,
    quotation: fromKobo(quotationKobo),
    amountPaid: fromKobo(amountPaidKobo),
    settings,
  };
};

// ============================================================
// ORDER LOOKUP
// ============================================================

const getNewPaymentOrder = async (
  req,
  orderType,
  orderId,
  requestedAmount
) => {
  const userId = getUserId(req);

  if (!userId) {
    throw getPaymentError("ORDER_NOT_FOUND");
  }

  if (!orderId || !isValidObjectId(orderId)) {
    throw getPaymentError(
      orderType === "CustomOrder"
        ? "CUSTOM_ORDER_NOT_FOUND"
        : "ORDER_NOT_FOUND"
    );
  }

  if (orderType === "Order") {
    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    });

    if (!order) {
      throw getPaymentError("ORDER_NOT_FOUND");
    }

    if (order.orderStatus === "cancelled") {
      throw getPaymentError("ORDER_CANCELLED");
    }

    if (order.paymentStatus === "paid") {
      throw getPaymentError("ORDER_ALREADY_PAID");
    }

    const totalKobo = toKobo(order.total || 0);

    if (totalKobo <= 0) {
      throw getPaymentError("INVALID_ORDER_TOTAL");
    }

    return {
      order,
      amount: fromKobo(totalKobo),
      amountKobo: totalKobo,
      balance: fromKobo(totalKobo),
      balanceKobo: totalKobo,
    };
  }

  if (orderType === "CustomOrder") {
    const customOrder = await CustomOrder.findOne({
      _id: orderId,
      user: userId,
    }).populate(
      "user",
      "email firstName lastName"
    );

    if (!customOrder) {
      throw getPaymentError("CUSTOM_ORDER_NOT_FOUND");
    }

    if (
      String(customOrder.status || "").toLowerCase() ===
      "cancelled"
    ) {
      throw getPaymentError("ORDER_CANCELLED");
    }

    const paymentAmounts = await getCustomPaymentAmount(
      customOrder,
      requestedAmount
    );

    return {
      order: customOrder,
      ...paymentAmounts,
    };
  }

  throw getPaymentError("INVALID_PAYMENT_PROVIDER");
};

// ============================================================
// REQUESTED PAYMENT AMOUNT
// ============================================================

const getRequestedPaymentAmount = (body = {}) => {
  if (
    Object.prototype.hasOwnProperty.call(body, "amount")
  ) {
    return body.amount;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      body,
      "paymentAmount"
    )
  ) {
    return body.paymentAmount;
  }

  return undefined;
};

// ============================================================
// PAYMENT LEDGER HELPERS
// ============================================================

const createPaymentRecord = async ({
  userId,
  orderType,
  orderId,
  provider,
  amount,
  reference,
  metadata = {},
}) => {
  return Payment.create({
    user: userId,
    orderType,
    orderId,
    provider,
    reference,
    amount,
    currency: CURRENCY,
    status: "pending",
    metadata,
  });
};

const findPaymentByReference = async (
  reference,
  provider,
  userId = null
) => {
  const filter = {
    reference,
    provider,
  };

  if (userId) {
    filter.user = userId;
  }

  return Payment.findOne(filter);
};

// ============================================================
// PAYSTACK VERIFICATION HELPER
// ============================================================

const verifyPaystackTransaction = async (reference) => {
  const response = await paystack.get(
    `/transaction/verify/${encodeURIComponent(reference)}`
  );

  return response?.data?.data;
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  CURRENCY,
  CUSTOM_PAYMENT_STATUSES,
  ACTIVE_PAYMENT_STATUSES,

  toKobo,
  fromKobo,
  isValidObjectId,
  makeReference,
  getFrontendCallbackUrl,
  getUserId,
  getCustomerEmail,
  getErrorMessage,
  getPaymentError,
  sendError,

  notifyAdminPaymentSafely,

  getInstallmentSettings,
  calculateMinimumDeposit,
  getPartyBookingInstallmentSettings,
  getPartyBookingPaymentDetails,
  getCustomPaymentAmount,

  getNewPaymentOrder,
  getRequestedPaymentAmount,

  createPaymentRecord,
  findPaymentByReference,
  verifyPaystackTransaction,
};
