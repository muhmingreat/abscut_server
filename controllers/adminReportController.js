
const Order = require("../models/Order");
const CustomOrder = require("../models/CustomOrder");
const Payment = require("../models/Payment");
const InventoryMovement = require("../models/InventoryMovement");

// ============================================================
// ABS CUT — ADMIN REPORTS
// ============================================================

const getAdminReportOverview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    // --------------------------------------------------------
    // Validate and build an optional inclusive date range
    // --------------------------------------------------------

    const dateFilter = {};

    if (startDate) {
      const start = new Date(`${startDate}T00:00:00.000Z`);

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        Number.isNaN(start.getTime()) ||
        start.toISOString().slice(0, 10) !== startDate
      ) {
        return res.status(400).json({
          message: "Invalid startDate. Use YYYY-MM-DD.",
        });
      }

      dateFilter.$gte = start;
    }

    if (endDate) {
      const end = new Date(`${endDate}T00:00:00.000Z`);

      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
        Number.isNaN(end.getTime()) ||
        end.toISOString().slice(0, 10) !== endDate
      ) {
        return res.status(400).json({
          message: "Invalid endDate. Use YYYY-MM-DD.",
        });
      }

      // Include the entire selected end date.
      end.setUTCDate(end.getUTCDate() + 1);
      dateFilter.$lt = end;
    }

    if (
      dateFilter.$gte &&
      dateFilter.$lt &&
      dateFilter.$gte >= dateFilter.$lt
    ) {
      return res.status(400).json({
        message: "startDate must be on or before endDate.",
      });
    }

    const orderDateMatch = Object.keys(dateFilter).length
      ? { createdAt: dateFilter }
      : {};

    // Orders use createdAt. Successful ledger payments use
    // updatedAt as their success-date proxy.
    const paymentDateMatch = Object.keys(dateFilter).length
      ? { updatedAt: dateFilter }
      : {};

    const movementDateMatch = Object.keys(dateFilter).length
      ? { createdAt: dateFilter }
      : {};

    // --------------------------------------------------------
    // Order status summaries
    // --------------------------------------------------------

    const orderStatusSummary = await Order.aggregate([
      { $match: orderDateMatch },
      {
        $group: {
          _id: {
            $toLower: {
              $ifNull: ["$orderStatus", "unknown"],
            },
          },
          count: { $sum: 1 },
          orderValue: { $sum: { $ifNull: ["$total", 0] } },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const customOrderStatusSummary = await CustomOrder.aggregate([
      { $match: orderDateMatch },
      {
        $group: {
          _id: {
            $toLower: {
              $ifNull: ["$status", "unknown"],
            },
          },
          count: { $sum: 1 },
          quotedValue: {
            $sum: { $ifNull: ["$quotation", 0] },
          },
          amountPaid: {
            $sum: { $ifNull: ["$amountPaid", 0] },
          },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // --------------------------------------------------------
    // Payment ledger summaries
    // --------------------------------------------------------

    const paymentStatusSummary = await Payment.aggregate([
      { $match: paymentDateMatch },
      {
        $group: {
          _id: {
            $toLower: {
              $ifNull: ["$status", "unknown"],
            },
          },
          count: { $sum: 1 },
          amount: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const paymentProviderSummary = await Payment.aggregate([
      {
        $match: {
          ...paymentDateMatch,
          status: "successful",
        },
      },
      {
        $group: {
          _id: {
            $toLower: {
              $ifNull: ["$provider", "unknown"],
            },
          },
          count: { $sum: 1 },
          amount: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
      { $sort: { amount: -1 } },
    ]);

    const successfulPaymentTotals = await Payment.aggregate([
      {
        $match: {
          ...paymentDateMatch,
          status: "successful",
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
          count: { $sum: 1 },
        },
      },
    ]);

    // --------------------------------------------------------
    // Inventory movement summary
    // --------------------------------------------------------

    const inventoryMovementSummary = await InventoryMovement.aggregate([
      { $match: movementDateMatch },
      {
        $group: {
          _id: {
            $ifNull: ["$type", "unknown"],
          },
          movementCount: { $sum: 1 },
          netQuantityChange: {
            $sum: { $ifNull: ["$quantityChange", 0] },
          },
        },
      },
      { $sort: { movementCount: -1 } },
    ]);

    // --------------------------------------------------------
    // Overall counts
    // --------------------------------------------------------

    const [
      totalOrders,
      totalCustomOrders,
      totalPaymentRecords,
      totalInventoryMovements,
    ] = await Promise.all([
      Order.countDocuments(orderDateMatch),
      CustomOrder.countDocuments(orderDateMatch),
      Payment.countDocuments(paymentDateMatch),
      InventoryMovement.countDocuments(movementDateMatch),
    ]);

    const successfulPayments = successfulPaymentTotals[0] || {
      totalAmount: 0,
      count: 0,
    };

    // IMPORTANT:
    // This revenue figure comes only from successful Payment
    // ledger records. Do not add Order.total or CustomOrder.amountPaid
    // to it, because those values can represent the same payments.

    return res.status(200).json({
      success: true,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
      overview: {
        totalOrders,
        totalCustomOrders,
        totalPaymentRecords,
        totalInventoryMovements,
        successfulPaymentCount: successfulPayments.count,
        successfulLedgerRevenue: successfulPayments.totalAmount,
      },
      orderStatusSummary,
      customOrderStatusSummary,
      paymentStatusSummary,
      paymentProviderSummary,
      inventoryMovementSummary,
      revenueNote:
        "Revenue is calculated from successful Payment ledger records only. It may exclude older payments that were not recorded in the ledger.",
    });
  } catch (error) {
    console.error("Admin report overview error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to generate admin reports.",
    });
  }
};

module.exports = {
  getAdminReportOverview,
};
