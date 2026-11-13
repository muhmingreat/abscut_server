const mongoose = require("mongoose");

const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const InventoryMovement = require("../models/InventoryMovement");
const DeliveryZone = require("../models/DeliveryZone");
const {
  notifyOrderPlaced,
} = require("../services/notificationService");


// =========================================================
// CREATE ORDER
// =========================================================

const normalizeLocation = (value = "") =>
  String(value).trim().toLowerCase().replace(/\s+/g, " ");

const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


// =========================================================
// REMOVE PRIVATE DIGITAL STORAGE KEYS FROM CUSTOMER DATA
// =========================================================

const sanitizeOrderForCustomer = (orderDocument) => {
  if (!orderDocument) return null;

  const order = orderDocument.toObject
    ? orderDocument.toObject()
    : { ...orderDocument };

  order.items = (order.items || []).map((item) => {
    const safeItem = { ...item };

    // Remove private storage keys from order digital files.
    safeItem.digitalFiles = (
      safeItem.digitalFiles || []
    ).map((file) => {
      const safeFile = { ...file };
      delete safeFile.storageKey;
      return safeFile;
    });

    // Also remove storage keys from populated product data.
    if (
      safeItem.product &&
      typeof safeItem.product === "object"
    ) {
      safeItem.product = { ...safeItem.product };

      safeItem.product.digitalFiles = (
        safeItem.product.digitalFiles || []
      ).map((file) => {
        const safeFile = { ...file };
        delete safeFile.storageKey;
        return safeFile;
      });
    }

    return safeItem;
  });

  return order;
};


const getMatchingDeliveryZone = async ({
  state,
  city,
  area,
}) => {
  const zones = await DeliveryZone.find({
    active: true,
    state: {
      $regex: `^${escapeRegex(state.trim())}$`,
      $options: "i",
    },
    city: {
      $regex: `^${escapeRegex(city.trim())}$`,
      $options: "i",
    },
  });

  const normalizedArea = normalizeLocation(area);

  // Specific area zones take priority.
  if (normalizedArea) {
    const areaZone = zones.find((zone) =>
      zone.areas.some(
        (zoneArea) =>
          normalizeLocation(zoneArea) === normalizedArea
      )
    );

    if (areaZone) return areaZone;
  }

  // Fall back to a city-wide zone.
  return zones.find((zone) => zone.areas.length === 0) || null;
};



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

    // ===================================================
    // CUSTOMER VALIDATION
    // ===================================================

    if (
      !customer ||
      !customer.firstName?.trim() ||
      !customer.lastName?.trim() ||
      !customer.phone?.trim() ||
      !customer.email?.trim()
    ) {
      await session.abortTransaction();

      return res.status(400).json({
        success: false,
        message: "Please provide all required customer information.",
      });
    }

    // ===================================================
    // GET CART
    // ===================================================

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

    // ===================================================
    // PREPARE ORDER ITEMS
    // ===================================================

    const orderItems = [];

    let subtotal = 0;
    let hasPhysicalItems = false;
    let hasDigitalItems = false;

    for (const cartItem of cart.items) {
      const product = cartItem.product;

      if (!product || !product.active) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "One or more products are unavailable.",
        });
      }

      const purchaseMode =
        cartItem.purchaseMode || "physical";

      const productType =
        product.productType || "ready_to_wear";

      const priceUnit =
        cartItem.priceUnit ||
        (productType === "raw_material"
          ? "yard"
          : product.priceUnit || "piece");

      const quantity = Number(cartItem.quantity);

      // -----------------------------------------------
      // VALIDATE QUANTITY
      // -----------------------------------------------

      if (
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: `Invalid quantity for ${product.name}.`,
        });
      }

      // -----------------------------------------------
      // DIGITAL PURCHASE
      // -----------------------------------------------

      if (purchaseMode === "digital") {
        if (!product.digitalAvailable) {
          await session.abortTransaction();

          return res.status(400).json({
            success: false,
            message: `${product.name} is not available digitally.`,
          });
        }

        const digitalFiles =
          product.digitalFiles || [];

        if (digitalFiles.length === 0) {
          await session.abortTransaction();

          return res.status(400).json({
            success: false,
            message: `${product.name} has no digital files available.`,
          });
        }

        const price = Number(product.digitalPrice);

        if (!Number.isFinite(price) || price < 0) {
          await session.abortTransaction();

          return res.status(400).json({
            success: false,
            message: `Invalid digital price for ${product.name}.`,
          });
        }

        const itemTotal = price * quantity;

        subtotal += itemTotal;
        hasDigitalItems = true;

        orderItems.push({
          product: product._id,
          name: product.name,
          image: product.image || "",
          video: product.video || "",
          productType,
          purchaseMode,
          priceUnit: "design",
          price,
          quantity,
          digitalFiles,
        });

        continue;
      }

      // -----------------------------------------------
      // PHYSICAL PURCHASE
      // -----------------------------------------------

      if (purchaseMode !== "physical") {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Invalid purchase mode.",
        });
      }

      if (!product.physicalAvailable) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: `${product.name} is not available physically.`,
        });
      }

      hasPhysicalItems = true;

      // -----------------------------------------------
      // PRICE
      // -----------------------------------------------

      const price =
        product.physicalPrice != null
          ? Number(product.physicalPrice)
          : Number(product.price);

      if (!Number.isFinite(price) || price < 0) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: `Invalid physical price for ${product.name}.`,
        });
      }

      // -----------------------------------------------
      // STOCK
      // -----------------------------------------------

      if (productType === "raw_material") {
        const availableYards =
          Number(product.stockInYards || 0);

        if (
          Math.round(quantity * 2) !== quantity * 2 ||
          quantity < 0.5 ||
          availableYards < quantity
        ) {
          await session.abortTransaction();

          return res.status(400).json({
            success: false,
            message: `Insufficient fabric yardage for ${product.name}.`,
          });
        }
      } else {
        if (
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          Number(product.stock || 0) < quantity
        ) {
          await session.abortTransaction();

          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}.`,
          });
        }
      }

      subtotal += price * quantity;

      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.image || "",
        video: product.video || "",
        productType,
        purchaseMode,
        priceUnit,
        price,
        quantity,
        digitalFiles: [],
      });
    }

    // ===================================================
    // DELIVERY
    // ===================================================

    let finalDeliveryMethod = "digital";
    let deliveryFee = 0;
    let deliveryZone = null;

    const cleanText = (value) =>
      typeof value === "string"
        ? value.trim()
        : "";

    const normalizedShippingAddress = {
      address: cleanText(shippingAddress?.address),
      city: cleanText(shippingAddress?.city),
      state: cleanText(shippingAddress?.state),
      area: cleanText(shippingAddress?.area),
      landmark: cleanText(shippingAddress?.landmark),
    };

    if (hasPhysicalItems) {
      if (!["delivery", "pickup"].includes(deliveryMethod)) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message: "Please select delivery or pickup.",
        });
      }

      finalDeliveryMethod = deliveryMethod;

      // -----------------------------------------------
      // DELIVERY
      // -----------------------------------------------

      if (deliveryMethod === "delivery") {
        const { state, city, address, area } =
          normalizedShippingAddress;

        if (!state || !city || !address) {
          await session.abortTransaction();

          return res.status(400).json({
            success: false,
            message: "Complete delivery address is required.",
          });
        }

        // Check whether every physical product
        // supports delivery.
        const physicalProducts = cart.items
          .filter(
            (item) =>
              (item.purchaseMode || "physical") ===
              "physical",
          )
          .map((item) => item.product);

        const deliveryUnavailable =
          physicalProducts.some(
            (product) =>
              product &&
              product.deliveryAvailable === false,
          );

        if (deliveryUnavailable) {
          await session.abortTransaction();

          return res.status(400).json({
            success: false,
            message:
              "One or more physical products are not available for delivery. Please choose pickup.",
          });
        }

        deliveryZone = await getMatchingDeliveryZone({
          state,
          city,
          area,
        });

        if (!deliveryZone) {
          await session.abortTransaction();

          return res.status(422).json({
            success: false,
            deliveryAvailable: false,
            requiresManualQuote: true,
            message:
              "We cannot automatically calculate delivery for this location. Please contact ABS CUT for a delivery quotation.",
          });
        }

        deliveryFee = Number(deliveryZone.fee || 0);
      }
    }

    // ===================================================
    // TOTAL
    // ===================================================

    const total = subtotal + deliveryFee;

    // ===================================================
    // CREATE ORDER
    // ===================================================

    const createdOrders = await Order.create(
      [
        {
          user: req.user._id,
          items: orderItems,

          customer: {
            firstName: customer.firstName.trim(),
            lastName: customer.lastName.trim(),
            phone: customer.phone.trim(),
            email: customer.email.toLowerCase().trim(),
          },

          shippingAddress: normalizedShippingAddress,

          deliveryMethod: finalDeliveryMethod,
          deliveryFee,

          deliveryZone: deliveryZone?._id || null,
          deliveryZoneName: deliveryZone?.name || "",

          notes: cleanText(notes),

          subtotal,
          total,

          paymentStatus: "pending",
          orderStatus: "pending",
        },
      ],
      { session },
    );

    const createdOrder = createdOrders[0];

    // ===================================================
    // STOCK DEDUCTION
    // PHYSICAL ITEMS ONLY
    // ===================================================

    for (const cartItem of cart.items) {
      const product = cartItem.product;

      if (
        !product ||
        (cartItem.purchaseMode || "physical") !==
          "physical"
      ) {
        continue;
      }

      const quantity = Number(cartItem.quantity);

      // -----------------------------------------------
      // RAW MATERIAL: YARDS
      // -----------------------------------------------

      if (product.productType === "raw_material") {
        const updatedProduct =
          await Product.findOneAndUpdate(
            {
              _id: product._id,
              active: true,
              stockInYards: { $gte: quantity },
            },
            {
              $inc: {
                stockInYards: -quantity,
              },
            },
            {
              new: true,
              session,
            },
          );

        if (!updatedProduct) {
          await session.abortTransaction();

          return res.status(400).json({
            success: false,
            message:
              `Unable to reserve fabric yardage for ${product.name}.`,
          });
        }

        await InventoryMovement.create(
          [
            {
              product: updatedProduct._id,
              type: "sale",
              quantityChange: -quantity,
              stockBefore:
                updatedProduct.stockInYards + quantity,
              stockAfter:
                updatedProduct.stockInYards,
              order: createdOrder._id,
              performedBy: req.user._id,
              reason:
                "Fabric yardage deducted for a newly created order.",
            },
          ],
          { session },
        );

        continue;
      }

      // -----------------------------------------------
      // OTHER PHYSICAL PRODUCTS: PIECES
      // -----------------------------------------------

      const updatedProduct =
        await Product.findOneAndUpdate(
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
          },
        );

      if (!updatedProduct) {
        await session.abortTransaction();

        return res.status(400).json({
          success: false,
          message:
            `Unable to reserve stock for ${product.name}.`,
        });
      }

      await InventoryMovement.create(
        [
          {
            product: updatedProduct._id,
            type: "sale",
            quantityChange: -quantity,
            stockBefore:
              updatedProduct.stock + quantity,
            stockAfter: updatedProduct.stock,
            order: createdOrder._id,
            performedBy: req.user._id,
            reason:
              "Stock deducted for a newly created order.",
          },
        ],
        { session },
      );
    }

    // ===================================================
    // CLEAR CART
    // ===================================================

    cart.items = [];

    await cart.save({ session });

    // ===================================================
    // COMMIT
    // ===================================================

    await session.commitTransaction();

    // ===================================================
    // NOTIFICATIONS
    // ===================================================

    Promise.allSettled([
      notifyOrderPlaced({
        name:
          `${createdOrder.customer.firstName} ${createdOrder.customer.lastName}`,
        email: createdOrder.customer.email,
        phone: createdOrder.customer.phone,
        orderId: createdOrder._id,
        total: createdOrder.total,
      }),
    ]).then((results) => {
      console.log(
        "ABS CUT order notification results:",
        results,
      );
    });

    return res.status(201).json({
      success: true,
      message: "Order created successfully.",
      order: sanitizeOrderForCustomer(createdOrder),
    });
  } catch (error) {
    try {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
    } catch (abortError) {
      console.error(
        "Transaction abort error:",
        abortError,
      );
    }

    console.error("Create order error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create your order.",
    });
  } finally {
    await session.endSession();
  }
};



// =========================================================
// GET MY ORDERS
// =========================================================

const getMyOrders = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      })
    }

    const orders = await Order.find({
      user: req.user._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    // Remove private digital storage keys before
    // returning customer order information.
    const safeOrders = orders.map((order) =>
      sanitizeOrderForCustomer(order)
    );

    return res.status(200).json({
      success: true,
      count: safeOrders.length,
      orders: safeOrders,
    });
  } catch (error) {
    console.error("Get my orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load your orders.",
    })
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
        order: sanitizeOrderForCustomer(order)
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
      // receipt: order,
      receipt: sanitizeOrderForCustomer(order),
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
