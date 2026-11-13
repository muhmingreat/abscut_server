
const crypto = require("crypto");
const mongoose = require("mongoose");

const CourseEnrollment = require("../models/CourseEnrollment");
const Payment = require("../models/Payment");

const paystack = require("../config/paystack");
const flutterwave = require("../config/flutterwave");

const {
  createNotification,
  notifyAdmins,
} = require("../services/notificationService");

// =====================================================
// ABS CUT FASHION ACADEMY — PAYMENT CONTROLLER
// =====================================================

const CURRENCY = "NGN";

const ACTIVE_PAYMENT_STATUSES = [
  "pending",
  "processing",
  "awaiting_confirmation",
];

// =====================================================
// NOTIFICATION HELPERS
// =====================================================

const getSocketIO = (req) => {
  return req?.app?.get("io");
};

const runNotifications = async (tasks, label = "Academy") => {
  const results = await Promise.allSettled(tasks);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(
        `ABS CUT ${label} notification ${index + 1} failed:`,
        result.reason
      );
    }
  });
};

// =====================================================
// GENERAL HELPERS
// =====================================================

const toKobo = (amount) => {
  return Math.round(Number(amount) * 100);
};

const fromKobo = (amount) => {
  return Number(amount) / 100;
};

const formatMoney = (amount) => {
  return `₦${Number(amount || 0).toLocaleString("en-NG")}`;
};

const makeReference = (prefix = "ABS-FA") => {
  return `${prefix}-${crypto.randomUUID()}`;
};

const getEnrollment = async (enrollmentId, userId) => {
  if (!mongoose.isValidObjectId(enrollmentId)) {
    return null;
  }

  return CourseEnrollment.findOne({
    _id: enrollmentId,
    user: userId,
  }).populate("course");
};

const getCoursePriceKobo = (enrollment) => {
  return toKobo(
    enrollment.courseSnapshot?.price ??
      enrollment.amountDue ??
      0
  );
};

const getPaidKobo = (enrollment) => {
  return toKobo(enrollment.amountPaid || 0);
};

const getRemainingKobo = (enrollment) => {
  return Math.max(
    0,
    getCoursePriceKobo(enrollment) - getPaidKobo(enrollment)
  );
};

const validateProvider = (provider) => {
  if (!["paystack", "flutterwave"].includes(provider)) {
    throw new Error("Unsupported payment provider.");
  }
};

const validateEnrollmentForPayment = (enrollment) => {
  if (!enrollment) {
    throw new Error("Course enrollment not found.");
  }

  if (["cancelled", "refunded"].includes(enrollment.status)) {
    throw new Error(
      "Payment is unavailable for this enrollment."
    );
  }

  if (
    enrollment.paymentStatus === "paid" ||
    enrollment.paymentStatus === "not_required"
  ) {
    throw new Error(
      "This enrollment has already been paid."
    );
  }

  if (enrollment.courseSnapshot?.isFree) {
    throw new Error("This course is free.");
  }
};

// =====================================================
// INSTALLMENT CALCULATION
// 50% UPFRONT + REMAINING BALANCE
// =====================================================

const getNextPayment = (enrollment, paymentOption) => {
  const totalKobo = getCoursePriceKobo(enrollment);
  const paidKobo = getPaidKobo(enrollment);
  const remainingKobo = getRemainingKobo(enrollment);

  if (totalKobo <= 0) {
    throw new Error("This course does not require payment.");
  }

  if (remainingKobo <= 0) {
    throw new Error(
      "This course has already been fully paid for."
    );
  }

  if (paymentOption === "full") {
    if (paidKobo > 0) {
      throw new Error(
        "Full payment is only available before the first installment."
      );
    }

    return {
      paymentPlan: "full",
      installmentNumber: null,
      amountKobo: totalKobo,
      totalInstallments: 2,
    };
  }

  if (paymentOption !== "installment") {
    throw new Error("Invalid payment option.");
  }

  // First installment: 50%.
  if (paidKobo === 0) {
    return {
      paymentPlan: "installment",
      installmentNumber: 1,
      amountKobo: Math.ceil(totalKobo / 2),
      totalInstallments: 2,
    };
  }

  // Second installment: exact remaining balance.
  if (enrollment.paymentStatus !== "partially_paid") {
    throw new Error(
      "Invalid installment payment state."
    );
  }

  if (Number(enrollment.installmentsPaid || 0) !== 1) {
    throw new Error(
      "The installment payment state is inconsistent."
    );
  }

  return {
    paymentPlan: "installment",
    installmentNumber: 2,
    amountKobo: remainingKobo,
    totalInstallments: 2,
  };
};

// =====================================================
// CREATE PAYMENT RECORD
// =====================================================

const createPayment = async ({
  enrollment,
  userId,
  provider,
  paymentDetails,
}) => {
  const reference = makeReference();

  const payment = await Payment.create({
    user: userId,
    orderType: "CourseEnrollment",
    orderId: enrollment._id,
    provider,
    reference,
    amount: fromKobo(paymentDetails.amountKobo),
    currency: CURRENCY,
    status: "pending",

    paymentPlan: paymentDetails.paymentPlan,
    installmentNumber: paymentDetails.installmentNumber,
    totalInstallments: paymentDetails.totalInstallments,

    metadata: {
      courseId: enrollment.course?._id || enrollment.course,
      courseTitle: enrollment.courseSnapshot?.title,
      enrollmentId: enrollment._id,
      paymentOption: paymentDetails.paymentPlan,
      installmentNumber: paymentDetails.installmentNumber,
    },
  });

  return payment;
};

// =====================================================
// PREVENT DUPLICATE ACTIVE PAYMENTS
// =====================================================

const findActivePayment = async (enrollmentId) => {
  return Payment.findOne({
    orderType: "CourseEnrollment",
    orderId: enrollmentId,
    status: {
      $in: ACTIVE_PAYMENT_STATUSES,
    },
  }).sort({ createdAt: -1 });
};

const assertNoActivePayment = async (enrollmentId) => {
  const existingPayment = await findActivePayment(enrollmentId);

  if (existingPayment) {
    throw new Error(
      "An outstanding payment already exists for this enrollment. Complete it or wait for its status to be updated before starting another."
    );
  }
};

// =====================================================
// ACADEMY PAYMENT NOTIFICATIONS
// =====================================================

const notifyAcademyPaymentSuccess = async ({
  payment,
  enrollment,
  io,
}) => {
  const courseTitle =
    enrollment.courseSnapshot?.title ||
    "Fashion Academy Course";

  const paymentDescription =
    payment.paymentPlan === "full"
      ? "Full payment"
      : `Installment ${payment.installmentNumber}`;

  const amount = Number(payment.amount || 0);

  await runNotifications(
    [
      createNotification({
        io,
        userId: payment.user,
        title: "Academy payment successful",
        message:
          `Your payment of ${formatMoney(amount)} for ` +
          `${courseTitle} has been verified successfully. ` +
          `Plan: ${paymentDescription}.`,
        type: "academy-payment",
        link: "/academy/my-courses",
        metadata: {
          paymentId: String(payment._id),
          enrollmentId: String(enrollment._id),
          courseTitle,
          amount,
          paymentPlan: payment.paymentPlan,
          installmentNumber: payment.installmentNumber,
          paymentStatus: enrollment.paymentStatus,
        },
      }),

      notifyAdmins({
        io,
        title: "Academy payment received",
        message:
          `A payment of ${formatMoney(amount)} was verified ` +
          `for ${courseTitle}.`,
        type: "academy-payment",
        link: "/admin/academy/payments",
        metadata: {
          paymentId: String(payment._id),
          enrollmentId: String(enrollment._id),
          studentId: String(payment.user),
          courseTitle,
          amount,
          paymentPlan: payment.paymentPlan,
          installmentNumber: payment.installmentNumber,
        },
      }),
    ],
    "Academy payment success"
  );
};

const notifyAcademyTransferEvidence = async ({
  payment,
  enrollment,
  io,
}) => {
  const courseTitle =
    enrollment?.courseSnapshot?.title ||
    "Fashion Academy Course";

  await runNotifications(
    [
      notifyAdmins({
        io,
        title: "Academy bank transfer submitted",
        message:
          `A student submitted bank-transfer evidence of ` +
          `${formatMoney(payment.amount)} for ${courseTitle}. ` +
          `Administrator confirmation is required.`,
        type: "academy-payment",
        link: "/admin/academy/payments",
        metadata: {
          paymentId: String(payment._id),
          enrollmentId: String(payment.orderId),
          studentId: String(payment.user),
          courseTitle,
          amount: payment.amount,
          reference: payment.reference,
          transferTransactionId: payment.transferTransactionId,
        },
      }),
    ],
    "Academy transfer evidence"
  );
};

const notifyAcademyTransferRejected = async ({
  payment,
  enrollment,
  io,
}) => {
  const courseTitle =
    enrollment?.courseSnapshot?.title ||
    "Fashion Academy Course";

  await runNotifications(
    [
      createNotification({
        io,
        userId: payment.user,
        title: "Academy bank transfer rejected",
        message:
          `Your bank-transfer evidence for ${courseTitle} ` +
          `was rejected. Reason: ${payment.rejectionReason || "Please contact support."}`,
        type: "academy-payment",
        link: "/academy/my-courses",
        metadata: {
          paymentId: String(payment._id),
          enrollmentId: String(payment.orderId),
          courseTitle,
          amount: payment.amount,
          reference: payment.reference,
          rejectionReason: payment.rejectionReason,
        },
      }),
    ],
    "Academy transfer rejection"
  );
};

// =====================================================
// APPLY SUCCESSFUL PAYMENT
// ATOMIC ENROLLMENT + PAYMENT UPDATE
// =====================================================

const applySuccessfulPayment = async (
  paymentId,
  providerTransactionId,
  options = {}
) => {
  if (!mongoose.isValidObjectId(paymentId)) {
    throw new Error("Invalid payment ID.");
  }

  const session = await mongoose.startSession();

  let result;

  try {
    await session.withTransaction(async () => {
      const payment = await Payment.findById(paymentId)
        .session(session);

      if (!payment) {
        throw new Error("Payment record not found.");
      }

      // Idempotency: never credit a successful payment twice.
      if (payment.status === "successful") {
        result = {
          alreadyApplied: true,
          payment,
          enrollment: await CourseEnrollment.findById(
            payment.orderId
          ).session(session),
        };

        return;
      }

      if (!ACTIVE_PAYMENT_STATUSES.includes(payment.status)) {
        throw new Error(
          `Payment cannot be applied from status "${payment.status}".`
        );
      }

      if (payment.orderType !== "CourseEnrollment") {
        throw new Error("Invalid payment type.");
      }

      if (payment.currency !== CURRENCY) {
        throw new Error("Invalid payment currency.");
      }

      const enrollment = await CourseEnrollment.findOne({
        _id: payment.orderId,
        user: payment.user,
      }).session(session);

      if (!enrollment) {
        throw new Error("Course enrollment not found.");
      }

      if (
        ["cancelled", "refunded"].includes(enrollment.status)
      ) {
        throw new Error(
          "Payment cannot be applied to this enrollment."
        );
      }

      const totalKobo = getCoursePriceKobo(enrollment);
      const currentPaidKobo = getPaidKobo(enrollment);
      const paymentKobo = toKobo(payment.amount);

      if (totalKobo <= 0 || paymentKobo <= 0) {
        throw new Error("Invalid course payment amount.");
      }

      if (currentPaidKobo + paymentKobo > totalKobo) {
        throw new Error(
          "This payment would overpay the course."
        );
      }

      // -----------------------------------------------
      // VALIDATE PAYMENT PLAN
      // -----------------------------------------------

      if (payment.paymentPlan === "full") {
        if (
          payment.installmentNumber != null ||
          currentPaidKobo !== 0 ||
          paymentKobo !== totalKobo
        ) {
          throw new Error("Invalid full payment.");
        }
      } else if (payment.paymentPlan === "installment") {
        if (payment.installmentNumber === 1) {
          const expectedFirstInstallment = Math.ceil(
            totalKobo / 2
          );

          if (
            currentPaidKobo !== 0 ||
            paymentKobo !== expectedFirstInstallment
          ) {
            throw new Error("Invalid first installment.");
          }
        } else if (payment.installmentNumber === 2) {
          if (
            enrollment.paymentStatus !== "partially_paid" ||
            Number(enrollment.installmentsPaid || 0) !== 1 ||
            currentPaidKobo <= 0 ||
            paymentKobo !== totalKobo - currentPaidKobo
          ) {
            throw new Error("Invalid second installment.");
          }
        } else {
          throw new Error("Invalid installment number.");
        }
      } else {
        throw new Error("Invalid payment plan.");
      }

      const newPaidKobo = currentPaidKobo + paymentKobo;
      const fullyPaid = newPaidKobo === totalKobo;

      // -----------------------------------------------
      // UPDATE ENROLLMENT
      // -----------------------------------------------

      const enrollmentUpdate =
        await CourseEnrollment.updateOne(
          {
            _id: enrollment._id,
            amountPaid: enrollment.amountPaid,
            paymentStatus: enrollment.paymentStatus,
          },
          {
            $set: {
              amountPaid: fromKobo(newPaidKobo),

              paymentStatus: fullyPaid
                ? "paid"
                : "partially_paid",

              paymentProvider: payment.provider,
              paymentReference: payment.reference,
              paymentPlan: payment.paymentPlan,

              installmentsPaid: fullyPaid
                ? payment.paymentPlan === "installment"
                  ? 2
                  : 0
                : 1,

              status: "active",
            },
          },
          { session }
        );

      if (enrollmentUpdate.modifiedCount !== 1) {
        throw new Error(
          "Enrollment payment state changed. Please verify the payment again."
        );
      }

      // -----------------------------------------------
      // UPDATE PAYMENT
      // -----------------------------------------------

      const paymentUpdate = await Payment.updateOne(
        {
          _id: payment._id,
          status: {
            $in: ACTIVE_PAYMENT_STATUSES,
          },
          orderType: "CourseEnrollment",
        },
        {
          $set: {
            status: "successful",

            transactionId: providerTransactionId
              ? String(providerTransactionId)
              : undefined,

            verifiedAt: new Date(),
            paidAt: new Date(),

            ...(options.confirmedBy
              ? {
                  confirmedBy: options.confirmedBy,
                  confirmedAt: new Date(),
                }
              : {}),
          },
        },
        { session }
      );

      if (paymentUpdate.modifiedCount !== 1) {
        throw new Error(
          "Payment status changed before confirmation."
        );
      }

      result = {
        alreadyApplied: false,
        payment,
        enrollment: {
          ...enrollment.toObject(),
          amountPaid: fromKobo(newPaidKobo),
          paymentStatus: fullyPaid
            ? "paid"
            : "partially_paid",
          status: "active",
        },
      };
    });

    // -----------------------------------------------
    // NOTIFICATIONS — ONLY AFTER TRANSACTION COMMIT
    // -----------------------------------------------

    if (result && !result.alreadyApplied) {
      await notifyAcademyPaymentSuccess({
        payment: result.payment,
        enrollment: result.enrollment,
        io: options.io,
      });
    }

    return result;
  } finally {
    await session.endSession();
  }
};

// =====================================================
// INITIALIZE PAYSTACK / FLUTTERWAVE PAYMENT
// =====================================================

const initializeAcademyPayment = async (req, res) => {
  try {
    const {
      enrollmentId,
      provider,
      paymentOption,
    } = req.body;

    validateProvider(provider);

    const enrollment = await getEnrollment(
      enrollmentId,
      req.user._id
    );

    validateEnrollmentForPayment(enrollment);

    const paymentDetails = getNextPayment(
      enrollment,
      paymentOption
    );

    await assertNoActivePayment(enrollment._id);

    const email = req.user.email;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Your account must have an email address.",
      });
    }

    const callbackUrl =
      process.env.ACADEMY_PAYMENT_CALLBACK_URL;

    if (!callbackUrl) {
      return res.status(500).json({
        success: false,
        message:
          "Academy payment callback URL is not configured.",
      });
    }

    const payment = await createPayment({
      enrollment,
      userId: req.user._id,
      provider,
      paymentDetails,
    });

    try {
      let paymentUrl;

      // PAYSTACK
      if (provider === "paystack") {
        const response = await paystack.post(
          "/transaction/initialize",
          {
            email,
            amount: toKobo(payment.amount),
            currency: CURRENCY,
            callback_url: callbackUrl,
            reference: payment.reference,

            metadata: {
              paymentId: payment._id.toString(),
              enrollmentId: enrollment._id.toString(),
              courseTitle: enrollment.courseSnapshot.title,
              paymentPlan: paymentDetails.paymentPlan,
              installmentNumber:
                paymentDetails.installmentNumber,
            },
          }
        );

        paymentUrl =
          response.data?.data?.authorization_url;
      }

      // FLUTTERWAVE
      if (provider === "flutterwave") {
        const response = await flutterwave.post(
          "/payments",
          {
            tx_ref: payment.reference,
            amount: payment.amount,
            currency: CURRENCY,
            redirect_url: callbackUrl,

            customer: {
              email,
              name:
                req.user.name ||
                req.user.fullName ||
                "ABS CUT Academy Student",
            },

            meta: {
              paymentId: payment._id.toString(),
              enrollmentId: enrollment._id.toString(),
              paymentPlan: paymentDetails.paymentPlan,
              installmentNumber:
                paymentDetails.installmentNumber,
            },

            customizations: {
              title: "ABS CUT Fashion Academy",
              description:
                `Payment for ${enrollment.courseSnapshot.title}`,
              logo: process.env.ABS_CUT_LOGO_URL || "",
            },
          }
        );

        paymentUrl = response.data?.data?.link;
      }

      if (!paymentUrl) {
        throw new Error(
          "Payment gateway did not return a payment URL."
        );
      }

      return res.status(200).json({
        success: true,
        message: "Payment initialized successfully.",
        paymentUrl,
        reference: payment.reference,
        paymentId: payment._id,
        amount: payment.amount,
        currency: payment.currency,
        paymentPlan: payment.paymentPlan,
        installmentNumber: payment.installmentNumber,
      });
    } catch (gatewayError) {
      await Payment.updateOne(
        {
          _id: payment._id,
          status: "pending",
        },
        {
          $set: {
            status: "failed",
            rejectionReason:
              gatewayError.response?.data?.message ||
              gatewayError.message ||
              "Payment initialization failed.",
          },
        }
      );

      throw gatewayError;
    }
  } catch (error) {
    console.error(
      "Academy payment initialization error:",
      error.response?.data || error.message
    );

    return res.status(400).json({
      success: false,
      message:
        error.response?.data?.message ||
        error.message ||
        "Unable to initialize payment.",
    });
  }
};

// =====================================================
// VERIFY PAYSTACK PAYMENT
// =====================================================

const verifyPaystackPayment = async (payment) => {
  const response = await paystack.get(
    `/transaction/verify/${encodeURIComponent(
      payment.reference
    )}`
  );

  const data = response.data?.data;

  if (!data) {
    throw new Error(
      "Unable to verify Paystack transaction."
    );
  }

  if (data.status !== "success") {
    throw new Error(
      "Paystack payment has not succeeded."
    );
  }

  if (data.reference !== payment.reference) {
    throw new Error("Paystack reference mismatch.");
  }

  if (data.currency !== payment.currency) {
    throw new Error("Paystack currency mismatch.");
  }

  if (Number(data.amount) !== toKobo(payment.amount)) {
    throw new Error("Paystack amount mismatch.");
  }

  return data;
};

// =====================================================
// VERIFY FLUTTERWAVE PAYMENT
// =====================================================

const verifyFlutterwavePayment = async (
  payment,
  transactionId
) => {
  const id =
    transactionId || payment.transactionId;

  if (!id) {
    throw new Error(
      "Flutterwave transaction ID is required for verification."
    );
  }

  const response = await flutterwave.get(
    `/transactions/${encodeURIComponent(id)}/verify`
  );

  const data = response.data?.data;

  if (!data) {
    throw new Error(
      "Unable to verify Flutterwave transaction."
    );
  }

  if (data.status !== "successful") {
    throw new Error(
      "Flutterwave payment has not succeeded."
    );
  }

  if (data.tx_ref !== payment.reference) {
    throw new Error("Flutterwave reference mismatch.");
  }

  if (data.currency !== payment.currency) {
    throw new Error("Flutterwave currency mismatch.");
  }

  if (toKobo(data.amount) !== toKobo(payment.amount)) {
    throw new Error("Flutterwave amount mismatch.");
  }

  if (String(data.id) !== String(id)) {
    throw new Error(
      "Flutterwave transaction ID mismatch."
    );
  }

  return data;
};

// =====================================================
// VERIFY ACADEMY PAYMENT
// =====================================================

const verifyAcademyPayment = async (req, res) => {
  try {
    const {
      reference,
      transactionId,
    } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: "Payment reference is required.",
      });
    }

    const payment = await Payment.findOne({
      reference,
      user: req.user._id,
      orderType: "CourseEnrollment",
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Academy payment not found.",
      });
    }

    // Already successfully applied.
    if (payment.status === "successful") {
      const enrollment = await CourseEnrollment.findById(
        payment.orderId
      );

      return res.status(200).json({
        success: true,
        message: "Payment already verified.",
        paymentStatus: payment.status,
        enrollmentPaymentStatus:
          enrollment?.paymentStatus,
        enrollmentStatus: enrollment?.status,
        amount: payment.amount,
        reference: payment.reference,
      });
    }

    if (!["pending", "processing"].includes(payment.status)) {
      return res.status(400).json({
        success: false,
        message:
          `Payment cannot be verified from status "${payment.status}".`,
      });
    }

    let transaction;

    if (payment.provider === "paystack") {
      transaction = await verifyPaystackPayment(payment);
    } else if (payment.provider === "flutterwave") {
      transaction = await verifyFlutterwavePayment(
        payment,
        transactionId
      );
    } else {
      return res.status(400).json({
        success: false,
        message:
          "This payment must be confirmed by an administrator.",
      });
    }

    const result = await applySuccessfulPayment(
      payment._id,
      transaction.id || transaction.transaction_id,
      {
        io: getSocketIO(req),
      }
    );

    return res.status(200).json({
      success: true,
      message: result.alreadyApplied
        ? "Payment already applied."
        : "Payment verified successfully.",
      paymentStatus: "successful",
      enrollmentPaymentStatus:
        result.enrollment?.paymentStatus,
      enrollmentStatus: result.enrollment?.status,
      amount: payment.amount,
      reference: payment.reference,
    });
  } catch (error) {
    console.error(
      "Academy payment verification error:",
      error.response?.data || error.message
    );

    return res.status(400).json({
      success: false,
      message:
        error.response?.data?.message ||
        error.message ||
        "Payment verification failed.",
    });
  }
};

// =====================================================
// BANK TRANSFER DETAILS
// =====================================================

const getAcademyBankTransferDetails = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,

      bankDetails: {
        bankName:
          process.env.BANK_TRANSFER_BANK_NAME ||
          process.env.BANK_NAME ||
          "",

        accountName:
          process.env.BANK_TRANSFER_ACCOUNT_NAME ||
          process.env.BANK_ACCOUNT_NAME ||
          "",

        accountNumber:
          process.env.BANK_TRANSFER_ACCOUNT_NUMBER ||
          process.env.BANK_ACCOUNT_NUMBER ||
          "",
      },
    });
  } catch (error) {
    console.error(
      "Academy bank details error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve bank details.",
    });
  }
};

// =====================================================
// INITIALIZE BANK TRANSFER
// =====================================================

const initializeAcademyBankTransfer = async (req, res) => {
  try {
    const {
      enrollmentId,
      paymentOption,
    } = req.body;

    const enrollment = await getEnrollment(
      enrollmentId,
      req.user._id
    );

    validateEnrollmentForPayment(enrollment);

    const paymentDetails = getNextPayment(
      enrollment,
      paymentOption
    );

    await assertNoActivePayment(enrollment._id);

    const payment = await createPayment({
      enrollment,
      userId: req.user._id,
      provider: "bank_transfer",
      paymentDetails,
    });

    return res.status(201).json({
      success: true,
      message:
        "Bank transfer payment created. Complete the transfer and submit your evidence.",

      payment: {
        _id: payment._id,
        reference: payment.reference,
        amount: payment.amount,
        currency: payment.currency,
        paymentPlan: payment.paymentPlan,
        installmentNumber: payment.installmentNumber,
        totalInstallments: payment.totalInstallments,
        status: payment.status,
      },
    });
  } catch (error) {
    console.error(
      "Academy bank transfer initialization error:",
      error.message
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Unable to create bank transfer.",
    });
  }
};


const submitAcademyBankTransferEvidence = async (
  req,
  res
) => {
  try {
    const {
      paymentId,
      transferSenderName,
      receiptUrl,
    } = req.body;

    // -----------------------------------------------
    // VALIDATE PAYMENT ID
    // -----------------------------------------------

    if (!mongoose.isValidObjectId(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID.",
      });
    }

    // -----------------------------------------------
    // FIND STUDENT PAYMENT
    // -----------------------------------------------

    const payment = await Payment.findOne({
      _id: paymentId,
      user: req.user._id,
      orderType: "CourseEnrollment",
      provider: "bank_transfer",
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Bank transfer payment not found.",
      });
    }

    // -----------------------------------------------
    // VALIDATE PAYMENT STATUS
    // -----------------------------------------------

    if (!["pending", "rejected"].includes(payment.status)) {
      return res.status(400).json({
        success: false,
        message:
          "Evidence can only be submitted for pending or rejected payments.",
      });
    }

    // -----------------------------------------------
    // VALIDATE SENDER NAME
    // -----------------------------------------------

    if (
      !transferSenderName ||
      !String(transferSenderName).trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Transfer sender name is required.",
      });
    }

    // -----------------------------------------------
    // VALIDATE RECEIPT URL
    // -----------------------------------------------

    if (
      !receiptUrl ||
      !/^https?:\/\/\S+$/i.test(String(receiptUrl))
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid receipt URL is required.",
      });
    }

    // -----------------------------------------------
    // SAVE PAYMENT EVIDENCE
    // -----------------------------------------------

    payment.transferSenderName =
      String(transferSenderName).trim();

    // Amount comes from the payment record.
    // Students do not manually enter the amount.
    payment.transferAmount = Number(payment.amount);

    payment.receiptUrl = String(receiptUrl).trim();

    payment.evidenceSubmittedAt = new Date();

    payment.status = "awaiting_confirmation";

    // Clear previous rejection details when resubmitting.
    payment.rejectionReason = undefined;
    payment.rejectedBy = undefined;
    payment.rejectedAt = undefined;

    await payment.save();

    // -----------------------------------------------
    // NOTIFY ADMINISTRATORS
    // -----------------------------------------------

    const enrollment = await CourseEnrollment.findById(
      payment.orderId
    );

    await notifyAcademyTransferEvidence({
      payment,
      enrollment,
      io: getSocketIO(req),
    });

    // -----------------------------------------------
    // RESPONSE
    // -----------------------------------------------

    return res.status(200).json({
      success: true,
      message:
        "Bank transfer receipt submitted successfully. Awaiting administrator confirmation.",

      payment: {
        _id: payment._id,
        reference: payment.reference,
        amount: payment.amount,
        status: payment.status,
      },
    });
  } catch (error) {
    console.error(
      "Academy bank transfer evidence error:",
      error.message
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Unable to submit bank transfer evidence.",
    });
  }
};



// =====================================================
// ADMIN CONFIRM BANK TRANSFER
// =====================================================

const confirmAcademyBankTransfer = async (req, res) => {
  try {
    const {
      paymentId,
      verifiedTransactionId,
    } = req.body;

    if (!mongoose.isValidObjectId(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID.",
      });
    }

    if (
      !verifiedTransactionId ||
      !String(verifiedTransactionId).trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Verified transaction ID is required.",
      });
    }

    const payment = await Payment.findOne({
      _id: paymentId,
      orderType: "CourseEnrollment",
      provider: "bank_transfer",
      status: "awaiting_confirmation",
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          "Pending bank transfer payment not found.",
      });
    }

    if (
      toKobo(payment.transferAmount) !==
      toKobo(payment.amount)
    ) {
      return res.status(400).json({
        success: false,
        message: "Submitted transfer amount is invalid.",
      });
    }

    const result = await applySuccessfulPayment(
      payment._id,
      String(verifiedTransactionId).trim(),
      {
        confirmedBy: req.user._id,
        io: getSocketIO(req),
      }
    );

    return res.status(200).json({
      success: true,
      message: result.alreadyApplied
        ? "Bank transfer already confirmed."
        : "Bank transfer confirmed successfully.",

      paymentStatus: "successful",
      enrollmentPaymentStatus:
        result.enrollment?.paymentStatus,
      enrollmentStatus: result.enrollment?.status,
    });
  } catch (error) {
    console.error(
      "Academy bank transfer confirmation error:",
      error.message
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Unable to confirm bank transfer.",
    });
  }
};

// =====================================================
// ADMIN REJECT BANK TRANSFER
// =====================================================

const rejectAcademyBankTransfer = async (req, res) => {
  try {
    const {
      paymentId,
      rejectionReason,
    } = req.body;

    if (!mongoose.isValidObjectId(paymentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment ID.",
      });
    }

    if (
      !rejectionReason ||
      !String(rejectionReason).trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required.",
      });
    }

    const payment = await Payment.findOne({
      _id: paymentId,
      orderType: "CourseEnrollment",
      provider: "bank_transfer",
      status: "awaiting_confirmation",
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          "Pending bank transfer payment not found.",
      });
    }

    payment.status = "rejected";

    payment.rejectionReason =
      String(rejectionReason).trim();

    payment.rejectedBy = req.user._id;
    payment.rejectedAt = new Date();

    await payment.save();

    // Notify the student after rejection is saved.
    const enrollment = await CourseEnrollment.findById(
      payment.orderId
    );

    await notifyAcademyTransferRejected({
      payment,
      enrollment,
      io: getSocketIO(req),
    });

    return res.status(200).json({
      success: true,
      message: "Bank transfer rejected.",
      paymentStatus: payment.status,
    });
  } catch (error) {
    console.error(
      "Academy bank transfer rejection error:",
      error.message
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Unable to reject bank transfer.",
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  initializeAcademyPayment,
  verifyAcademyPayment,

  getAcademyBankTransferDetails,
  initializeAcademyBankTransfer,
  submitAcademyBankTransferEvidence,

  confirmAcademyBankTransfer,
  rejectAcademyBankTransfer,

  // Used by verified payment webhooks.
  applySuccessfulPayment,
};

