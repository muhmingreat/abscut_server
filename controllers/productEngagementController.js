
const mongoose = require("mongoose");

const Product = require("../models/Product");
const ProductReview = require("../models/ProductReview");
const ProductLike = require("../models/ProductLike");

const getCustomerId = (req) =>
  req.user?._id || req.user?.id;

const isValidId = (id) =>
  mongoose.isValidObjectId(id);

// ==========================================
// GET REVIEWS AND RATING SUMMARY
// ==========================================

const getProductReviews = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID.",
      });
    }

    const product = await Product.findOne({
      _id: id,
      active: true,
    }).select("_id");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    const [reviews, summary] = await Promise.all([
      ProductReview.find({ product: id })
        .populate("customer", "firstName lastName name")
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
        

      ProductReview.aggregate([
        {
          $match: {
            product: new mongoose.Types.ObjectId(id),
          },
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            totalReviews: { $sum: 1 },
          },
        },
      ]),
    ]);

    const result = summary[0] || {
      averageRating: 0,
      totalReviews: 0,
    };

    const likes = await ProductLike.countDocuments({
      product: id,
    });

    const customerId = getCustomerId(req);

    const liked = customerId
      ? Boolean(
          await ProductLike.exists({
            product: id,
            customer: customerId,
          })
        )
      : false;

    return res.status(200).json({
      success: true,
      reviews,
      averageRating: Number(
        (result.averageRating || 0).toFixed(1)
      ),
      totalReviews: result.totalReviews || 0,
      likeCount: likes,
      liked,
    });
  } catch (error) {
    console.error("Get product reviews error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load product reviews.",
    });
  }
};

// ==========================================
// CREATE OR UPDATE A REVIEW
// ==========================================

const saveProductReview = async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Please sign in to review this product.",
      });
    }

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID.",
      });
    }

    const numericRating = Number(rating);
    const cleanComment =
      typeof comment === "string" ? comment.trim() : "";

    if (
      !Number.isInteger(numericRating) ||
      numericRating < 1 ||
      numericRating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Choose a rating from 1 to 5 stars.",
      });
    }

    if (
      cleanComment.length < 2 ||
      cleanComment.length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message: "Your review must contain 2–1000 characters.",
      });
    }

    const product = await Product.findOne({
      _id: id,
      active: true,
    }).select("_id");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    const review = await ProductReview.findOneAndUpdate(
      {
        product: id,
        customer: customerId,
      },
      {
        $set: {
          rating: numericRating,
          comment: cleanComment,
        },
        $setOnInsert: {
          product: id,
          customer: customerId,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Your review has been saved.",
      review,
    });
  } catch (error) {
    console.error("Save product review error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A review already exists. Please reload and try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to save your review.",
    });
  }
};

// ==========================================
// DELETE YOUR OWN REVIEW
// ==========================================

const deleteProductReview = async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { id } = req.params;

    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Please sign in first.",
      });
    }

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID.",
      });
    }

    const deleted = await ProductReview.findOneAndDelete({
      _id: id,
      customer: customerId,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Review not found or you cannot delete it.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Your review has been deleted.",
    });
  } catch (error) {
    console.error("Delete product review error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to delete your review.",
    });
  }
};

// ==========================================
// LIKE / UNLIKE A PRODUCT
// ==========================================

const toggleProductLike = async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { id } = req.params;

    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Please sign in to like this product.",
      });
    }

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID.",
      });
    }

    const product = await Product.findOne({
      _id: id,
      active: true,
    }).select("_id");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    const existingLike = await ProductLike.findOne({
      product: id,
      customer: customerId,
    });

    let liked;

    if (existingLike) {
      await ProductLike.deleteOne({
        _id: existingLike._id,
      });

      liked = false;
    } else {
      try {
        await ProductLike.create({
          product: id,
          customer: customerId,
        });

        liked = true;
      } catch (error) {
        // Handles two rapid requests for the same like.
        if (error.code !== 11000) {
          throw error;
        }

        liked = true;
      }
    }

    const likeCount = await ProductLike.countDocuments({
      product: id,
    });

    return res.status(200).json({
      success: true,
      liked,
      likeCount,
    });
  } catch (error) {
    console.error("Toggle product like error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update product like.",
    });
  }
};

// ==========================================
// ADD A REPLY TO A PRODUCT REVIEW
// ==========================================

const addReviewReply = async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { id } = req.params;
    const comment =
      typeof req.body.comment === "string"
        ? req.body.comment.trim()
        : "";

    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Please sign in to reply.",
      });
    }

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review ID.",
      });
    }

    if (comment.length < 2 || comment.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Your reply must contain 2–1000 characters.",
      });
    }

    const review = await ProductReview.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found.",
      });
    }

    review.replies.push({
      customer: customerId,
      comment,
    });

    await review.save();

    const savedReview = await ProductReview.findById(id)
      .populate("customer", "firstName lastName name")
      .populate("replies.customer", "firstName lastName name");

    return res.status(201).json({
      success: true,
      message: "Your reply has been added.",
      review: savedReview,
    });
  } catch (error) {
    console.error("Add review reply error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to add your reply.",
    });
  }
};

// ==========================================
// EDIT YOUR OWN REVIEW REPLY
// ==========================================

const editReviewReply = async (req, res) => {
  try {
    const customerId = getCustomerId(req);
    const { id, replyId } = req.params;
    const comment =
      typeof req.body.comment === "string"
        ? req.body.comment.trim()
        : "";

    if (!customerId) {
      return res.status(401).json({
        success: false,
        message: "Please sign in first.",
      });
    }

    if (!isValidId(id) || !isValidId(replyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid review or reply ID.",
      });
    }

    if (comment.length < 2 || comment.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Your reply must contain 2–1000 characters.",
      });
    }

    const review = await ProductReview.findById(id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found.",
      });
    }

    const reply = review.replies.id(replyId);

    if (!reply) {
      return res.status(404).json({
        success: false,
        message: "Reply not found.",
      });
    }

    if (reply.customer.toString() !== customerId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own reply.",
      });
    }

    reply.comment = comment;

    await review.save();

    const savedReview = await ProductReview.findById(id)
      .populate("customer", "firstName lastName name")
      .populate("replies.customer", "firstName lastName name");

    return res.status(200).json({
      success: true,
      message: "Your reply has been updated.",
      review: savedReview,
    });
  } catch (error) {
    console.error("Edit review reply error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to edit your reply.",
    });
  }
};

module.exports = {
  getProductReviews,
  saveProductReview,
  deleteProductReview,
  toggleProductLike,
  addReviewReply,
  editReviewReply,
};