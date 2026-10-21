
const axios = require("axios");

const flutterwave = axios.create({
  baseURL: "https://api.flutterwave.com/v3",
  headers: {
    "Content-Type": "application/json",
  },
});

flutterwave.interceptors.request.use((config) => {
  const secretKey = process.env.FLW_SECRET_KEY;

  if (!secretKey) {
    throw new Error("FLW_SECRET_KEY is not configured.");
  }

  config.headers.Authorization = `Bearer ${secretKey}`;

  return config;
});

module.exports = flutterwave;
