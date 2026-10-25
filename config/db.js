const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error("MONGO_URI is missing from the environment.");
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("ABS CUT MongoDB connected successfully.");

    return mongoose.connection;
  } catch (error) {
    console.error("ABS CUT MongoDB connection failed:", error.message);
    throw error;
  }
};

module.exports = connectDB;
