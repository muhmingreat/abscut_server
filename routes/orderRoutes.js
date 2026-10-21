const express = require("express");

const protect = require("../middleware/authMiddleware");

const {
  createOrder,
  getMyOrders,
  getOrderById,
  getReceiptById,
} = require("../controllers/orderController");

const router = express.Router();

// =========================================================
// CREATE ORDER
// =========================================================

router.post(
  "/",
  protect,
  createOrder
);

// =========================================================
// GET MY ORDERS
// =========================================================

router.get(
  "/my-orders",
  protect,
  getMyOrders
);

// =========================================================
// GET SINGLE ORDER
// =========================================================

router.get(
  "/:id",
  protect,
  getOrderById
);

router.get(
  "/:id/receipt",
  protect,
  getReceiptById
);



module.exports = router;