const express = require("express");

const protect = require("../middleware/authMiddleware");

const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  mergeCart,
} = require("../controllers/cartController");

const router = express.Router();

// Get customer's cart
router.get("/", protect, getCart);

// Add product to cart
router.post("/", protect, addToCart);

router.post("/merge", protect, mergeCart);

// Update product quantity
router.put("/:productId", protect, updateCartItem);

// Remove product from cart
router.delete("/:productId", protect, removeFromCart);

// Clear entire cart
router.delete("/", protect, clearCart);

module.exports = router;
