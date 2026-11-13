
const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const {
  getActiveDeliveryZones,
  calculateDeliveryQuote,
  getAdminDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
} = require("../controllers/deliveryController");

const protect = authMiddleware;
const { adminOnly } = authMiddleware;

const router = express.Router();

// Public: View active delivery zones.
router.get("/zones", getActiveDeliveryZones);

// Authenticated customers: Calculate delivery fee.
router.post("/quote", protect, calculateDeliveryQuote);

// Admin-only delivery zone management.
router.get(
  "/admin/zones",
  protect,
  adminOnly,
  getAdminDeliveryZones
);

router.post(
  "/admin/zones",
  protect,
  adminOnly,
  createDeliveryZone
);

router.put(
  "/admin/zones/:id",
  protect,
  adminOnly,
  updateDeliveryZone
);

router.delete(
  "/admin/zones/:id",
  protect,
  adminOnly,
  deleteDeliveryZone
);

module.exports = router;
