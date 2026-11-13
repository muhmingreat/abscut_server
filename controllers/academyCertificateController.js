
const crypto = require("crypto");
const mongoose = require("mongoose");

const CourseEnrollment = require("../models/CourseEnrollment");
const Certificate = require("../models/Certificate");

// Generate a unique ABS CUT certificate reference.
const generateCertificateNumber = () => {
  const year = new Date().getFullYear();
  const random = crypto.randomBytes(5).toString("hex").toUpperCase();

  return `ABS-FA-${year}-${random}`;
};

// Get a student's display name without assuming one specific User schema.
const getStudentName = (user) => {
  if (!user) return "ABS CUT Fashion Academy Student";

  return (
    user.name ||
    user.fullName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    "ABS CUT Fashion Academy Student"
  );
};

// Flatten all course lessons.
const getCourseLessons = (course) => {
  return (course?.modules || []).flatMap((module) => module.lessons || []);
};

// Check whether every lesson has been completed.
const hasCompletedAllLessons = (course, enrollment) => {
  const lessons = getCourseLessons(course);

  if (lessons.length === 0) return false;

  const completedIds = new Set(
    (enrollment.completedLessonIds || []).map((id) => id.toString())
  );

  return lessons.every((lesson) => completedIds.has(lesson._id.toString()));
};

// Check certificate eligibility.
const checkCertificateEligibility = (course, enrollment) => {
  if (!course.certificateEnabled) {
    return {
      allowed: false,
      status: 400,
      message: "Certificates are not enabled for this course.",
    };
  }

  if (
    enrollment.status !== "completed" ||
    Number(enrollment.progressPercentage) !== 100
  ) {
    return {
      allowed: false,
      status: 403,
      message:
        "Complete all course lessons before requesting your certificate.",
    };
  }

  if (!hasCompletedAllLessons(course, enrollment)) {
    return {
      allowed: false,
      status: 403,
      message: "Not all course lessons have been completed.",
    };
  }

  // const fullyPaid =
  //   enrollment.paymentStatus === "paid" ||
  //   (course.isFree && enrollment.paymentStatus === "not_required");

const isFreeCourse =
  course.isFree === true ||
  enrollment.courseSnapshot?.isFree === true;

const fullyPaid =
  enrollment.paymentStatus === "paid" ||
  (isFreeCourse && enrollment.paymentStatus === "not_required");


  if (!fullyPaid) {
    return {
      allowed: false,
      status: 403,
      code: "FULL_PAYMENT_REQUIRED",
      message:
        "Full course payment is required before a certificate can be issued.",
      amountDue: enrollment.amountDue,
      amountPaid: enrollment.amountPaid,
      remainingBalance: Math.max(
        0,
        Number(enrollment.amountDue || 0) -
          Number(enrollment.amountPaid || 0)
      ),
    };
  }

  return { allowed: true };
};

// Format certificate data for API responses.
const formatCertificate = (certificate) => ({
  _id: certificate._id,
  certificateNumber: certificate.certificateNumber,
  studentName: certificate.studentName,
  courseTitle: certificate.courseTitle,
  instructorName: certificate.instructorName,
  issuedAt: certificate.issuedAt,
  certificateUrl: certificate.certificateUrl,
  verificationStatus: certificate.verificationStatus,
  revokedAt: certificate.revokedAt,
  revocationReason: certificate.revocationReason,
  enrollment: certificate.enrollment,
  course: certificate.course,
});

// ISSUE CERTIFICATE
exports.issueCertificate = async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const studentId = req.user._id;

    if (!mongoose.isValidObjectId(enrollmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment ID.",
      });
    }

    const enrollment = await CourseEnrollment.findOne({
      _id: enrollmentId,
      user: studentId,
    })
      .populate("course")
      .populate("user");

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Course enrollment not found.",
      });
    }

    const course = enrollment.course;

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "The associated course could not be found.",
      });
    }

    // Return an existing certificate instead of issuing another one.
    const existingCertificate = await Certificate.findOne({
      enrollment: enrollment._id,
    });

    if (existingCertificate) {
      return res.status(200).json({
        success: true,
        message:
          existingCertificate.verificationStatus === "revoked"
            ? "A certificate record already exists, but it has been revoked."
            : "Your certificate has already been issued.",
        certificate: formatCertificate(existingCertificate),
      });
    }


// Migrate an older certificate stored only on CourseEnrollment.
// Preserve its original certificate number and issue date.
if (
  enrollment.certificateIssued === true &&
  enrollment.certificateNumber
) {
  const legacyCertificate = await Certificate.create({
    certificateNumber: enrollment.certificateNumber,
    student: studentId,
    course: course._id,
    enrollment: enrollment._id,
    studentName: getStudentName(enrollment.user),
    courseTitle:
      enrollment.courseSnapshot?.title ||
      course.title ||
      "Fashion Course",
    instructorName:
      course.instructorName || "ABS CUT Fashion Academy",
    issuedAt: enrollment.certificateIssuedAt || new Date(),
    verificationStatus: "valid",
  });

  return res.status(200).json({
    success: true,
    message: "Your existing certificate record has been restored.",
    certificate: formatCertificate(legacyCertificate),
  });
}

    const eligibility = checkCertificateEligibility(course, enrollment);

    if (!eligibility.allowed) {
      return res.status(eligibility.status).json({
        success: false,
        ...(eligibility.code ? { code: eligibility.code } : {}),
        message: eligibility.message,
        ...(eligibility.amountDue !== undefined
          ? {
              amountDue: eligibility.amountDue,
              amountPaid: eligibility.amountPaid,
              remainingBalance: eligibility.remainingBalance,
            }
          : {}),
      });
    }

    const studentName = getStudentName(enrollment.user);
    const courseTitle =
      enrollment.courseSnapshot?.title || course.title || "Fashion Course";

    const instructorName =
      course.instructorName || "ABS CUT Fashion Academy";

    const certificate = await Certificate.create({
      certificateNumber: generateCertificateNumber(),
      student: studentId,
      course: course._id,
      enrollment: enrollment._id,
      studentName,
      courseTitle,
      instructorName,
      issuedAt: new Date(),
      verificationStatus: "valid",
    });

    // Keep legacy enrollment fields synchronized where they exist.
    await CourseEnrollment.updateOne(
      { _id: enrollment._id, user: studentId },
      {
        $set: {
          certificateIssued: true,
          certificateNumber: certificate.certificateNumber,
          certificateIssuedAt: certificate.issuedAt,
        },
      }
    );

    return res.status(201).json({
      success: true,
      message: "Your ABS CUT Fashion Academy certificate has been issued.",
      certificate: formatCertificate(certificate),
    });
  } catch (error) {
    // A unique enrollment index prevents two certificates for one enrollment.
    if (error.code === 11000) {
      try {
        const existingCertificate = await Certificate.findOne({
          enrollment: req.params.enrollmentId,
        });

        if (existingCertificate) {
          return res.status(200).json({
            success: true,
            message: "Your certificate has already been issued.",
            certificate: formatCertificate(existingCertificate),
          });
        }
      } catch (lookupError) {
        console.error("Certificate duplicate lookup error:", lookupError);
      }

      return res.status(409).json({
        success: false,
        message:
          "A certificate already exists for this enrollment. Please refresh and try again.",
      });
    }

    console.error("Issue Academy certificate error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to issue certificate.",
    });
  }
};

// GET ALL CERTIFICATES BELONGING TO THE LOGGED-IN STUDENT
exports.getMyCertificates = async (req, res) => {
  try {
    const certificates = await Certificate.find({
      student: req.user._id,
    })
      .populate("course", "title category thumbnail")
      .sort({ issuedAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: certificates.length,
      certificates,
    });
  } catch (error) {
    console.error("Get my Academy certificates error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load your certificates.",
    });
  }
};

// GET ONE CERTIFICATE BY ENROLLMENT ID FOR ITS OWNER
exports.getCertificateByEnrollment = async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    if (!mongoose.isValidObjectId(enrollmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid enrollment ID.",
      });
    }

    const certificate = await Certificate.findOne({
      enrollment: enrollmentId,
      student: req.user._id,
    })
      .populate("course", "title category thumbnail")
      .populate("enrollment", "status progressPercentage");

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found.",
      });
    }

    return res.status(200).json({
      success: true,
      certificate,
    });
  } catch (error) {
    console.error("Get Academy certificate error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load this certificate.",
    });
  }
};

// PUBLIC CERTIFICATE VERIFICATION
exports.verifyCertificate = async (req, res) => {
  try {
    const certificateNumber = String(
      req.params.certificateNumber || ""
    )
      .trim()
      .toUpperCase();

    if (!certificateNumber) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: "Certificate number is required.",
      });
    }

    const certificate = await Certificate.findOne({
      certificateNumber,
    }).lean();

    if (!certificate) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: "Certificate not found.",
      });
    }

const isValid =
  certificate.verificationStatus === "valid" &&
  !certificate.revokedAt;

return res.status(200).json({
  success: true,
  valid: isValid,
  message: isValid
    ? "This is a valid ABS CUT Fashion Academy certificate."
    : "This certificate has been revoked.",
  certificate: {
    certificateNumber: certificate.certificateNumber,
    studentName: certificate.studentName,
    courseTitle: certificate.courseTitle,
    instructorName: certificate.instructorName,
    issuedAt: certificate.issuedAt,
    issuer: "ABS CUT Fashion Academy",
    verificationStatus: isValid ? "valid" : "revoked",
    revokedAt: certificate.revokedAt,
    revocationReason: certificate.revocationReason,
  },
})


  } catch (error) {
    console.error("Verify Academy certificate error:", error);

    return res.status(500).json({
      success: false,
      valid: false,
      message: "Unable to verify certificate.",
    });
  }
}

// ADMIN: LIST CERTIFICATES
exports.getAllCertificates = async (req, res) => {
  try {
    const certificates = await Certificate.find({})
      .populate("student", "name fullName firstName lastName email")
      .populate("course", "title category")
      .populate("revokedBy", "name email")
      .sort({ issuedAt: -1 })
      .limit(500)
      .lean();

    return res.status(200).json({
      success: true,
      count: certificates.length,
      certificates,
    });
  } catch (error) {
    console.error("Admin get Academy certificates error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load Academy certificates.",
    });
  }
};

// ADMIN: REVOKE CERTIFICATE
exports.revokeCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;
    const reason = String(req.body.reason || "").trim();

    if (!mongoose.isValidObjectId(certificateId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid certificate ID.",
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Please provide a reason for revoking this certificate.",
      });
    }

    if (reason.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "The revocation reason cannot exceed 1000 characters.",
      });
    }

    const certificate = await Certificate.findById(certificateId);

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: "Certificate not found.",
      });
    }

    if (certificate.verificationStatus === "revoked") {
      return res.status(200).json({
        success: true,
        message: "This certificate has already been revoked.",
        certificate,
      });
    }

    certificate.verificationStatus = "revoked";
    certificate.revokedAt = new Date();
    certificate.revocationReason = reason;
    certificate.revokedBy = req.user._id;

    await certificate.save();

    return res.status(200).json({
      success: true,
      message: "Certificate revoked successfully.",
      certificate,
    });
  } catch (error) {
    console.error("Revoke Academy certificate error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to revoke certificate.",
    });
  }
};
