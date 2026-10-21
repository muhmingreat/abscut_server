const Product = require("../models/Product");

/* =========================================================
   CUSTOMER — GET ACTIVE PRODUCTS
========================================================= */

const getProducts = async (req, res) => {
  try {
    const products = await Product.find({
      active: true,
    }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Get products error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load products.",
    });
  }
};

/* =========================================================
   CUSTOMER — GET SINGLE ACTIVE PRODUCT
========================================================= */

const getProductById = async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      active: true,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Get product error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load product.",
    });
  }
};

/* =========================================================
   ADMIN — GET ALL PRODUCTS
========================================================= */

const getAdminProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: products.length,
      products,
    });
  } catch (error) {
    console.error("Get admin products error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load admin products.",
    });
  }
};

/* ADMIN — GET SINGLE PRODUCT */

const getAdminProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("Get admin product error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load product.",
    });
  }
};

/* =========================================================
   ADMIN — CREATE PRODUCT
========================================================= */

const createProduct = async (req, res) => {
  try {
    const {
      name,
      category,
      price,
      image,
      video,
      description,
      stock,
      featured,
      active,
    } = req.body;

    if (!name || !category || price === undefined || (!image && !video)) {
      return res.status(400).json({
        success: false,
        message: "Product name, category, price and at least one media file are required."
      });
    }

    const product = await Product.create({
      name: name.trim(),
      category: category.trim(),
      price: Number(price),
      image: image.trim() || "",
      video: video?.trim() || "",
      description: description?.trim() || "",
      stock: Number(stock) || 0,
      featured: Boolean(featured),
      active: active === undefined ? true : Boolean(active),
    });

    res.status(201).json({
      success: true,
      message: "Product created successfully.",
      product,
    });
  } catch (error) {
    console.error("Create product error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create product.",
    });
  }
};

/* =========================================================
   ADMIN — UPDATE PRODUCT
========================================================= */

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      category,
      price,
      image,
      video,
      description,
      stock,
      featured,
      active,
    } = req.body;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    if (name !== undefined) {
      product.name = name.trim();
    }

    if (category !== undefined) {
      product.category = category.trim();
    }

    if (price !== undefined) {
      product.price = Number(price);
    }

    if (image !== undefined) {
      product.image = image.trim();
    }

    if (video !== undefined) {
      product.video = video.trim()


    }

    if (description !== undefined) {
      product.description = description.trim();
    }

    if (stock !== undefined) {
      product.stock = Number(stock);
    }

    if (featured !== undefined) {
      product.featured = Boolean(featured);
    }

    if (active !== undefined) {
      product.active = Boolean(active);
    }

    await product.save();

    res.status(200).json({
      success: true,
      message: "Product updated successfully.",
      product,
    });
  } catch (error) {
    console.error("Update product error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update product.",
    });
  }
};

/* =========================================================
   ADMIN — DEACTIVATE PRODUCT
========================================================= */

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    /*
      We deactivate products instead of
      permanently deleting them.

      This protects existing order history.
    */

    product.active = false;

    await product.save();

    res.status(200).json({
      success: true,
      message: "Product deactivated successfully.",
      product,
    });
  } catch (error) {
    console.error("Delete product error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to deactivate product.",
    });
  }
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getProducts,
  getProductById,

  getAdminProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getAdminProductById,
};
