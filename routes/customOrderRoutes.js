const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const {
  createCustomOrder,
  getMyCustomOrders,
  getMyCustomOrderById,
  getAdminCustomOrders,
  getAdminCustomOrderById,
  updateAdminCustomOrder,
} = require("../controllers/customOrderController");

const protect = authMiddleware;
const { adminOnly } = authMiddleware;

const router = express.Router();

// =====================================================
// CUSTOMER
// =====================================================

// Create custom order
router.post(
  "/",
  protect,
  createCustomOrder
);

// Get my custom orders
router.get(
  "/",
  protect,
  getMyCustomOrders
);

// =====================================================
// ADMIN
// =====================================================

// Get all custom orders
router.get(
  "/admin",
  protect,
  adminOnly,
  getAdminCustomOrders
);

// Get one admin custom order
router.get(
  "/admin/:id",
  protect,
  adminOnly,
  getAdminCustomOrderById
);

// Update admin custom order
router.put(
  "/admin/:id",
  protect,
  adminOnly,
  updateAdminCustomOrder
);

// =====================================================
// CUSTOMER — GET ONE
// =====================================================

router.get(
  "/:id",
  protect,
  getMyCustomOrderById
);

module.exports = router;