
const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const {
  getDashboardStats,
  getAdminOrders,
  getAdminOrderById,
  updateAdminOrderStatus,
  getAdminCustomers,
  getAdminCustomerById,
  updateAdminCustomer,
  deleteAdminCustomer,
  getInventorySummary,
  getInventoryMovements,
  adjustInventoryStock,
} = require("../controllers/adminController");
const {
  getAdminReportOverview,
} = require("../controllers/adminReportController");

const protect = authMiddleware;
const { adminOnly } = authMiddleware;

const router = express.Router();

// Dashboard
router.get("/dashboard", protect, adminOnly, getDashboardStats);

// Orders
router.get("/orders", protect, adminOnly, getAdminOrders);
router.get("/orders/:id", protect, adminOnly, getAdminOrderById);

router.put(
  "/orders/:id/status",
  protect,
  adminOnly,
  updateAdminOrderStatus
);

// Customers
router.get(
  "/customers",
  protect,
  adminOnly,
  getAdminCustomers
);

router.get(
  "/customers/:id",
  protect,
  adminOnly,
  getAdminCustomerById
);

router.put(
  "/customers/:id",
  protect,
  adminOnly,
  updateAdminCustomer
);

router.delete(
  "/customers/:id",
  protect,
  adminOnly,
  deleteAdminCustomer
);

// =====================================================
// ADMIN — INVENTORY MANAGEMENT
// =====================================================

router.get(
  "/inventory/summary",
  protect,
  adminOnly,
  getInventorySummary
);

router.get(
  "/inventory/movements",
  protect,
  adminOnly,
  getInventoryMovements
);

router.post(
  "/inventory/products/:id/adjust-stock",
  protect,
  adminOnly,
  adjustInventoryStock
);

// ============================================================
// ADMIN REPORTS
// ============================================================

router.get(
  "/reports/overview",
  protect,
  adminOnly,
  getAdminReportOverview
)
module.exports = router;









// const express = require("express");

// const authMiddleware = require("../middleware/authMiddleware");
// const {
//   getDashboardStats,
//   getAdminOrders,
//   getAdminOrderById,
//   updateAdminOrderStatus
// } = require("../controllers/adminController");

// const protect = authMiddleware;
// const { adminOnly } = authMiddleware;

// const router = express.Router();

// router.get("/dashboard", protect, adminOnly, getDashboardStats);

// router.get("/orders", protect, adminOnly, getAdminOrders);
// router.get("/orders/:id", protect, adminOnly, getAdminOrderById);

// router.put(
//   "/orders/:id/status",
//   protect,
//   adminOnly,
//   updateAdminOrderStatus
// );



// module.exports = router;
