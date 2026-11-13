
const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");
const controller = require("../controllers/partyBookingController");

const router = express.Router();

const protect = authMiddleware;
const { adminOnly } = authMiddleware;


// =====================================================
// PARTY MATERIALS
// =====================================================

router.get("/materials", controller.listMaterials);

router.get(
  "/materials/admin/all",
  protect,
  adminOnly,
  (req, res, next) => {
    req.query.all = "true";
    return controller.listMaterials(req, res, next);
  }
);

router.post(
  "/materials",
  protect,
  adminOnly,
  controller.createMaterial
);

router.patch(
  "/materials/:id",
  protect,
  adminOnly,
  controller.updateMaterial
);

router.delete(
  "/materials/:id",
  protect,
  adminOnly,
  controller.deleteMaterial
);


// =====================================================
// CUSTOMER BOOKINGS
// =====================================================

router.post(
  "/",
  protect,
  controller.createBooking
);

router.get(
  "/mine",
  protect,
  controller.listMyBookings
);


// =====================================================
// CUSTOMER QUOTATION ACCEPTANCE
// =====================================================

router.post(
  "/:id/accept-quotation",
  protect,
  controller.acceptQuotation
);


// =====================================================
// CUSTOMER INSTALLMENT SCHEDULE
// =====================================================

router.post(
  "/:id/installment-schedule",
  protect,
  controller.submitInstallmentSchedule
);


// =====================================================
// ADMIN BOOKING MANAGEMENT
// =====================================================

router.get(
  "/admin/all",
  protect,
  adminOnly,
  controller.listAllBookings
);

router.patch(
  "/admin/:id",
  protect,
  adminOnly,
  controller.updateBooking
);


// =====================================================
// ADMIN INSTALLMENT SCHEDULE REVIEW
// =====================================================

router.patch(
  "/admin/:id/installment-schedule",
  protect,
  adminOnly,
  controller.reviewInstallmentSchedule
);


module.exports = router;
