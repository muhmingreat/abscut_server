const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const http = require("http");
const { Server } = require("socket.io");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const productRoutes = require("./routes/productRoutes");
const cartRoutes = require("./routes/cartRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const adminProductRoutes = require("./routes/adminProductRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const customOrderRoutes = require("./routes/customOrderRoutes");
const contactRoutes = require("./routes/contactRoutes");
const chatRoutes = require("./routes/chatRoutes");

const initializeChatSocket = require("./socket/chatSocket");
const connectDB = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// =========================================================
// ABS CUT — ALLOWED FRONTEND ORIGINS
// =========================================================

const allowedOrigins = [
  "http://localhost:5173",
  "https://abscut-client.vercel.app",
];

// Add any additional configured frontend origin.
if (
  process.env.FRONTEND_URL &&
  !allowedOrigins.includes(process.env.FRONTEND_URL.replace(/\/$/, ""))
) {
  allowedOrigins.push(
    process.env.FRONTEND_URL.replace(/\/$/, "")
  );
}

const corsOptions = {
  origin: allowedOrigins,
  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],
};

// =========================================================
// SOCKET.IO — CUSTOMER SUPPORT CHAT
// =========================================================

const io = new Server(server, {
  cors: {
    ...corsOptions,
  },
});

initializeChatSocket(io);

// =========================================================
// DATABASE
// =========================================================

connectDB();

// =========================================================
// EXPRESS MIDDLEWARE
// =========================================================

app.use(cors(corsOptions));

app.use(express.json({ limit: "10mb" }));

app.use(express.urlencoded({ extended: true }));

// =========================================================
// HEALTH CHECK
// =========================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "ABS CUT API is running",
  });
});

// =========================================================
// API ROUTES
// =========================================================

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/products", adminProductRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/custom-orders", customOrderRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/chat", chatRoutes);

// =========================================================
// START SERVER
// =========================================================

server.listen(PORT, () => {
  console.log(`ABS CUT API running on port ${PORT}`);
});








// const path = require("path");
// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");
// dotenv.config()

// const mongoose = require("mongoose");
// const http = require("http");
// const { Server } = require("socket.io");
// const jwt = require("jsonwebtoken");

// const authRoutes = require("./routes/authRoutes");
// const userRoutes = require("./routes/userRoutes");
// const productRoutes = require("./routes/productRoutes");
// const cartRoutes = require("./routes/cartRoutes");
// const orderRoutes = require("./routes/orderRoutes");
// const paymentRoutes = require("./routes/paymentRoutes");
// const adminRoutes = require("./routes/adminRoutes");
// const adminProductRoutes = require("./routes/adminProductRoutes");
// const uploadRoutes = require("./routes/uploadRoutes");
// const customOrderRoutes = require("./routes/customOrderRoutes");
// const contactRoutes = require("./routes/contactRoutes");
// const chatRoutes = require("./routes/chatRoutes");

// // const Conversation = require("./models/Conversation");
// // const Message = require("./models/Message");
// // const User = require("./models/User");

// const initializeChatSocket = require("./socket/chatSocket");
// const connectDB = require("./config/db");

// const app = express();
// const PORT = process.env.PORT || 5000;
// const server = http.createServer(app);

// const frontendOrigin =
//   process.env.FRONTEND_URL || "http://localhost:5173";

// const io = new Server(server, {
//   cors: {
//     origin: frontendOrigin,
//     methods: ["GET", "POST"],
//   },
// });

// initializeChatSocket(io);


// connectDB();

// // =========================================================
// // HEALTH CHECK
// // =========================================================
// // =========================================================
// // ABS CUT — EXPRESS MIDDLEWARE
// // =========================================================

// app.use(
//   cors({
//     origin: frontendOrigin,
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//   })
// );

// app.use(express.json({ limit: "10mb" }));

// app.use(express.urlencoded({ extended: true }));

// app.get("/", (req, res) => {
//   res.json({
//     success: true,
//     message: "ABS CUT API is running",
//   });
// });

// // =========================================================
// // API ROUTES
// // =========================================================

// app.use("/api/auth", authRoutes);
// app.use("/api/users", userRoutes);
// app.use("/api/products", productRoutes);
// app.use("/api/cart", cartRoutes);
// app.use("/api/orders", orderRoutes);
// app.use("/api/payments", paymentRoutes);
// app.use("/api/admin", adminRoutes);
// app.use("/api/admin/products", adminProductRoutes);
// app.use("/api/uploads", uploadRoutes);
// app.use("/api/custom-orders", customOrderRoutes);
// app.use("/api/contact", contactRoutes);
// app.use("/api/chat", chatRoutes);

// // =========================================================
// // START SERVER
// // =========================================================

// server.listen(PORT, () => {
//   console.log(`ABS CUT API running on port ${PORT}`);
// });








