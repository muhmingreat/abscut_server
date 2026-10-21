const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");

const {
  getAdminProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getAdminProductById,
} = require("../controllers/adminProductController");

const protect = authMiddleware;
const { adminOnly } = authMiddleware;

const router = express.Router();

router.get(
  "/",
  protect,
  adminOnly,
  getAdminProducts
);


router.get(
  "/:id",
  protect,
  adminOnly,
  getAdminProductById
);



router.post(
  "/",
  protect,
  adminOnly,
  createProduct
);

router.put(
  "/:id",
  protect,
  adminOnly,
  updateProduct
);

router.delete(
  "/:id",
  protect,
  adminOnly,
  deleteProduct
);

module.exports = router;

