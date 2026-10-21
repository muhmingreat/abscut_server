
const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

// =====================================================
// HELPERS
// =====================================================

const isValidId = (id) => mongoose.isValidObjectId(id);

const isAdminUser = (user) =>
  String(user?.role || "").toLowerCase() === "admin";

const canAccessConversation = (conversation, user) => {
  if (isAdminUser(user)) return true;

  return (
    String(conversation.customer) === String(user._id)
  );
};

// =====================================================
// CUSTOMER: CREATE OR REUSE AN OPEN CONVERSATION
// =====================================================

const startConversation = async (req, res) => {
  try {
    const customerId = req.user?._id;

    if (!customerId || !isValidId(customerId)) {
      return res.status(401).json({
        success: false,
        message: "Please sign in to start a conversation.",
      });
    }

    const subject =
      String(req.body?.subject || "ABS CUT Customer Support")
        .trim()
        .slice(0, 150) || "ABS CUT Customer Support";

    let conversation = await Conversation.findOne({
      customer: customerId,
      status: "open",
    }).sort({ updatedAt: -1 });

    if (!conversation) {
      conversation = await Conversation.create({
        customer: customerId,
        subject,
        status: "open",
      });
    }

    return res.status(200).json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("Start conversation error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not start the conversation.",
    });
  }
};

// =====================================================
// CUSTOMER: GET THEIR CONVERSATIONS
// =====================================================

const getMyConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      customer: req.user._id,
    }).sort({ updatedAt: -1 });

    return res.json({
      success: true,
      conversations,
    });
  } catch (error) {
    console.error("Get customer conversations error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load your conversations.",
    });
  }
};

// =====================================================
// ADMIN: GET ALL CONVERSATIONS
// =====================================================

const getAllConversations = async (req, res) => {
  try {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Administrator access required.",
      });
    }

    const conversations = await Conversation.find()
      .populate("customer", "name email role")
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    return res.json({
      success: true,
      conversations,
    });
  } catch (error) {
    console.error("Get all conversations error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load conversations.",
    });
  }
};

// =====================================================
// GET MESSAGES FOR AN AUTHORIZED CONVERSATION
// =====================================================

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!isValidId(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID.",
      });
    }

    const conversation =
      await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You cannot access this conversation.",
      });
    }

    const messages = await Message.find({
      conversation: conversation._id,
    })
      .populate("sender", "name role")
      .sort({ createdAt: 1 })
      .limit(200);

    return res.json({
      success: true,
      conversation,
      messages,
    });
  } catch (error) {
    console.error("Get messages error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not load messages.",
    });
  }
};

// =====================================================
// SEND MESSAGE THROUGH HTTP
// =====================================================

const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const text = String(req.body?.text || "").trim();

    if (!isValidId(conversationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid conversation ID.",
      });
    }

    if (!text || text.length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Message must contain 1–2000 characters.",
      });
    }

    const conversation =
      await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    if (!canAccessConversation(conversation, req.user)) {
      return res.status(403).json({
        success: false,
        message: "You cannot send messages in this conversation.",
      });
    }

    // Mark messages as read when the authorized user opens the conversation.
if (isAdminUser(req.user)) {
  conversation.unreadByAdmin = 0;
} else {
  conversation.unreadByCustomer = 0;
}

await conversation.save();

    if (conversation.status !== "open") {
      return res.status(409).json({
        success: false,
        message: "This conversation is not open.",
      });
    }

    const admin = isAdminUser(req.user);

    const message = await Message.create({
      conversation: conversation._id,
      sender: req.user._id,
      senderRole: admin ? "admin" : "customer",
      text,
    });

    conversation.lastMessage = text;
    conversation.lastMessageAt = message.createdAt;

    if (admin) {
      conversation.unreadByCustomer =
        (conversation.unreadByCustomer || 0) + 1;
      conversation.unreadByAdmin = 0;
    } else {
      conversation.unreadByAdmin =
        (conversation.unreadByAdmin || 0) + 1;
      conversation.unreadByCustomer = 0;
    }

    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name role");

    return res.status(201).json({
      success: true,
      conversationId: String(conversation._id),
      message: populatedMessage,
    });
  } catch (error) {
    console.error("Send message error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not send the message.",
    })
  }
};

module.exports = {
  startConversation,
  getMyConversations,
  getAllConversations,
  getMessages,
  sendMessage,
};








