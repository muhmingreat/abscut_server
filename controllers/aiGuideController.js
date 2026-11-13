// =====================================================
// ABS CUT — AI GUIDE CONTROLLER
// =====================================================

const {
  generateAssistantReply,
} = require("../services/geminiService");

// =====================================================
// CHAT WITH ABS CUT AI GUIDE
// =====================================================

const chatWithAIGuide = async (req, res) => {
  try {
    const { message, page, history } = req.body;

    // Validate message
    if (
      !message ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter a message.",
      });
    }

    if (message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Your message is too long. Maximum is 2000 characters.",
      });
    }

    // Generate AI response
    const reply = await generateAssistantReply({
      message,
      page: typeof page === "string" ? page : "/",
      history: Array.isArray(history) ? history : [],
    });

    return res.status(200).json({
      success: true,
      reply,
    });
  } catch (error) {
    console.error("ABS CUT AI Guide Error:", error.message);

    return res.status(500).json({
      success: false,
      message:
        "The ABS CUT AI Guide is temporarily unavailable. Please try again shortly.",
    });
  }
};

module.exports = {
  chatWithAIGuide,
};