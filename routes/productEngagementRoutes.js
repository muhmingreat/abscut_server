const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  getProductReviews,
  saveProductReview,
  deleteProductReview,
  toggleProductLike,
  addReviewReply,
  editReviewReply,
} = require("../controllers/productEngagementController");

const router = express.Router();

router.get("/:id/reviews", getProductReviews);

router.put(
  "/:id/reviews",
  authMiddleware,
  saveProductReview
);

router.delete(
  "/reviews/:id",
  authMiddleware,
  deleteProductReview
);

router.post(
  "/:id/like",
  authMiddleware,
  toggleProductLike
);

router.post(
  "/reviews/:id/replies",
  authMiddleware,
  addReviewReply
);

router.put(
  "/reviews/:id/replies/:replyId",
  authMiddleware,
  editReviewReply
);

module.exports = router;
