
const mongoose = require("mongoose");

const CustomOrder = require("../models/CustomOrder");
const CustomOrderInstallmentSettings = require("../models/CustomOrderInstallmentSettings");

const {
  notifyCustomOrderSubmitted,
  notifyCustomOrderStatus,
} = require("../services/notificationService");

// =====================================================
// HELPERS
// =====================================================

const getInstallmentSettings = async () => {
  let settings =
    await CustomOrderInstallmentSettings.findOne({
      settingsKey: "custom-order-installments",
    });

  if (!settings) {
    settings = await CustomOrderInstallmentSettings.create({
      settingsKey: "custom-order-installments",
    });
  }

  return settings;
};

const toKobo = (amount) =>
  Math.round(Number(amount || 0) * 100);

const getMinimumDeposit = (quotation, settings) => {
  const quotationKobo = toKobo(quotation);
  const value = Number(settings.minimumDepositValue || 0);

  if (settings.minimumDepositType === "fixed") {
    return toKobo(value);
  }

  return Math.ceil((quotationKobo * value) / 100);
};

// =====================================================
// CUSTOMER — CREATE CUSTOM ORDER
// =====================================================

const createCustomOrder = async (req, res) => {
  try {
    const {
      serviceType,
      outfitType,
      fabric,
      color,
      materialSource,
      materialDescription,
      pickupRequired,
      pickupLocation,
      embroidery,
      embroideryDetails,
      monogram,
      monogramText,
      measurements,
      measurementMethod,
      referenceImage,
      deliveryRequired,
      deliveryLocation,
      notes,
    } = req.body;

    // Required fields
    if (!serviceType) {
      return res.status(400).json({
        success: false,
        message: "Please select a service type.",
      });
    }

    if (!outfitType) {
      return res.status(400).json({
        success: false,
        message: "Please provide the outfit type.",
      });
    }

    // Validate material source
    const allowedMaterialSources = [
      "ABS CUT",
      "Customer",
      "Already Made Garment",
      "Not Required",
    ];

    if (
      materialSource &&
      !allowedMaterialSources.includes(materialSource)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid material source.",
      });
    }

    // Validate service type
    const allowedServiceTypes = [
      "Custom Tailoring",
      "Embroidery",
      "Monogram",
      "Tailoring & Embroidery",
      "Tailoring & Monogram",
      "Tailoring, Embroidery & Monogram",
    ];

    if (!allowedServiceTypes.includes(serviceType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service type.",
      });
    }

    // Validate embroidery
    if (
      embroidery &&
      !["yes", "no"].includes(embroidery)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid embroidery selection.",
      });
    }

    // Validate monogram
    if (
      monogram &&
      !["yes", "no"].includes(monogram)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid monogram selection.",
      });
    }

    if (
      monogram === "yes" &&
      !monogramText?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide the monogram text.",
      });
    }

    // Validate pickup address
    if (pickupRequired === true) {
      if (
        !pickupLocation ||
        !pickupLocation.address?.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Please provide the pickup address.",
        });
      }
    }

    // Validate delivery address
    if (deliveryRequired === true) {
      if (
        !deliveryLocation ||
        !deliveryLocation.address?.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Please provide the delivery address.",
        });
      }
    }

    const customOrder = await CustomOrder.create({
      user: req.user._id,

      serviceType: serviceType.trim(),
      outfitType: outfitType.trim(),
      fabric: fabric?.trim() || "",
      color: color?.trim() || "",

      materialSource: materialSource || "ABS CUT",
      materialDescription: materialDescription?.trim() || "",

      // Pickup
      pickupRequired: pickupRequired === true,

      pickupLocation:
        pickupRequired === true
          ? {
              address: pickupLocation.address?.trim() || "",
              area: pickupLocation.area?.trim() || "",
              landmark: pickupLocation.landmark?.trim() || "",
              latitude: pickupLocation.latitude ?? null,
              longitude: pickupLocation.longitude ?? null,
            }
          : {},

      // Embroidery
      embroidery: embroidery === "yes" ? "yes" : "no",
      embroideryDetails: embroideryDetails?.trim() || "",

      // Monogram
      monogram: monogram === "yes" ? "yes" : "no",
      monogramText:
        monogram === "yes"
          ? monogramText.trim()
          : "",

      // Measurements
      measurements: measurements?.trim() || "",
      measurementMethod: measurementMethod || "To Be Confirmed",

      // Reference image
      referenceImage: referenceImage || {},

      // Delivery
      deliveryRequired: deliveryRequired === true,

      deliveryLocation:
        deliveryRequired === true
          ? {
              address: deliveryLocation.address?.trim() || "",
              area: deliveryLocation.area?.trim() || "",
              landmark: deliveryLocation.landmark?.trim() || "",
              latitude: deliveryLocation.latitude ?? null,
              longitude: deliveryLocation.longitude ?? null,
            }
          : {},

      notes: notes?.trim() || "",

      // Initial fees
      tailoringFee: 0,
      materialFee: 0,
      embroideryFee: 0,
      monogramFee: 0,
      pickupFee: 0,
      deliveryFee: 0,

      // Initial quotation
      quotation: null,

      // Initial status
      status: "Pending Review",

      // Payment values are initialized by the server.
      // Only verified payment processing may change them.
      paymentStatus: "Not Required",
      amountPaid: 0,
    });

    // Notifications must not invalidate a successfully saved order.
    Promise.allSettled([
      notifyCustomOrderSubmitted({
        name: `${req.user.firstName} ${req.user.lastName}`,
        email: req.user.email,
        phone: req.user.phone,
        customOrderId: customOrder._id,
      }),
    ]).then((results) => {
      console.log(
        "ABS CUT custom order submission notification results:",
        results
      );
    });

    return res.status(201).json({
      success: true,
      message: "Custom order submitted successfully.",
      customOrder,
    });
  } catch (error) {
    console.error("Create custom order error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to submit your custom order.",
    });
  }
};

// =====================================================
// CUSTOMER — GET MY CUSTOM ORDERS
// =====================================================

const getMyCustomOrders = async (req, res) => {
  try {
    const customOrders = await CustomOrder.find({
      user: req.user._id,
    }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      count: customOrders.length,
      customOrders,
    });
  } catch (error) {
    console.error("Get my custom orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load your custom orders.",
    });
  }
};

// =====================================================
// CUSTOMER — GET ONE CUSTOM ORDER
// =====================================================

const getMyCustomOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid custom order ID.",
      });
    }

    const customOrder = await CustomOrder.findOne({
      _id: id,
      user: req.user._id,
    });

    if (!customOrder) {
      return res.status(404).json({
        success: false,
        message: "Custom order not found.",
      });
    }

    return res.status(200).json({
      success: true,
      customOrder,
    });
  } catch (error) {
    console.error("Get my custom order error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load custom order.",
    });
  }
};

// =====================================================
// ADMIN — GET ALL CUSTOM ORDERS
// =====================================================

const getAdminCustomOrders = async (req, res) => {
  try {
    const customOrders = await CustomOrder.find()
      .populate("user", "firstName lastName email phone")
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,
      count: customOrders.length,
      customOrders,
    });
  } catch (error) {
    console.error("Get admin custom orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load custom orders.",
    });
  }
};

// =====================================================
// ADMIN — GET ONE CUSTOM ORDER
// =====================================================

const getAdminCustomOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid custom order ID.",
      });
    }

    const customOrder = await CustomOrder.findById(id).populate(
      "user",
      "firstName lastName email phone"
    );

    if (!customOrder) {
      return res.status(404).json({
        success: false,
        message: "Custom order not found.",
      });
    }

    return res.status(200).json({
      success: true,
      customOrder,
    });
  } catch (error) {
    console.error("Get admin custom order error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load custom order.",
    });
  }
};

// =====================================================
// ADMIN — UPDATE CUSTOM ORDER
// =====================================================

const updateAdminCustomOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      status,
      quotation,
      tailoringFee,
      materialFee,
      embroideryFee,
      monogramFee,
      pickupFee,
      deliveryFee,
      adminNotes,
      productionNotes,
    } = req.body;

    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid custom order ID.",
      });
    }

    // Never allow the admin update endpoint to manually
    // overwrite payment totals or payment status.
    if (
      Object.prototype.hasOwnProperty.call(
        req.body,
        "amountPaid"
      ) ||
      Object.prototype.hasOwnProperty.call(
        req.body,
        "paymentStatus"
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Payment totals and payment status are managed by verified payment records. Use the payment system to record or confirm payments.",
      });
    }

    const customOrder = await CustomOrder.findById(id);

    if (!customOrder) {
      return res.status(404).json({
        success: false,
        message: "Custom order not found.",
      });
    }

    const previousStatus = customOrder.status;

    // Validate requested status before applying changes.
    if (status !== undefined) {
      const allowedStatuses = [
        "Pending Review",
        "Under Review",
        "Quote Sent",
        "Awaiting Payment",
        "Confirmed",
        "In Production",
        "Ready",
        "Completed",
        "Cancelled",
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid custom order status.",
        });
      }
    }

    // Validate pricing values before applying them.
    const pricingFields = [
      "tailoringFee",
      "materialFee",
      "embroideryFee",
      "monogramFee",
      "pickupFee",
      "deliveryFee",
    ];

    for (const field of pricingFields) {
      if (req.body[field] === undefined) {
        continue;
      }

      const value = Number(req.body[field]);

      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({
          success: false,
          message: `${field} must be a valid amount.`,
        });
      }

      customOrder[field] = value;
    }

    // Validate and update quotation.
    if (quotation !== undefined) {
      if (quotation === null) {
        if (toKobo(customOrder.amountPaid) > 0) {
          return res.status(400).json({
            success: false,
            message:
              "A quotation cannot be removed after a payment has been received.",
          });
        }

        customOrder.quotation = null;
      } else {
        const quotationAmount = Number(quotation);

        if (
          !Number.isFinite(quotationAmount) ||
          quotationAmount < 0
        ) {
          return res.status(400).json({
            success: false,
            message: "Quotation must be a valid amount.",
          });
        }

        if (
          toKobo(quotationAmount) <
          toKobo(customOrder.amountPaid)
        ) {
          return res.status(400).json({
            success: false,
            message:
              "The quotation cannot be lower than the amount already paid.",
          });
        }

        customOrder.quotation = quotationAmount;
      }
    }

    // Admin notes
    if (adminNotes !== undefined) {
      customOrder.adminNotes = String(adminNotes).trim();
    }

    // Production notes
    if (productionNotes !== undefined) {
      customOrder.productionNotes =
        String(productionNotes).trim();
    }

    // Deposit gate: only enforce when moving into production.
    if (
      status === "In Production" &&
      previousStatus !== "In Production"
    ) {
      const settings = await getInstallmentSettings();

      if (settings.requireDepositBeforeProduction) {
        const quotationKobo = toKobo(customOrder.quotation);
        const amountPaidKobo = toKobo(customOrder.amountPaid);

        if (
          customOrder.quotation === null ||
          !Number.isSafeInteger(quotationKobo) ||
          quotationKobo <= 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              "A valid quotation must be set before production can begin.",
          });
        }

        const minimumDepositKobo = getMinimumDeposit(
          customOrder.quotation,
          settings
        );

        if (amountPaidKobo < minimumDepositKobo) {
          const minimumDeposit = (
            minimumDepositKobo / 100
          ).toFixed(2);

          const remainingDeposit = (
            (minimumDepositKobo - amountPaidKobo) / 100
          ).toFixed(2);

          return res.status(400).json({
            success: false,
            code: "MINIMUM_DEPOSIT_NOT_MET",
            message:
              `Production cannot begin yet. The minimum required deposit is ₦${minimumDeposit}. ` +
              `An additional ₦${remainingDeposit} must be received and verified first.`,
            minimumDeposit: Number(minimumDeposit),
            amountPaid: Number(
              (amountPaidKobo / 100).toFixed(2)
            ),
            remainingDeposit: Number(remainingDeposit),
          });
        }
      }
    }

    // Apply status only after validation and deposit checks.
    if (status !== undefined) {
      customOrder.status = status;
    }

    await customOrder.save();

    // Send customer notification if status changed.
    const statusChanged =
      status !== undefined &&
      status !== previousStatus;

    if (statusChanged) {
      const notificationOrder = await CustomOrder.findById(
        customOrder._id
      ).populate("user", "firstName lastName email phone");

      const customer = notificationOrder?.user;

      if (customer) {
        Promise.allSettled([
          notifyCustomOrderStatus({
            name: `${customer.firstName} ${customer.lastName}`,
            email: customer.email,
            phone: customer.phone,
            customOrderId: customOrder._id,
            status: customOrder.status,
          }),
        ]).then((results) => {
          console.log(
            "ABS CUT custom order status notification results:",
            results
          );
        });
      }
    }

    const updatedOrder = await CustomOrder.findById(
      customOrder._id
    ).populate("user", "firstName lastName email phone");

    return res.status(200).json({
      success: true,
      message: "Custom order updated successfully.",
      customOrder: updatedOrder,
    });
  } catch (error) {
    console.error("Update admin custom order error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update custom order.",
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  createCustomOrder,
  getMyCustomOrders,
  getMyCustomOrderById,
  getAdminCustomOrders,
  getAdminCustomOrderById,
  updateAdminCustomOrder,
};
