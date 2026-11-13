



const Cart = require("../models/Cart");
const Product = require("../models/Product");

// =========================================================
// CART HELPERS
// =========================================================

function getPurchaseMode(req) {
  return (
    req.body?.purchaseMode ||
    req.query?.purchaseMode ||
    "physical"
  );
}

function getPriceUnit(product) {
  if (product.productType === "raw_material") {
    return "yard";
  }

  if (product.productType === "ready_to_wear") {
    return "piece";
  }

  return product.priceUnit || "design";
}

function getAvailableStock(product, purchaseMode) {
  if (purchaseMode === "digital") {
    return Infinity;
  }

  if (product.productType === "raw_material") {
    return Number(product.stockInYards || 0);
  }

  return Number(product.stock || 0);
}

function validatePurchaseMode(product, purchaseMode) {
  if (!["physical", "digital"].includes(purchaseMode)) {
    return "Invalid purchase option.";
  }

  if (purchaseMode === "digital") {
    if (!product.digitalAvailable) {
      return "Digital purchase is not available for this product.";
    }

    return null;
  }

  if (!product.physicalAvailable) {
    return "Physical purchase is not available for this product.";
  }

  return null;
}

function validateQuantity(product, purchaseMode, quantity) {
  const amount = Number(quantity);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "Quantity must be greater than zero.";
  }

  const isYardQuantity =
    product.productType === "raw_material" &&
    purchaseMode === "physical";

  if (!isYardQuantity && !Number.isInteger(amount)) {
    return "Quantity must be a whole number for this product.";
  }

  if (isYardQuantity && amount < 0.5) {
    return "Material quantity must be at least 0.5 yard.";
  }

  const available = getAvailableStock(product, purchaseMode);

  if (amount > available) {
    return isYardQuantity
      ? `Only ${available} yard(s) available.`
      : `Only ${available} item(s) available in stock.`;
  }

  return null;
}

function findCartItem(cart, productId, purchaseMode) {
  return cart.items.find(
    (item) =>
      item.product.toString() === productId.toString() &&
      (item.purchaseMode || "physical") === purchaseMode
  );
}

function normalizeCartItems(cart) {
  cart.items.forEach((item) => {
    if (!item.purchaseMode) {
      item.purchaseMode = "physical";
    }

    if (!item.priceUnit) {
      item.priceUnit = "piece";
    }
  });

  return cart;
}

async function populateCart(cartId) {
  const cart = await Cart.findById(cartId).populate(
    "items.product"
  );

  if (cart) {
    normalizeCartItems(cart);
  }

  return cart;
}

// =========================================================
// GET CUSTOMER CART
// =========================================================

const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({
      user: req.user._id,
    });

    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        items: [],
      });
    }

    cart = normalizeCartItems(cart);

    await cart.save();

    cart = await populateCart(cart._id);

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
    const {
      productId,
      quantity = 1,
    } = req.body;

    const purchaseMode = getPurchaseMode(req);

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required.",
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

    const modeError = validatePurchaseMode(
      product,
      purchaseMode
    );

    if (modeError) {
      return res.status(400).json({
        success: false,
        message: modeError,
      });
    }

    const quantityError = validateQuantity(
      product,
      purchaseMode,
      quantity
    );

    if (quantityError) {
      return res.status(400).json({
        success: false,
        message: quantityError,
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

    normalizeCartItems(cart);

    const existingItem = findCartItem(
      cart,
      productId,
      purchaseMode
    );

    const amount = Number(quantity);

    if (existingItem) {
      const newQuantity =
        Number(existingItem.quantity) + amount;

      const available = getAvailableStock(
        product,
        purchaseMode
      );

      if (newQuantity > available) {
        return res.status(400).json({
          success: false,
          message: `Only ${available} unit(s) available.`,
        });
      }

      existingItem.quantity = newQuantity;
    } else {
      cart.items.push({
        product: productId,
        purchaseMode,
        priceUnit: getPriceUnit(product),
        quantity: amount,
      });
    }

    await cart.save();

    cart = await populateCart(cart._id);

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
    const purchaseMode = getPurchaseMode(req);

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

    const modeError = validatePurchaseMode(
      product,
      purchaseMode
    );

    if (modeError) {
      return res.status(400).json({
        success: false,
        message: modeError,
      });
    }

    const quantityError = validateQuantity(
      product,
      purchaseMode,
      quantity
    );

    if (quantityError) {
      return res.status(400).json({
        success: false,
        message: quantityError,
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

    normalizeCartItems(cart);

    const item = findCartItem(
      cart,
      productId,
      purchaseMode
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Product is not in your cart.",
      });
    }

    item.quantity = Number(quantity);
    item.priceUnit = getPriceUnit(product);

    await cart.save();

    const updatedCart = await populateCart(cart._id);

    res.status(200).json({
      success: true,
      message: "Cart updated successfully.",
      cart: updatedCart,
    });
  } catch (error) {
    console.error("Update cart item error:", error);

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
    const purchaseMode = getPurchaseMode(req);

    const cart = await Cart.findOne({
      user: req.user._id,
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found.",
      });
    }

    normalizeCartItems(cart);

    const matchingItems = cart.items.filter(
      (item) =>
        item.product.toString() === productId.toString()
    );

    if (!matchingItems.length) {
      return res.status(404).json({
        success: false,
        message: "Product is not in your cart.",
      });
    }

    // If physical and digital versions both exist,
    // require the caller to identify which one to remove.
    if (
      matchingItems.length > 1 &&
      !req.body?.purchaseMode &&
      !req.query?.purchaseMode
    ) {
      return res.status(400).json({
        success: false,
        message: "Purchase mode is required to remove this item.",
      });
    }

    cart.items = cart.items.filter(
      (item) =>
        !(
          item.product.toString() === productId.toString() &&
          (item.purchaseMode || "physical") === purchaseMode
        )
    );

    await cart.save();

    const updatedCart = await populateCart(cart._id);

    res.status(200).json({
      success: true,
      message: "Product removed from cart.",
      cart: updatedCart,
    });
  } catch (error) {
    console.error("Remove cart item error:", error);

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

    let cart = await Cart.findOne({
      user: req.user._id,
    });

    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        items: [],
      });
    }

    normalizeCartItems(cart);

    for (const guestItem of items) {
      const productId =
        guestItem._id || guestItem.id;

      const purchaseMode =
        guestItem.purchaseMode || "physical";

      const guestQuantity =
        Number(guestItem.quantity);

      if (
        !productId ||
        !Number.isFinite(guestQuantity) ||
        guestQuantity <= 0
      ) {
        continue;
      }

      const product = await Product.findOne({
        _id: productId,
        active: true,
      });

      if (!product) {
        continue;
      }

      if (
        validatePurchaseMode(product, purchaseMode)
      ) {
        continue;
      }

      if (
        validateQuantity(
          product,
          purchaseMode,
          guestQuantity
        )
      ) {
        continue;
      }

      const existingItem = findCartItem(
        cart,
        productId,
        purchaseMode
      );

      const available = getAvailableStock(
        product,
        purchaseMode
      );

      if (existingItem) {
        existingItem.quantity = Math.min(
          Number(existingItem.quantity) + guestQuantity,
          available
        );
      } else {
        cart.items.push({
          product: productId,
          purchaseMode,
          priceUnit: getPriceUnit(product),
          quantity: Math.min(
            guestQuantity,
            available
          ),
        });
      }
    }

    await cart.save();

    const updatedCart = await populateCart(cart._id);

    res.status(200).json({
      success: true,
      message: "Cart merged successfully.",
      cart: updatedCart,
    });
  } catch (error) {
    console.error("Merge cart error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to merge your cart.",
    });
  }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  mergeCart,
};
// const Cart = require("../models/Cart");
// const Product = require("../models/Product");

// // =========================================================
// // GET CUSTOMER CART
// // =========================================================

// const getCart = async (req, res) => {
//   try {
//     let cart = await Cart.findOne({
//       user: req.user._id,
//     }).populate("items.product");

//     // Create an empty cart if the customer does not have one
//     if (!cart) {
//       cart = await Cart.create({
//         user: req.user._id,
//         items: [],
//       });

//       cart = await Cart.findById(cart._id).populate(
//         "items.product"
//       );
//     }

//     res.status(200).json({
//       success: true,
//       cart,
//     });
//   } catch (error) {
//     console.error("Get cart error:", error);

//     res.status(500).json({
//       success: false,
//       message: "Unable to load cart.",
//     });
//   }
// };

// // =========================================================
// // ADD PRODUCT TO CART
// // =========================================================

// const addToCart = async (req, res) => {
//   try {
//     const { productId, quantity = 1 } = req.body;

//     if (!productId) {
//       return res.status(400).json({
//         success: false,
//         message: "Product ID is required.",
//       });
//     }

//     if (!Number.isInteger(quantity) || quantity < 1) {
//       return res.status(400).json({
//         success: false,
//         message: "Quantity must be at least 1.",
//       });
//     }

//     const product = await Product.findOne({
//       _id: productId,
//       active: true,
//     });

//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         message: "Product not found.",
//       });
//     }

//     if (product.stock < quantity) {
//       return res.status(400).json({
//         success: false,
//         message: "Not enough stock available.",
//       });
//     }

//     let cart = await Cart.findOne({
//       user: req.user._id,
//     });

//     if (!cart) {
//       cart = await Cart.create({
//         user: req.user._id,
//         items: [],
//       });
//     }

//     const existingItem = cart.items.find(
//       (item) =>
//         item.product.toString() === productId
//     );

//     if (existingItem) {
//       const newQuantity =
//         existingItem.quantity + quantity;

//       if (newQuantity > product.stock) {
//         return res.status(400).json({
//           success: false,
//           message: `Only ${product.stock} item(s) available in stock.`,
//         });
//       }

//       existingItem.quantity = newQuantity;
//     } else {
//       cart.items.push({
//         product: productId,
//         quantity,
//       });
//     }

//     await cart.save();

//     cart = await Cart.findById(cart._id).populate(
//       "items.product"
//     );

//     res.status(200).json({
//       success: true,
//       message: "Product added to cart.",
//       cart,
//     });
//   } catch (error) {
//     console.error("Add to cart error:", error);

//     res.status(500).json({
//       success: false,
//       message: "Unable to add product to cart.",
//     });
//   }
// };

// // =========================================================
// // UPDATE CART ITEM QUANTITY
// // =========================================================

// const updateCartItem = async (req, res) => {
//   try {
//     const { productId } = req.params;
//     const { quantity } = req.body;

//     if (!Number.isInteger(quantity) || quantity < 1) {
//       return res.status(400).json({
//         success: false,
//         message: "Quantity must be at least 1.",
//       });
//     }

//     const product = await Product.findOne({
//       _id: productId,
//       active: true,
//     });

//     if (!product) {
//       return res.status(404).json({
//         success: false,
//         message: "Product not found.",
//       });
//     }

//     if (quantity > product.stock) {
//       return res.status(400).json({
//         success: false,
//         message: `Only ${product.stock} item(s) available in stock.`,
//       });
//     }

//     const cart = await Cart.findOne({
//       user: req.user._id,
//     });

//     if (!cart) {
//       return res.status(404).json({
//         success: false,
//         message: "Cart not found.",
//       });
//     }

//     const item = cart.items.find(
//       (cartItem) =>
//         cartItem.product.toString() === productId
//     );

//     if (!item) {
//       return res.status(404).json({
//         success: false,
//         message: "Product is not in your cart.",
//       });
//     }

//     item.quantity = quantity;

//     await cart.save();

//     const updatedCart =
//       await Cart.findById(cart._id).populate(
//         "items.product"
//       );

//     res.status(200).json({
//       success: true,
//       message: "Cart updated successfully.",
//       cart: updatedCart,
//     });
//   } catch (error) {
//     console.error(
//       "Update cart item error:",
//       error
//     );

//     res.status(500).json({
//       success: false,
//       message: "Unable to update cart.",
//     });
//   }
// };

// // =========================================================
// // REMOVE PRODUCT FROM CART
// // =========================================================

// const removeFromCart = async (req, res) => {
//   try {
//     const { productId } = req.params;

//     const cart = await Cart.findOne({
//       user: req.user._id,
//     });

//     if (!cart) {
//       return res.status(404).json({
//         success: false,
//         message: "Cart not found.",
//       });
//     }

//     const originalLength = cart.items.length;

//     cart.items = cart.items.filter(
//       (item) =>
//         item.product.toString() !== productId
//     );

//     if (cart.items.length === originalLength) {
//       return res.status(404).json({
//         success: false,
//         message: "Product is not in your cart.",
//       });
//     }

//     await cart.save();

//     const updatedCart =
//       await Cart.findById(cart._id).populate(
//         "items.product"
//       );

//     res.status(200).json({
//       success: true,
//       message: "Product removed from cart.",
//       cart: updatedCart,
//     });
//   } catch (error) {
//     console.error(
//       "Remove from cart error:",
//       error
//     );

//     res.status(500).json({
//       success: false,
//       message: "Unable to remove product from cart.",
//     });
//   }
// };

// // =========================================================
// // CLEAR CART
// // =========================================================

// const clearCart = async (req, res) => {
//   try {
//     const cart = await Cart.findOne({
//       user: req.user._id,
//     });

//     if (!cart) {
//       return res.status(200).json({
//         success: true,
//         message: "Cart is already empty.",
//       });
//     }

//     cart.items = [];

//     await cart.save();

//     res.status(200).json({
//       success: true,
//       message: "Cart cleared successfully.",
//       cart,
//     });
//   } catch (error) {
//     console.error("Clear cart error:", error);

//     res.status(500).json({
//       success: false,
//       message: "Unable to clear cart.",
//     });
//   }
// };
// // =========================================================
// // MERGE GUEST CART INTO CUSTOMER CART
// // =========================================================

// const mergeCart = async (req, res) => {
//   try {
//     const { items } = req.body;

//     if (!Array.isArray(items)) {
//       return res.status(400).json({
//         success: false,
//         message: "Cart items must be an array.",
//       });
//     }

//     // -----------------------------------------------------
//     // FIND OR CREATE CUSTOMER CART
//     // -----------------------------------------------------

//     let cart = await Cart.findOne({
//       user: req.user._id,
//     });

//     if (!cart) {
//       cart = await Cart.create({
//         user: req.user._id,
//         items: [],
//       });
//     }

//     // -----------------------------------------------------
//     // MERGE EACH GUEST CART ITEM
//     // -----------------------------------------------------

//     for (const guestItem of items) {
//       const productId =
//         guestItem._id ||
//         guestItem.id;

//       const guestQuantity =
//         Number(guestItem.quantity);

//       if (
//         !productId ||
//         !Number.isInteger(guestQuantity) ||
//         guestQuantity < 1
//       ) {
//         continue;
//       }

//       // ---------------------------------------------------
//       // FIND PRODUCT
//       // ---------------------------------------------------

//       const product =
//         await Product.findOne({
//           _id: productId,
//           active: true,
//         });

//       if (!product) {
//         continue;
//       }

//       // ---------------------------------------------------
//       // FIND EXISTING CART ITEM
//       // ---------------------------------------------------

//       const existingItem =
//         cart.items.find(
//           (item) =>
//             item.product.toString() ===
//             productId.toString()
//         );

//       // ---------------------------------------------------
//       // PRODUCT ALREADY IN CART
//       // ---------------------------------------------------

//       if (existingItem) {

//         const combinedQuantity =
//           existingItem.quantity +
//           guestQuantity;

//         existingItem.quantity =
//           Math.min(
//             combinedQuantity,
//             product.stock
//           );

//       }

//       // ---------------------------------------------------
//       // PRODUCT NOT YET IN CART
//       // ---------------------------------------------------

//       else {

//         const safeQuantity =
//           Math.min(
//             guestQuantity,
//             product.stock
//           );

//         if (safeQuantity > 0) {
//           cart.items.push({
//             product: productId,
//             quantity: safeQuantity,
//           });
//         }
//       }
//     }

//     // -----------------------------------------------------
//     // SAVE MERGED CART
//     // -----------------------------------------------------

//     await cart.save();

//     // -----------------------------------------------------
//     // RETURN POPULATED CART
//     // -----------------------------------------------------

//     const updatedCart =
//       await Cart.findById(
//         cart._id
//       ).populate(
//         "items.product"
//       );

//     res.status(200).json({
//       success: true,
//       message: "Cart merged successfully.",
//       cart: updatedCart,
//     });

//   } catch (error) {

//     console.error(
//       "Merge cart error:",
//       error
//     );

//     res.status(500).json({
//       success: false,
//       message:
//         "Unable to merge your cart.",
//     });
//   }
// };

// module.exports = {
//   getCart,
//   addToCart,
//   updateCartItem,
//   removeFromCart,
//   clearCart,
//   mergeCart,  
  
// };