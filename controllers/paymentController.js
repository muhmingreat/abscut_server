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

// const getFrontendCallbackUrl = () => {
//   const frontendUrl = process.env.FRONTEND_URL;

//   if (!frontendUrl) {
//     throw new Error("FRONTEND_URL_MISSING");
//   }

//   return `${frontendUrl.replace(/\/+$/, "")}/payments/callback`;
// };
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

// ============================================================
// ADMIN PAYMENT NOTIFICATION
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

    if (!order && payment.orderId) {
      const Model = payment.orderType === "CustomOrder" ? CustomOrder : Order;

      order = await Model.findById(payment.orderId).populate(
        "user",
        "firstName lastName email",
      );
    }

    if (!order) {
      console.warn(
        "ABS CUT payment notification skipped: order not found.",
        payment.reference,
      );
      return;
    }

    const user = order.user || {};

    const buyerName =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      order.name ||
      order.customerName ||
      "Customer";

    const customerEmail = getCustomerEmail(order) || user.email || "";

    await notifyAdminPayment({
      customerName: buyerName,
      customerEmail,
      orderId: `${payment.orderType === "CustomOrder" ? "Custom Order" : "Order"} #${order._id}`,
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
      "ABS CUT admin payment notification sent for:",
      payment.reference,
    );
  } catch (error) {
    // The payment has already been processed. Do not fail it
    // just because the notification could not be delivered.
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

      // Idempotency: a repeated webhook or verify call must not add
      // the same payment to the order again.
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

        // Normal product orders are full-payment only.
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

        // Enforce the maximum installment count when money is actually
        // applied, not only when checkout is initialized.
        const successfulPayments = await Payment.countDocuments({
          _id: { $ne: payment._id },
          orderType: "CustomOrder",
          orderId: order._id,
          status: "successful",
        }).session(session);

        let completedCount = successfulPayments;

        // Legacy orders may have a paid amount but no payment ledger.
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
      } else {
        throw getPaymentError("INVALID_PAYMENT_PROVIDER");
      }

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

      // // applyNewPayment must apply this ledger entry only once.
      // const applied = await applyNewPayment({
      //   paymentId: payment._id,
      //   provider: "paystack",
      //   transactionId: transaction.id,
      // });
      // if (!applied.alreadyProcessed) {
      //   await notifyAdminPaymentSafely({
      //     payment: applied.payment,
      //     order: updatedCustomOrder,
      //   });
      // }
      // // Reload the order because applyNewPayment may have updated it.
      // const updatedCustomOrder = await CustomOrder.findOne({
      //   _id: payment.orderId,
      //   user: userId,
      // });

      // if (!updatedCustomOrder) {
      //   throw getPaymentError("CUSTOM_ORDER_NOT_FOUND");
      // }

      // return res.status(200).json({
      //   success: true,
      //   alreadyVerified: false,
      //   message: "Custom order payment verified successfully.",
      //   payment: applied.payment,
      //   customOrder: updatedCustomOrder,
      //   orderType: "CustomOrder",
      //   orderId: String(updatedCustomOrder._id),
      // });
      
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
  try {
    const { orderId, customOrderId } = req.body;
    const requestedAmount = getRequestedPaymentAmount(req.body);

    const isCustomOrder = Boolean(customOrderId);
    const orderType = isCustomOrder ? "CustomOrder" : "Order";
    const requestedId = isCustomOrder ? customOrderId : orderId;

    if (!requestedId) {
      return res.status(400).json({
        success: false,
        message: isCustomOrder
          ? "Custom order ID is required."
          : "Order ID is required.",
      });
    }

    const result = await getNewPaymentOrder(
      req,
      orderType,
      requestedId,
      isCustomOrder ? requestedAmount : undefined,
    );

    const { order, amount } = result;
    const email = getCustomerEmail(order);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "A valid customer email is required.",
      });
    }

    const reference = makeReference(
      isCustomOrder ? "ABS-CUT-FLW-CUSTOM" : "ABS-CUT-FLW",
    );

    const payment = await createPaymentRecord({
      userId: getUserId(req),
      orderType,
      orderId: order._id,
      provider: "flutterwave",
      amount,
      reference,
      metadata: {
        purpose: isCustomOrder
          ? "custom_order_installment"
          : "product_order_full_payment",
      },
    });

    const response = await flutterwave.post("/payments", {
      tx_ref: reference,
      amount,
      currency: CURRENCY,
      redirect_url: getFrontendCallbackUrl(),
      customer: {
        email,
        name:
          `${order.user?.firstName || ""} ${
            order.user?.lastName || ""
          }`.trim() || "ABS CUT Customer",
      },
      meta: {
        paymentId: String(payment._id),
        orderId: String(order._id),
        orderType,
        userId: String(getUserId(req)),
      },
      customizations: {
        title: "ABS CUT",
        description: isCustomOrder
          ? "Custom order payment"
          : "Product order payment",
      },
    });

    const data = response?.data?.data;

    if (!data?.link) {
      // Keep the ledger record pending if the provider response is
      // ambiguous; a later webhook/verification may still resolve it.
      return res.status(502).json({
        success: false,
        message: "Flutterwave did not return a checkout link.",
        reference,
      });
    }

    if (isCustomOrder) {
      order.paymentReference = reference;

      if (
        Number(order.amountPaid || 0) <= 0 &&
        order.paymentStatus === "Not Required"
      ) {
        order.paymentStatus = CUSTOM_PAYMENT_STATUSES.PENDING;
      }

      await order.save();
    } else {
      order.paymentReference = reference;
      await order.save();
    }

    return res.status(200).json({
      success: true,
      message: "Flutterwave payment initialized successfully.",
      authorizationUrl: data.link,
      link: data.link,
      reference,
      amount,
      currency: CURRENCY,
      paymentId: payment._id,
    });
  } catch (error) {
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

    // Flutterwave transaction IDs commonly arrive as numeric strings.
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

    /*
     * Load the associated order.
     */
    let order = null;
    let customOrder = null;

    if (payment.orderType === "CustomOrder") {
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

    /*
     * Idempotent response for an already-successful payment.
     * Do not apply the same installment twice.
     */
    if (payment.status === "successful") {
      return res.status(200).json({
        success: true,
        alreadyVerified: true,
        message: "This payment has already been verified.",
        payment,
        order,
        customOrder,
        orderId: String(payment.orderId),
        orderType: payment.orderType,
      });
    }

    /*
     * Verify the transaction directly with Flutterwave.
     */
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

    /*
     * Validate the actual amount received.
     *
     * Flutterwave's transaction amount is expressed in the
     * major currency unit, for example NGN 5000.00.
     * Compare it with the ledger amount, not the full quotation.
     */
    if (
      !Number.isFinite(Number(transaction.amount)) ||
      toKobo(transaction.amount) !== toKobo(payment.amount)
    ) {
      throw getPaymentError("PAYMENT_AMOUNT_MISMATCH");
    }

    // Record the verified transaction and apply this payment once.
    const applied = await applyNewPayment({
      paymentId: payment._id,
      provider: "flutterwave",
      transactionId: String(transaction.id),
    });

    /*
     * Reload the order after payment application so the frontend
     * receives the latest balance and payment status.
     */
    if (payment.orderType === "CustomOrder") {
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

    return res.status(200).json({
      success: true,
      alreadyVerified: false,
      message: "Flutterwave payment verified successfully.",
      payment: applied.payment,
      order,
      customOrder,
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
    order: applied.order,
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
    const { orderId, customOrderId } = req.body;
    const requestedAmount = getRequestedPaymentAmount(req.body);

    const isCustomOrder = Boolean(customOrderId);
    const orderType = isCustomOrder ? "CustomOrder" : "Order";
    const requestedId = isCustomOrder ? customOrderId : orderId;

    if (!requestedId) {
      return res.status(400).json({
        success: false,
        message: isCustomOrder
          ? "Custom order ID is required."
          : "Order ID is required.",
      });
    }

    const result = await getNewPaymentOrder(
      req,
      orderType,
      requestedId,
      isCustomOrder ? requestedAmount : undefined,
    );

    const { order, amount, balance } = result;

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

    const reference = makeReference("ABS-CUT-BANK");

    const payment = await createPaymentRecord({
      userId: getUserId(req),
      orderType,
      orderId: order._id,
      provider: "bank_transfer",
      amount,
      reference,
      metadata: {
        purpose: isCustomOrder
          ? "custom_order_installment"
          : "product_order_full_payment",
        requestedAmount: amount,
        balanceBeforePayment: balance,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Bank transfer instructions created.",
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
      },
      bankDetails: {
        bankName,
        accountName,
        accountHolder: accountName,
        accountNumber,
      },
      instructions:
        "Transfer the exact amount using the payment reference, then submit your transfer details for admin confirmation.",
    });
  } catch (error) {
    return sendError(res, error, "Initialize bank transfer error:");
  }
};

// ============================================================
// BANK TRANSFER — CUSTOMER SUBMITS TRANSFER DETAILS
// ============================================================

const submitBankTransfer = async (req, res) => {
  try {
    const { paymentId, reference, transferSenderName, receiptUrl } = req.body;

    if (!paymentId && !reference) {
      return res.status(400).json({
        success: false,
        message: "Payment ID or reference is required.",
      });
    }

    if (!String(transferSenderName || "").trim()) {
      throw getPaymentError("BANK_TRANSFER_SENDER_REQUIRED");
    }

    const filter = {
      user: getUserId(req),
      provider: "bank_transfer",
      status: { $in: ["pending", "awaiting_confirmation"] },
    };

    if (paymentId && isValidObjectId(paymentId)) {
      filter._id = paymentId;
    } else if (reference) {
      filter.reference = reference;
    } else {
      throw getPaymentError("PAYMENT_NOT_FOUND");
    }

    const payment = await Payment.findOne(filter);

    if (!payment) {
      throw getPaymentError("PAYMENT_NOT_FOUND");
    }

    payment.status = "awaiting_confirmation";
    payment.transferSenderName = String(transferSenderName).trim();

    if (receiptUrl) {
      payment.receiptUrl = String(receiptUrl).trim();
    }

    await payment.save();

    return res.status(200).json({
      success: true,
      message:
        "Transfer details submitted. Your payment is awaiting admin confirmation.",
      payment,
    });
  } catch (error) {
    return sendError(res, error, "Submit bank transfer error:");
  }
};

// ============================================================
// BANK TRANSFER — ADMIN CONFIRMS PAYMENT
// ============================================================
const confirmBankTransfer = async (req, res) => {
  try {
    const { paymentId, bankTransactionId } = req.body;

    if (!paymentId || !isValidObjectId(paymentId)) {
      throw getPaymentError("PAYMENT_NOT_FOUND");
    }

    const transactionNumber = String(bankTransactionId || "").trim();

    if (!transactionNumber) {
      return res.status(400).json({
        success: false,
        message: "The bank transaction number is required.",
      });
    }

    const payment = await Payment.findOne({
      _id: paymentId,
      provider: "bank_transfer",
      status: "awaiting_confirmation",
    });

    if (!payment) {
      throw getPaymentError("PAYMENT_NOT_AWAITING_CONFIRMATION");
    }

    if (!payment.transferSenderName) {
      throw getPaymentError("BANK_TRANSFER_SENDER_REQUIRED");
    }

    // Only proceed after independently verifying the funds
    // in the ABS CUT bank account.
    const result = await applyNewPayment({
      paymentId: payment._id,
      provider: "bank_transfer",
      transactionId: transactionNumber,
      confirmedBy: getUserId(req),
    });
    if (!result.alreadyProcessed) {
      await notifyAdminPaymentSafely({
        payment: result.payment,
        order: result.order,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bank transfer confirmed successfully.",
      payment: result.payment,
    });
  } catch (error) {
    return sendError(res, error, "Confirm bank transfer error:");
  }
};

// ============================================================
// BANK TRANSFER — ADMIN LISTS PENDING TRANSFERS
// ============================================================

const getPendingBankTransfers = async (req, res) => {
  try {
    const payments = await Payment.find({
      provider: "bank_transfer",
      status: "awaiting_confirmation",
    })
      .populate("user", "firstName lastName email")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    return sendError(res, error, "Get pending bank transfers error:");
  }
};

// ============================================================
// BANK TRANSFER — ADMIN REJECTS TRANSFER
// ============================================================

const rejectBankTransfer = async (req, res) => {
  try {
    const { paymentId } = req.params;
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

// ============================================================
// ADMIN — PAYMENT HISTORY
// ============================================================

const getAdminPaymentHistory = async (req, res) => {
  try {
    const { status, provider, orderType, page = 1, limit = 20 } = req.query;

    const filter = {};

    if (status) {
      filter.status = status;
    }

    if (
      provider &&
      ["paystack", "flutterwave", "bank_transfer"].includes(provider)
    ) {
      filter.provider = provider;
    }

    if (orderType && ["Order", "CustomOrder"].includes(orderType)) {
      filter.orderType = orderType;
    }

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

  getAdminPaymentHistory,
};
