
const mongoose = require("mongoose");

const PartyMaterial = require("../models/PartyMaterial");
const PartyBooking = require("../models/PartyBooking");
const PartyBookingInstallmentSettings = require(
  "../models/PartyBookingInstallmentSettings"
);


// =====================================================
// CONFIGURATION
// =====================================================

const materialFields = [
  "name",
  "category",
  "variety",
  "description",
  "image",
  "colors",
  "packages",
  "headwear",
  "stock",
  "active",
];

const ALLOWED_STATUSES = [
  "pending-review",
  "quoted",
  "confirmed",
  "ready",
  "completed",
  "cancelled",
];


// =====================================================
// HELPERS
// =====================================================

function sendError(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
  })
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function isValidDate(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

async function getPartySettings() {
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
    }
  );
}

function calculateMinimumDeposit(quotationAmount, settings) {
  if (settings.minimumDepositType === "fixed") {
    return roundMoney(
      Math.min(settings.minimumDepositValue, quotationAmount)
    );
  }

  return roundMoney(
    quotationAmount * settings.minimumDepositValue / 100
  );
}


// =====================================================
// INVENTORY HELPERS
// =====================================================

// Combine repeated material entries before reserving stock.
// This prevents the same material from being checked against
// its original stock quantity more than once.

function aggregateBookingItems(items) {
  const grouped = new Map();

  for (const item of items) {
    const id = String(item.material);

    if (!grouped.has(id)) {
      grouped.set(id, {
        material: item.material,
        materialName: item.materialName,
        quantity: 0,
        headwearQuantity: 0,
      });
    }

    const entry = grouped.get(id);

    entry.quantity += Number(item.quantity || 0);
    entry.headwearQuantity += Number(item.headwearQuantity || 0);
  }

  return [...grouped.values()];
}


async function reserveBookingStock(booking, session) {
  if (booking.stockDeducted) return;

  const groupedItems = aggregateBookingItems(booking.items);

  for (const item of groupedItems) {
    const filter = {
      _id: item.material,
      active: true,
      stock: { $gte: item.quantity },
    };

    if (item.headwearQuantity > 0) {
      filter["headwear.stock"] = {
        $gte: item.headwearQuantity,
      };
    }

    const update = {
      $inc: {
        stock: -item.quantity,
      },
    };

    if (item.headwearQuantity > 0) {
      update.$inc["headwear.stock"] = -item.headwearQuantity;
    }

    const result = await PartyMaterial.updateOne(
      filter,
      update,
      { session }
    );

    if (result.modifiedCount !== 1) {
      throw Object.assign(
        new Error(
          `Insufficient material or headwear stock for ${item.materialName}.`
        ),
        { statusCode: 409 }
      );
    }
  }

  booking.stockDeducted = true;
  booking.stockReservedAt = new Date();
}


async function restoreBookingStock(booking, session) {
  if (!booking.stockDeducted) return;

  const groupedItems = aggregateBookingItems(booking.items);

  for (const item of groupedItems) {
    const update = {
      $inc: {
        stock: item.quantity,
      },
    };

    if (item.headwearQuantity > 0) {
      update.$inc["headwear.stock"] = item.headwearQuantity;
    }

    const result = await PartyMaterial.updateOne(
      { _id: item.material },
      update,
      { session }
    );

    if (result.matchedCount !== 1) {
      throw Object.assign(
        new Error(
          `Could not restore inventory for ${item.materialName}.`
        ),
        { statusCode: 409 }
      );
    }
  }

  booking.stockDeducted = false;
  booking.stockReservedAt = null;
}


// =====================================================
// MATERIAL MANAGEMENT
// =====================================================

async function listMaterials(req, res) {
  try {
    const filter =
      req.user?.role === "admin" && req.query.all === "true"
        ? {}
        : { active: true }

    const materials = await PartyMaterial.find(filter)
      .sort({ category: 1, name: 1 })
      .lean();

    return res.json({
      success: true,
      materials,
    });
  } catch (error) {
    console.error("List party materials failed:", error);

    return sendError(
      res,
      500,
      "Could not load party materials."
    );
  }
};



async function createMaterial(req, res) {
  try {
    const payload = {};

    for (const key of materialFields) {
      if (req.body[key] !== undefined) {
        payload[key] = req.body[key];
      }
    }

    const material = await PartyMaterial.create(payload);

    return res.status(201).json({
      success: true,
      material,
    });
  } catch (error) {
    return sendError(
      res,
      400,
      error.message || "Invalid material details."
    );
  }
}


async function updateMaterial(req, res) {
  try {
    const payload = {};

    for (const key of materialFields) {
      if (req.body[key] !== undefined) {
        payload[key] = req.body[key];
      }
    }

    const material = await PartyMaterial.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!material) {
      return sendError(res, 404, "Material not found.");
    }

    return res.json({
      success: true,
      material,
    });
  } catch (error) {
    return sendError(
      res,
      400,
      error.message || "Could not update material."
    );
  }
}


async function deleteMaterial(req, res) {
  try {
    const material = await PartyMaterial.findByIdAndUpdate(
      req.params.id,
      { $set: { active: false } },
      { new: true }
    );

    if (!material) {
      return sendError(res, 404, "Material not found.");
    }

    return res.json({
      success: true,
      message: "Material deactivated.",
      material,
    });
  } catch (error) {
    return sendError(
      res,
      500,
      "Could not deactivate material."
    );
  }
}


// =====================================================
// CREATE BOOKING
// =====================================================

async function createBooking(req, res) {
  try {
    const {
      items,
      eventDate,
      eventType,
      partySize,
      contactName,
      phone,
      deliveryMethod,
      deliveryAddress,
      customerNotes,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return sendError(
        res,
        400,
        "Select at least one material package."
      );
    }

    if (
      !eventDate ||
      !isValidDate(eventDate) ||
      new Date(eventDate) < startOfToday()
    ) {
      return sendError(
        res,
        400,
        "Choose a valid future event date."
      );
    }

    if (
      !String(eventType || "").trim() ||
      !String(contactName || "").trim() ||
      !String(phone || "").trim()
    ) {
      return sendError(
        res,
        400,
        "Event type, contact name, and phone are required."
      );
    }

    if (
      !Number.isInteger(Number(partySize)) ||
      Number(partySize) < 1
    ) {
      return sendError(
        res,
        400,
        "Party size must be at least one."
      );
    }

    if (!["collection", "delivery"].includes(deliveryMethod)) {
      return sendError(
        res,
        400,
        "Choose collection or delivery."
      );
    }

    if (
      deliveryMethod === "delivery" &&
      !String(deliveryAddress || "").trim()
    ) {
      return sendError(
        res,
        400,
        "Enter the delivery address."
      );
    }

    const snapshots = [];

    for (const item of items) {
      if (
        !mongoose.isValidObjectId(item.material) ||
        !mongoose.isValidObjectId(item.packageId)
      ) {
        return sendError(
          res,
          400,
          "A selected material or package is invalid."
        );
      }

      const quantity = Number(item.quantity);
      const headwearQuantity = Number(item.headwearQuantity || 0);

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        !Number.isInteger(headwearQuantity) ||
        headwearQuantity < 0
      ) {
        return sendError(
          res,
          400,
          "Package quantities must be valid whole numbers."
        );
      }

      const material = await PartyMaterial.findOne({
        _id: item.material,
        active: true,
      });

      if (!material) {
        return sendError(
          res,
          409,
          "A selected material is no longer available."
        );
      }

      const pack = material.packages.id(item.packageId);

      if (!pack) {
        return sendError(
          res,
          400,
          `Package not found for ${material.name}.`
        );
      }

      const headwearType = item.headwearType || "none";

      if (!["none", "cap", "gele"].includes(headwearType)) {
        return sendError(
          res,
          400,
          "Invalid cap/gele selection."
        );
      }

      if (headwearQuantity > 0) {
        if (
          headwearType === "none" ||
          !material.headwear?.available ||
          !["cap-or-gele", headwearType].includes(
            material.headwear.type
          )
        ) {
          return sendError(
            res,
            400,
            `The selected headwear is not available for ${material.name}.`
          );
        }
      } else if (headwearType !== "none") {
        return sendError(
          res,
          400,
          "Select a headwear quantity for the chosen headwear type."
        );
      }

      snapshots.push({
        material: material._id,
        materialName: material.name,
        category: material.category,
        variety: material.variety,
        packageId: pack._id,
        packageName: pack.name,
        yards: pack.yards,
        quantity,
        unitPrice: pack.price,
        headwearType,
        headwearQuantity,
        headwearUnitPrice:
          headwearQuantity > 0
            ? Number(material.headwear.price || 0)
            : 0,
      });
    }

    const booking = await PartyBooking.create({
      customer: req.user._id,
      items: snapshots,
      eventDate: new Date(eventDate),
      eventType: String(eventType).trim(),
      partySize: Number(partySize),
      contactName: String(contactName).trim(),
      phone: String(phone).trim(),
      deliveryMethod,
      deliveryAddress: String(deliveryAddress || "").trim(),
      customerNotes: String(customerNotes || "").trim(),
      status: "pending-review",
    });

    return res.status(201).json({
      success: true,
      booking,
      message:
        "Booking request submitted for ABS CUT to review. No stock has been deducted.",
    });
  } catch (error) {
    console.error("Create party booking failed:", error);

    return sendError(
      res,
      500,
      "Could not submit the booking request."
    );
  }
}


// =====================================================
// CUSTOMER BOOKING LIST
// =====================================================

async function listMyBookings(req, res) {
  try {
    const bookings = await PartyBooking.find({
      customer: req.user._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      bookings,
    });
  } catch (error) {
    console.error("List my party bookings failed:", error);

    return sendError(
      res,
      500,
      "Could not load your bookings."
    );
  }
}


// =====================================================
// ADMIN BOOKING LIST
// =====================================================

async function listAllBookings(req, res) {
  try {
    const bookings = await PartyBooking.find()
      .populate("customer", "name email phone")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      bookings,
    });
  } catch (error) {
    console.error("List all party bookings failed:", error);

    return sendError(
      res,
      500,
      "Could not load party bookings."
    );
  }
}


// =====================================================
// CUSTOMER ACCEPTS QUOTATION
// =====================================================

async function acceptQuotation(req, res) {
  try {
    const booking = await PartyBooking.findOne({
      _id: req.params.id,
      customer: req.user._id,
    });

    if (!booking) {
      return sendError(res, 404, "Booking not found.");
    }

    if (booking.status === "cancelled") {
      return sendError(
        res,
        409,
        "This booking has been cancelled."
      );
    }

    if (
      booking.status !== "quoted" ||
      booking.quotationAmount === null ||
      booking.quotationAmount <= 0
    ) {
      return sendError(
        res,
        409,
        "There is no valid quotation available to accept."
      );
    }

    if (
      !booking.fulfilmentDate ||
      !booking.paymentDeadline
    ) {
      return sendError(
        res,
        409,
        "The administrator must set the collection or delivery date and payment deadline first."
      );
    }

    if (
      booking.paymentDeadline > booking.fulfilmentDate ||
      booking.paymentDeadline <= new Date()
    ) {
      return sendError(
        res,
        409,
        "The booking payment deadline is invalid or has passed."
      );
    }

    if (booking.quotationAcceptedAt) {
      return res.json({
        success: true,
        booking,
        message: "You have already accepted this quotation.",
      });
    }

    booking.quotationAcceptedAt = new Date();

    await booking.save();

    return res.json({
      success: true,
      booking,
      message:
        "Quotation accepted. You can now submit your installment schedule.",
    });
  } catch (error) {
    console.error("Accept party quotation failed:", error);

    return sendError(
      res,
      500,
      "Could not accept the quotation."
    );
  }
}


// =====================================================
// CUSTOMER SUBMITS INSTALLMENT SCHEDULE
// =====================================================

// async function submitInstallmentSchedule(req, res) {
//   try {
//     const booking = await PartyBooking.findOne({
//       _id: req.params.id,
//       customer: req.user._id,
//     });

//     if (!booking) {
//       return sendError(res, 404, "Booking not found.");
//     }

//     if (
//       booking.status === "cancelled" ||
//       booking.status === "completed"
//     ) {
//       return sendError(
//         res,
//         409,
//         "This booking cannot accept a new payment schedule."
//       );
//     }

//     if (!booking.quotationAcceptedAt) {
//       return sendError(
//         res,
//         409,
//         "Accept the quotation before submitting an installment schedule."
//       );
//     }

//     if (
//       booking.paymentStatus === "paid" ||
//       booking.amountPaid >= booking.quotationAmount
//     ) {
//       return sendError(
//         res,
//         409,
//         "This booking has already been fully paid."
//       );
//     }

//     const settings = await getPartySettings();

//     if (!settings.enabled) {
//       return sendError(
//         res,
//         403,
//         "Party-booking installments are currently disabled."
//       );
//     }

//     if (!settings.customerChoosesPaymentDates) {
//       return sendError(
//         res,
//         403,
//         "Customer-selected payment dates are currently disabled."
//       );
//     }

//     const { installments } = req.body;

//     if (
//       !Array.isArray(installments) ||
//       installments.length < 1 ||
//       installments.length > settings.maxInstallments
//     ) {
//       return sendError(
//         res,
//         400,
//         `Submit between 1 and ${settings.maxInstallments} installments.`
//       );
//     }

//     if (
//       !booking.paymentDeadline ||
//       !booking.fulfilmentDate ||
//       booking.paymentDeadline > booking.fulfilmentDate
//     ) {
//       return sendError(
//         res,
//         409,
//         "The booking payment deadline has not been configured correctly."
//       );
//     }

//     const remainingBalance = roundMoney(
//       booking.quotationAmount - booking.amountPaid
//     );

//     const normalized = [];
//     let total = 0;
//     let previousDate = null;

//     for (const entry of installments) {
//       const amount = Number(entry.amount);
//       const dueDate = new Date(entry.dueDate);

//       if (
//         !Number.isFinite(amount) ||
//         amount <= 0 ||
//         !isValidDate(entry.dueDate)
//       ) {
//         return sendError(
//           res,
//           400,
//           "Every installment must have a valid amount and due date."
//         );
//       }

//       if (dueDate < startOfToday()) {
//         return sendError(
//           res,
//           400,
//           "Installment dates cannot be in the past."
//         );
//       }

//       if (dueDate > booking.paymentDeadline) {
//         return sendError(
//           res,
//           400,
//           "Every installment must be due on or before the payment deadline."
//         );
//       }

//       if (previousDate && dueDate <= previousDate) {
//         return sendError(
//           res,
//           400,
//           "Installment dates must be in chronological order."
//         );
//       }

//       previousDate = dueDate;
//       total += amount;

//       normalized.push({
//         amount: roundMoney(amount),
//         dueDate,
//         status: "scheduled",
//       });
//     }

//     total = roundMoney(total);

//     if (total !== remainingBalance) {
//       return sendError(
//         res,
//         400,
//         `Installment amounts must total the outstanding balance of ₦${remainingBalance.toLocaleString("en-NG")}.`
//       );
//     }

//     const minimumDeposit = calculateMinimumDeposit(
//       booking.quotationAmount,
//       settings
//     );

//     const firstInstallment = normalized[0].amount;

//     if (
//       booking.amountPaid === 0 &&
//       firstInstallment < minimumDeposit
//     ) {
//       return sendError(
//         res,
//         400,
//         `Your first installment must be at least ₦${minimumDeposit.toLocaleString("en-NG")}.`
//       );
//     }

//     booking.installmentSchedule = normalized;
//     booking.scheduleStatus = "pending-review";

//     await booking.save();

//     return res.json({
//       success: true,
//       booking,
//       message:
//         "Your installment schedule has been submitted for administrator review.",
//     });
//   } catch (error) {
//     console.error("Submit installment schedule failed:", error);

//     return sendError(
//       res,
//       500,
//       "Could not submit your installment schedule."
//     );
//   }
// }

async function submitInstallmentSchedule(req, res) {
  try {
    const booking = await PartyBooking.findOne({
      _id: req.params.id,
      customer: req.user._id,
    });

    if (!booking) {
      return sendError(res, 404, "Booking not found.");
    }

    // Only quoted bookings with an accepted quotation
    // can receive a new installment schedule.
    if (
      booking.status !== "quoted" ||
      booking.status === "cancelled" ||
      booking.status === "completed"
    ) {
      return sendError(
        res,
        409,
        "This booking cannot accept a new installment schedule in its current status."
      );
    }

    if (!booking.quotationAcceptedAt) {
      return sendError(
        res,
        409,
        "Accept the quotation before submitting an installment schedule."
      );
    }

    // Do not overwrite schedules awaiting review or already approved.
    if (
      !["not-submitted", "rejected"].includes(
        booking.scheduleStatus
      )
    ) {
      return sendError(
        res,
        409,
        "Your current installment schedule must be rejected before submitting another one."
      );
    }

    if (
      booking.paymentStatus === "paid" ||
      booking.amountPaid >= booking.quotationAmount
    ) {
      return sendError(
        res,
        409,
        "This booking has already been fully paid."
      );
    }

    const settings = await getPartySettings();

    if (!settings.enabled) {
      return sendError(
        res,
        403,
        "Party-booking installments are currently disabled."
      );
    }

    if (!settings.customerChoosesPaymentDates) {
      return sendError(
        res,
        403,
        "Customer-selected payment dates are currently disabled."
      );
    }

    if (
      !booking.paymentDeadline ||
      !isValidDate(booking.paymentDeadline) ||
      !booking.fulfilmentDate ||
      !isValidDate(booking.fulfilmentDate)
    ) {
      return sendError(
        res,
        409,
        "The booking payment deadline or fulfilment date is invalid."
      );
    }

    const paymentDeadline = new Date(
      booking.paymentDeadline
    );

    const fulfilmentDate = new Date(
      booking.fulfilmentDate
    );

    if (
      paymentDeadline > fulfilmentDate ||
      paymentDeadline <= new Date()
    ) {
      return sendError(
        res,
        409,
        "The booking payment deadline is invalid or has passed."
      );
    }

    const { installments } = req.body;

    if (
      !Array.isArray(installments) ||
      installments.length < 1 ||
      installments.length > settings.maxInstallments
    ) {
      return sendError(
        res,
        400,
        `Submit between 1 and ${settings.maxInstallments} installments.`
      );
    }

    const quotationAmount = Number(
      booking.quotationAmount
    );

    const amountPaid = Number(
      booking.amountPaid || 0
    );

    if (
      !Number.isFinite(quotationAmount) ||
      quotationAmount <= 0 ||
      !Number.isFinite(amountPaid) ||
      amountPaid < 0 ||
      amountPaid >= quotationAmount
    ) {
      return sendError(
        res,
        409,
        "The booking quotation or outstanding balance is invalid."
      );
    }

    const remainingBalance = roundMoney(
      quotationAmount - amountPaid
    );

    const normalized = [];
    let total = 0;
    let previousDate = null;

    for (const entry of installments) {
      const amount = Number(entry.amount);

      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !isValidDate(entry.dueDate)
      ) {
        return sendError(
          res,
          400,
          "Every installment must have a valid amount and due date."
        );
      }

      const roundedAmount = roundMoney(amount);
      const dueDate = new Date(entry.dueDate);

      if (dueDate < startOfToday()) {
        return sendError(
          res,
          400,
          "Installment dates cannot be in the past."
        );
      }

      if (dueDate > paymentDeadline) {
        return sendError(
          res,
          400,
          "Every installment must be due on or before the payment deadline."
        );
      }

      if (previousDate && dueDate <= previousDate) {
        return sendError(
          res,
          400,
          "Installment dates must be in chronological order."
        );
      }

      previousDate = dueDate;

      // Sum the exact rounded amounts being saved.
      total += roundedAmount;

      normalized.push({
        amount: roundedAmount,
        dueDate,
        status: "scheduled",
      });
    }

    total = roundMoney(total);

    if (total !== remainingBalance) {
      return sendError(
        res,
        400,
        `Installment amounts must total the outstanding balance of ₦${remainingBalance.toLocaleString("en-NG")}.`
      );
    }

    const minimumDeposit = calculateMinimumDeposit(
      quotationAmount,
      settings
    );

    const firstInstallment = normalized[0].amount;

    if (
      amountPaid === 0 &&
      firstInstallment < minimumDeposit
    ) {
      return sendError(
        res,
        400,
        `Your first installment must be at least ₦${minimumDeposit.toLocaleString("en-NG")}.`
      );
    }

    booking.installmentSchedule = normalized;
    booking.scheduleStatus = "pending-review";

    await booking.save();

    return res.json({
      success: true,
      booking,
      message:
        "Your installment schedule has been submitted for administrator review.",
    });
  } catch (error) {
    console.error(
      "Submit installment schedule failed:",
      error
    );

    return sendError(
      res,
      500,
      "Could not submit your installment schedule."
    );
  }
}



// =====================================================
// ADMIN APPROVES OR REJECTS INSTALLMENT SCHEDULE
// =====================================================

// async function reviewInstallmentSchedule(req, res) {
//   const session = await mongoose.startSession();

//   try {
//     const { decision, adminNotes } = req.body;

//     if (!["approve", "reject"].includes(decision)) {
//       return sendError(
//         res,
//         400,
//         "Choose approve or reject."
//       );
//     }

//     let updated;

//     await session.withTransaction(async () => {
//       const booking = await PartyBooking.findById(
//         req.params.id
//       ).session(session);

//       if (!booking) {
//         throw Object.assign(
//           new Error("Booking not found."),
//           { statusCode: 404 }
//         );
//       }

//       if (booking.status === "cancelled") {
//         throw Object.assign(
//           new Error("This booking has been cancelled."),
//           { statusCode: 409 }
//         );
//       }

//       if (!booking.quotationAcceptedAt) {
//         throw Object.assign(
//           new Error("The customer has not accepted the quotation."),
//           { statusCode: 409 }
//         );
//       }

//       if (booking.scheduleStatus !== "pending-review") {
//         throw Object.assign(
//           new Error("There is no installment schedule awaiting review."),
//           { statusCode: 409 }
//         );
//       }

//       if (decision === "reject") {
//         booking.scheduleStatus = "rejected";

//         if (adminNotes !== undefined) {
//           booking.adminNotes = String(adminNotes).trim();
//         }

//         await booking.save({ session });

//         updated = booking;
//         return;
//       }

//       if (
//         !booking.installmentSchedule.length ||
//         !booking.paymentDeadline ||
//         !booking.fulfilmentDate ||
//         booking.paymentDeadline > booking.fulfilmentDate
//       ) {
//         throw Object.assign(
//           new Error("The booking schedule or payment deadline is invalid."),
//           { statusCode: 409 }
//         );
//       }

//       const total = roundMoney(
//         booking.installmentSchedule.reduce(
//           (sum, installment) => sum + installment.amount,
//           0
//         )
//       );

//       const remainingBalance = roundMoney(
//         booking.quotationAmount - booking.amountPaid
//       );

//       if (total !== remainingBalance) {
//         throw Object.assign(
//           new Error("The installment schedule no longer matches the outstanding balance."),
//           { statusCode: 409 }
//         );
//       }

//       for (const installment of booking.installmentSchedule) {
//         if (
//           installment.dueDate > booking.paymentDeadline ||
//           installment.dueDate < startOfToday()
//         ) {
//           throw Object.assign(
//             new Error("An installment date is outside the permitted payment period."),
//             { statusCode: 409 }
//           );
//         }
//       }

//       // Reserve inventory only after customer acceptance
//       // and administrator approval.

//       await reserveBookingStock(booking, session);

//       booking.scheduleStatus = "approved";
//       booking.status = "confirmed";

//       if (adminNotes !== undefined) {
//         booking.adminNotes = String(adminNotes).trim();
//       }

//       await booking.save({ session });

//       updated = booking;
//     });

//     return res.json({
//       success: true,
//       booking: updated,
//       message:
//         decision === "approve"
//           ? "Installment schedule approved and inventory reserved."
//           : "Installment schedule rejected.",
//     });
//   } catch (error) {
//     console.error("Review installment schedule failed:", error);

//     return sendError(
//       res,
//       error.statusCode || 500,
//       error.message || "Could not review installment schedule."
//     );
//   } finally {
//     await session.endSession();
//   }
// }


async function reviewInstallmentSchedule(req, res) {
  // Validate the booking ID before starting a database transaction.
  if (!mongoose.isValidObjectId(req.params.id)) {
    return sendError(res, 400, "Invalid booking ID.");
  }

  const { decision, adminNotes } = req.body;

  if (!["approve", "reject"].includes(decision)) {
    return sendError(res, 400, "Choose approve or reject.");
  }

  const session = await mongoose.startSession();

  try {
    // Load the configured deposit and installment limits.
    const settings =
      decision === "approve"
        ? await getPartySettings()
        : null;

    let updated;

    await session.withTransaction(async () => {
      const booking = await PartyBooking.findById(
        req.params.id
      ).session(session);

      if (!booking) {
        throw Object.assign(
          new Error("Booking not found."),
          { statusCode: 404 }
        );
      }

      if (
        booking.status === "cancelled" ||
        booking.status === "completed"
      ) {
        throw Object.assign(
          new Error("This booking cannot be reviewed in its current status."),
          { statusCode: 409 }
        );
      }

      if (!booking.quotationAcceptedAt) {
        throw Object.assign(
          new Error("The customer has not accepted the quotation."),
          { statusCode: 409 }
        );
      }

      if (
        booking.scheduleStatus !== "pending-review"
      ) {
        throw Object.assign(
          new Error(
            "There is no installment schedule awaiting review."
          ),
          { statusCode: 409 }
        );
      }

      // =============================================
      // REJECT SCHEDULE
      // =============================================

      if (decision === "reject") {
        booking.scheduleStatus = "rejected";

        if (adminNotes !== undefined) {
          booking.adminNotes = String(adminNotes).trim();
        }

        await booking.save({ session });

        updated = booking;
        return;
      }

      // =============================================
      // APPROVAL VALIDATION
      // =============================================

      const quotationAmount = Number(
        booking.quotationAmount
      );

      const amountPaid = Number(
        booking.amountPaid || 0
      );

      if (
        !Number.isFinite(quotationAmount) ||
        quotationAmount <= 0 ||
        !Number.isFinite(amountPaid) ||
        amountPaid < 0 ||
        amountPaid > quotationAmount
      ) {
        throw Object.assign(
          new Error("The booking quotation or payment balance is invalid."),
          { statusCode: 409 }
        );
      }

      if (
        booking.paymentStatus === "paid" ||
        roundMoney(amountPaid) >= roundMoney(quotationAmount)
      ) {
        throw Object.assign(
          new Error("This booking has already been fully paid."),
          { statusCode: 409 }
        );
      }

      if (
        !booking.paymentDeadline ||
        !isValidDate(booking.paymentDeadline) ||
        !booking.fulfilmentDate ||
        !isValidDate(booking.fulfilmentDate)
      ) {
        throw Object.assign(
          new Error(
            "The booking payment deadline or fulfilment date is invalid."
          ),
          { statusCode: 409 }
        );
      }

      const paymentDeadline = new Date(
        booking.paymentDeadline
      );

      const fulfilmentDate = new Date(
        booking.fulfilmentDate
      );

      if (
        paymentDeadline > fulfilmentDate ||
        paymentDeadline <= new Date()
      ) {
        throw Object.assign(
          new Error(
            "The payment deadline is invalid or has already passed."
          ),
          { statusCode: 409 }
        );
      }

      const installments = booking.installmentSchedule;

      if (
        !Array.isArray(installments) ||
        installments.length < 1 ||
        !Number.isInteger(settings.maxInstallments) ||
        settings.maxInstallments < 1 ||
        installments.length > settings.maxInstallments
      ) {
        throw Object.assign(
          new Error(
            `The schedule must contain between 1 and ${settings.maxInstallments} installments.`
          ),
          { statusCode: 409 }
        );
      }

      // =============================================
      // VALIDATE EACH INSTALLMENT
      // =============================================

      let total = 0;
      let previousDate = null;

      for (const installment of installments) {
        const amount = Number(installment.amount);

        if (
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          throw Object.assign(
            new Error(
              "Every installment must have a valid amount greater than zero."
            ),
            { statusCode: 409 }
          );
        }

        if (
          !installment.dueDate ||
          !isValidDate(installment.dueDate)
        ) {
          throw Object.assign(
            new Error(
              "Every installment must have a valid due date."
            ),
            { statusCode: 409 }
          );
        }

        if (installment.status !== "scheduled") {
          throw Object.assign(
            new Error(
              "An installment has an invalid status and cannot be approved."
            ),
            { statusCode: 409 }
          );
        }

        const dueDate = new Date(
          installment.dueDate
        );

        if (dueDate < startOfToday()) {
          throw Object.assign(
            new Error(
              "Installment dates cannot be in the past."
            ),
            { statusCode: 409 }
          );
        }

        if (dueDate > paymentDeadline) {
          throw Object.assign(
            new Error(
              "Every installment must be due on or before the payment deadline."
            ),
            { statusCode: 409 }
          );
        }

        if (
          previousDate &&
          dueDate <= previousDate
        ) {
          throw Object.assign(
            new Error(
              "Installment dates must be in chronological order."
            ),
            { statusCode: 409 }
          );
        }

        previousDate = dueDate;
        total += amount;
      }

      // =============================================
      // VALIDATE OUTSTANDING BALANCE
      // =============================================

      total = roundMoney(total);

      const remainingBalance = roundMoney(
        quotationAmount - amountPaid
      );

      if (total !== remainingBalance) {
        throw Object.assign(
          new Error(
            "The installment amounts no longer match the outstanding booking balance."
          ),
          { statusCode: 409 }
        );
      }

      // =============================================
      // VALIDATE MINIMUM DEPOSIT
      // =============================================

      const minimumDeposit = calculateMinimumDeposit(
        quotationAmount,
        settings
      );

      const firstInstallment = roundMoney(
        installments[0].amount
      );

      if (
        amountPaid === 0 &&
        firstInstallment < minimumDeposit
      ) {
        throw Object.assign(
          new Error(
            `The first installment must be at least ₦${minimumDeposit.toLocaleString("en-NG")}.`
          ),
          { statusCode: 409 }
        );
      }

      // =============================================
      // RESERVE PARTY MATERIAL INVENTORY
      // =============================================

      // Inventory is reserved only after:
      // 1. Customer quotation acceptance.
      // 2. Valid installment schedule submission.
      // 3. Successful administrator approval.
      //
      // The helper aggregates repeated material entries
      // and performs conditional stock updates.

      await reserveBookingStock(booking, session);

      booking.scheduleStatus = "approved";
      booking.status = "confirmed";

      if (adminNotes !== undefined) {
        booking.adminNotes = String(adminNotes).trim();
      }

      await booking.save({ session });

      updated = booking;
    });

    return res.json({
      success: true,
      booking: updated,
      message:
        decision === "approve"
          ? "Installment schedule approved and inventory reserved."
          : "Installment schedule rejected.",
    });
  } catch (error) {
    console.error(
      "Review installment schedule failed:",
      error
    );

    return sendError(
      res,
      error.statusCode || 500,
      error.message ||
        "Could not review installment schedule."
    );
  } finally {
    await session.endSession();
  }
}

// =====================================================
// ADMIN UPDATES BOOKING / QUOTATION
// =====================================================

async function updateBooking(req, res) {
  const session = await mongoose.startSession();

  try {
    const {
      status,
      quotationAmount,
      fulfilmentDate,
      paymentDeadline,
      adminNotes,
    } = req.body;

    if (
      status !== undefined &&
      !ALLOWED_STATUSES.includes(status)
    ) {
      return sendError(
        res,
        400,
        "Invalid booking status."
      );
    }

    // Confirmation must go through quotation acceptance
    // and schedule approval, not this general update route.

    if (status === "confirmed") {
      return sendError(
        res,
        409,
        "Bookings must be confirmed through installment schedule approval."
      );
    }

    if (
      quotationAmount !== undefined &&
      (
        !Number.isFinite(Number(quotationAmount)) ||
        Number(quotationAmount) <= 0
      )
    ) {
      return sendError(
        res,
        400,
        "Quotation must be greater than zero."
      );
    }

    if (
      fulfilmentDate !== undefined &&
      !isValidDate(fulfilmentDate)
    ) {
      return sendError(
        res,
        400,
        "Invalid collection or delivery date."
      );
    }

    if (
      paymentDeadline !== undefined &&
      !isValidDate(paymentDeadline)
    ) {
      return sendError(
        res,
        400,
        "Invalid payment deadline."
      );
    }

    let updated;

    await session.withTransaction(async () => {
      const booking = await PartyBooking.findById(
        req.params.id
      ).session(session);

      if (!booking) {
        throw Object.assign(
          new Error("Booking not found."),
          { statusCode: 404 }
        );
      }

      if (booking.status === "completed") {
        throw Object.assign(
          new Error("Completed bookings cannot be modified."),
          { statusCode: 409 }
        );
      }

      if (booking.status === "cancelled" && status !== undefined && status !== "cancelled") {
        throw Object.assign(
          new Error("Cancelled bookings cannot be reopened through this endpoint."),
          { statusCode: 409 }
        );
      }

      if (quotationAmount !== undefined) {
        const nextAmount = roundMoney(quotationAmount);

        if (booking.quotationAcceptedAt && nextAmount !== booking.quotationAmount) {
          throw Object.assign(
            new Error("An accepted quotation cannot be changed. Contact the customer and create a new booking if the price must change."),
            { statusCode: 409 }
          );
        }

        if (nextAmount < booking.amountPaid) {
          throw Object.assign(
            new Error("Quotation cannot be lower than the amount already paid."),
            { statusCode: 409 }
          );
        }

        booking.quotationAmount = nextAmount;
        booking.status = "quoted";
      }

      if (fulfilmentDate !== undefined) {
        booking.fulfilmentDate = new Date(fulfilmentDate);
      }

      if (paymentDeadline !== undefined) {
        booking.paymentDeadline = new Date(paymentDeadline);
      }

      if (
        booking.fulfilmentDate &&
        booking.paymentDeadline &&
        booking.paymentDeadline > booking.fulfilmentDate
      ) {
        throw Object.assign(
          new Error("Payment deadline must be on or before the collection or delivery date."),
          { statusCode: 400 }
        );
      }

      if (
        booking.quotationAcceptedAt &&
        booking.paymentDeadline &&
        booking.paymentDeadline <= new Date()
      ) {
        throw Object.assign(
          new Error("The payment deadline cannot be changed to a past date after quotation acceptance."),
          { statusCode: 400 }
        );
      }

      if (status !== undefined) {
        if (status === "cancelled") {
          await restoreBookingStock(booking, session);

          booking.installmentSchedule.forEach((installment) => {
            if (installment.status !== "paid") {
              installment.status = "cancelled";
            }
          });
        } else if (
          ["ready", "completed"].includes(status) &&
          booking.paymentStatus !== "paid"
        ) {
          throw Object.assign(
            new Error("The booking must be fully paid before it can be marked ready or completed."),
            { statusCode: 409 }
          );
        } else if (
          ["ready", "completed"].includes(status) &&
          !booking.stockDeducted
        ) {
          throw Object.assign(
            new Error("Inventory has not been reserved for this booking."),
            { statusCode: 409 }
          );
        }

        booking.status = status;
      }

      if (adminNotes !== undefined) {
        booking.adminNotes = String(adminNotes).trim();
      }

      await booking.save({ session });

      updated = booking;
    });

    return res.json({
      success: true,
      booking: updated,
      message: "Booking updated successfully.",
    });
  } catch (error) {
    console.error("Update party booking failed:", error);

    return sendError(
      res,
      error.statusCode || 500,
      error.message || "Could not update booking."
    );
  } finally {
    await session.endSession();
  }
}


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  listMaterials,
  createMaterial,
  updateMaterial,
  deleteMaterial,

  createBooking,
  listMyBookings,
  listAllBookings,
  updateBooking,

  acceptQuotation,
  submitInstallmentSchedule,
  reviewInstallmentSchedule,
};











// const mongoose = require("mongoose");
// const PartyMaterial = require("../models/PartyMaterial");
// const PartyBooking = require("../models/PartyBooking");

// const materialFields = [
//   "name",
//   "category",
//   "variety",
//   "description",
//   "image",
//   "colors",
//   "packages",
//   "headwear",
//   "stock",
//   "active",
// ];

// async function listMaterials(req, res) {
//   try {
//     const filter =
//       req.user?.role === "admin" && req.query.all === "true"
//         ? {}
//         : { active: true };
//     const materials = await PartyMaterial.find(filter)
//       .sort({ category: 1, name: 1 })
//       .lean();
//     return res.json({ success: true, materials });
//   } catch (error) {
//     console.error("List party materials failed:", error);
//     return res
//       .status(500)
//       .json({ success: false, message: "Could not load party materials." });
//   }
// }

// async function createMaterial(req, res) {
//   try {
//     const payload = {};
//     for (const key of materialFields)
//       if (req.body[key] !== undefined) payload[key] = req.body[key];
//     const material = await PartyMaterial.create(payload);
//     return res.status(201).json({ success: true, material });
//   } catch (error) {
//     return res
//       .status(400)
//       .json({
//         success: false,
//         message: error.message || "Invalid material details.",
//       });
//   }
// }

// async function updateMaterial(req, res) {
//   try {
//     const payload = {};
//     for (const key of materialFields)
//       if (req.body[key] !== undefined) payload[key] = req.body[key];
//     const material = await PartyMaterial.findByIdAndUpdate(
//       req.params.id,
//       { $set: payload },
//       { new: true, runValidators: true },
//     );
//     if (!material)
//       return res
//         .status(404)
//         .json({ success: false, message: "Material not found." });
//     return res.json({ success: true, material });
//   } catch (error) {
//     return res
//       .status(400)
//       .json({
//         success: false,
//         message: error.message || "Could not update material.",
//       });
//   }
// }

// async function deleteMaterial(req, res) {
//   try {
//     const material = await PartyMaterial.findByIdAndUpdate(
//       req.params.id,
//       { $set: { active: false } },
//       { new: true },
//     );
//     if (!material)
//       return res
//         .status(404)
//         .json({ success: false, message: "Material not found." });
//     return res.json({
//       success: true,
//       message: "Material deactivated.",
//       material,
//     });
//   } catch (error) {
//     return res
//       .status(500)
//       .json({ success: false, message: "Could not deactivate material." });
//   }
// }

// async function createBooking(req, res) {
//   try {
//     const {
//       items,
//       eventDate,
//       eventType,
//       partySize,
//       contactName,
//       phone,
//       deliveryMethod,
//       deliveryAddress,
//       customerNotes,
//     } = req.body;
//     if (!Array.isArray(items) || items.length === 0)
//       return res
//         .status(400)
//         .json({
//           success: false,
//           message: "Select at least one material package.",
//         });
//     const date = new Date(eventDate);
//     if (
//       !eventDate ||
//       Number.isNaN(date.getTime()) ||
//       date < new Date(new Date().setHours(0, 0, 0, 0))
//     )
//       return res
//         .status(400)
//         .json({ success: false, message: "Choose a valid future event date." });
//     if (
//       !String(eventType || "").trim() ||
//       !String(contactName || "").trim() ||
//       !String(phone || "").trim()
//     )
//       return res
//         .status(400)
//         .json({
//           success: false,
//           message: "Event type, contact name, and phone are required.",
//         });
//     if (!Number.isInteger(Number(partySize)) || Number(partySize) < 1)
//       return res
//         .status(400)
//         .json({ success: false, message: "Party size must be at least one." });
//     if (!["collection", "delivery"].includes(deliveryMethod))
//       return res
//         .status(400)
//         .json({ success: false, message: "Choose collection or delivery." });
//     if (deliveryMethod === "delivery" && !String(deliveryAddress || "").trim())
//       return res
//         .status(400)
//         .json({ success: false, message: "Enter the delivery address." });

//     const snapshots = [];
//     for (const item of items) {
//       if (
//         !mongoose.isValidObjectId(item.material) ||
//         !mongoose.isValidObjectId(item.packageId)
//       )
//         return res
//           .status(400)
//           .json({
//             success: false,
//             message: "A selected material or package is invalid.",
//           });
//       const quantity = Number(item.quantity);
//       const headwearQuantity = Number(item.headwearQuantity || 0);
//       if (
//         !Number.isInteger(quantity) ||
//         quantity < 1 ||
//         !Number.isInteger(headwearQuantity) ||
//         headwearQuantity < 0
//       )
//         return res
//           .status(400)
//           .json({
//             success: false,
//             message: "Package quantities must be valid whole numbers.",
//           });
//       const material = await PartyMaterial.findOne({
//         _id: item.material,
//         active: true,
//       });
//       if (!material)
//         return res
//           .status(409)
//           .json({
//             success: false,
//             message: "A selected material is no longer available.",
//           });
//       const pack = material.packages.id(item.packageId);
//       if (!pack)
//         return res
//           .status(400)
//           .json({
//             success: false,
//             message: `Package not found for ${material.name}.`,
//           });
//       const headwearType = item.headwearType || "none";
//       if (!["none", "cap", "gele"].includes(headwearType))
//         return res
//           .status(400)
//           .json({ success: false, message: "Invalid cap/gele selection." });
//       if (
//         headwearQuantity > 0 &&
//         (!material.headwear?.available ||
//           !["cap-or-gele", headwearType].includes(material.headwear.type))
//       )
//         return res
//           .status(400)
//           .json({
//             success: false,
//             message: `The selected ${headwearType} is not available for ${material.name}.`,
//           });
//       snapshots.push({
//         material: material._id,
//         materialName: material.name,
//         category: material.category,
//         variety: material.variety,
//         packageId: pack._id,
//         packageName: pack.name,
//         yards: pack.yards,
//         quantity,
//         unitPrice: pack.price,
//         headwearType,
//         headwearQuantity,
//         headwearUnitPrice:
//           headwearQuantity > 0 ? Number(material.headwear.price || 0) : 0,
//       });
//     }

//     const booking = await PartyBooking.create({
//       customer: req.user._id,
//       items: snapshots,
//       eventDate: date,
//       eventType: String(eventType).trim(),
//       partySize: Number(partySize),
//       contactName: String(contactName).trim(),
//       phone: String(phone).trim(),
//       deliveryMethod,
//       deliveryAddress: String(deliveryAddress || "").trim(),
//       customerNotes: String(customerNotes || "").trim(),
//       status: "pending-review",
//     });
//     return res
//       .status(201)
//       .json({
//         success: true,
//         booking,
//         message:
//           "Booking request submitted for ABS CUT to review. Stock is not deducted until confirmation.",
//       });
//   } catch (error) {
//     console.error("Create party booking failed:", error);
//     return res
//       .status(500)
//       .json({
//         success: false,
//         message: "Could not submit the booking request.",
//       });
//   }
// }

// async function listMyBookings(req, res) {
//   try {
//     const bookings = await PartyBooking.find({ customer: req.user._id })
//       .sort({ createdAt: -1 })
//       .lean();
//     return res.json({ success: true, bookings });
//   } catch (error) {
//     return res
//       .status(500)
//       .json({ success: false, message: "Could not load your bookings." });
//   }
// }

// async function listAllBookings(req, res) {
//   try {
//     const bookings = await PartyBooking.find()
//       .populate("customer", "name email phone")
//       .sort({ createdAt: -1 })
//       .lean();
//     return res.json({ success: true, bookings });
//   } catch (error) {
//     return res
//       .status(500)
//       .json({ success: false, message: "Could not load party bookings." });
//   }
// }

// async function updateBooking(req, res) {
//   const session = await mongoose.startSession();
//   try {
//     const { status, quotationAmount, paymentStatus, amountPaid, adminNotes } =
//       req.body;
//     const allowedStatuses = [
//       "pending-review",
//       "quoted",
//       "confirmed",
//       "ready",
//       "completed",
//       "cancelled",
//     ];
//     if (status !== undefined && !allowedStatuses.includes(status))
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid booking status." });
//     if (
//       quotationAmount !== undefined &&
//       (!Number.isFinite(Number(quotationAmount)) || Number(quotationAmount) < 0)
//     )
//       return res
//         .status(400)
//         .json({
//           success: false,
//           message: "Quotation must be a non-negative amount.",
//         });
//     if (
//       amountPaid !== undefined &&
//       (!Number.isFinite(Number(amountPaid)) || Number(amountPaid) < 0)
//     )
//       return res
//         .status(400)
//         .json({ success: false, message: "Amount paid must be non-negative." });
//     if (
//       paymentStatus !== undefined &&
//       !["unpaid", "part-paid", "paid", "refunded"].includes(paymentStatus)
//     )
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid payment status." });

//     let updated;
//     await session.withTransaction(async () => {
//       const booking = await PartyBooking.findById(req.params.id).session(
//         session,
//       );
//       if (!booking)
//         throw Object.assign(new Error("Booking not found."), {
//           statusCode: 404,
//         });

//       // Only the first transition into confirmed deducts stock. All item updates are transactional.
//       if (status === "confirmed" && !booking.stockDeducted) {
//         for (const item of booking.items) {
//           const material = await PartyMaterial.findOneAndUpdate(
//             {
//               _id: item.material,
//               active: true,
//               stock: { $gte: item.quantity },
//             },
//             { $inc: { stock: -item.quantity } },
//             { new: true, session },
//           );
//           if (!material)
//             throw Object.assign(
//               new Error(
//                 `Not enough stock for ${item.materialName}. No stock changes were saved.`,
//               ),
//               { statusCode: 409 },
//             );
//           if (item.headwearQuantity > 0) {
//             const headwear = await PartyMaterial.findOneAndUpdate(
//               {
//                 _id: item.material,
//                 "headwear.stock": { $gte: item.headwearQuantity },
//               },
//               { $inc: { "headwear.stock": -item.headwearQuantity } },
//               { new: true, session },
//             );
//             if (!headwear)
//               throw Object.assign(
//                 new Error(
//                   `Not enough cap/gele stock for ${item.materialName}. No stock changes were saved.`,
//                 ),
//                 { statusCode: 409 },
//               );
//           }
//         }
//         booking.stockDeducted = true;
//       }

//       // Cancellation before completion restores any stock previously deducted.
//       if (status === "cancelled" && booking.stockDeducted) {
//         for (const item of booking.items) {
//           await PartyMaterial.updateOne(
//             { _id: item.material },
//             {
//               $inc: {
//                 stock: item.quantity,
//                 "headwear.stock": item.headwearQuantity || 0,
//               },
//             },
//             { session },
//           );
//         }
//         booking.stockDeducted = false;
//       }

//       if (status !== undefined) booking.status = status;
//       if (quotationAmount !== undefined)
//         booking.quotationAmount = Number(quotationAmount);
//       if (paymentStatus !== undefined) booking.paymentStatus = paymentStatus;
//       if (amountPaid !== undefined) booking.amountPaid = Number(amountPaid);
//       if (adminNotes !== undefined)
//         booking.adminNotes = String(adminNotes).trim();
//       if (
//         booking.quotationAmount !== null &&
//         booking.status === "pending-review"
//       )
//         booking.status = "quoted";
//       await booking.save({ session })

//       updated = booking;
//     });
//     return res.json({
//       success: true,
//       booking: updated,
//       message: "Booking updated.",
//     });
//   } catch (error) {
//     console.error("Update party booking failed:", error);
//     return res
//       .status(error.statusCode || 500)
//       .json({
//         success: false,
//         message: error.message || "Could not update booking.",
//       });
//   } finally {
//     await session.endSession();
//   }
// }

// module.exports = {
//   listMaterials,
//   createMaterial,
//   updateMaterial,
//   deleteMaterial,
//   createBooking,
//   listMyBookings,
//   listAllBookings,
//   updateBooking,
// };
