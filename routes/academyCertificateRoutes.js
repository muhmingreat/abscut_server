
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  issueCertificate,
  getMyCertificates,
  getCertificateByEnrollment,
  verifyCertificate,
  getAllCertificates,
  revokeCertificate,
} = require("../controllers/academyCertificateController");

const router = express.Router();

const protect = authMiddleware;
const { adminOnly } = authMiddleware;

// PUBLIC: Verify a certificate.
router.get(
  "/certificates/verify/:certificateNumber",
  verifyCertificate
);

// STUDENT: Get all certificates belonging to the logged-in student.
router.get(
  "/certificates/me",
  protect,
  getMyCertificates
);

// STUDENT: Get a certificate using its enrollment ID.
router.get(
  "/certificates/enrollment/:enrollmentId",
  protect,
  getCertificateByEnrollment
);

// STUDENT: Issue a certificate for an eligible enrollment.
router.post(
  "/enrollments/:enrollmentId/certificate/issue",
  protect,
  issueCertificate
);

// ADMIN: View all issued certificates.
router.get(
  "/admin/certificates",
  protect,
  adminOnly,
  getAllCertificates
);

// ADMIN: Revoke a certificate.
router.patch(
  "/admin/certificates/:certificateId/revoke",
  protect,
  adminOnly,
  revokeCertificate
);

module.exports = router;
