
const mongoose = require("mongoose");

const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const InventoryMovement = require("../models/InventoryMovement");

const {
  notifyOrderPlaced,
} = require("../services/notificationService");

// =========================================================
// CREATE ORDER
// =========================================================

const createOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      customer,
      shippingAddress,
      deliveryMethod,
      notes,
    } = req.body;

    // ---------------------------------------------------
    // VALIDATE CUSTOMER
    // ---------------------------------------------------

    if (
      !customer ||
      !customer.firstName ||
      !customer.lastName ||
      !customer.phone ||
      !customer.email
    ) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message:
          "Please provide all required customer information.",
      });
    }

    // ---------------------------------------------------
    // VALIDATE DELIVERY METHOD
    // ---------------------------------------------------

    if (!["delivery", "pickup"].includes(deliveryMethod)) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Please select a valid delivery method.",
      });
    }

    // ---------------------------------------------------
    // VALIDATE DELIVERY ADDRESS
    // ---------------------------------------------------

    if (deliveryMethod === "delivery") {
      if (
        !shippingAddress ||
        !shippingAddress.address ||
        !shippingAddress.city ||
        !shippingAddress.state
      ) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message:
            "Please provide your complete delivery address.",
        });
      }
    }

    // ---------------------------------------------------
    // GET CUSTOMER CART
    // ---------------------------------------------------

    const cart = await Cart.findOne({
      user: req.user._id,
    })
      .populate("items.product")
      .session(session);

    if (!cart || cart.items.length === 0) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Your cart is empty.",
      });
    }

    // ---------------------------------------------------
    // PREPARE ORDER ITEMS
    // ---------------------------------------------------

    const orderItems = [];

    let subtotal = 0;

    for (const cartItem of cart.items) {
      const product = cartItem.product;

      // -----------------------------------------------
      // CHECK PRODUCT AVAILABILITY
      // -----------------------------------------------

      if (!product || !product.active) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message:
            "One or more products in your cart are no longer available.",
        });
      }

      // -----------------------------------------------
      // CHECK AVAILABLE STOCK
      // -----------------------------------------------

      if (product.stock < cartItem.quantity) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: `${product.name} does not have enough stock available.`,
        });
      }

      // -----------------------------------------------
      // CALCULATE ITEM TOTAL
      // -----------------------------------------------

      const itemTotal =
        product.price * cartItem.quantity;

      subtotal += itemTotal;

      // -----------------------------------------------
      // ADD ITEM TO ORDER
      // -----------------------------------------------

      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.image || "",
        video: product.video || "",
        price: product.price,
        quantity: cartItem.quantity,
      });
    }

    // ---------------------------------------------------
    // DELIVERY FEE
    // ---------------------------------------------------

    const deliveryFee = 0;

    // ---------------------------------------------------
    // FINAL TOTAL
    // ---------------------------------------------------

    const total = subtotal + deliveryFee;

    // ---------------------------------------------------
    // CREATE ORDER
    // ---------------------------------------------------

    const createdOrders = await Order.create(
      [
        {
          user: req.user._id,

          items: orderItems,

          // -----------------------------------------
          // CUSTOMER
          // -----------------------------------------

          customer: {
            firstName: customer.firstName.trim(),
            lastName: customer.lastName.trim(),
            phone: customer.phone.trim(),
            email: customer.email.toLowerCase().trim(),
          },

          // -----------------------------------------
          // SHIPPING ADDRESS
          // -----------------------------------------

          shippingAddress: {
            address: shippingAddress?.address?.trim() || "",
            city: shippingAddress?.city?.trim() || "",
            state: shippingAddress?.state?.trim() || "",
          },

          // -----------------------------------------
          // DELIVERY
          // -----------------------------------------

          deliveryMethod,

          // -----------------------------------------
          // NOTES
          // -----------------------------------------

          notes: notes?.trim() || "",

          // -----------------------------------------
          // PRICING
          // -----------------------------------------

          subtotal,
          deliveryFee,
          total,

          // -----------------------------------------
          // PAYMENT
          // -----------------------------------------

          paymentStatus: "pending",

          // -----------------------------------------
          // ORDER STATUS
          // -----------------------------------------

          orderStatus: "pending",
        },
      ],
      { session }
    );

    // ---------------------------------------------------
    // GET CREATED ORDER
    // ---------------------------------------------------

    const createdOrder = createdOrders[0];

    // ---------------------------------------------------
    // DEDUCT STOCK AND RECORD INVENTORY HISTORY
    // IMPORTANT: STOCK IS DEDUCTED ONLY ONCE.
    // ---------------------------------------------------

    for (const cartItem of cart.items) {
      const product = cartItem.product;
      const quantity = Number(cartItem.quantity);

      // -----------------------------------------------
      // ATOMIC STOCK DEDUCTION
      // -----------------------------------------------

      const updatedProduct = await Product.findOneAndUpdate(
        {
          _id: product._id,
          active: true,
          stock: { $gte: quantity },
        },
        {
          $inc: {
            stock: -quantity,
          },
        },
        {
          new: true,
          session,
        }
      );

      // -----------------------------------------------
      // HANDLE INSUFFICIENT STOCK
      // -----------------------------------------------

      if (!updatedProduct) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: `Unable to reserve stock for ${product.name}. Please try again.`,
        });
      }

      // -----------------------------------------------
      // RECORD INVENTORY MOVEMENT
      // -----------------------------------------------

      await InventoryMovement.create(
        [
          {
            product: updatedProduct._id,

            type: "sale",

            quantityChange: -quantity,

            stockBefore: updatedProduct.stock + quantity,

            stockAfter: updatedProduct.stock,

            order: createdOrder._id,

            performedBy: req.user._id,

            reason: "Stock deducted for a newly created order.",
          },
        ],
        { session }
      );
    }

    // ---------------------------------------------------
    // CLEAR CUSTOMER CART
    // ---------------------------------------------------

    cart.items = [];

    await cart.save({ session });

    // ---------------------------------------------------
    // COMMIT TRANSACTION
    // ---------------------------------------------------

    await session.commitTransaction();

    // ---------------------------------------------------
    // SEND ORDER RECEIVED NOTIFICATIONS
    // Runs AFTER the transaction commits.
    // Notification failure does not undo the order.
    // ---------------------------------------------------

    Promise.allSettled([
      notifyOrderPlaced({
        name: `${createdOrder.customer.firstName} ${createdOrder.customer.lastName}`,

        email: createdOrder.customer.email,

        phone: createdOrder.customer.phone,

        orderId: createdOrder._id,

        total: createdOrder.total,
      }),
    ]).then((results) => {
      console.log(
        "ABS CUT order notification results:",
        results
      );
    });

    // ---------------------------------------------------
    // RESPONSE
    // ---------------------------------------------------

    return res.status(201).json({
      success: true,
      message: "Order created successfully.",
      order: createdOrder,
    });
  } catch (error) {
    // -----------------------------------------------
    // ROLL BACK IF TRANSACTION IS STILL ACTIVE
    // -----------------------------------------------

    try {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
    } catch (abortError) {
      console.error(
        "Transaction abort error:",
        abortError
      );
    }

    console.error("Create order error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create your order.",
    });
  } finally {
    // -----------------------------------------------
    // CLOSE DATABASE SESSION
    // -----------------------------------------------

    await session.endSession();
  }
};

// =========================================================
// GET MY ORDERS
// =========================================================

const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      user: req.user._id,
    }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Get my orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load your orders.",
    });
  }
};

// =========================================================
// GET SINGLE ORDER
// =========================================================

const getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Get order error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load this order.",
    });
  }
};

// =========================================================
// GET SECURE RECEIPT
// Receipt available only after successful payment
// =========================================================

const getReceiptById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({
      _id: id,
      user: req.user._id,
    }).populate("items.product");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    // -----------------------------------------------
    // RECEIPT SECURITY
    // -----------------------------------------------

    if (
      order.paymentStatus !== "paid" ||
      order.orderStatus !== "confirmed"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Receipt is only available after successful payment.",
      });
    }

    return res.status(200).json({
      success: true,
      receipt: order,
    });
  } catch (error) {
    console.error("Get receipt error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve receipt.",
    });
  }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  getReceiptById,
};








// const mongoose = require("mongoose");

// const Order = require("../models/Order");
// const Cart = require("../models/Cart");
// const Product = require("../models/Product");
// const InventoryMovement = require("../models/InventoryMovement");
// const {
//   notifyOrderPlaced,
// } = require("../services/notificationService");

// // =========================================================
// // CREATE ORDER
// // =========================================================

// const createOrder = async (req, res) => {
//   const session =
//     await mongoose.startSession();

//   try {
//     session.startTransaction();

//     const {
//       customer,
//       shippingAddress,
//       deliveryMethod,
//       notes,
//     } = req.body;

//     // ---------------------------------------------------
//     // VALIDATE CUSTOMER
//     // ---------------------------------------------------

//     if (
//       !customer ||
//       !customer.firstName ||
//       !customer.lastName ||
//       !customer.phone ||
//       !customer.email
//     ) {
//       await session.abortTransaction();

//       return res.status(400).json({
//         success: false,
//         message:
//           "Please provide all required customer information.",
//       });
//     }

//     // ---------------------------------------------------
//     // VALIDATE DELIVERY METHOD
//     // ---------------------------------------------------

//     if (
//       ![
//         "delivery",
//         "pickup",
//       ].includes(
//         deliveryMethod
//       )
//     ) {
//       await session.abortTransaction();

//       return res.status(400).json({
//         success: false,
//         message:
//           "Please select a valid delivery method.",
//       });
//     }

//     // ---------------------------------------------------
//     // VALIDATE DELIVERY ADDRESS
//     // ---------------------------------------------------

//     if (
//       deliveryMethod ===
//       "delivery"
//     ) {
//       if (
//         !shippingAddress ||
//         !shippingAddress.address ||
//         !shippingAddress.city ||
//         !shippingAddress.state
//       ) {
//         await session.abortTransaction();

//         return res.status(400).json({
//           success: false,
//           message:
//             "Please provide your complete delivery address.",
//         });
//       }
//     }

//     // ---------------------------------------------------
//     // GET CUSTOMER CART
//     // ---------------------------------------------------

//     const cart =
//       await Cart.findOne({
//         user:
//           req.user._id,
//       })
//         .populate(
//           "items.product"
//         )
//         .session(session);

//     if (
//       !cart ||
//       cart.items.length === 0
//     ) {
//       await session.abortTransaction();

//       return res.status(400).json({
//         success: false,
//         message:
//           "Your cart is empty.",
//       });
//     }

//     // ---------------------------------------------------
//     // PREPARE ORDER ITEMS
//     // ---------------------------------------------------

//     const orderItems = [];

//     let subtotal = 0;

//     for (
//       const cartItem of
//       cart.items
//     ) {
//       const product =
//         cartItem.product;

//       // -----------------------------------------------
//       // CHECK PRODUCT
//       // -----------------------------------------------

//       if (
//         !product ||
//         !product.active
//       ) {
//         await session.abortTransaction();

//         return res.status(400).json({
//           success: false,
//           message:
//             "One or more products in your cart are no longer available.",
//         });
//       }

//       // -----------------------------------------------
//       // CHECK STOCK
//       // -----------------------------------------------

//       if (
//         product.stock <
//         cartItem.quantity
//       ) {
//         await session.abortTransaction();

//         return res.status(400).json({
//           success: false,
//           message:
//             `${product.name} does not have enough stock available.`,
//         });
//       }

//       // -----------------------------------------------
//       // CALCULATE ITEM TOTAL
//       // -----------------------------------------------

//       const itemTotal =
//         product.price *
//         cartItem.quantity;

//       subtotal +=
//         itemTotal;

//       // -----------------------------------------------
//       // ADD ITEM
//       // -----------------------------------------------

//       orderItems.push({
//         product:
//           product._id,

//         name:
//           product.name,

//         image:
//           product.image,

//         price:
//           product.price,

//         quantity:
//           cartItem.quantity,
//       });
//     }

//     // ---------------------------------------------------
//     // DELIVERY FEE
//     // ---------------------------------------------------

//     const deliveryFee = 0;

//     // ---------------------------------------------------
//     // FINAL TOTAL
//     // ---------------------------------------------------

//     const total =
//       subtotal +
//       deliveryFee;

//     // ---------------------------------------------------
//     // REDUCE PRODUCT STOCK
//     // ---------------------------------------------------

//     for (
//       const cartItem of
//       cart.items
//     ) {
//       const product =
//         cartItem.product;

//       const updatedProduct =
//         await Product.findOneAndUpdate(
//           {
//             _id:
//               product._id,

//             active:
//               true,

//             stock: {
//               $gte:
//                 cartItem.quantity,
//             },
//           },

//           {
//             $inc: {
//               stock:
//                 -cartItem.quantity,
//             },
//           },

//           {
//             new:
//               true,

//             session,
//           }
//         );

//       if (
//         !updatedProduct
//       ) {
//         await session.abortTransaction();

//         return res.status(400).json({
//           success: false,
//           message:
//             `Unable to reserve stock for ${product.name}. Please try again.`,
//         });
//       }
//     }

//     // ---------------------------------------------------
//     // CREATE ORDER
//     // ---------------------------------------------------

//     const createdOrders =
//       await Order.create(
//         [
//           {
//             user:
//               req.user._id,

//             items:
//               orderItems,

//             // -----------------------------------------
//             // CUSTOMER
//             // -----------------------------------------

//             customer: {
//               firstName:
//                 customer.firstName.trim(),

//               lastName:
//                 customer.lastName.trim(),

//               phone:
//                 customer.phone.trim(),

//               email:
//                 customer.email
//                   .toLowerCase()
//                   .trim(),
//             },

//             // -----------------------------------------
//             // SHIPPING ADDRESS
//             // -----------------------------------------

//             shippingAddress: {
//               address:
//                 shippingAddress?.address
//                   ?.trim() || "",

//               city:
//                 shippingAddress?.city
//                   ?.trim() || "",

//               state:
//                 shippingAddress?.state
//                   ?.trim() || "",
//             },

//             // -----------------------------------------
//             // DELIVERY
//             // -----------------------------------------

//             deliveryMethod:
//               deliveryMethod,

//             // -----------------------------------------
//             // NOTES
//             // -----------------------------------------

//             notes:
//               notes?.trim() || "",

//             // -----------------------------------------
//             // PRICING
//             // -----------------------------------------

//             subtotal:
//               subtotal,

//             deliveryFee:
//               deliveryFee,

//             total:
//               total,

//             // -----------------------------------------
//             // PAYMENT
//             // -----------------------------------------

//             paymentStatus:
//               "pending",

//             // -----------------------------------------
//             // ORDER STATUS
//             // -----------------------------------------

//             orderStatus:
//               "pending",
//           },
//         ],

//         {
//           session,
//         }
//       );

//     // ---------------------------------------------------
//     // CLEAR CART
//     // ---------------------------------------------------

//     cart.items = [];

//     await cart.save({
//       session,
//     });

//     // ---------------------------------------------------
//     // COMPLETE TRANSACTION
//     // ---------------------------------------------------

//     await session.commitTransaction();

//     const createdOrder =
//       createdOrders[0];

//     // ===================================================
//     // SEND ORDER RECEIVED EMAIL + SMS
//     // ===================================================
//     //
//     // This happens AFTER commit.
//     //
//     // Therefore:
//     //
//     // Database success
//     //        ↓
//     // Transaction committed
//     //        ↓
//     // Notification attempted
//     //
//     // Email/SMS failure cannot undo the order.
//     //
//     // ===================================================

//     Promise.allSettled([
//       notifyOrderPlaced({
//         name:
//           `${createdOrder.customer.firstName} ${createdOrder.customer.lastName}`,

//         email:
//           createdOrder.customer.email,

//         phone:
//           createdOrder.customer.phone,

//         orderId:
//           createdOrder._id,

//         total:
//           createdOrder.total,
//       }),
//     ]).then((results) => {
//       console.log(
//         "ABS CUT order notification results:",
//         results
//       );
//     });

//     // ---------------------------------------------------
//     // RESPONSE
//     // ---------------------------------------------------

//     return res.status(201).json({
//       success: true,

//       message:
//         "Order created successfully.",

//       order:
//         createdOrder,
//     });

//   } catch (error) {
//     try {
//       await session.abortTransaction();
//     } catch (abortError) {
//       console.error(
//         "Transaction abort error:",
//         abortError
//       );
//     }

//     console.error(
//       "Create order error:",
//       error
//     );

//     return res.status(500).json({
//       success: false,
//       message:
//         "Unable to create your order.",
//     });

//   } finally {
//     await session.endSession();
//   }
// };


// // =========================================================
// // GET MY ORDERS
// // =========================================================

// const getMyOrders =
//   async (req, res) => {
//     try {
//       const orders =
//         await Order.find({
//           user:
//             req.user._id,
//         }).sort({
//           createdAt:
//             -1,
//         });

//       return res.status(200).json({
//         success: true,
//         count:
//           orders.length,
//         orders,
//       });

//     } catch (error) {
//       console.error(
//         "Get my orders error:",
//         error
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Unable to load your orders.",
//       });
//     }
//   };


// // =========================================================
// // GET SINGLE ORDER
// // =========================================================

// const getOrderById =
//   async (req, res) => {
//     try {
//       const order =
//         await Order.findOne({
//           _id:
//             req.params.id,

//           user:
//             req.user._id,
//         });

//       if (!order) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Order not found.",
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         order,
//       });

//     } catch (error) {
//       console.error(
//         "Get order error:",
//         error
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Unable to load this order.",
//       });
//     }
//   };


// // =========================================================
// // GET SECURE RECEIPT
// // Receipt is available ONLY after successful payment
// // =========================================================

// const getReceiptById =
//   async (req, res) => {
//     try {
//       const {
//         id,
//       } = req.params;

//       const order =
//         await Order.findOne({
//           _id:
//             id,

//           user:
//             req.user._id,
//         }).populate(
//           "items.product"
//         );

//       if (!order) {
//         return res.status(404).json({
//           success: false,
//           message:
//             "Order not found.",
//         });
//       }

//       // -----------------------------------------------
//       // RECEIPT SECURITY
//       // -----------------------------------------------

//       if (
//         order.paymentStatus !==
//           "paid" ||
//         order.orderStatus !==
//           "confirmed"
//       ) {
//         return res.status(403).json({
//           success: false,
//           message:
//             "Receipt is only available after successful payment.",
//         });
//       }

//       return res.status(200).json({
//         success: true,
//         receipt:
//           order,
//       });

//     } catch (error) {
//       console.error(
//         "Get receipt error:",
//         error
//       );

//       return res.status(500).json({
//         success: false,
//         message:
//           "Unable to retrieve receipt.",
//       });
//     }
//   };


// // =========================================================
// // EXPORTS
// // =========================================================

// module.exports = {
//   createOrder,
//   getMyOrders,
//   getOrderById,
//   getReceiptById,
// };