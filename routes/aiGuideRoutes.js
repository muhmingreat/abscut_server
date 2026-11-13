
const express = require("express");
const { rateLimit } = require("express-rate-limit");

const {
  chatWithAIGuide,
} = require("../controllers/aiGuideController");

const router = express.Router();

// =====================================================
// ABS CUT AI GUIDE — RATE LIMITER
// =====================================================

const aiGuideLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Maximum 10 requests per IP
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message:
      "You've reached the AI Guide request limit. Please try again later.",
  },
});

// =====================================================
// AI CHAT ROUTE
// =====================================================

router.post(
  "/chat",
  aiGuideLimiter,
  chatWithAIGuide
)

module.exports = router;
