
const express = require("express");
const router = express.Router();

const {
  createLiveClass,
  getLiveClasses,
  getLiveClassById,
  updateLiveClass,
  cancelLiveClass,
} = require("../controllers/academyLiveClassController");

const authMiddleWare  = require("../middleware/authMiddleware");
const {
  authorizeLiveClassInstructor,
} = require("../middleware/liveClassMiddleware");

const { adminOnly } = authMiddleWare;
const protect = authMiddleWare;

// All live-class management routes require authentication.
router.use(protect)

// Admin creates a class and assigns its instructor.
router.post("/admin", adminOnly, createLiveClass);

// Admin and staff can list classes.
// Staff only receive classes assigned to them.
router.get("/", getLiveClasses);

// Admin and assigned instructor can view a particular class.
router.get("/:liveClassId", getLiveClassById);

// Admin-only schedule management.
router.put(
  "/:liveClassId",
  adminOnly,
  authorizeLiveClassInstructor,
  updateLiveClass
);

// Admin-only cancellation.
router.patch(
  "/:liveClassId/cancel",
  adminOnly,
  authorizeLiveClassInstructor,
  cancelLiveClass
);

module.exports = router;
