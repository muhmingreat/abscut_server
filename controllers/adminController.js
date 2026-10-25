
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const mongoose = require("mongoose");
const InventoryMovement = require("../models/InventoryMovement");

// =====================================================
// ABS CUT — ADMIN DASHBOARD
// =====================================================

const getDashboardStats = async (req, res) => {
  try {
    const [
      totalCustomers,
      totalProducts,
      totalOrders,
      pendingOrders,
      paidOrders,
    ] = await Promise.all([
      User.countDocuments({ role: "customer" }),
      Product.countDocuments({ active: true }),
      Order.countDocuments(),
      Order.countDocuments({ orderStatus: "pending" }),
      Order.countDocuments({ paymentStatus: "paid" }),
    ]);

    const revenueResult = await Order.aggregate([
      { $match: { paymentStatus: "paid" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
        },
      },
    ]);

    const totalRevenue =
      revenueResult.length > 0
        ? revenueResult[0].totalRevenue
        : 0;

    return res.status(200).json({
      success: true,
      stats: {
        totalCustomers,
        totalProducts,
        totalOrders,
        pendingOrders,
        paidOrders,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load dashboard statistics.",
    });
  }
};

// =====================================================
// ABS CUT — ADMIN ORDERS
// =====================================================

const getAdminOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("user", "firstName lastName email phone")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error("Admin orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load admin orders.",
    });
  }
};

const getAdminOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    const order = await Order.findById(id)
      .populate("user", "firstName lastName email phone")
      .populate("items.product", "name image category stock");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Admin order details error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load order details.",
    });
  }
};

const updateAdminOrderStatus = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const { orderStatus } = req.body;

    const allowedStatuses = [
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];

    // ---------------------------------------------------
    // VALIDATE ORDER ID
    // ---------------------------------------------------

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    // ---------------------------------------------------
    // VALIDATE STATUS
    // ---------------------------------------------------

    if (!allowedStatuses.includes(orderStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status.",
      });
    }

    // ---------------------------------------------------
    // START TRANSACTION
    // ---------------------------------------------------

    session.startTransaction();

    // ---------------------------------------------------
    // FIND ORDER
    // ---------------------------------------------------

    const order = await Order.findById(id).session(session);

    if (!order) {
      await session.abortTransaction();

      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    // ---------------------------------------------------
    // PREVENT REPEATED CANCELLATION
    // ---------------------------------------------------

    if (order.orderStatus === "cancelled") {
      await session.abortTransaction();

      if (orderStatus === "cancelled") {
        return res.status(200).json({
          success: true,
          message: "This order is already cancelled. Stock was not restored again.",
          order,
        });
      }

      return res.status(400).json({
        success: false,
        message:
          "A cancelled order cannot be reopened through a status update.",
      });
    }

    // ---------------------------------------------------
    // PREVENT CANCELLATION AFTER SHIPPING
    // ---------------------------------------------------

    if (
      orderStatus === "cancelled" &&
      ["shipped", "delivered"].includes(order.orderStatus)
    ) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message:
          "Shipped or delivered orders cannot be cancelled here. Use the returns process instead.",
      });
    }

    // ---------------------------------------------------
    // RESTORE STOCK WHEN CANCELLING
    // ---------------------------------------------------

    if (orderStatus === "cancelled") {
      for (const item of order.items) {
        const quantity = Number(item.quantity);

        if (
          !item.product ||
          !Number.isInteger(quantity) ||
          quantity < 1
        ) {
          throw new Error(
            `Invalid product or quantity in order ${order._id}.`
          );
        }

        // -----------------------------------------------
        // ADD ORDER QUANTITY BACK TO STOCK
        // -----------------------------------------------

        const updatedProduct = await Product.findByIdAndUpdate(
          item.product,
          {
            $inc: {
              stock: quantity,
            },
          },
          {
            new: true,
            session,
          }
        );

        if (!updatedProduct) {
          await session.abortTransaction();

          return res.status(409).json({
            success: false,
            message:
              "A product in this order no longer exists. Cancellation was not completed.",
          });
        }

        // -----------------------------------------------
        // RECORD INVENTORY RESTORATION
        // -----------------------------------------------

        await InventoryMovement.create(
          [
            {
              product: updatedProduct._id,
              type: "cancellation_return",
              quantityChange: quantity,
              stockBefore: updatedProduct.stock - quantity,
              stockAfter: updatedProduct.stock,
              order: order._id,
              performedBy: req.user._id,
              reason:
                "Stock restored because the admin cancelled the order.",
            },
          ],
          { session }
        );
      }
    }

    // ---------------------------------------------------
    // UPDATE ORDER STATUS
    // ---------------------------------------------------

    order.orderStatus = orderStatus;

    await order.save({ session });

    // ---------------------------------------------------
    // COMMIT TRANSACTION
    // ---------------------------------------------------

    await session.commitTransaction();

    // ---------------------------------------------------
    // RESPONSE
    // ---------------------------------------------------

    return res.status(200).json({
      success: true,
      message:
        orderStatus === "cancelled"
          ? "Order cancelled and stock restored successfully."
          : "Order status updated successfully.",
      order,
    });
  } catch (error) {
    if (session.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error(
          "Transaction abort error:",
          abortError
        );
      }
    }

    console.error(
      "Update admin order status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to update order status.",
    });
  } finally {
    await session.endSession();
  }
};


// const updateAdminOrderStatus = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { orderStatus } = req.body;

//     const allowedStatuses = [
//       "pending",
//       "confirmed",
//       "processing",
//       "shipped",
//       "delivered",
//       "cancelled",
//     ];

//     if (!allowedStatuses.includes(orderStatus)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid order status.",
//       });
//     }

//     const order = await Order.findById(id);

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found.",
//       });
//     }

//     order.orderStatus = orderStatus;
//     await order.save();

//     return res.status(200).json({
//       success: true,
//       message: "Order status updated successfully.",
//       order,
//     });
//   } catch (error) {
//     console.error("Update admin order status error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Unable to update order status.",
//     });
//   }
// };

// =====================================================
// ABS CUT — CUSTOMER MANAGEMENT
// =====================================================

// GET /api/admin/customers
const getAdminCustomers = async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit, 10) || 20)
    );

    const filter = {};

    if (search) {
      const escaped = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const regex = new RegExp(escaped, "i");

      filter.$or = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const [customers, total] = await Promise.all([
      User.find(filter)
        .select(
          "firstName lastName email phone avatar authProvider emailVerified role createdAt updatedAt"
        )
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get admin customers error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load customers.",
    });
  }
};

// GET /api/admin/customers/:id
// const getAdminCustomerById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!/^[a-f\d]{24}$/i.test(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid customer ID.",
//       });
//     }

//     const customer = await User.findOne({
//       _id: id,
//       role: "customer",
//     }).select(
//       "firstName lastName email phone avatar authProvider emailVerified role createdAt updatedAt"
//     );

//     if (!customer) {
//       return res.status(404).json({
//         success: false,
//         message: "Customer not found.",
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       customer,
//     });
//   } catch (error) {
//     console.error("Get admin customer error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Unable to load customer details.",
//     });
//   }
// };


const getAdminCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const user = await User.findById(id).select(
      "firstName lastName email phone avatar authProvider emailVerified role createdAt updatedAt"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      customer: user,
    });
  } catch (error) {
    console.error("Get admin user error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load user details.",
    });
  }
};


// PUT /api/admin/customers/:id


const updateAdminCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Prevent an administrator from accidentally removing
    // their own administrative access.
    const currentUserId = req.user?.userId || req.user?._id;

    if (
      req.body.role !== undefined &&
      String(user._id) === String(currentUserId) &&
      req.body.role !== "admin"
    ) {
      return res.status(400).json({
        success: false,
        message: "You cannot remove your own administrator role.",
      });
    }

    const allowedFields = [
      "firstName",
      "lastName",
      "email",
      "phone",
      "avatar",
      "emailVerified",
      "role",
    ];

    const fields = allowedFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(req.body, field)
    );

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No editable user fields were provided.",
      });
    }

    const allowedRoles = ["customer", "admin", "staff"];

    for (const field of fields) {
      const value = req.body[field];

      if (
        ["firstName", "lastName", "email"].includes(field) &&
        (typeof value !== "string" || !value.trim())
      ) {
        return res.status(400).json({
          success: false,
          message: `${field} is required.`,
        });
      }

      if (
        ["phone", "avatar"].includes(field) &&
        typeof value !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: `${field} must be a string.`,
        });
      }

      if (
        ["firstName", "lastName"].includes(field) &&
        typeof value === "string" &&
        value.trim().length > 100
      ) {
        return res.status(400).json({
          success: false,
          message: `${field} must not exceed 100 characters.`,
        });
      }

      if (field === "email") {
        if (
          typeof value !== "string" ||
          value.trim().length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
        ) {
          return res.status(400).json({
            success: false,
            message: "Please provide a valid email address.",
          });
        }
      }

      if (field === "role" && !allowedRoles.includes(value)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user role.",
        });
      }

      if (
        field === "emailVerified" &&
        typeof value !== "boolean"
      ) {
        return res.status(400).json({
          success: false,
          message: "Email verification must be true or false.",
        });
      }

      if (typeof value === "string" && value.length > 254) {
        return res.status(400).json({
          success: false,
          message: `${field} is too long.`,
        });
      }

      user[field] =
        typeof value === "string" ? value.trim() : value;
    }

    if (fields.includes("email")) {
      user.email = user.email.toLowerCase();

      const duplicate = await User.findOne({
        email: user.email,
        _id: { $ne: user._id },
      }).select("_id");

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "That email address is already in use.",
        });
      }
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "User updated successfully.",
      customer: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        authProvider: user.authProvider,
        emailVerified: user.emailVerified,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update admin customer error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "That email address is already in use.",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "User details failed validation.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to update user.",
    });
  }
};


// DELETE /api/admin/customers/:id
const deleteAdminCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID.",
      });
    }

    const customer = await User.findOne({
      _id: id,
      role: "customer",
    }).select("_id");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    // NOTE: Add related-record retention handling before
    // enabling permanent customer deletion in production.
    await User.deleteOne({
      _id: customer._id,
      role: "customer",
    });

    return res.status(200).json({
      success: true,
      message: "Customer account deleted successfully.",
      customerId: String(customer._id),
    });
  } catch (error) {
    console.error("Delete admin customer error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete customer.",
    });
  }
};


/* =========================================================
   ABS CUT INVENTORY — CONFIGURATION
========================================================= */

const LOW_STOCK_THRESHOLD = Math.max(
  0,
  Number(process.env.LOW_STOCK_THRESHOLD) || 5
);

/* =========================================================
   INVENTORY — DASHBOARD SUMMARY
   GET /api/admin/inventory/summary
========================================================= */

const getInventorySummary = async (req, res) => {
  try {
    const [
      totalProducts,
      activeProducts,
      stockTotals,
      lowStockProducts,
      outOfStockProducts,
    ] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ active: true }),

      Product.aggregate([
        { $match: { active: true } },
        {
          $group: {
            _id: null,
            totalUnits: { $sum: "$stock" },
          },
        },
      ]),

      Product.countDocuments({
        active: true,
        stock: { $gt: 0, $lte: LOW_STOCK_THRESHOLD },
      }),

      Product.countDocuments({
        active: true,
        stock: 0,
      }),
    ]);

    res.status(200).json({
      success: true,
      summary: {
        totalProducts,
        activeProducts,
        totalUnits: stockTotals[0]?.totalUnits || 0,
        lowStockProducts,
        outOfStockProducts,
        lowStockThreshold: LOW_STOCK_THRESHOLD,
      },
    });
  } catch (error) {
    console.error("Get inventory summary error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load inventory summary.",
    });
  }
};

/* =========================================================
   INVENTORY — STOCK MOVEMENT HISTORY
   GET /api/admin/inventory/movements
========================================================= */

const getInventoryMovements = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
    );

    const filter = {};

    if (req.query.type) {
      const allowedTypes = [
        "opening_stock",
        "stock_added",
        "sale",
        "cancellation_return",
        "manual_adjustment",
        "return",
      ];

      if (!allowedTypes.includes(req.query.type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid inventory movement type.",
        });
      }

      filter.type = req.query.type;
    }

    if (req.query.productId) {
      if (!mongoose.isValidObjectId(req.query.productId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID.",
        });
      }

      filter.product = req.query.productId;
    }

    const [movements, total] = await Promise.all([
      InventoryMovement.find(filter)
        .populate("product", "name category image")
        .populate("performedBy", "firstName lastName name email")
        .populate("order", "orderNumber")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      InventoryMovement.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      movements,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get inventory movements error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load inventory movement history.",
    });
  }
};

/* =========================================================
   INVENTORY — ADJUST PRODUCT STOCK
   POST /api/admin/inventory/products/:id/adjust-stock

   Body:
   {
     "quantityChange": 10,
     "reason": "New fabric stock received"
   }

   Positive quantityChange adds stock.
   Negative quantityChange removes stock.
========================================================= */

const adjustInventoryStock = async (req, res) => {
  const { id } = req.params;
  const { quantityChange, reason } = req.body;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID.",
    });
  }

  if (
    typeof quantityChange !== "number" ||
    !Number.isSafeInteger(quantityChange) ||
    quantityChange === 0
  ) {
    return res.status(400).json({
      success: false,
      message: "Stock change must be a non-zero whole number.",
    });
  }

  if (
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.trim().length > 500
  ) {
    return res.status(400).json({
      success: false,
      message: "A reason of up to 500 characters is required.",
    });
  }

  const session = await mongoose.startSession();

  try {
    let updatedProduct;
    let movement;

    await session.withTransaction(async () => {
      const product = await Product.findById(id).session(session);

      if (!product) {
        const error = new Error("Product not found.");
        error.statusCode = 404;
        throw error;
      }

      const stockBefore = product.stock;
      const stockAfter = stockBefore + quantityChange;

      if (!Number.isSafeInteger(stockAfter) || stockAfter < 0) {
        const error = new Error(
          "This adjustment would make stock negative or exceed the supported quantity."
        );
        error.statusCode = 400;
        throw error;
      }

      // Compare-and-update prevents a concurrent stock change
      // from silently overwriting the quantity we just read.
      updatedProduct = await Product.findOneAndUpdate(
        {
          _id: id,
          stock: stockBefore,
        },
        {
          $inc: { stock: quantityChange },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!updatedProduct) {
        const error = new Error(
          "Stock changed during this adjustment. Please retry."
        );
        error.statusCode = 409;
        throw error;
      }

      const [createdMovement] = await InventoryMovement.create(
        [
          {
            product: product._id,
            type:
              quantityChange > 0
                ? "stock_added"
                : "manual_adjustment",
            quantityChange,
            stockBefore,
            stockAfter,
            performedBy: req.user._id,
            reason: reason.trim(),
          },
        ],
        { session }
      );

      movement = createdMovement;
    });

    res.status(200).json({
      success: true,
      message: "Inventory stock updated successfully.",
      product: updatedProduct,
      movement,
    });
  } catch (error) {
    console.error("Adjust inventory stock error:", error);

    res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode && error.statusCode < 500
          ? error.message
          : "Unable to adjust inventory stock.",
    });
  } finally {
    await session.endSession()
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  // Existing dashboard and order functions
  getDashboardStats,
  getAdminOrders,
  getAdminOrderById,
  updateAdminOrderStatus,

  // Existing customer management functions
  getAdminCustomers,
  getAdminCustomerById,
  updateAdminCustomer,
  deleteAdminCustomer,

  // New inventory functions
  getInventorySummary,
  getInventoryMovements,
  adjustInventoryStock,
};;










// const User = require("../models/User");
// const Product = require("../models/Product");
// const Order = require("../models/Order");

// const getDashboardStats = async (req, res) => {
//   try {
//     const [
//       totalCustomers,
//       totalProducts,
//       totalOrders,
//       pendingOrders,
//       paidOrders,
//     ] = await Promise.all([
//       User.countDocuments({
//         role: "customer",
//       }),

//       Product.countDocuments({
//         active: true,
//       }),

//       Order.countDocuments(),

//       Order.countDocuments({
//         orderStatus: "pending",
//       }),

//       Order.countDocuments({
//         paymentStatus: "paid",
//       }),
//     ]);

//     const revenueResult = await Order.aggregate([
//       {
//         $match: {
//           paymentStatus: "paid",
//         },
//       },
//       {
//         $group: {
//           _id: null,
//           totalRevenue: {
//             $sum: "$total",
//           },
//         },
//       },
//     ]);

//     const totalRevenue =
//       revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

//     res.status(200).json({
//       success: true,
//       stats: {
//         totalCustomers,
//         totalProducts,
//         totalOrders,
//         pendingOrders,
//         paidOrders,
//         totalRevenue,
//       },
//     });
//   } catch (error) {
//     console.error("Admin dashboard error:", error)



//     res.status(500).json({
//       success: false,
//       message: "Unable to load dashboard statistics."
//     });
//   }
// };

// const getAdminOrders = async (req, res) => {
//   try {
//     const orders = await Order.find()
//       .populate("user", "firstName lastName email phone")
//       .sort({
//         createdAt: -1,
//       });

//     res.status(200).json({
//       success: true,
//       orders,
//     });
//   } catch (error) {
//     console.error("Admin orders error:", error);

//     res.status(500).json({
//       success: false,
//       message: "Unable to load admin orders.",
//     });
//   }
// };

// const getAdminOrderById = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const order = await Order.findById(id)
//       .populate("user", "firstName lastName email phone")
//       .populate("items.product", "name image category stock");
//     if (!order) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Order not found." });
//     }
//     res.status(200).json({ success: true, order });
//   } catch (error) {
//     console.error("Admin order details error:", error)
//     res
//       .status(500)
//       .json({ success: false, message: "Unable to load order details." });
//   }
// };

// const updateAdminOrderStatus = async (req, res) => {
//   try {

//     const { id } = req.params;
//     const { orderStatus } = req.body;

//     const allowedStatuses = [
//       "pending",
//       "confirmed",
//       "processing",
//       "shipped",
//       "delivered",
//       "cancelled",
//     ];

//     if (!orderStatus) {
//       return res.status(400).json({
//         success: false,
//         message: "Order status is required.",
//       });
//     }

//     if (!allowedStatuses.includes(orderStatus)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid order status.",
//       });
//     }

//     const order = await Order.findById(id)

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found.",
//       });
//     }

//     order.orderStatus = orderStatus;

//     await order.save();

//     res.status(200).json({
//       success: true,
//       message: "Order status updated successfully.",
//       order,
//     });
//   } catch (error) {
//     console.error(
//       "Update admin order status error:",
//       error
//     );

//     res.status(500).json({
//       success: false,
//       message:
//         "Unable to update order status.",
//     });
//   }
// };



// /* =====================================================
//    ABS CUT — CUSTOMER MANAGEMENT
// ===================================================== */

// // GET /api/admin/customers
// const getAdminCustomers = async (req, res) => {
//   try {
//     const {
//       search = "",
//       page = "1",
//       limit = "20",
//     } = req.query;

//     const currentPage = Math.max(1, Number(page) || 1);
//     const pageSize = Math.min(
//       100,
//       Math.max(1, Number(limit) || 20)
//     );

//     const filter = {
//       role: "customer",
//     };

//     const searchText = String(search).trim();

//     if (searchText) {
//       const escaped = searchText.replace(
//         /[.*+?^${}()|[\]\\]/g,
//         "\\$&"
//       );

//       const regex = new RegExp(escaped, "i");

//       filter.$or = [
//         { firstName: regex },
//         { lastName: regex },
//         { email: regex },
//         { phone: regex },
//       ];
//     }

//     const [customers, total] = await Promise.all([
//       User.find(filter)
//         .select(
//           "firstName lastName email phone avatar authProvider emailVerified role createdAt updatedAt"
//         )
//         .sort({ createdAt: -1 })
//         .skip((currentPage - 1) * pageSize)
//         .limit(pageSize)
//         .lean(),

//       User.countDocuments(filter),
//     ]);

//     return res.status(200).json({
//       success: true,
//       customers,
//       pagination: {
//         page: currentPage,
//         limit: pageSize,
//         total,
//         totalPages: Math.ceil(total / pageSize),
//       },
//     });
//   } catch (error) {
//     console.error("Get admin customers error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Unable to load customers.",
//     });
//   }
// };


// // GET /api/admin/customers/:id
// const getAdminCustomerById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!/^[a-f\d]{24}$/i.test(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid customer ID.",
//       });
//     }

//     const customer = await User.findOne({
//       _id: id,
//       role: "customer",
//     }).select(
//       "firstName lastName email phone avatar authProvider emailVerified role createdAt updatedAt"
//     );

//     if (!customer) {
//       return res.status(404).json({
//         success: false,
//         message: "Customer not found.",
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       customer,
//     });
//   } catch (error) {
//     console.error("Get admin customer error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Unable to load customer details.",
//     });
//   }
// };


// // PUT /api/admin/customers/:id
// const updateAdminCustomer = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!/^[a-f\d]{24}$/i.test(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid customer ID.",
//       });
//     }

//     const customer = await User.findOne({
//       _id: id,
//       role: "customer",
//     });

//     if (!customer) {
//       return res.status(404).json({
//         success: false,
//         message: "Customer not found.",
//       });
//     }

//     const allowedFields = [
//       "firstName",
//       "lastName",
//       "email",
//       "phone",
//       "avatar",
//       "emailVerified",
//     ];

//     const suppliedFields = allowedFields.filter(
//       (field) =>
//         Object.prototype.hasOwnProperty.call(
//           req.body,
//           field
//         )
//     );

//     if (suppliedFields.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "No editable customer fields were provided.",
//       });
//     }

//     for (const field of suppliedFields) {
//       const value = req.body[field];

//       if (
//         field === "emailVerified" &&
//         typeof value !== "boolean"
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: "Email verification must be true or false.",
//         });
//       }

//       if (
//         ["firstName", "lastName", "email"].includes(field) &&
//         (typeof value !== "string" || !value.trim())
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: `${field} is required.`,
//         });
//       }

//       if (
//         ["phone", "avatar"].includes(field) &&
//         typeof value !== "string"
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: `${field} must be a string.`,
//         });
//       }

//       if (
//         typeof value === "string" &&
//         value.length > 254
//       ) {
//         return res.status(400).json({
//           success: false,
//           message: `${field} is too long.`,
//         });
//       }

//       if (typeof value === "string") {
//         customer[field] = value.trim();
//       } else {
//         customer[field] = value;
//       }
//     }

//     if (suppliedFields.includes("email")) {
//       customer.email = customer.email.toLowerCase();

//       const existingEmail = await User.findOne({
//         email: customer.email,
//         _id: { $ne: customer._id },
//       }).select("_id");

//       if (existingEmail) {
//         return res.status(409).json({
//           success: false,
//           message: "That email address is already in use.",
//         });
//       }
//     }

//     await customer.save();

//     return res.status(200).json({
//       success: true,
//       message: "Customer updated successfully.",
//       customer: {
//         id: customer._id,
//         firstName: customer.firstName,
//         lastName: customer.lastName,
//         email: customer.email,
//         phone: customer.phone,
//         avatar: customer.avatar,
//         authProvider: customer.authProvider,
//         emailVerified: customer.emailVerified,
//         role: customer.role,
//         createdAt: customer.createdAt,
//         updatedAt: customer.updatedAt,
//       },
//     });
//   } catch (error) {
//     console.error("Update admin customer error:", error);

//     if (error.code === 11000) {
//       return res.status(409).json({
//         success: false,
//         message: "That email address is already in use.",
//       });
//     }

//     if (error.name === "ValidationError") {
//       return res.status(400).json({
//         success: false,
//         message: "Customer details failed validation.",
//       });
//     }

//     return res.status(500).json({
//       success: false,
//       message: "Unable to update customer.",
//     });
//   }
// };


// // DELETE /api/admin/customers/:id
// const deleteAdminCustomer = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!/^[a-f\d]{24}$/i.test(id)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid customer ID.",
//       });
//     }

//     const customer = await User.findOne({
//       _id: id,
//       role: "customer",
//     }).select("_id");

//     if (!customer) {
//       return res.status(404).json({
//         success: false,
//         message: "Customer not found.",
//       });
//     }

//     await User.deleteOne({
//       _id: customer._id,
//       role: "customer",
//     });

//     return res.status(200).json({
//       success: true,
//       message: "Customer account deleted successfully.",
//       customerId: String(customer._id),
//     });
//   } catch (error) {
//     console.error("Delete admin customer error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Unable to delete customer.",
//     });
//   }
// };

// module.exports = {
//   getDashboardStats,
//   getAdminOrders,
//   getAdminOrderById,
//   updateAdminOrderStatus,
//   getAdminCustomers,
//   getAdminCustomerById,
//   updateAdminCustomer,
//   deleteAdminCustomer,
// };

