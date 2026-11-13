const AIOutfitPreviewUsage = require("../models/AIOutfitPreviewUsage");

const DAILY_PREVIEW_LIMIT = 3;

// Uses UTC dates, so the daily limit resets at midnight UTC.
const getDateKey = () => new Date().toISOString().slice(0, 10);

const getAIOutfitPreviewUsage = async (req, res) => {
  try {
    const dateKey = getDateKey();

    const usage = await AIOutfitPreviewUsage.findOne({
      user: req.user._id,
      dateKey,
    }).lean();

    const used = usage?.count || 0;

    return res.status(200).json({
      success: true,
      usage: {
        used,
        limit: DAILY_PREVIEW_LIMIT,
        remaining: Math.max(0, DAILY_PREVIEW_LIMIT - used),
        dateKey,
      },
    });
  } catch (error) {
    console.error("AI preview usage error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve AI preview usage.",
    });
  }
};

module.exports = {
  DAILY_PREVIEW_LIMIT,
  getDateKey,
  getAIOutfitPreviewUsage,
};