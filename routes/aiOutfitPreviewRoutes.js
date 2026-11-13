const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");

const {
  generateOutfitPreview,
} = require("../controllers/aiOutfitPreviewController");

const {
  getAIOutfitPreviewUsage,
} = require("../controllers/aiOutfitPreviewUsageController");

router.get("/usage", protect, getAIOutfitPreviewUsage);
router.post("/", protect, generateOutfitPreview);

module.exports = router;