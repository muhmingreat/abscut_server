const mongoose = require("mongoose");
require("dotenv").config();

const Product = require("./models/Product");

const products = [
  {
    name: "Classic Royal Agbada",
    category: "Agbada",
    price: 150000,
    image: "/images/agbada.png",
    description:
      "A premium classic agbada designed for a refined and elegant appearance.",
    stock: 10,
    featured: true,
    active: true,
  },

  {
    name: "Premium Senator",
    category: "Senator",
    price: 120000,
    image: "/images/senator.png",
    description:
      "A sophisticated senator outfit crafted for comfort and style.",
    stock: 10,
    featured: true,
    active: true,
  },

  {
    name: "Luxury Native Caftan",
    category: "Caftan",
    price: 100000,
    image: "/images/caftan.png",
    description:
      "A stylish native caftan suitable for special occasions and everyday elegance.",
    stock: 8,
    featured: true,
    active: true,
  },

  {
    name: "Classic Native Wear",
    category: "Native Wear",
    price: 85000,
    image: "/images/native-wear.png",
    description:
      "Premium native wear combining traditional style with modern finishing.",
    stock: 12,
    featured: false,
    active: true,
  },

  {
    name: "Premium Fashion Material",
    category: "Materials",
    price: 45000,
    image: "/images/material.png",
    description:
      "Quality fashion material suitable for custom native outfits.",
    stock: 20,
    featured: false,
    active: true,
  },
];

const seedProducts = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected.");

    await Product.deleteMany();

    console.log("Existing products cleared.");

    const createdProducts =
      await Product.insertMany(products);

    console.log(
      `${createdProducts.length} products inserted successfully.`
    );

    await mongoose.connection.close();

    console.log("MongoDB connection closed.");

    process.exit(0);
  } catch (error) {
    console.error(
      "Product seeding failed:",
      error
    );

    await mongoose.connection.close();

    process.exit(1);
  }
};

seedProducts();