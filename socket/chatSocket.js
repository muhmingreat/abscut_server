
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");

const isAdminUser = (user) =>
  String(user?.role || "").toLowerCase() === "admin";

module.exports = function initializeChatSocket(io) {
  // Authenticate every socket connection.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      if (!process.env.JWT_SECRET) {
        return next(new Error("Server authentication is not configured"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!mongoose.isValidObjectId(decoded.userId)) {
        return next(new Error("Invalid authentication token"));
      }

      const user = await User.findById(decoded.userId)
        .select("_id role name email");

      if (!user) {
        return next(new Error("User account not found"));
      }

      socket.user = user;
      next();
    } catch (error) {
      console.error("Chat socket authentication:", error.message);
      next(new Error("Invalid or expired authentication token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    const userId = String(user._id);
    const isAdmin = isAdminUser(user);
    const userRoom = `user:${userId}`;
    const adminRoom = "admins";
    const joinedConversations = new Set();

    socket.join(userRoom);

    if (isAdmin) {
      socket.join(adminRoom);
    }

    console.log(
      `[CHAT CONNECTED] user=${userId} role=${user.role} socket=${socket.id}`
    );

    async function findAuthorizedConversation(conversationId) {
      if (!mongoose.isValidObjectId(conversationId)) {
        return { error: "Invalid conversation ID." };
      }

      const conversation = await Conversation.findById(conversationId);

      if (!conversation) {
        return { error: "Conversation not found." };
      }

      if (
        !isAdmin &&
        String(conversation.customer) !== userId
      ) {
        return { error: "You cannot access this conversation." };
      }

      return { conversation };
    }

    // Join one authorized conversation.
    socket.on("chat:join", async (payload, acknowledge) => {
      const ack =
        typeof acknowledge === "function" ? acknowledge : () => {};

      try {
        const conversationId = String(payload?.conversationId || "");
        const result =
          await findAuthorizedConversation(conversationId);

        if (result.error) {
          return ack({ success: false, message: result.error });
        }

        // Prevent a socket from accumulating unrelated conversation rooms.
        for (const oldId of joinedConversations) {
          if (oldId !== conversationId) {
            socket.leave(`conversation:${oldId}`);
            joinedConversations.delete(oldId);
          }
        }

        socket.join(`conversation:${conversationId}`);
        joinedConversations.add(conversationId);

        console.log(
          `[CHAT JOIN] role=${isAdmin ? "admin" : "customer"} ` +
          `user=${userId} conversation=${conversationId}`
        );

        return ack({ success: true, conversationId });
      } catch (error) {
        console.error("Chat join error:", error);
        return ack({
          success: false,
          message: "Could not join the conversation.",
        });
      }
    });

    
    // Relay typing status only to the authorized conversation.
    socket.on("chat:typing", async (payload) => {
      try {
        const conversationId = String(
          payload?.conversationId || ""
        );

        // A socket must have joined this conversation first.
        if (!joinedConversations.has(conversationId)) {
          return;
        }

        const result =
          await findAuthorizedConversation(conversationId);

        if (result.error) {
          return;
        }

        const isTyping = Boolean(payload?.isTyping);

        // Send to the other participant, not back to the sender.
        socket.to(`conversation:${conversationId}`).emit(
          "chat:typing",
          {
            conversationId,
            senderRole: isAdmin ? "admin" : "customer",
            isTyping,
          }
        );
      } catch (error) {
        console.error("Chat typing error:", error);
      }
    });


    // Persist first, then deliver to the other participant.
    socket.on("chat:send", async (payload, acknowledge) => {
      const ack =
        typeof acknowledge === "function" ? acknowledge : () => {};

      try {
        const conversationId = String(payload?.conversationId || "");
        const text = String(payload?.text || "").trim();

        if (!mongoose.isValidObjectId(conversationId)) {
          return ack({
            success: false,
            message: "Invalid conversation ID.",
          });
        }

        if (!text || text.length > 2000) {
          return ack({
            success: false,
            message: "Message must contain 1–2000 characters.",
          });
        }

        // Require joining the conversation before sending.
        if (!joinedConversations.has(conversationId)) {
          return ack({
            success: false,
            message: "Join the conversation before sending messages.",
          });
        }

        const result =
          await findAuthorizedConversation(conversationId);

        if (result.error) {
          return ack({ success: false, message: result.error });
        }

        const conversation = result.conversation;

        if (conversation.status !== "open") {
          return ack({
            success: false,
            message: "This conversation is not open.",
          });
        }

        const message = await Message.create({
          conversation: conversation._id,
          sender: user._id,
          senderRole: isAdmin ? "admin" : "customer",
          text,
        });

        conversation.lastMessage = text;
        conversation.lastMessageAt = message.createdAt;

        if (isAdmin) {
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

        const updatedConversation = await Conversation.findById(
          conversation._id
        ).populate("customer", "name email");

        const messagePayload = {
          success: true,
          conversationId: String(conversation._id),
          message: populatedMessage,
        };

        const customerRoom =
          `user:${String(conversation.customer._id || conversation.customer)}`;
        const conversationRoom = `conversation:${conversationId}`;

        if (isAdmin) {
          io.to(conversationRoom)
            .to(customerRoom)
            .emit("chat:new_message", messagePayload);
        } else {
          io.to(conversationRoom)
            .to(adminRoom)
            .emit("chat:new_message", messagePayload);
        }

        const updatePayload = {
          success: true,
          conversation: updatedConversation,
        };

        io.to(adminRoom).emit(
          "chat:conversation_updated",
          updatePayload
        );

        io.to(customerRoom).emit(
          "chat:conversation_updated",
          updatePayload
        );

        return ack(messagePayload);
      } catch (error) {
        console.error("Chat send error:", error);
        return ack({
          success: false,
          message: "Could not save or send your message.",
        });
      }
    });

    socket.on("chat:leave", (payload, acknowledge) => {
      const ack =
        typeof acknowledge === "function" ? acknowledge : () => {};
      const conversationId = String(payload?.conversationId || "");

      if (!joinedConversations.has(conversationId)) {
        return ack({ success: true, conversationId });
      }

      socket.leave(`conversation:${conversationId}`);
      joinedConversations.delete(conversationId);

      return ack({ success: true, conversationId });
    });

    socket.on("disconnect", (reason) => {
      console.log(
        `[CHAT DISCONNECTED] user=${userId} reason=${reason}`
      );
    });
  });
};
