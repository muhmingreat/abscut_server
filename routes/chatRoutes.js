
const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/authMiddleware");

const {
  startConversation,
  getMyConversations,
  getAllConversations,
  getMessages,
  sendMessage,
} = require("../controllers/chatController");

// All routes require login.
router.use(protect);

// Customer routes.
router.post("/conversations", startConversation);
router.get("/conversations/mine", getMyConversations);

// Admin-only inbox.
router.get(
  "/admin/conversations",
  adminOnly,
  getAllConversations
);

// Both the conversation's customer and admin can access these.
router.get(
  "/conversations/:conversationId/messages",
  getMessages
);

router.post(
  "/conversations/:conversationId/messages",
  sendMessage
);

module.exports = router;
