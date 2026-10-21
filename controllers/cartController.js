const Cart = require("../models/Cart");
const Product = require("../models/Product");

// =========================================================
// GET CUSTOMER CART
// =========================================================

const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({
      user: req.user._id,
    }).populate("items.product");

    // Create an empty cart if the customer does not have one
    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        items: [],
      });

      cart = await Cart.findById(cart._id).populate(
        "items.product"
      );
    }

    res.status(200).json({
      success: true,
      cart,
    });
  } catch (error) {
    console.error("Get cart error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load cart.",
    });
  }
};

// =========================================================
// ADD PRODUCT TO CART
// =========================================================

const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required.",
      });
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be at least 1.",
      });
    }

    const product = await Product.findOne({
      _id: productId,
      active: true,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: "Not enough stock available.",
      });
    }

    let cart = await Cart.findOne({
      user: req.user._id,
    });

    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        items: [],
      });
    }

    const existingItem = cart.items.find(
      (item) =>
        item.product.toString() === productId
    );

    if (existingItem) {
      const newQuantity =
        existingItem.quantity + quantity;

      if (newQuantity > product.stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${product.stock} item(s) available in stock.`,
        });
      }

      existingItem.quantity = newQuantity;
    } else {
      cart.items.push({
        product: productId,
        quantity,
      });
    }

    await cart.save();

    cart = await Cart.findById(cart._id).populate(
      "items.product"
    );

    res.status(200).json({
      success: true,
      message: "Product added to cart.",
      cart,
    });
  } catch (error) {
    console.error("Add to cart error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to add product to cart.",
    });
  }
};

// =========================================================
// UPDATE CART ITEM QUANTITY
// =========================================================

const updateCartItem = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!Number.isInteger(quantity) || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be at least 1.",
      });
    }

    const product = await Product.findOne({
      _id: productId,
      active: true,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    if (quantity > product.stock) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} item(s) available in stock.`,
      });
    }

    const cart = await Cart.findOne({
      user: req.user._id,
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found.",
      });
    }

    const item = cart.items.find(
      (cartItem) =>
        cartItem.product.toString() === productId
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Product is not in your cart.",
      });
    }

    item.quantity = quantity;

    await cart.save();

    const updatedCart =
      await Cart.findById(cart._id).populate(
        "items.product"
      );

    res.status(200).json({
      success: true,
      message: "Cart updated successfully.",
      cart: updatedCart,
    });
  } catch (error) {
    console.error(
      "Update cart item error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Unable to update cart.",
    });
  }
};

// =========================================================
// REMOVE PRODUCT FROM CART
// =========================================================

const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;

    const cart = await Cart.findOne({
      user: req.user._id,
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found.",
      });
    }

    const originalLength = cart.items.length;

    cart.items = cart.items.filter(
      (item) =>
        item.product.toString() !== productId
    );

    if (cart.items.length === originalLength) {
      return res.status(404).json({
        success: false,
        message: "Product is not in your cart.",
      });
    }

    await cart.save();

    const updatedCart =
      await Cart.findById(cart._id).populate(
        "items.product"
      );

    res.status(200).json({
      success: true,
      message: "Product removed from cart.",
      cart: updatedCart,
    });
  } catch (error) {
    console.error(
      "Remove from cart error:",
      error
    );

    res.status(500).json({
      success: false,
      message: "Unable to remove product from cart.",
    });
  }
};

// =========================================================
// CLEAR CART
// =========================================================

const clearCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({
      user: req.user._id,
    });

    if (!cart) {
      return res.status(200).json({
        success: true,
        message: "Cart is already empty.",
      });
    }

    cart.items = [];

    await cart.save();

    res.status(200).json({
      success: true,
      message: "Cart cleared successfully.",
      cart,
    });
  } catch (error) {
    console.error("Clear cart error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to clear cart.",
    });
  }
};
// =========================================================
// MERGE GUEST CART INTO CUSTOMER CART
// =========================================================

const mergeCart = async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Cart items must be an array.",
      });
    }

    // -----------------------------------------------------
    // FIND OR CREATE CUSTOMER CART
    // -----------------------------------------------------

    let cart = await Cart.findOne({
      user: req.user._id,
    });

    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        items: [],
      });
    }

    // -----------------------------------------------------
    // MERGE EACH GUEST CART ITEM
    // -----------------------------------------------------

    for (const guestItem of items) {
      const productId =
        guestItem._id ||
        guestItem.id;

      const guestQuantity =
        Number(guestItem.quantity);

      if (
        !productId ||
        !Number.isInteger(guestQuantity) ||
        guestQuantity < 1
      ) {
        continue;
      }

      // ---------------------------------------------------
      // FIND PRODUCT
      // ---------------------------------------------------

      const product =
        await Product.findOne({
          _id: productId,
          active: true,
        });

      if (!product) {
        continue;
      }

      // ---------------------------------------------------
      // FIND EXISTING CART ITEM
      // ---------------------------------------------------

      const existingItem =
        cart.items.find(
          (item) =>
            item.product.toString() ===
            productId.toString()
        );

      // ---------------------------------------------------
      // PRODUCT ALREADY IN CART
      // ---------------------------------------------------

      if (existingItem) {

        const combinedQuantity =
          existingItem.quantity +
          guestQuantity;

        existingItem.quantity =
          Math.min(
            combinedQuantity,
            product.stock
          );

      }

      // ---------------------------------------------------
      // PRODUCT NOT YET IN CART
      // ---------------------------------------------------

      else {

        const safeQuantity =
          Math.min(
            guestQuantity,
            product.stock
          );

        if (safeQuantity > 0) {
          cart.items.push({
            product: productId,
            quantity: safeQuantity,
          });
        }
      }
    }

    // -----------------------------------------------------
    // SAVE MERGED CART
    // -----------------------------------------------------

    await cart.save();

    // -----------------------------------------------------
    // RETURN POPULATED CART
    // -----------------------------------------------------

    const updatedCart =
      await Cart.findById(
        cart._id
      ).populate(
        "items.product"
      );

    res.status(200).json({
      success: true,
      message: "Cart merged successfully.",
      cart: updatedCart,
    });

  } catch (error) {

    console.error(
      "Merge cart error:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to merge your cart.",
    });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  mergeCart,  
  
};