
const Product = require("../models/Product");

/* =========================================================
   HELPERS
========================================================= */

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (value === true || value === "true" || value === 1 || value === "1") {
    return true;
  }

  if (value === false || value === "false" || value === 0 || value === "0") {
    return false;
  }

  return null;
};

const parseNumber = (value, fieldName, options = {}) => {
  if (value === undefined || value === null || value === "") {
    return options.defaultValue;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  if (options.min !== undefined && number < options.min) {
    throw new Error(`${fieldName} cannot be less than ${options.min}.`);
  }

  return number;
};

const parseDigitalFiles = (files) => {
  if (!Array.isArray(files)) {
    throw new Error("Digital files must be provided as an array.");
  }

  const allowedFormats = ["DST", "PES", "JEF", "EXP"];

  const seenFormats = new Set();

  return files.map((file) => {
    const format = String(file.format || "").toUpperCase();

    if (!allowedFormats.includes(format)) {
      throw new Error(
        `Unsupported embroidery format: ${format || "unknown"}.`
      );
    }

    if (seenFormats.has(format)) {
      throw new Error(`Only one ${format} file is allowed per product.`);
    }

    seenFormats.add(format);

    if (!file.storageKey || !file.originalName) {
      throw new Error(
        `The ${format} file is missing its storage information.`
      );
    }

    return {
      format,
      storageKey: String(file.storageKey),
      originalName: String(file.originalName),
      fileSize: parseNumber(file.fileSize, "File size", {
        defaultValue: 0,
        min: 0,
      }),
    };
  });
};

const getErrorStatus = (error) => {
  if (
    error.name === "ValidationError" ||
    error.name === "CastError" ||
    error.message.includes("must be") ||
    error.message.includes("cannot be") ||
    error.message.includes("Unsupported") ||
    error.message.includes("Only one") ||
    error.message.includes("missing its storage")
  ) {
    return 400;
  }

  return 500;
};

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

/* =========================================================
   ADMIN — GET SINGLE PRODUCT
========================================================= */

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

      productType,
      priceUnit,
      stockInYards,

      digitalAvailable,
      digitalPrice,
      digitalFiles,

      physicalAvailable,
      physicalPrice,

      deliveryAvailable,
      deliveryFee,
    } = req.body;

    if (!name?.trim() || !category?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Product name and category are required.",
      });
    }

    if (!image?.trim() && !video?.trim()) {
      return res.status(400).json({
        success: false,
        message: "At least one product image or video is required.",
      });
    }

    // Preserve compatibility with the existing required price field.
    const finalPrice = parseNumber(
      price !== undefined
        ? price
        : physicalPrice !== undefined
          ? physicalPrice
          : digitalPrice,
      "Product price",
      { min: 0 }
    );

    if (finalPrice === undefined) {
      return res.status(400).json({
        success: false,
        message: "Product price is required.",
      });
    }

    const parsedFeatured = parseBoolean(featured, false);
    const parsedActive = parseBoolean(active, true);
    const parsedDigitalAvailable = parseBoolean(
      digitalAvailable,
      false
    );
    const parsedPhysicalAvailable = parseBoolean(
      physicalAvailable,
      true
    );
    const parsedDeliveryAvailable = parseBoolean(
      deliveryAvailable,
      false
    );

    if (
      parsedFeatured === null ||
      parsedActive === null ||
      parsedDigitalAvailable === null ||
      parsedPhysicalAvailable === null ||
      parsedDeliveryAvailable === null
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more boolean fields contain invalid values.",
      });
    }

    const productData = {
      name: name.trim(),
      category: category.trim(),
      price: finalPrice,

      image: image?.trim() || "",
      video: video?.trim() || "",
      description: description?.trim() || "",

      stock: parseNumber(stock, "Stock", {
        defaultValue: 0,
        min: 0,
      }),

      featured: parsedFeatured,
      active: parsedActive,

      productType: productType || "ready_to_wear",
      priceUnit: priceUnit || "piece",

      stockInYards: parseNumber(stockInYards, "Stock in yards", {
        defaultValue: 0,
        min: 0,
      }),

      digitalAvailable: parsedDigitalAvailable,

      digitalPrice: parseNumber(digitalPrice, "Digital price", {
        defaultValue: 0,
        min: 0,
      }),

      physicalAvailable: parsedPhysicalAvailable,

      physicalPrice: parseNumber(physicalPrice, "Physical price", {
        defaultValue: null,
        min: 0,
      }),

      deliveryAvailable: parsedDeliveryAvailable,

      deliveryFee: parseNumber(deliveryFee, "Delivery fee", {
        defaultValue: 0,
        min: 0,
      }),
    };

    if (digitalFiles !== undefined) {
      productData.digitalFiles = parseDigitalFiles(digitalFiles);
    }

    const product = await Product.create(productData);

    res.status(201).json({
      success: true,
      message: "Product created successfully.",
      product,
    });
  } catch (error) {
    console.error("Create product error:", error);

    res.status(getErrorStatus(error)).json({
      success: false,
      message:
        getErrorStatus(error) === 400
          ? error.message
          : "Unable to create product.",
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

      productType,
      priceUnit,
      stockInYards,

      digitalAvailable,
      digitalPrice,
      digitalFiles,

      physicalAvailable,
      physicalPrice,

      deliveryAvailable,
      deliveryFee,
    } = req.body;

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Product name cannot be empty.",
        });
      }

      product.name = name.trim();
    }

    if (category !== undefined) {
      if (!category.trim()) {
        return res.status(400).json({
          success: false,
          message: "Product category cannot be empty.",
        });
      }

      product.category = category.trim();
    }

    if (price !== undefined) {
      product.price = parseNumber(price, "Product price", {
        min: 0,
      });
    }

    if (image !== undefined) {
      product.image = image?.trim() || "";
    }

    if (video !== undefined) {
      product.video = video?.trim() || "";
    }

    if (description !== undefined) {
      product.description = description.trim();
    }

    if (stock !== undefined) {
      product.stock = parseNumber(stock, "Stock", {
        min: 0,
      });
    }

    if (featured !== undefined) {
      const value = parseBoolean(featured);

      if (value === null) {
        return res.status(400).json({
          success: false,
          message: "Invalid featured value.",
        });
      }

      product.featured = value;
    }

    if (active !== undefined) {
      const value = parseBoolean(active);

      if (value === null) {
        return res.status(400).json({
          success: false,
          message: "Invalid active value.",
        });
      }

      product.active = value;
    }

    if (productType !== undefined) {
      product.productType = productType;
    }

    if (priceUnit !== undefined) {
      product.priceUnit = priceUnit;
    }

    if (stockInYards !== undefined) {
      product.stockInYards = parseNumber(
        stockInYards,
        "Stock in yards",
        { min: 0 }
      );
    }

    if (digitalAvailable !== undefined) {
      const value = parseBoolean(digitalAvailable);

      if (value === null) {
        return res.status(400).json({
          success: false,
          message: "Invalid digital availability value.",
        });
      }

      product.digitalAvailable = value;
    }

    if (digitalPrice !== undefined) {
      product.digitalPrice = parseNumber(
        digitalPrice,
        "Digital price",
        { min: 0 }
      );
    }

    if (digitalFiles !== undefined) {
      product.digitalFiles = parseDigitalFiles(digitalFiles);
    }

    if (physicalAvailable !== undefined) {
      const value = parseBoolean(physicalAvailable);

      if (value === null) {
        return res.status(400).json({
          success: false,
          message: "Invalid physical availability value.",
        });
      }

      product.physicalAvailable = value;
    }

    if (physicalPrice !== undefined) {
      product.physicalPrice =
        physicalPrice === null || physicalPrice === ""
          ? null
          : parseNumber(physicalPrice, "Physical price", {
              min: 0,
            });
    }

    if (deliveryAvailable !== undefined) {
      const value = parseBoolean(deliveryAvailable);

      if (value === null) {
        return res.status(400).json({
          success: false,
          message: "Invalid delivery availability value.",
        });
      }

      product.deliveryAvailable = value;
    }

    if (deliveryFee !== undefined) {
      product.deliveryFee = parseNumber(deliveryFee, "Delivery fee", {
        min: 0,
      });
    }

    await product.save();

    res.status(200).json({
      success: true,
      message: "Product updated successfully.",
      product,
    });
  } catch (error) {
    console.error("Update product error:", error);

    res.status(getErrorStatus(error)).json({
      success: false,
      message:
        getErrorStatus(error) === 400
          ? error.message
          : "Unable to update product.",
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

    // Deactivate instead of permanently deleting.
    // This protects existing order history.

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
