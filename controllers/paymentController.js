"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");

const paystack = require("../config/paystack");
const flutterwave = require("../config/flutterwave");

const Order = require("../models/Order");
const CustomOrder = require("../models/CustomOrder");
const Payment = require("../models/Payment");
const CustomOrderInstallmentSettings = require("../models/CustomOrderInstallmentSettings");
const { notifyAdminPayment } = require("../services/notificationService");
const PartyBooking = require("../models/PartyBooking");
const PartyBookingInstallmentSettings = require("../models/PartyBookingInstallmentSettings");

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

const toKobo = (amount) => Math.round(Number(amount) * 100);

const fromKobo = (amount) => Number(amount) / 100;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const makeReference = (prefix = "ABS-CUT") =>
  `${prefix}-${Date.now()}-${crypto.randomUUID()}`;

const getFrontendCallbackUrl = () => {
  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    throw new Error("FRONTEND_URL_MISSING");
  }

  return `${frontendUrl.replace(/\/+$/, "")}/payments/callback`;
};

const getUserId = (req) => req.user?._id || req.user?.id;

const getCustomerEmail = (order) =>
  order?.customer?.email || order?.user?.email || order?.email || "";

const getErrorMessage = (error) =>
  error?.response?.data?.message ||
  error?.response?.data?.error ||
  error?.message ||
  "An unexpected payment error occurred.";

const sendError = (res, error, fallbackMessage) => {
  const messages = {
    FRONTEND_URL_MISSING: [500, "The payment callback URL is not configured."],

    PAYSTACK_CHECKOUT_URL_MISSING: [
      502,
      "Paystack did not return a checkout link. Please try again.",
    ],
    BANK_TRANSFER_AMOUNT_REQUIRED: [400, "Enter the exact amount transferred."],

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
    FLUTTERWAVE_CHECKOUT_URL_MISSING: [
      502,
      "Flutterwave did not return a checkout link. Please try again.",
    ],

    BANK_TRANSFER_RECEIPT_REQUIRED: [
      400,
      "Upload your bank transfer receipt before submitting.",
    ],
    PARTY_INSTALLMENT_PAYMENT_IN_PROGRESS: [
      409,
      "A payment attempt already exists for this installment. Please check your existing payment before trying again.",
    ],
    BANK_TRANSFER_TRANSACTION_REQUIRED: [
      400,
      "Enter the transaction ID shown by your bank.",
    ],

    BANK_TRANSFER_EVIDENCE_INCOMPLETE: [
      400,
      "This transfer cannot be reviewed because required evidence is missing.",
    ],

    INVALID_TRANSACTION_ID: [
      400,
      "A valid transaction ID is required to verify this payment.",
    ],

    ORDER_NOT_FOUND: [404, "Order not found."],

    CUSTOM_ORDER_NOT_FOUND: [404, "Custom order not found."],

    ORDER_CANCELLED: [400, "This order has been cancelled and cannot be paid."],

    ORDER_ALREADY_PAID: [400, "This order has already been paid for."],

    INVALID_ORDER_TOTAL: [400, "The order total is invalid."],

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

    PAYMENT_REFERENCE_MISMATCH: [400, "The payment reference does not match."],

    PAYMENT_NOT_CONFIRMED: [
      400,
      "The payment provider has not confirmed this transaction.",
    ],

    PAYMENT_ALREADY_PROCESSED: [
      409,
      "This payment has already been processed.",
    ],

    PAYMENT_NOT_FOUND: [404, "Payment record not found."],

    PAYMENT_NOT_AWAITING_CONFIRMATION: [
      400,
      "This bank transfer is not awaiting confirmation.",
    ],

    BANK_TRANSFER_DETAILS_MISSING: [
      500,
      "Bank transfer details are not configured.",
    ],

    BANK_TRANSFER_SENDER_REQUIRED: [
      400,
      "Enter the name used to make the bank transfer.",
    ],

    INVALID_PAYMENT_PROVIDER: [400, "Unsupported payment provider."],
    PARTY_BOOKING_NOT_FOUND: [
      404,
      "The party booking associated with this payment could not be found.",
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

    PARTY_BOOKING_NOT_FOUND: [404, "Party booking not found."],

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
    error?.response?.data || error?.message || error,
  );

  return res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Unable to process the payment request."
        : getErrorMessage(error),
  });
};

const getPaymentError = (message) => new Error(message);

// ============================================================
// INSTALLMENT SETTINGS
// ============================================================
const notifyAdminPaymentSafely = async ({
  payment,
  order: suppliedOrder = null,
}) => {
  try {
    if (!payment) {
      console.warn("ABS CUT payment notification skipped: missing payment.");
      return;
    }

    let order = suppliedOrder;

    // Retrieve the associated booking or order.
    if (!order && payment.orderId) {
      if (payment.orderType === "PartyBooking") {
        order = await PartyBooking.findById(payment.orderId).populate(
          "customer",
          "firstName lastName name email",
        );
      } else {
        const Model = payment.orderType === "CustomOrder" ? CustomOrder : Order;

        order = await Model.findById(payment.orderId).populate(
          "user",
          "firstName lastName name email",
        );
      }
    }

    if (!order) {
      console.warn(
        "ABS CUT payment notification skipped: associated record not found.",
        payment.reference,
      );
      return;
    }

    // Party bookings use the customer reference.
    // Ordinary and custom orders use the user reference.
    const customer =
      payment.orderType === "PartyBooking"
        ? order.customer || {}
        : order.user || {};

    const buyerName =
      [customer.firstName, customer.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      customer.name ||
      order.contactName ||
      order.name ||
      order.customerName ||
      "Customer";

    const customerEmail = customer.email || getCustomerEmail(order) || "";

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

      paymentReference: payment.reference || order.paymentReference || "",

      paymentMethod:
        payment.provider === "bank_transfer"
          ? "Bank Transfer"
          : payment.provider === "flutterwave"
            ? "Flutterwave"
            : "Paystack",
    });

    console.info(
      `ABS CUT admin payment notification sent for ${recordLabel}:`,
      payment.reference,
    );
  } catch (error) {
    // Payment processing must not fail because a notification fails.
    console.error(
      "ABS CUT admin payment notification failed:",
      error?.message || error,
    );
  }
};

const getInstallmentSettings = async (session = null) => {
  let query = CustomOrderInstallmentSettings.findOne({
    settingsKey: "custom-order-installments",
  });

  if (session) {
    query = query.session(session);
  }

  let settings = await query;

  if (!settings) {
    const created = await CustomOrderInstallmentSettings.create([
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
    return Math.max(0, Number(settings.minimumDepositValue || 0));
  }

  return (Number(quotation) * Number(settings.minimumDepositValue || 0)) / 100;
};

// ============================================================
// PARTY BOOKING PAYMENT VALIDATION
// ============================================================

const getPartyBookingInstallmentSettings = async () => {
  return PartyBookingInstallmentSettings.findOneAndUpdate(
    { settingsKey: "party-booking-installments" },
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
    },
  );
};

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

  if (!["paystack", "flutterwave", "bank_transfer"].includes(provider)) {
    throw getPaymentError("INVALID_PAYMENT_PROVIDER");
  }

  // Retrieve the booking and the customer's email.
  const booking = await PartyBooking.findOne({
    _id: bookingId,
    customer: userId,
  }).populate("customer", "email");

  if (!booking) {
    throw getPaymentError("PARTY_BOOKING_NOT_FOUND");
  }

  if (booking.status === "cancelled" || booking.status === "completed") {
    throw getPaymentError("PARTY_BOOKING_NOT_PAYABLE");
  }

  if (!booking.quotationAcceptedAt) {
    throw getPaymentError("PARTY_QUOTATION_NOT_ACCEPTED");
  }

  if (booking.scheduleStatus !== "approved") {
    throw getPaymentError("PARTY_INSTALLMENT_SCHEDULE_NOT_APPROVED");
  }

  const now = Date.now();

  if (
    booking.paymentDeadline &&
    new Date(booking.paymentDeadline).getTime() < now
  ) {
    throw getPaymentError("PARTY_PAYMENT_DEADLINE_PASSED");
  }

  const installment = booking.installmentSchedule.id(installmentId);

  if (!installment) {
    throw getPaymentError("PARTY_INSTALLMENT_NOT_FOUND");
  }

  if (installment.status !== "scheduled") {
    throw getPaymentError("PARTY_INSTALLMENT_ALREADY_PROCESSED");
  }

  if (new Date(installment.dueDate).getTime() < now) {
    throw getPaymentError("PARTY_INSTALLMENT_DUE_DATE_PASSED");
  }

  const quotationKobo = toKobo(booking.quotationAmount || 0);
  const amountPaidKobo = toKobo(booking.amountPaid || 0);
  const installmentAmountKobo = toKobo(installment.amount);

  const balanceKobo = quotationKobo - amountPaidKobo;

  if (quotationKobo <= 0 || balanceKobo <= 0) {
    throw getPaymentError("PARTY_BOOKING_ALREADY_PAID");
  }

  if (installmentAmountKobo <= 0 || installmentAmountKobo > balanceKobo) {
    throw getPaymentError("PAYMENT_AMOUNT_MISMATCH");
  }

  const settings = await getPartyBookingInstallmentSettings();

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

  if (["paystack", "flutterwave"].includes(provider) && !customerEmail) {
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

/**
 * Validates the amount a customer wants to pay on a custom order.
 *
 * All calculations are performed in kobo to reduce floating-point
 * errors. The returned amounts are converted back to naira.
 */
const getCustomPaymentAmount = async (
  customOrder,
  requestedAmount,
  { session = null } = {},
) => {
  const quotationKobo = toKobo(customOrder.quotation || 0);
  const amountPaidKobo = toKobo(customOrder.amountPaid || 0);

  if (quotationKobo <= 0) {
    throw getPaymentError("QUOTATION_NOT_READY");
  }

  const balanceKobo = quotationKobo - amountPaidKobo;

  if (balanceKobo <= 0) {
    throw getPaymentError("CUSTOM_ORDER_ALREADY_PAID");
  }

  const settings = await getInstallmentSettings(session);

  // No requested amount means the customer is paying the full
  // outstanding balance, not necessarily the original quotation.
  const requestedKobo =
    requestedAmount === undefined ||
    requestedAmount === null ||
    requestedAmount === ""
      ? balanceKobo
      : toKobo(requestedAmount);

  if (!Number.isFinite(requestedKobo) || requestedKobo <= 0) {
    throw getPaymentError("INVALID_PAYMENT_AMOUNT");
  }

  if (requestedKobo > balanceKobo) {
    throw getPaymentError("PAYMENT_EXCEEDS_BALANCE");
  }

  if (!settings.enabled && requestedKobo !== balanceKobo) {
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
    status: { $in: ACTIVE_PAYMENT_STATUSES },
  });

  if (session) {
    completedPaymentsQuery.session(session);
    activePaymentsQuery.session(session);
  }

  let completedPayments = await completedPaymentsQuery;
  const activePayments = await activePaymentsQuery;

  // Compatibility with custom orders that already have an amountPaid
  // value from the old system but no ledger payment records.
  if (amountPaidKobo > 0 && completedPayments === 0) {
    completedPayments = 1;
  }

  if (completedPayments >= Number(settings.maxInstallments)) {
    throw getPaymentError("MAX_INSTALLMENTS_REACHED");
  }

  // Count active checkout attempts when determining whether the
  // maximum installment count is already reserved.
  if (completedPayments + activePayments >= Number(settings.maxInstallments)) {
    throw getPaymentError("MAX_INSTALLMENTS_REACHED");
  }

  if (amountPaidKobo === 0) {
    const minimumDeposit = toKobo(
      calculateMinimumDeposit(fromKobo(quotationKobo), settings),
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

const getNewPaymentOrder = async (req, orderType, orderId, requestedAmount) => {
  const userId = getUserId(req);

  if (!userId) {
    throw getPaymentError("ORDER_NOT_FOUND");
  }

  if (!orderId || !isValidObjectId(orderId)) {
    throw getPaymentError(
      orderType === "CustomOrder"
        ? "CUSTOM_ORDER_NOT_FOUND"
        : "ORDER_NOT_FOUND",
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

    // Product orders must always be paid in full.
    // Ignore any requested partial amount.
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
    }).populate("user", "email firstName lastName");

    if (!customOrder) {
      throw getPaymentError("CUSTOM_ORDER_NOT_FOUND");
    }

    if (String(customOrder.status || "").toLowerCase() === "cancelled") {
      throw getPaymentError("ORDER_CANCELLED");
    }

    const paymentAmounts = await getCustomPaymentAmount(
      customOrder,
      requestedAmount,
    );

    return {
      order: customOrder,
      ...paymentAmounts,
    };
  }

  throw getPaymentError("INVALID_PAYMENT_PROVIDER");
};

/**
 * Accept the current frontend field `amount` and the older
 * `paymentAmount` field for backward compatibility.
 *
 * An explicitly supplied amount of 0 or an invalid value is
 * passed to server-side validation; it must not silently become
 * a full-balance payment.
 */
const getRequestedPaymentAmount = (body = {}) => {
  if (Object.prototype.hasOwnProperty.call(body, "amount")) {
    return body.amount;
  }

  if (Object.prototype.hasOwnProperty.call(body, "paymentAmount")) {
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

const findPaymentByReference = async (reference, provider, userId = null) => {
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
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );

  return response?.data?.data;
};

// ============================================================
// NORMAL PRODUCT ORDER — PAYSTACK INITIALIZATION
// ============================================================

const initializePayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required.",
      });
    }

    const { order, amount, amountKobo } = await getNewPaymentOrder(
      req,
      "Order",
      orderId,
    );

    const email = getCustomerEmail(order);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "A valid customer email is required.",
      });
    }

    const reference = makeReference("ABS-CUT");
    const callbackUrl = getFrontendCallbackUrl();

    const response = await paystack.post("/transaction/initialize", {
      email,
      amount: amountKobo,
      currency: CURRENCY,
      reference,
      callback_url: callbackUrl,
      metadata: {
        orderId: String(order._id),
        userId: String(getUserId(req)),
        orderType: "Order",
      },
    });

    const data = response?.data?.data;

    if (!data?.authorization_url || !data?.reference) {
      throw getPaymentError("PAYSTACK_CHECKOUT_URL_MISSING");
    }

    order.paymentReference = data.reference;
    await order.save();

    return res.status(200).json({
      success: true,
      message: "Payment initialized successfully.",
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
      amount,
      currency: CURRENCY,
    });
  } catch (error) {
    return sendError(res, error, "Initialize product payment error:");
  }
};

// ============================================================
// NORMAL PRODUCT ORDER — PAYSTACK VERIFICATION
// ============================================================

const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required.",
      });
    }

    const userId = getUserId(req);

    const order = await Order.findOne({
      user: userId,
      paymentReference: reference,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order for this payment reference was not found.",
      });
    }

    if (order.paymentStatus === "paid") {
      return res.status(200).json({
        success: true,
        message: "This order has already been paid.",
        order,
      });
    }

    const transaction = await verifyPaystackTransaction(reference);

    if (
      transaction?.status !== "success" ||
      transaction?.reference !== reference
    ) {
      throw getPaymentError("PAYMENT_NOT_CONFIRMED");
    }

    if (String(transaction.currency || "").toUpperCase() !== CURRENCY) {
      throw getPaymentError("PAYMENT_CURRENCY_MISMATCH");
    }

    // Normal product orders require the exact full order amount.
    if (Number(transaction.amount) !== toKobo(order.total)) {
      throw getPaymentError("PAYMENT_AMOUNT_MISMATCH");
    }

    order.paymentStatus = "paid";
    order.paymentTransactionId = String(transaction.id);
    order.paidAt = new Date();

    if (order.orderStatus === "pending") {
      order.orderStatus = "confirmed";
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Product order payment verified successfully.",
      order,
    });
  } catch (error) {
    return sendError(res, error, "Verify product payment error:");
  }
};

// ============================================================
// CUSTOM ORDER — PAYSTACK INITIALIZATION
// ============================================================

const initializeCustomOrderPayment = async (req, res) => {
  let payment;

  try {
    const { customOrderId } = req.body;
    const requestedAmount = getRequestedPaymentAmount(req.body);

    if (!customOrderId) {
      return res.status(400).json({
        success: false,
        message: "Custom order ID is required.",
      });
    }

    const result = await getNewPaymentOrder(
      req,
      "CustomOrder",
      customOrderId,
      requestedAmount,
    );

    const { order, amount, amountKobo, balance } = result;
    const email = getCustomerEmail(order);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "A valid customer email is required.",
      });
    }

    const reference = makeReference("ABS-CUT-CUSTOM");

    payment = await createPaymentRecord({
      userId: getUserId(req),
      orderType: "CustomOrder",
      orderId: order._id,
      provider: "paystack",
      amount,
      reference,
      metadata: {
        purpose: "custom_order_installment",
        requestedAmount: amount,
        balanceBeforePayment: balance,
      },
    });

    const response = await paystack.post("/transaction/initialize", {
      email,
      // Paystack expects the amount in kobo.
      // For ₦3,000, this must be 300000, not ₦10,000.
      amount: amountKobo,
      currency: CURRENCY,
      reference,
      callback_url: getFrontendCallbackUrl(),
      metadata: {
        paymentId: String(payment._id),
        customOrderId: String(order._id),
        userId: String(getUserId(req)),
        orderType: "CustomOrder",
        requestedAmount: amount,
      },
    });

    const data = response?.data?.data;

    if (!data?.authorization_url || !data?.reference) {
      payment.status = "failed";
      await payment.save();

      throw getPaymentError("PAYSTACK_CHECKOUT_URL_MISSING");
    }

    payment.reference = data.reference;
    await payment.save();

    order.paymentReference = data.reference;

    if (
      Number(order.amountPaid || 0) <= 0 &&
      order.paymentStatus === "Not Required"
    ) {
      order.paymentStatus = CUSTOM_PAYMENT_STATUSES.PENDING;
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: "Custom order payment initialized successfully.",
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
      amount,
      balance,
      currency: CURRENCY,
      paymentId: payment._id,
      payment: {
        _id: payment._id,
        id: payment._id,
        reference: data.reference,
        amount,
        status: payment.status,
      },
      installmentSettings: {
        enabled: result.settings.enabled,
        minimumDepositType: result.settings.minimumDepositType,
        minimumDepositValue: result.settings.minimumDepositValue,
        maxInstallments: result.settings.maxInstallments,
      },
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Initialize custom order Paystack payment error:",
    );
  }
};

// ============================================================
// APPLY A VERIFIED LEDGER PAYMENT ATOMICALLY
// ============================================================

const applyNewPayment = async ({
  paymentId,
  provider,
  transactionId,
  confirmedBy = null,
}) => {
  if (!transactionId) {
    throw getPaymentError("INVALID_TRANSACTION_ID");
  }

  const session = await mongoose.startSession();

  let result;

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findById(paymentId).session(session);

      if (!payment) {
        throw getPaymentError("PAYMENT_NOT_FOUND");
      }

      if (payment.provider !== provider) {
        throw getPaymentError("INVALID_PAYMENT_PROVIDER");
      }

      // Idempotency: prevent duplicate payment application.
      if (payment.status === "successful") {
        result = {
          success: true,
          alreadyProcessed: true,
          payment,
        };

        return;
      }

      const allowedStatuses =
        provider === "bank_transfer"
          ? ["awaiting_confirmation"]
          : ["pending", "processing"];

      if (!allowedStatuses.includes(payment.status)) {
        throw getPaymentError("PAYMENT_ALREADY_PROCESSED");
      }

      let order;

      // =====================================================
      // ORDINARY ORDER
      // =====================================================

      if (payment.orderType === "Order") {
        order = await Order.findById(payment.orderId).session(session);

        if (!order) {
          throw getPaymentError("ORDER_NOT_FOUND");
        }

        if (order.orderStatus === "cancelled") {
          throw getPaymentError("ORDER_CANCELLED");
        }

        if (order.paymentStatus === "paid") {
          throw getPaymentError("ORDER_ALREADY_PAID");
        }

        const expectedAmountKobo = toKobo(order.total || 0);

        if (
          expectedAmountKobo <= 0 ||
          toKobo(payment.amount) !== expectedAmountKobo
        ) {
          throw getPaymentError("PAYMENT_AMOUNT_MISMATCH");
        }

        order.paymentStatus = "paid";
        order.paymentTransactionId = String(transactionId);
        order.paidAt = new Date();

        if (order.orderStatus === "pending") {
          order.orderStatus = "confirmed";
        }

        await order.save({ session });

        // =====================================================
        // CUSTOM ORDER
        // =====================================================
      } else if (payment.orderType === "CustomOrder") {
        order = await CustomOrder.findById(payment.orderId).session(session);

        if (!order) {
          throw getPaymentError("CUSTOM_ORDER_NOT_FOUND");
        }

        if (String(order.status || "").toLowerCase() === "cancelled") {
          throw getPaymentError("ORDER_CANCELLED");
        }

        const quotationKobo = toKobo(order.quotation || 0);
        const amountPaidKobo = toKobo(order.amountPaid || 0);
        const paymentAmountKobo = toKobo(payment.amount);

        if (quotationKobo <= 0) {
          throw getPaymentError("QUOTATION_NOT_READY");
        }

        const balanceKobo = quotationKobo - amountPaidKobo;

        if (balanceKobo <= 0) {
          throw getPaymentError("CUSTOM_ORDER_ALREADY_PAID");
        }

        if (paymentAmountKobo <= 0 || paymentAmountKobo > balanceKobo) {
          throw getPaymentError("PAYMENT_EXCEEDS_BALANCE");
        }

        const settings = await getInstallmentSettings(session);

        if (!settings.enabled && paymentAmountKobo !== balanceKobo) {
          throw getPaymentError("INSTALLMENTS_DISABLED");
        }

        const successfulPayments = await Payment.countDocuments({
          _id: { $ne: payment._id },
          orderType: "CustomOrder",
          orderId: order._id,
          status: "successful",
        }).session(session);

        let completedCount = successfulPayments;

        if (amountPaidKobo > 0 && successfulPayments === 0) {
          completedCount = 1;
        }

        if (completedCount >= Number(settings.maxInstallments)) {
          throw getPaymentError("MAX_INSTALLMENTS_REACHED");
        }

        if (amountPaidKobo === 0) {
          const minimumDepositKobo = toKobo(
            calculateMinimumDeposit(fromKobo(quotationKobo), settings),
          );

          if (paymentAmountKobo < minimumDepositKobo) {
            throw getPaymentError("MINIMUM_DEPOSIT_NOT_MET");
          }
        }

        const newAmountPaidKobo = amountPaidKobo + paymentAmountKobo;

        if (newAmountPaidKobo > quotationKobo) {
          throw getPaymentError("PAYMENT_EXCEEDS_BALANCE");
        }

        order.amountPaid = fromKobo(newAmountPaidKobo);
        order.paymentTransactionId = String(transactionId);
        order.paidAt = new Date();

        if (newAmountPaidKobo >= quotationKobo) {
          order.amountPaid = fromKobo(quotationKobo);
          order.paymentStatus = CUSTOM_PAYMENT_STATUSES.PAID;

          if (
            order.status === "Awaiting Payment" ||
            order.status === "Pending Payment"
          ) {
            order.status = "Confirmed";
          }
        } else {
          order.paymentStatus = CUSTOM_PAYMENT_STATUSES.PARTIAL;
        }

        await order.save({ session });

        // =====================================================
        // PARTY BOOKING
        // =====================================================
      } else if (payment.orderType === "PartyBooking") {
        order = await PartyBooking.findOne({
          _id: payment.orderId,
          customer: payment.user,
        }).session(session);

        if (!order) {
          throw getPaymentError("PARTY_BOOKING_NOT_FOUND");
        }

        if (order.status === "cancelled" || order.status === "completed") {
          throw getPaymentError("PARTY_BOOKING_NOT_PAYABLE");
        }

        if (!order.quotationAcceptedAt) {
          throw getPaymentError("PARTY_QUOTATION_NOT_ACCEPTED");
        }

        if (order.scheduleStatus !== "approved") {
          throw getPaymentError("PARTY_INSTALLMENT_SCHEDULE_NOT_APPROVED");
        }

        // Check the overall booking payment deadline.
        if (
          order.paymentDeadline &&
          new Date(order.paymentDeadline).getTime() < Date.now()
        ) {
          throw getPaymentError("PARTY_PAYMENT_DEADLINE_PASSED");
        }

        const quotationKobo = toKobo(order.quotationAmount || 0);
        const amountPaidKobo = toKobo(order.amountPaid || 0);
        const paymentAmountKobo = toKobo(payment.amount);

        if (quotationKobo <= 0) {
          throw getPaymentError("QUOTATION_NOT_READY");
        }

        const balanceKobo = quotationKobo - amountPaidKobo;

        if (balanceKobo <= 0) {
          throw getPaymentError("PARTY_BOOKING_ALREADY_PAID");
        }

        if (
          !payment.metadata?.installmentId ||
          !mongoose.Types.ObjectId.isValid(payment.metadata.installmentId)
        ) {
          throw getPaymentError("PARTY_INSTALLMENT_NOT_FOUND");
        }

        const installment = order.installmentSchedule.id(
          payment.metadata.installmentId,
        );

        if (!installment) {
          throw getPaymentError("PARTY_INSTALLMENT_NOT_FOUND");
        }

        if (installment.status !== "scheduled") {
          throw getPaymentError("PARTY_INSTALLMENT_ALREADY_PROCESSED");
        }

        // Recheck the individual installment due date.
        // The customer can pay throughout the due date.
        if (installment.dueDate) {
          const dueDate = new Date(installment.dueDate);

          if (Number.isFinite(dueDate.getTime())) {
            const dueDateEnd = Date.UTC(
              dueDate.getUTCFullYear(),
              dueDate.getUTCMonth(),
              dueDate.getUTCDate(),
              23,
              59,
              59,
              999,
            );

            if (dueDateEnd < Date.now()) {
              throw getPaymentError("PARTY_PAYMENT_DEADLINE_PASSED");
            }
          }
        }

        const scheduledAmountKobo = toKobo(installment.amount);

        // The approved installment schedule is the source of truth.
        if (
          paymentAmountKobo <= 0 ||
          paymentAmountKobo !== scheduledAmountKobo ||
          paymentAmountKobo > balanceKobo
        ) {
          throw getPaymentError("PAYMENT_AMOUNT_MISMATCH");
        }

        const newAmountPaidKobo = amountPaidKobo + paymentAmountKobo;

        if (newAmountPaidKobo > quotationKobo) {
          throw getPaymentError("PAYMENT_EXCEEDS_BALANCE");
        }

        const now = new Date();

        installment.status = "paid";
        installment.payment = payment._id;
        installment.paidAt = now;

        order.amountPaid = fromKobo(newAmountPaidKobo);

        if (newAmountPaidKobo >= quotationKobo) {
          order.amountPaid = fromKobo(quotationKobo);
          order.paymentStatus = "paid";
        } else {
          order.paymentStatus = "part-paid";
        }

        // Payment completion does not automatically mark
        // the booking as ready or completed.
        await order.save({ session });
      } else {
        throw getPaymentError("INVALID_PAYMENT_PROVIDER");
      }

      // =====================================================
      // UPDATE PAYMENT LEDGER
      // =====================================================

      payment.status = "successful";
      payment.transactionId = String(transactionId);
      payment.verifiedAt = new Date();
      payment.paidAt = new Date();

      if (provider === "bank_transfer") {
        payment.confirmedBy = confirmedBy || null;
        payment.confirmedAt = new Date();
      }

      await payment.save({ session });

      result = {
        success: true,
        alreadyProcessed: false,
        payment,
        order,
      };
    });

    return result;
  } finally {
    await session.endSession();
  }
};


const verifyCustomOrderPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = getUserId(req);

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required.",
      });
    }

    /*
     * NEW PAYMENT LEDGER
     */
    const payment = await findPaymentByReference(reference, "paystack", userId);

    if (payment) {
      if (payment.orderType !== "CustomOrder") {
        return res.status(400).json({
          success: false,
          message: "This payment is not associated with a custom order.",
        });
      }

      // Load the actual custom order for both first-time and
      // repeat verification. Never apply an installment twice.
      const customOrder = await CustomOrder.findOne({
        _id: payment.orderId,
        user: userId,
      });

      if (!customOrder) {
        return res.status(404).json({
          success: false,
          message:
            "The custom order associated with this payment could not be found.",
        });
      }

      // An already-successful payment is an idempotent success.
      if (payment.status === "successful") {
        return res.status(200).json({
          success: true,
          alreadyVerified: true,
          message: "This payment has already been verified.",
          payment,
          customOrder,
          orderType: "CustomOrder",
          orderId: String(customOrder._id),
        });
      }

      // Verify the transaction directly with Paystack.
      const transaction = await verifyPaystackTransaction(reference);

      if (
        transaction?.status !== "success" ||
        transaction?.reference !== reference
      ) {
        throw getPaymentError("PAYMENT_NOT_CONFIRMED");
      }

      if (String(transaction.currency || "").toUpperCase() !== CURRENCY) {
        throw getPaymentError("PAYMENT_CURRENCY_MISMATCH");
      }

      if (Number(transaction.amount) !== toKobo(payment.amount)) {
        throw getPaymentError("PAYMENT_AMOUNT_MISMATCH");
      }

      const applied = await applyNewPayment({
        paymentId: payment._id,
        provider: "paystack",
        transactionId: transaction.id,
      });

      const updatedCustomOrder = await CustomOrder.findOne({
        _id: payment.orderId,
        user: userId,
      });

      if (!updatedCustomOrder) {
        throw getPaymentError("CUSTOM_ORDER_NOT_FOUND");
      }

      if (!applied.alreadyProcessed) {
        await notifyAdminPaymentSafely({
          payment: applied.payment,
          order: updatedCustomOrder,
        });
      }

      return res.status(200).json({
        success: true,
        alreadyVerified: false,
        message: "Custom order payment verified successfully.",
        payment: applied.payment,
        customOrder: updatedCustomOrder,
        orderType: "CustomOrder",
        orderId: String(updatedCustomOrder._id),
      });
    }

    /*
     * LEGACY CUSTOM-ORDER PAYMENT
     * Supports payments created before the Payment ledger existed.
     */
    const legacyOrder = await CustomOrder.findOne({
      user: userId,
      paymentReference: reference,
    });

    if (!legacyOrder) {
      throw getPaymentError("CUSTOM_ORDER_NOT_FOUND");
    }

    // If the legacy order is already paid, return it successfully.
    if (legacyOrder.paymentStatus === CUSTOM_PAYMENT_STATUSES.PAID) {
      return res.status(200).json({
        success: true,
        alreadyVerified: true,
        message: "This custom order has already been paid.",
        customOrder: legacyOrder,
        order: legacyOrder,
        orderType: "CustomOrder",
        orderId: String(legacyOrder._id),
      });
    }

    const transaction = await verifyPaystackTransaction(reference);

    if (
      transaction?.status !== "success" ||
      transaction?.reference !== reference
    ) {
      throw getPaymentError("PAYMENT_NOT_CONFIRMED");
    }

    if (String(transaction.currency || "").toUpperCase() !== CURRENCY) {
      throw getPaymentError("PAYMENT_CURRENCY_MISMATCH");
    }

    const transactionAmountKobo = Number(transaction.amount);

    const quotationKobo = toKobo(legacyOrder.quotation || 0);
    const paidKobo = toKobo(legacyOrder.amountPaid || 0);
    const balanceKobo = quotationKobo - paidKobo;

    if (
      !Number.isFinite(transactionAmountKobo) ||
      transactionAmountKobo <= 0 ||
      transactionAmountKobo > balanceKobo
    ) {
      throw getPaymentError("PAYMENT_AMOUNT_MISMATCH");
    }

    // Ensure the same provider transaction cannot be applied to
    // another legacy custom order.
    const duplicate = await CustomOrder.findOne({
      paymentTransactionId: String(transaction.id),
      _id: { $ne: legacyOrder._id },
    });

    if (duplicate) {
      throw getPaymentError("PAYMENT_ALREADY_PROCESSED");
    }

    legacyOrder.amountPaid = fromKobo(paidKobo + transactionAmountKobo);

    legacyOrder.paymentTransactionId = String(transaction.id);
    legacyOrder.paidAt = new Date();

    if (toKobo(legacyOrder.amountPaid) >= quotationKobo) {
      legacyOrder.amountPaid = fromKobo(quotationKobo);

      legacyOrder.paymentStatus = CUSTOM_PAYMENT_STATUSES.PAID;

      if (
        legacyOrder.status === "Awaiting Payment" ||
        legacyOrder.status === "Pending Payment"
      ) {
        legacyOrder.status = "Confirmed";
      }
    } else {
      legacyOrder.paymentStatus = CUSTOM_PAYMENT_STATUSES.PARTIAL;
    }

    await legacyOrder.save();

    return res.status(200).json({
      success: true,
      alreadyVerified: false,
      message: "Legacy custom order payment verified successfully.",
      customOrder: legacyOrder,
      order: legacyOrder,
      orderType: "CustomOrder",
      orderId: String(legacyOrder._id),
    });
  } catch (error) {
    return sendError(res, error, "Verify custom order Paystack payment error:");
  }
};
// ============================================================
// PAYSTACK WEBHOOK
// ============================================================

const paystackWebhook = async (req, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;

    if (!secret) {
      console.error("PAYSTACK_SECRET_KEY is not configured.");
      return res.status(500).send("Webhook configuration error.");
    }

    const signature = req.headers["x-paystack-signature"];

    if (!signature) {
      return res.status(401).send("Missing webhook signature.");
    }

    const expectedSignature = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    const receivedBuffer = Buffer.from(String(signature), "utf8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      return res.status(401).send("Invalid webhook signature.");
    }

    if (req.body?.event !== "charge.success") {
      return res.status(200).send("Event ignored.");
    }

    const eventData = req.body?.data;
    const reference = eventData?.reference;

    if (!reference) {
      return res.status(400).send("Missing payment reference.");
    }

    const ledgerPayment = await Payment.findOne({
      reference,
      provider: "paystack",
    });

    if (ledgerPayment) {
      if (ledgerPayment.status === "successful") {
        return res.status(200).send("Payment already processed.");
      }

      // Confirm directly with Paystack rather than trusting only the
      // webhook payload.
      const transaction = await verifyPaystackTransaction(reference);

      if (
        transaction?.status !== "success" ||
        transaction?.reference !== reference
      ) {
        return res.status(400).send("Payment is not confirmed.");
      }

      if (
        String(transaction.currency || "").toUpperCase() !== CURRENCY ||
        Number(transaction.amount) !== toKobo(ledgerPayment.amount)
      ) {
        return res.status(400).send("Payment details do not match.");
      }
      const applied = await applyNewPayment({
        paymentId: ledgerPayment._id,
        provider: "paystack",
        transactionId: transaction.id,
      });

      if (!applied.alreadyProcessed) {
        await notifyAdminPaymentSafely({
          payment: applied.payment,
          order: applied.order,
        });
      }

      return res.status(200).send("Payment processed.");
    }

    // Normal product order legacy path: always require full payment.
    const order = await Order.findOne({
      paymentReference: reference,
    });

    if (order) {
      if (order.paymentStatus === "paid") {
        return res.status(200).send("Order already paid.");
      }

      const transaction = await verifyPaystackTransaction(reference);

      if (
        transaction?.status !== "success" ||
        transaction?.reference !== reference ||
        String(transaction.currency || "").toUpperCase() !== CURRENCY ||
        Number(transaction.amount) !== toKobo(order.total)
      ) {
        return res.status(400).send("Payment details do not match.");
      }

      order.paymentStatus = "paid";
      order.paymentTransactionId = String(transaction.id);
      order.paidAt = new Date();

      if (order.orderStatus === "pending") {
        order.orderStatus = "confirmed";
      }

      await order.save();

      return res.status(200).send("Product order payment processed.");
    }

    // Legacy custom order path.
    const customOrder = await CustomOrder.findOne({
      paymentReference: reference,
    });

    if (customOrder) {
      if (customOrder.paymentStatus === CUSTOM_PAYMENT_STATUSES.PAID) {
        return res.status(200).send("Custom order already paid.");
      }

      const transaction = await verifyPaystackTransaction(reference);

      if (
        transaction?.status !== "success" ||
        transaction?.reference !== reference ||
        String(transaction.currency || "").toUpperCase() !== CURRENCY
      ) {
        return res.status(400).send("Payment is not confirmed.");
      }

      const quotationKobo = toKobo(customOrder.quotation || 0);
      const amountPaidKobo = toKobo(customOrder.amountPaid || 0);
      const paymentAmountKobo = Number(transaction.amount);

      if (
        quotationKobo <= 0 ||
        paymentAmountKobo <= 0 ||
        paymentAmountKobo > quotationKobo - amountPaidKobo
      ) {
        return res.status(400).send("Payment amount does not match.");
      }

      const duplicate = await CustomOrder.findOne({
        paymentTransactionId: String(transaction.id),
        _id: { $ne: customOrder._id },
      });

      if (duplicate) {
        return res.status(200).send("Duplicate payment ignored.");
      }

      customOrder.amountPaid = fromKobo(amountPaidKobo + paymentAmountKobo);
      customOrder.paymentTransactionId = String(transaction.id);
      customOrder.paidAt = new Date();

      if (toKobo(customOrder.amountPaid) >= quotationKobo) {
        customOrder.amountPaid = fromKobo(quotationKobo);
        customOrder.paymentStatus = CUSTOM_PAYMENT_STATUSES.PAID;

        if (
          customOrder.status === "Awaiting Payment" ||
          customOrder.status === "Pending Payment"
        ) {
          customOrder.status = "Confirmed";
        }
      } else {
        customOrder.paymentStatus = CUSTOM_PAYMENT_STATUSES.PARTIAL;
      }

      await customOrder.save();

      return res.status(200).send("Custom order payment processed.");
    }

    // No matching ledger or legacy order. Acknowledge the webhook
    // so the provider does not repeatedly retry an unmatchable event.
    console.warn("Paystack reference not found:", reference);

    return res.status(200).send("No matching payment record.");
  } catch (error) {
    console.error(
      "Paystack webhook error:",
      error?.response?.data || error?.message || error,
    );

    return res.status(500).send("Webhook processing failed.");
  }
};

// ============================================================
// FLUTTERWAVE — INITIALIZE PAYMENT
// ============================================================

const initializeFlutterwavePayment = async (req, res) => {
  let payment = null;

  try {
    const { orderId, customOrderId, partyBookingId, installmentId } = req.body;

    const userId = getUserId(req);
    const requestedAmount = getRequestedPaymentAmount(req.body);

    const selectedTypes = [
      Boolean(orderId),
      Boolean(customOrderId),
      Boolean(partyBookingId),
    ].filter(Boolean).length;

    if (selectedTypes !== 1) {
      return res.status(400).json({
        success: false,
        message:
          "Provide exactly one of orderId, customOrderId, or partyBookingId.",
      });
    }

    let orderType;
    let order;
    let amount;
    let email;
    let customerName;
    let metadata;
    let description;
    let isCustomOrder = false;
    let isPartyBooking = false;

    // -------------------------------------------------------
    // PARTY BOOKING INSTALLMENT
    // -------------------------------------------------------

    if (partyBookingId) {
      isPartyBooking = true;

      if (!installmentId) {
        return res.status(400).json({
          success: false,
          message: "An installment ID is required for Party Booking payments.",
        });
      }

      const result = await getPartyBookingPaymentDetails({
        bookingId: partyBookingId,
        installmentId,
        userId,
        provider: "flutterwave",
      });

      const {
        booking,
        installment,
        amount: installmentAmount,
        customerEmail,
      } = result;

      // Prevent multiple active attempts for this installment,
      // including attempts made through another payment provider.
      const existingPayment = await Payment.findOne({
        orderType: "PartyBooking",
        orderId: booking._id,
        user: userId,
        "metadata.installmentId": String(installment._id),
        status: {
          $in: ["pending", "processing", "awaiting_confirmation"],
        },
      });

      if (existingPayment) {
        throw getPaymentError("PARTY_INSTALLMENT_PAYMENT_IN_PROGRESS");
      }

      orderType = "PartyBooking";
      order = booking;
      amount = installmentAmount;
      email = customerEmail;
      customerName = booking.contactName || "ABS CUT Customer";

      metadata = {
        purpose: "party_booking_installment",
        partyBookingId: String(booking._id),
        installmentId: String(installment._id),
        installmentAmount: amount,
        installmentDueDate: installment.dueDate,
      };

      description = "Party booking installment payment";
    }

    // -------------------------------------------------------
    // CUSTOM ORDER
    // -------------------------------------------------------
    else if (customOrderId) {
      isCustomOrder = true;
      orderType = "CustomOrder";

      const result = await getNewPaymentOrder(
        req,
        orderType,
        customOrderId,
        requestedAmount,
      );

      order = result.order;
      amount = result.amount;
      email = getCustomerEmail(order);

      customerName =
        `${order.user?.firstName || ""} ${order.user?.lastName || ""}`.trim() ||
        "ABS CUT Customer";

      metadata = {
        purpose: "custom_order_installment",
      };

      description = "Custom order payment";
    }

    // -------------------------------------------------------
    // NORMAL PRODUCT ORDER
    // -------------------------------------------------------
    else {
      orderType = "Order";

      const result = await getNewPaymentOrder(req, orderType, orderId);

      order = result.order;
      amount = result.amount;
      email = getCustomerEmail(order);

      customerName =
        `${order.user?.firstName || ""} ${order.user?.lastName || ""}`.trim() ||
        "ABS CUT Customer";

      metadata = {
        purpose: "product_order_full_payment",
      };

      description = "Product order payment";
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "A valid customer email is required.",
      });
    }

    // -------------------------------------------------------
    // CREATE PAYMENT LEDGER RECORD
    // -------------------------------------------------------

    const reference = makeReference(
      isPartyBooking
        ? "ABS-CUT-FLW-PARTY"
        : isCustomOrder
          ? "ABS-CUT-FLW-CUSTOM"
          : "ABS-CUT-FLW",
    );

    payment = await createPaymentRecord({
      userId,
      orderType,
      orderId: order._id,
      provider: "flutterwave",
      amount,
      reference,
      metadata,
    });

    // -------------------------------------------------------
    // INITIALIZE FLUTTERWAVE CHECKOUT
    // -------------------------------------------------------

    const response = await flutterwave.post("/payments", {
      tx_ref: reference,
      amount,
      currency: CURRENCY,
      redirect_url: getFrontendCallbackUrl(),

      customer: {
        email,
        name: customerName,
      },

      meta: {
        paymentId: String(payment._id),
        orderId: String(order._id),
        orderType,
        userId: String(userId),
        ...metadata,
      },

      customizations: {
        title: "ABS CUT",
        description,
      },
    });

    const data = response?.data?.data;

    if (!data?.link) {
      throw getPaymentError("FLUTTERWAVE_CHECKOUT_URL_MISSING");
    }

    // -------------------------------------------------------
    // PRESERVE CUSTOM ORDER BEHAVIOUR
    // -------------------------------------------------------

    if (isCustomOrder) {
      order.paymentReference = reference;

      if (
        Number(order.amountPaid || 0) <= 0 &&
        order.paymentStatus === "Not Required"
      ) {
        order.paymentStatus = CUSTOM_PAYMENT_STATUSES.PENDING;
      }

      await order.save();
    }

    // -------------------------------------------------------
    // PRESERVE NORMAL ORDER BEHAVIOUR
    // -------------------------------------------------------

    if (!isPartyBooking && !isCustomOrder) {
      order.paymentReference = reference;
      await order.save();
    }

    // -------------------------------------------------------
    // SUCCESS RESPONSE
    // -------------------------------------------------------

    return res.status(200).json({
      success: true,
      message: isPartyBooking
        ? "Party booking installment payment initialized successfully."
        : "Flutterwave payment initialized successfully.",

      authorizationUrl: data.link,
      link: data.link,
      reference,
      amount,
      currency: CURRENCY,
      paymentId: payment._id,
      orderType,
      orderId: String(order._id),
      installmentId: isPartyBooking ? String(installmentId) : undefined,
    });
  } catch (error) {
    // -------------------------------------------------------
    // CLEAN UP FAILED CHECKOUT ATTEMPTS
    // -------------------------------------------------------

    // Only change this payment if it is still pending.
    // This prevents a stale document from overwriting a payment
    // that may already have been processed elsewhere.
    if (payment?._id) {
      try {
        await Payment.updateOne(
          {
            _id: payment._id,
            status: "pending",
          },
          {
            $set: {
              status: "failed",
            },
          },
        );
      } catch (cleanupError) {
        console.error(
          "Could not update failed Flutterwave payment:",
          cleanupError.message,
        );
      }
    }

    return sendError(res, error, "Initialize Flutterwave payment error:");
  }
};


// ============================================================
// FLUTTERWAVE — VERIFY TRANSACTION
// ============================================================

const verifyFlutterwavePayment = async (req, res) => {
  try {
    const { transactionId, transaction_id, tx_ref, reference } = req.query;

    const suppliedTransactionId = String(
      transactionId || transaction_id || "",
    ).trim();

    const suppliedReference = String(
      reference || tx_ref || req.params.reference || "",
    ).trim();

    if (
      !suppliedTransactionId ||
      !/^\d+$/.test(suppliedTransactionId) ||
      !suppliedReference
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A valid Flutterwave transaction ID and payment reference are required.",
      });
    }

    const userId = getUserId(req);

    const payment = await findPaymentByReference(
      suppliedReference,
      "flutterwave",
      userId,
    );

    if (!payment) {
      throw getPaymentError("PAYMENT_NOT_FOUND");
    }

    if (payment.provider !== "flutterwave") {
      throw getPaymentError("PAYMENT_NOT_FOUND");
    }

    let order = null;
    let customOrder = null;
    let booking = null;

    // -------------------------------------------------------
    // LOAD THE ASSOCIATED RECORD
    // -------------------------------------------------------

    if (payment.orderType === "PartyBooking") {
      booking = await PartyBooking.findOne({
        _id: payment.orderId,
        customer: userId,
      }).populate("customer", "email firstName lastName");

      if (!booking) {
        throw getPaymentError("PARTY_BOOKING_NOT_FOUND");
      }
    } else if (payment.orderType === "CustomOrder") {
      customOrder = await CustomOrder.findOne({
        _id: payment.orderId,
        user: userId,
      });

      if (!customOrder) {
        throw getPaymentError("CUSTOM_ORDER_NOT_FOUND");
      }
    } else if (payment.orderType === "Order") {
      order = await Order.findOne({
        _id: payment.orderId,
        user: userId,
      });

      if (!order) {
        throw getPaymentError("ORDER_NOT_FOUND");
      }
    } else {
      throw getPaymentError("PAYMENT_NOT_FOUND");
    }

    // -------------------------------------------------------
    // IDEMPOTENCY
    // -------------------------------------------------------

    if (payment.status === "successful") {
      return res.status(200).json({
        success: true,
        alreadyVerified: true,
        message: "This payment has already been verified.",
        payment,
        order,
        customOrder,
        booking,
        orderId: String(payment.orderId),
        orderType: payment.orderType,
      });
    }

    if (!["pending", "processing"].includes(payment.status)) {
      throw getPaymentError("PAYMENT_ALREADY_PROCESSED");
    }

    // -------------------------------------------------------
    // VERIFY DIRECTLY WITH FLUTTERWAVE
    // -------------------------------------------------------

    const response = await flutterwave.get(
      `/transactions/${encodeURIComponent(suppliedTransactionId)}/verify`,
    );

    const transaction = response?.data?.data;

    if (!transaction) {
      throw getPaymentError("PAYMENT_NOT_CONFIRMED");
    }

    if (
      String(transaction.status || "").toLowerCase() !== "successful" ||
      String(transaction.tx_ref || "") !== payment.reference ||
      String(transaction.id) !== suppliedTransactionId
    ) {
      throw getPaymentError("PAYMENT_NOT_CONFIRMED");
    }

    if (String(transaction.currency || "").toUpperCase() !== CURRENCY) {
      throw getPaymentError("PAYMENT_CURRENCY_MISMATCH");
    }

    // Verify the exact amount recorded in the payment ledger.
    if (
      !Number.isFinite(Number(transaction.amount)) ||
      toKobo(transaction.amount) !== toKobo(payment.amount)
    ) {
      throw getPaymentError("PAYMENT_AMOUNT_MISMATCH");
    }

    // -------------------------------------------------------
    // APPLY THE VERIFIED PAYMENT
    // -------------------------------------------------------

    const applied = await applyNewPayment({
      paymentId: payment._id,
      provider: "flutterwave",
      transactionId: String(transaction.id),
    });

    // -------------------------------------------------------
    // RELOAD THE UPDATED RECORD
    // -------------------------------------------------------

    if (payment.orderType === "PartyBooking") {
      booking = await PartyBooking.findOne({
        _id: payment.orderId,
        customer: userId,
      }).populate("customer", "email firstName lastName");

      if (!booking) {
        throw getPaymentError("PARTY_BOOKING_NOT_FOUND");
      }
    } else if (payment.orderType === "CustomOrder") {
      customOrder = await CustomOrder.findOne({
        _id: payment.orderId,
        user: userId,
      });

      if (!customOrder) {
        throw getPaymentError("CUSTOM_ORDER_NOT_FOUND");
      }
    } else {
      order = await Order.findOne({
        _id: payment.orderId,
        user: userId,
      });

      if (!order) {
        throw getPaymentError("ORDER_NOT_FOUND");
      }
    }

    // -------------------------------------------------------
    // NOTIFY ADMIN FOR ALL PAYMENT TYPES
    // -------------------------------------------------------

    if (!applied.alreadyProcessed) {
      await notifyAdminPaymentSafely({
        payment: applied.payment,
        order: booking || customOrder || order,
      });
    }

    // -------------------------------------------------------
    // RESPONSE
    // -------------------------------------------------------

    return res.status(200).json({
      success: true,
      alreadyVerified: Boolean(applied.alreadyProcessed),
      message:
        payment.orderType === "PartyBooking"
          ? "Party booking installment payment verified successfully."
          : "Flutterwave payment verified successfully.",

      payment: applied.payment,
      order,
      customOrder,
      booking,
      orderId: String(payment.orderId),
      orderType: payment.orderType,
    });
  } catch (error) {
    return sendError(res, error, "Verify Flutterwave payment error:");
  }
};


// ============================================================
// FLUTTERWAVE WEBHOOK
// ============================================================

const flutterwaveWebhook = async (req, res) => {
  try {
    const secretHash = process.env.FLW_SECRET_HASH;

    if (!secretHash) {
      console.error("FLW_SECRET_HASH is not configured.");
      return res.status(500).send("Webhook configuration error.");
    }

    const receivedHash = req.headers["verif-hash"];

    if (!receivedHash) {
      return res.status(401).send("Missing webhook signature.");
    }

    const receivedBuffer = Buffer.from(String(receivedHash), "utf8");

    const expectedBuffer = Buffer.from(String(secretHash), "utf8");

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      return res.status(401).send("Invalid webhook signature.");
    }

    const event = req.body?.event;
    const eventData = req.body?.data;

    if (event !== "charge.completed" || eventData?.status !== "successful") {
      return res.status(200).send("Event ignored.");
    }

    const reference = eventData?.tx_ref;
    const transactionId = eventData?.id;

    if (!reference || !transactionId) {
      return res.status(400).send("Missing transaction details.");
    }

    const payment = await Payment.findOne({
      reference,
      provider: "flutterwave",
    });

    if (!payment) {
      return res.status(200).send("No matching payment record.");
    }

    if (payment.status === "successful") {
      return res.status(200).send("Payment already processed.");
    }

    // Always verify the transaction with Flutterwave's API.
    const response = await flutterwave.get(
      `/transactions/${encodeURIComponent(transactionId)}/verify`,
    );

    const transaction = response?.data?.data;

    if (
      transaction?.status !== "successful" ||
      transaction?.tx_ref !== payment.reference ||
      String(transaction.currency || "").toUpperCase() !== CURRENCY ||
      toKobo(transaction.amount) !== toKobo(payment.amount)
    ) {
      return res.status(400).send("Payment details do not match.");
    }

    const applied = await applyNewPayment({
      paymentId: payment._id,
      provider: "flutterwave",
      transactionId: transaction.id || transactionId,
    });
    if (!applied.alreadyProcessed) {
      await notifyAdminPaymentSafely({
        payment: applied.payment,
      });
    }

    return res.status(200).send("Payment processed.");
  } catch (error) {
    console.error(
      "Flutterwave webhook error:",
      error?.response?.data || error?.message || error,
    );

    return res.status(500).send("Webhook processing failed.");
  }
};

// ============================================================
// BANK TRANSFER — INITIALIZE
// ============================================================
const initializeBankTransfer = async (req, res) => {
  try {
    const { orderId, customOrderId, partyBookingId, installmentId } = req.body;

    const userId = getUserId(req);
    const requestedAmount = getRequestedPaymentAmount(req.body);

    // Exactly one payment target must be supplied.
    const targets = [
      Boolean(orderId),
      Boolean(customOrderId),
      Boolean(partyBookingId),
    ];

    if (targets.filter(Boolean).length !== 1) {
      return res.status(400).json({
        success: false,
        message:
          "Provide exactly one order, custom order, or party booking ID.",
      });
    }

    const isPartyBooking = Boolean(partyBookingId);
    const isCustomOrder = Boolean(customOrderId);

    const orderType = isPartyBooking
      ? "PartyBooking"
      : isCustomOrder
        ? "CustomOrder"
        : "Order";

    const requestedId = partyBookingId || customOrderId || orderId;

    if (isPartyBooking && !installmentId) {
      return res.status(400).json({
        success: false,
        message: "Party booking installment ID is required.",
      });
    }

    // Read configured bank details.
    const bankName = (
      process.env.BANK_TRANSFER_BANK_NAME ||
      process.env.BANK_NAME ||
      ""
    ).trim();

    const accountName = (
      process.env.BANK_TRANSFER_ACCOUNT_NAME ||
      process.env.BANK_ACCOUNT_NAME ||
      ""
    ).trim();

    const accountNumber = (
      process.env.BANK_TRANSFER_ACCOUNT_NUMBER ||
      process.env.BANK_ACCOUNT_NUMBER ||
      ""
    ).trim();

    if (!bankName || !accountName || !accountNumber) {
      throw getPaymentError("BANK_TRANSFER_DETAILS_MISSING");
    }

    let order = null;
    let amount = 0;
    let balance = 0;
    let payment = null;
    let partyInstallment = null;

    // =====================================================
    // PARTY BOOKING
    // =====================================================

    if (isPartyBooking) {
      const result = await getPartyBookingPaymentDetails({
        bookingId: partyBookingId,
        installmentId,
        userId,
        provider: "bank_transfer",
      });

      const {
        booking,
        installment,
        amount: installmentAmount,
        balance: outstandingBalance,
      } = result;

      order = booking;
      partyInstallment = installment;
      amount = installmentAmount;
      balance = outstandingBalance;

      // Reuse an existing active attempt for this installment.
      payment = await Payment.findOne({
        user: userId,
        orderType: "PartyBooking",
        orderId: booking._id,
        provider: "bank_transfer",
        "metadata.installmentId": String(installment._id),
        status: {
          $in: ["pending", "awaiting_confirmation"],
        },
      }).sort({ createdAt: -1 });

      if (!payment) {
        payment = await createPaymentRecord({
          userId,
          orderType: "PartyBooking",
          orderId: booking._id,
          provider: "bank_transfer",
          amount,
          reference: makeReference("ABS-CUT-PARTY-BANK"),
          metadata: {
            purpose: "party_booking_installment",
            partyBookingId: String(booking._id),
            installmentId: String(installment._id),
            installmentAmount: amount,
            balanceBeforePayment: balance,
            dueDate: installment.dueDate,
          },
        });
      }
    }

    // =====================================================
    // ORDINARY ORDER / CUSTOM ORDER
    // =====================================================
    else {
      const reusablePayments = await Payment.find({
        user: userId,
        provider: "bank_transfer",
        orderType,
        orderId: requestedId,
        status: {
          $in: ["pending", "awaiting_confirmation"],
        },
      }).sort({ createdAt: -1 });

      if (reusablePayments.length > 0) {
        const Model = isCustomOrder ? CustomOrder : Order;

        order = await Model.findOne({
          _id: requestedId,
          user: userId,
        });

        if (!order) {
          throw getPaymentError(
            isCustomOrder ? "CUSTOM_ORDER_NOT_FOUND" : "ORDER_NOT_FOUND",
          );
        }

        if (
          (isCustomOrder &&
            String(order.status || "").toLowerCase() === "cancelled") ||
          (!isCustomOrder && order.orderStatus === "cancelled")
        ) {
          throw getPaymentError("ORDER_CANCELLED");
        }

        if (isCustomOrder) {
          const quotationKobo = toKobo(order.quotation || 0);
          const paidKobo = toKobo(order.amountPaid || 0);
          const balanceKobo = quotationKobo - paidKobo;

          if (quotationKobo <= 0) {
            throw getPaymentError("QUOTATION_NOT_READY");
          }

          if (balanceKobo <= 0) {
            throw getPaymentError("CUSTOM_ORDER_ALREADY_PAID");
          }

          balance = fromKobo(balanceKobo);
        } else {
          if (order.paymentStatus === "paid") {
            throw getPaymentError("ORDER_ALREADY_PAID");
          }

          balance = Number(order.total || 0);
        }

        const requestedAmountNumber =
          requestedAmount === undefined ||
          requestedAmount === null ||
          requestedAmount === ""
            ? null
            : Number(requestedAmount);

        payment =
          reusablePayments.find((candidate) => {
            const candidateKobo = toKobo(candidate.amount);

            if (candidateKobo <= 0 || candidateKobo > toKobo(balance)) {
              return false;
            }

            if (!isCustomOrder && candidateKobo !== toKobo(balance)) {
              return false;
            }

            if (
              isCustomOrder &&
              requestedAmountNumber !== null &&
              candidateKobo !== toKobo(requestedAmountNumber)
            ) {
              return false;
            }

            return true;
          }) || null;

        if (payment) {
          amount = Number(payment.amount);
        }
      }

      if (!payment) {
        const result = await getNewPaymentOrder(
          req,
          orderType,
          requestedId,
          isCustomOrder ? requestedAmount : undefined,
        );

        order = result.order;
        amount = result.amount;
        balance = result.balance;

        payment = await createPaymentRecord({
          userId,
          orderType,
          orderId: order._id,
          provider: "bank_transfer",
          amount,
          reference: makeReference("ABS-CUT-BANK"),
          metadata: {
            purpose: isCustomOrder
              ? "custom_order_installment"
              : "product_order_full_payment",
            requestedAmount: amount,
            balanceBeforePayment: balance,
          },
        });
      }
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,
      message:
        payment.status === "awaiting_confirmation"
          ? "Your submitted transfer is awaiting confirmation."
          : "Bank transfer instructions are ready.",

      paymentId: payment._id,
      reference: payment.reference,
      amount: payment.amount,
      balance,
      currency: CURRENCY,

      payment: {
        _id: payment._id,
        id: payment._id,
        reference: payment.reference,
        amount: payment.amount,
        status: payment.status,
        transferSenderName: payment.transferSenderName || "",
        transferAmount: payment.transferAmount ?? null,
        transferDate: payment.transferDate || null,
        transferTransactionId: payment.transferTransactionId || "",
        receiptUrl: payment.receiptUrl || "",
        evidenceSubmittedAt: payment.evidenceSubmittedAt || null,
      },

      bankDetails: {
        bankName,
        accountName,
        accountHolder: accountName,
        accountNumber,
      },

      partyBooking: isPartyBooking
        ? {
            _id: order._id,
            quotationAmount: order.quotationAmount,
            amountPaid: order.amountPaid,
            paymentStatus: order.paymentStatus,
            installment: {
              _id: partyInstallment._id,
              amount: partyInstallment.amount,
              dueDate: partyInstallment.dueDate,
              status: partyInstallment.status,
            },
          }
        : undefined,

      instructions:
        "Transfer the exact amount shown. After completing the transfer, submit your sender details and receipt for ABS CUT admin verification.",
    });
  } catch (error) {
    return sendError(res, error, "Initialize bank transfer error:");
  }
};

const initializePartyBookingPayment = async (req, res) => {
  let payment;

  try {
    const { partyBookingId, installmentId } = req.body;

    if (!partyBookingId || !installmentId) {
      return res.status(400).json({
        success: false,
        message: "Party booking ID and installment ID are required.",
      });
    }

    const userId = getUserId(req);

    // Validate booking, installment, customer email and settings.
    const result = await getPartyBookingPaymentDetails({
      bookingId: partyBookingId,
      installmentId,
      userId,
      provider: "paystack",
    });

    const { booking, installment, amount, customerEmail } = result;

    // Prevent multiple active payment attempts for the same
    // installment across Paystack, Flutterwave and bank transfer.
    const existingPayment = await Payment.findOne({
      orderType: "PartyBooking",
      orderId: booking._id,
      user: userId,
      "metadata.installmentId": String(installment._id),
      status: {
        $in: ["pending", "processing", "awaiting_confirmation"],
      },
    });

    if (existingPayment) {
      throw getPaymentError("PARTY_INSTALLMENT_PAYMENT_IN_PROGRESS");
    }

    const reference = makeReference("ABS-CUT-PARTY");

    // Create the payment ledger record first.
    payment = await createPaymentRecord({
      userId,
      orderType: "PartyBooking",
      orderId: booking._id,
      provider: "paystack",
      amount,
      reference,
      metadata: {
        purpose: "party_booking_installment",
        installmentId: String(installment._id),
        partyBookingId: String(booking._id),
        installmentAmount: amount,
      },
    });

    // Initialize Paystack checkout.
    const response = await paystack.post("/transaction/initialize", {
      email: customerEmail,
      amount: toKobo(amount),
      currency: CURRENCY,
      reference,
      callback_url: getFrontendCallbackUrl(),
      metadata: {
        paymentId: String(payment._id),
        partyBookingId: String(booking._id),
        installmentId: String(installment._id),
        userId: String(userId),
        orderType: "PartyBooking",
        purpose: "party_booking_installment",
      },
    });

    const data = response?.data?.data;

    if (!data?.authorization_url || !data?.reference) {
      payment.status = "failed";
      await payment.save();

      throw getPaymentError("PAYSTACK_CHECKOUT_URL_MISSING");
    }

    // Save the actual reference returned by Paystack.
    payment.reference = data.reference;
    await payment.save();

    return res.status(200).json({
      success: true,
      message: "Party booking payment initialized successfully.",
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
      amount,
      currency: CURRENCY,
      paymentId: payment._id,
      payment: {
        _id: payment._id,
        reference: data.reference,
        amount,
        status: payment.status,
      },
      booking: {
        _id: booking._id,
        quotationAmount: booking.quotationAmount,
        amountPaid: booking.amountPaid,
        paymentStatus: booking.paymentStatus,
      },
      installment: {
        _id: installment._id,
        amount: installment.amount,
        dueDate: installment.dueDate,
        status: installment.status,
      },
    });
  } catch (error) {
    // If checkout initialization fails, do not leave a pending
    // ledger record that permanently blocks another attempt.
    if (payment && payment.status === "pending") {
      try {
        payment.status = "failed";
        await payment.save();
      } catch (saveError) {
        console.error(
          "Could not update failed party payment:",
          saveError.message,
        );
      }
    }

    return sendError(
      res,
      error,
      "Initialize party booking Paystack payment error:",
    );
  }
};

// ============================================================
// PARTY BOOKING — PAYSTACK VERIFICATION
// ============================================================

const verifyPartyBookingPayment = async (req, res) => {
  try {
    const { reference } = req.params;
    const userId = getUserId(req);

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required.",
      });
    }

    // Find the customer's Paystack ledger payment.
    const payment = await findPaymentByReference(reference, "paystack", userId);

    if (!payment || payment.orderType !== "PartyBooking") {
      throw getPaymentError("PARTY_BOOKING_NOT_FOUND");
    }

    // Confirm that this booking belongs to the logged-in customer.
    const booking = await PartyBooking.findOne({
      _id: payment.orderId,
      customer: userId,
    }).populate("customer", "email firstName lastName");

    if (!booking) {
      throw getPaymentError("PARTY_BOOKING_NOT_FOUND");
    }

    // Return an idempotent success for an already-verified payment.
    if (payment.status === "successful") {
      return res.status(200).json({
        success: true,
        alreadyVerified: true,
        message: "This party booking payment has already been verified.",
        payment,
        booking,
        orderType: "PartyBooking",
        orderId: String(booking._id),
      });
    }

    if (!["pending", "processing"].includes(payment.status)) {
      throw getPaymentError("PAYMENT_ALREADY_PROCESSED");
    }

    // Verify directly with Paystack.
    const transaction = await verifyPaystackTransaction(reference);

    if (
      transaction?.status !== "success" ||
      transaction?.reference !== reference
    ) {
      throw getPaymentError("PAYMENT_NOT_CONFIRMED");
    }

    if (String(transaction.currency || "").toUpperCase() !== CURRENCY) {
      throw getPaymentError("PAYMENT_CURRENCY_MISMATCH");
    }

    // Verify the exact amount recorded in our payment ledger.
    if (
      !Number.isFinite(Number(transaction.amount)) ||
      Number(transaction.amount) !== toKobo(payment.amount)
    ) {
      throw getPaymentError("PAYMENT_AMOUNT_MISMATCH");
    }

    if (!transaction.id) {
      throw getPaymentError("INVALID_TRANSACTION_ID");
    }

    // Apply the verified payment to the correct installment.
    const applied = await applyNewPayment({
      paymentId: payment._id,
      provider: "paystack",
      transactionId: transaction.id,
    });

    // Retrieve the updated booking.
    const updatedBooking = await PartyBooking.findOne({
      _id: payment.orderId,
      customer: userId,
    }).populate("customer", "email firstName lastName");

    if (!updatedBooking) {
      throw getPaymentError("PARTY_BOOKING_NOT_FOUND");
    }

    if (!applied.alreadyProcessed) {
      await notifyAdminPaymentSafely({
        payment: applied.payment,
        order: updatedBooking,
      });
    }

    return res.status(200).json({
      success: true,
      alreadyVerified: false,
      message: "Party booking payment verified successfully.",
      payment: applied.payment,
      booking: updatedBooking,
      orderType: "PartyBooking",
      orderId: String(updatedBooking._id),
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Verify party booking Paystack payment error:",
    );
  }
};

const submitBankTransfer = async (req, res) => {
  try {
    const {
      paymentId,
      reference,
      transferSenderName,
      transferAmount,
      receiptUrl,
    } = req.body;

    if (!paymentId && !reference) {
      return res.status(400).json({
        success: false,
        message: "Payment ID or reference is required.",
      });
    }

    const senderName = String(transferSenderName || "").trim();

    const receipt = String(receiptUrl || "").trim();

    const amount = Number(transferAmount);

    if (!senderName) {
      throw getPaymentError("BANK_TRANSFER_SENDER_REQUIRED");
    }

    if (
      transferAmount === undefined ||
      transferAmount === null ||
      String(transferAmount).trim() === "" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid transfer amount.",
      });
    }

    // Receipt is required by the current payment policy.
    if (!receipt || !/^https?:\/\//i.test(receipt)) {
      throw getPaymentError("BANK_TRANSFER_RECEIPT_REQUIRED");
    }

    // Find the payment belonging to the logged-in customer.
    const filter = {
      user: getUserId(req),
      provider: "bank_transfer",
    };

    if (paymentId) {
      if (!isValidObjectId(paymentId)) {
        throw getPaymentError("PAYMENT_NOT_FOUND");
      }

      filter._id = paymentId;
    } else {
      filter.reference = String(reference).trim();
    }

    const payment = await Payment.findOne(filter);

    if (!payment) {
      throw getPaymentError("PAYMENT_NOT_FOUND");
    }

    // Prevent duplicate submission.
    if (payment.status === "awaiting_confirmation") {
      const sameSubmission =
        payment.transferSenderName === senderName &&
        toKobo(payment.transferAmount) === toKobo(amount) &&
        payment.receiptUrl === receipt;

      if (sameSubmission) {
        return res.status(200).json({
          success: true,
          message: "Your transfer is already awaiting admin confirmation.",
          payment,
        });
      }

      return res.status(409).json({
        success: false,
        message:
          "Transfer evidence has already been submitted. Contact ABS CUT if you need to correct it.",
      });
    }

    if (payment.status !== "pending") {
      throw getPaymentError("PAYMENT_NOT_AWAITING_CONFIRMATION");
    }

    // Verify the submitted amount.
    if (toKobo(amount) !== toKobo(payment.amount)) {
      return res.status(400).json({
        success: false,
        message:
          "The transfer amount does not match the amount requested for this payment. Please contact ABS CUT if you made a different payment.",
        expectedAmount: payment.amount,
        submittedAmount: amount,
      });
    }

    // PARTY BOOKING VALIDATION
    if (payment.orderType === "PartyBooking") {
      const booking = await PartyBooking.findOne({
        _id: payment.orderId,
        customer: getUserId(req),
      });

      if (!booking) {
        throw getPaymentError("PARTY_BOOKING_NOT_FOUND");
      }

      if (["cancelled", "completed"].includes(booking.status)) {
        throw getPaymentError("PARTY_BOOKING_NOT_PAYABLE");
      }

      if (
        !booking.quotationAcceptedAt ||
        booking.scheduleStatus !== "approved"
      ) {
        throw getPaymentError("PARTY_INSTALLMENT_SCHEDULE_NOT_APPROVED");
      }

      const installmentId = payment.metadata?.installmentId;

      const installment = booking.installmentSchedule.id(installmentId);

      if (!installment || installment.status !== "scheduled") {
        throw getPaymentError("PARTY_INSTALLMENT_ALREADY_PROCESSED");
      }
    }

    payment.transferSenderName = senderName;
    payment.transferAmount = amount;
    payment.receiptUrl = receipt;
    payment.evidenceSubmittedAt = new Date();

    // Do not assign transferDate here.
    // Do not assign transferTransactionId here.

    payment.status = "awaiting_confirmation";

    await payment.save();

    return res.status(200).json({
      success: true,
      message:
        "Transfer evidence submitted successfully. Your payment is awaiting ABS CUT admin verification.",

      payment: {
        _id: payment._id,
        reference: payment.reference,
        orderType: payment.orderType,
        orderId: payment.orderId,
        amount: payment.amount,
        transferSenderName: payment.transferSenderName,
        transferAmount: payment.transferAmount,
        receiptUrl: payment.receiptUrl,
        evidenceSubmittedAt: payment.evidenceSubmittedAt,
        status: payment.status,
      },
    });
  } catch (error) {
    return sendError(res, error, "Submit bank transfer error:");
  }
};

const confirmBankTransfer = async (req, res) => {
  try {
    const { paymentId, bankTransactionId, verifiedAmount } = req.body;

    if (
      !paymentId ||
      !bankTransactionId ||
      verifiedAmount === undefined ||
      verifiedAmount === null ||
      String(verifiedAmount).trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Payment ID, verified bank transaction ID and verified amount are required.",
      });
    }

    if (!isValidObjectId(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID.",
      });
    }

    const transactionId = String(bankTransactionId).trim();
    const amount = Number(verifiedAmount);

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "Enter the verified bank transaction ID.",
      });
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid verified transfer amount.",
      });
    }

    const payment = await Payment.findOne({
      _id: paymentId,
      provider: "bank_transfer",
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Bank transfer payment not found.",
      });
    }

    // Make repeated confirmation requests safe.
    if (payment.status === "successful") {
      return res.status(200).json({
        success: true,
        alreadyProcessed: true,
        message: "This bank transfer has already been confirmed.",
        payment,
      });
    }

    if (payment.status !== "awaiting_confirmation") {
      return res.status(400).json({
        success: false,
        message: "This transfer is not awaiting confirmation.",
      });
    }

    if (
      !payment.transferSenderName ||
      !payment.receiptUrl ||
      !payment.evidenceSubmittedAt
    ) {
      return res.status(400).json({
        success: false,
        message: "The customer has not submitted complete transfer evidence.",
      });
    }

    // Compare monetary values in kobo to avoid
    // JavaScript floating-point precision problems.
    if (toKobo(amount) !== toKobo(payment.amount)) {
      return res.status(400).json({
        success: false,
        message: "The verified bank amount does not match the payment amount.",
        expectedAmount: payment.amount,
        verifiedAmount: amount,
      });
    }

    // Do not trust the uploaded receipt alone.
    // The admin must independently verify the transaction in the bank account.
    const result = await applyNewPayment({
      paymentId: payment._id,
      provider: "bank_transfer",
      transactionId,
      confirmedBy: getUserId(req),
    });

    if (!result || !result.payment) {
      throw new Error("Payment confirmation could not be completed.");
    }

    if (!result.alreadyProcessed) {
      await notifyAdminPaymentSafely({
        payment: result.payment,
      });
    }

    return res.status(200).json({
      success: true,
      alreadyProcessed: Boolean(result.alreadyProcessed),
      message: result.alreadyProcessed
        ? "This bank transfer has already been confirmed."
        : "Bank transfer confirmed successfully.",
      payment: result.payment,
    });
  } catch (error) {
    console.error("Confirm bank transfer error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "This bank transaction ID has already been used for another payment.",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to confirm bank transfer.",
    });
  }
};

const getPendingBankTransfers = async (req, res) => {
  try {
    const payments = await Payment.find({
      provider: "bank_transfer",
      status: "awaiting_confirmation",
      transferSenderName: {
        $type: "string",
        $ne: "",
      },
      receiptUrl: {
        $type: "string",
        $ne: "",
      },
      evidenceSubmittedAt: {
        $type: "date",
      },
    })
      .populate("user", "firstName lastName name email")
      .sort({ evidenceSubmittedAt: -1 })
      .lean();

    const enrichedPayments = await Promise.all(
      payments.map(async (payment) => {
        let customer = payment.user || null;
        let booking = null;

        // =====================================================
        // PARTY BOOKING DETAILS
        // =====================================================

        if (payment.orderType === "PartyBooking" && payment.orderId) {
          booking = await PartyBooking.findById(payment.orderId)
            .populate("customer", "firstName lastName name email")
            .lean();

          if (booking?.customer) {
            customer = booking.customer;
          }
        }

        // =====================================================
        // ORDINARY ORDER DETAILS
        // =====================================================

        let order = null;

        if (payment.orderType === "Order" && payment.orderId) {
          order = await Order.findById(payment.orderId)
            .select("_id total orderStatus")
            .lean();
        }

        // =====================================================
        // CUSTOM ORDER DETAILS
        // =====================================================

        if (payment.orderType === "CustomOrder" && payment.orderId) {
          order = await CustomOrder.findById(payment.orderId)
            .select("_id quotation status")
            .lean();
        }

        // =====================================================
        // PARTY BOOKING INSTALLMENT DETAILS
        // =====================================================

        const installmentId = payment.metadata?.installmentId || null;

        let installment = null;

        if (booking && installmentId) {
          installment =
            booking.installmentSchedule?.find(
              (item) => String(item._id) === String(installmentId),
            ) || null;
        }

        return {
          ...payment,
          customer,
          booking,
          order,
          installment,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      count: enrichedPayments.length,
      payments: enrichedPayments,
    });
  } catch (error) {
    console.error("Get pending bank transfers error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve pending bank transfers.",
    });
  }
};

const rejectBankTransfer = async (req, res) => {
  try {
    const paymentId = req.body.paymentId || req.params.paymentId;
    const { rejectionReason } = req.body;

    if (!paymentId || !isValidObjectId(paymentId)) {
      throw getPaymentError("PAYMENT_NOT_FOUND");
    }

    const payment = await Payment.findOne({
      _id: paymentId,
      provider: "bank_transfer",
      status: "awaiting_confirmation",
    });

    if (!payment) {
      throw getPaymentError("PAYMENT_NOT_AWAITING_CONFIRMATION");
    }

    payment.status = "rejected";
    payment.rejectionReason = String(
      rejectionReason || "Transfer could not be confirmed.",
    ).trim();
    payment.rejectedBy = getUserId(req);
    payment.rejectedAt = new Date();

    await payment.save();

    return res.status(200).json({
      success: true,
      message: "Bank transfer rejected.",
      payment,
    });
  } catch (error) {
    return sendError(res, error, "Reject bank transfer error:");
  }
};

const getAdminPaymentHistory = async (req, res) => {
  try {
    const { status, provider, orderType, page = 1, limit = 20 } = req.query;

    const filter = {};

    // Preserve the existing filters.
    if (status) {
      filter.status = status;
    }

    if (
      provider &&
      ["paystack", "flutterwave", "bank_transfer"].includes(provider)
    ) {
      filter.provider = provider;
    }
    const supportedOrderTypes = ["Order", "CustomOrder", "PartyBooking"];

    if (orderType && supportedOrderTypes.includes(orderType)) {
      filter.orderType = orderType;
    }

    const bankTransferHistoryFilter = {
      $or: [
        
        {
          provider: { $ne: "bank_transfer" },
        },

        {
          provider: "bank_transfer",
          status: { $nin: ["pending", "awaiting_confirmation"] },
        },

        {
          provider: "bank_transfer",
          status: "awaiting_confirmation",

          transferSenderName: {
            $type: "string",
            $regex: /\S/,
          },

          receiptUrl: {
            $type: "string",
            $regex: /\S/,
          },

          evidenceSubmittedAt: {
            $type: "date",
          },
        },
       
      ],
    };

    filter.$and = [...(filter.$and || []), bankTransferHistoryFilter];

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate("user", "firstName lastName email")
        .populate("confirmedBy", "firstName lastName email")
        .populate("rejectedBy", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit),

      Payment.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      payments,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    return sendError(res, error, "Get admin payment history error:");
  }
};




// ============================================================
// EXPORTS — KEEP THESE NAMES FOR EXISTING ROUTES
// ============================================================

module.exports = {
  initializePayment,
  verifyPayment,

  initializeCustomOrderPayment,
  verifyCustomOrderPayment,
  paystackWebhook,

  initializeFlutterwavePayment,
  verifyFlutterwavePayment,
  flutterwaveWebhook,

  initializeBankTransfer,
  submitBankTransfer,
  confirmBankTransfer,
  getPendingBankTransfers,
  rejectBankTransfer,
  initializePartyBookingPayment,
  verifyPartyBookingPayment,
  getAdminPaymentHistory,
};

