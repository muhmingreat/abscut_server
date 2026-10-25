
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

// =========================================================
// ABS CUT — ROUTES
// =========================================================

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
const productEngagementRoutes = require("./routes/productEngagementRoutes");

const initializeChatSocket = require("./socket/chatSocket");
const connectDB = require("./config/db");

// =========================================================
// APP & SERVER
// =========================================================

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// =========================================================
// CORS — ALLOWED FRONTEND ORIGINS
// =========================================================

const allowedOrigins = [
  "http://localhost:5173",
  "https://abscut-client.vercel.app",
];

if (process.env.FRONTEND_URL) {
  const frontendUrl = process.env.FRONTEND_URL.replace(/\/$/, "");

  if (!allowedOrigins.includes(frontendUrl)) {
    allowedOrigins.push(frontendUrl);
  }
}

const corsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

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
app.use("/api/product-engagement", productEngagementRoutes);

// =========================================================
// SOCKET.IO — CUSTOMER SUPPORT CHAT
// =========================================================

const io = new Server(server, {
  cors: corsOptions,
});

initializeChatSocket(io);

// =========================================================
// DATABASE & START SERVER
// =========================================================

async function startServer() {
  try {
    await connectDB();

    server.listen(PORT, () => {
      console.log(`ABS CUT API running on port ${PORT}`);
    });
  } catch (error) {
    console.error("ABS CUT server startup failed:", error);
    process.exit(1);
  }
}

startServer();
