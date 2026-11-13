const mongoose = require("mongoose");
const fs = require("fs/promises");
const cloudinary = require("../config/cloudinary");

const Assignment = require("../models/Assignment");
const AssignmentSubmission = require("../models/AssignmentSubmission");
const CourseEnrollment = require("../models/CourseEnrollment");

// =====================================================
// HELPERS
// =====================================================

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const getActiveEnrollment = async (userId, courseId) => {
  return CourseEnrollment.findOne({
    user: userId,
    course: courseId,
    status: "active",
    $or: [
      { accessExpiresAt: null },
      { accessExpiresAt: { $gt: new Date() } },
    ],
  });
};

const getFileType = (file) => {
  const mime = String(file.mimetype || "").toLowerCase();
  const extension = require("path")
    .extname(file.originalname || "")
    .toLowerCase();

  if (
    mime.startsWith("image/") ||
    [".jpg", ".jpeg", ".png", ".webp"].includes(extension)
  ) {
    return "image";
  }

  if (
    mime.startsWith("video/") ||
    [".mp4", ".mov", ".webm"].includes(extension)
  ) {
    return "video";
  }

  if (
    mime === "application/pdf" ||
    mime.includes("document") ||
    mime.includes("word") ||
    mime === "text/plain" ||
    [".pdf", ".doc", ".docx", ".txt"].includes(extension)
  ) {
    return "document";
  }

  return "other";
};

// const uploadSubmissionFiles = async (files) => {
//   const uploadedFiles = [];

//   for (const file of files) {
//     const type = getFileType(file);

//     const resourceType =
//       type === "image"
//         ? "image"
//         : type === "video"
//           ? "video"
//           : "raw";

//     const result = await cloudinary.uploader.upload(file.path, {
//       resource_type: resourceType,
//       folder: "abs-cut/academy/assignments/submissions",
//       use_filename: true,
//       unique_filename: true,
//     });

//     uploadedFiles.push({
//       url: result.secure_url,
//       publicId: result.public_id,
//       type,
//       originalName: file.originalname,
//       format: result.format || "",
//       bytes: result.bytes || file.size,
//     });
//   }

//   return uploadedFiles;
// };
const uploadSubmissionFiles = async (files) => {
  const uploadedFiles = [];

  try {
    for (const file of files) {
      const type = getFileType(file);

      const resourceType =
        type === "image"
          ? "image"
          : type === "video"
            ? "video"
            : "raw";

      const result = await cloudinary.uploader.upload(file.path, {
        resource_type: resourceType,
        folder: "abs-cut/academy/assignments/submissions",
        use_filename: true,
        unique_filename: true,
      });

      uploadedFiles.push({
        url: result.secure_url,
        publicId: result.public_id,
        type,
        originalName: file.originalname,
        format: result.format || "",
        bytes: result.bytes || file.size,
      });
    }

    return uploadedFiles;
  } catch (error) {
    await removeCloudinaryFiles(uploadedFiles);
    throw error;
  }
};

const removeCloudinaryFiles = async (files) => {
  for (const file of files) {
    if (!file.publicId) continue;

    try {
      const resourceType =
        file.type === "image"
          ? "image"
          : file.type === "video"
            ? "video"
            : "raw";

      await cloudinary.uploader.destroy(file.publicId, {
        resource_type: resourceType,
      });
    } catch (error) {
      console.error(
        "Cloudinary submission cleanup error:",
        error.message
      );
    }
  }
};

// =====================================================
// STUDENT — SUBMIT ASSIGNMENT
// =====================================================

const submitAssignment = async (req, res) => {
  let uploadedFiles = [];

  try {
    const { assignmentId } = req.params;
    const studentComment = String(
      req.body.studentComment || ""
    ).trim();

    if (!isValidId(assignmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignment ID.",
      });
    }

    const assignment = await Assignment.findOne({
      _id: assignmentId,
      status: "published",
    });

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found or is not accepting submissions.",
      });
    }

    if (
      assignment.dueDate &&
      new Date(assignment.dueDate).getTime() < Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: "The submission deadline has passed.",
      });
    }

    const enrollment = await getActiveEnrollment(
      req.user._id,
      assignment.course
    );

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You need an active enrollment to submit this assignment.",
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please attach at least one assignment file.",
      });
    }

    if (req.files.length > 5) {
      return res.status(400).json({
        success: false,
        message: "You can upload a maximum of five files.",
      });
    }

    const fileTypes = req.files.map(getFileType);

    if (fileTypes.includes("other")) {
      return res.status(400).json({
        success: false,
        message: "One or more uploaded files have an unsupported format.",
      });
    }

    if (
      assignment.submissionType !== "mixed" &&
      fileTypes.some((type) => type !== assignment.submissionType)
    ) {
      return res.status(400).json({
        success: false,
        message: `This assignment only accepts ${assignment.submissionType} submissions.`,
      });
    }

    const existingCount = await AssignmentSubmission.countDocuments({
      assignment: assignment._id,
      student: req.user._id,
    });

    if (existingCount >= assignment.maxSubmissions) {
      return res.status(400).json({
        success: false,
        message: "You have reached the maximum number of submissions.",
      });
    }

    const latestSubmission = await AssignmentSubmission.findOne({
      assignment: assignment._id,
      student: req.user._id,
    }).sort({ submissionNumber: -1 });

    if (latestSubmission) {
      if (!assignment.allowResubmission) {
        return res.status(400).json({
          success: false,
          message: "Resubmission is not allowed for this assignment.",
        });
      }

      if (latestSubmission.status !== "resubmission_required") {
        return res.status(400).json({
          success: false,
          message: "Your previous submission must be reviewed and returned for resubmission before submitting again.",
        });
      }
    }

    uploadedFiles = await uploadSubmissionFiles(req.files);

    const submission = await AssignmentSubmission.create({
      assignment: assignment._id,
      student: req.user._id,
      enrollment: enrollment._id,
      files: uploadedFiles,
      studentComment,
      submissionNumber: existingCount + 1,
      status: "submitted",
      submittedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "Assignment submitted successfully.",
      submission,
    });
  } catch (error) {
    console.error("Submit assignment error:", error);

    // Avoid leaving uploaded files behind if saving fails.
    if (uploadedFiles.length) {
      await removeCloudinaryFiles(uploadedFiles);
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A submission attempt was created at the same time. Please refresh and try again.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to submit assignment. Please try again.",
    });
  }
  finally {
      for (const file of req.files || []) {
          try {
              await fs.unlink(file.path);
            } catch (cleanupError) {
                console.error(
                    "Assignment temporary file cleanup error:",
                    cleanupError.message
                )
            }
        }
  }
}


// =====================================================
// STUDENT — MY SUBMISSION HISTORY
// =====================================================

const getMySubmissions = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    if (!isValidId(assignmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignment ID.",
      });
    }

    const assignment = await Assignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    const enrollment = await CourseEnrollment.findOne({
      user: req.user._id,
      course: assignment.course,
      status: { $in: ["active", "completed"] },
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this course.",
      });
    }

    const submissions = await AssignmentSubmission.find({
      assignment: assignmentId,
      student: req.user._id,
    })
      .populate("gradedBy", "firstName lastName")
      .sort({ submissionNumber: -1 });

    return res.status(200).json({
      success: true,
      count: submissions.length,
      submissions,
    });
  } catch (error) {
    console.error("Get my submissions error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load submission history.",
    });
  }
};

// =====================================================
// ADMIN — GET ASSIGNMENT SUBMISSIONS
// =====================================================

const getAssignmentSubmissions = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    if (!isValidId(assignmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignment ID.",
      });
    }

    const assignment = await Assignment.findById(assignmentId)
      .populate("course", "title");

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    const submissions = await AssignmentSubmission.find({
      assignment: assignmentId,
    })
      .populate("student", "firstName lastName email")
      .populate("enrollment", "courseSnapshot status paymentStatus")
      .populate("gradedBy", "firstName lastName")
      .sort({ submittedAt: -1 });

    return res.status(200).json({
      success: true,
      assignment,
      count: submissions.length,
      submissions,
    });
  } catch (error) {
    console.error("Get assignment submissions error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load assignment submissions.",
    });
  }
};

// =====================================================
// ADMIN — MARK SUBMISSION UNDER REVIEW
// =====================================================

const markSubmissionUnderReview = async (req, res) => {
  try {
    const { submissionId } = req.params;

    if (!isValidId(submissionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid submission ID.",
      });
    }

    const submission = await AssignmentSubmission.findById(
      submissionId
    );

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "Submission not found.",
      });
    }

    if (submission.status !== "submitted") {
      return res.status(400).json({
        success: false,
        message: "Only newly submitted work can be marked under review.",
      });
    }

    submission.status = "under_review";
    await submission.save();

    return res.status(200).json({
      success: true,
      message: "Submission marked as under review.",
      submission,
    });
  } catch (error) {
    console.error("Mark submission review error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update submission status.",
    });
  }
};

// =====================================================
// ADMIN — GRADE SUBMISSION
// =====================================================

const gradeSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { marksAwarded, instructorFeedback } = req.body;

    if (!isValidId(submissionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid submission ID.",
      });
    }

    if (
      marksAwarded === undefined ||
      marksAwarded === null ||
      !Number.isFinite(Number(marksAwarded))
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid marks.",
      });
    }

    const submission = await AssignmentSubmission.findById(
      submissionId
    );

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "Submission not found.",
      });
    }

    if (
      !["submitted", "under_review"].includes(submission.status)
    ) {
      return res.status(400).json({
        success: false,
        message: "This submission cannot be graded in its current state.",
      });
    }

    const assignment = await Assignment.findById(
      submission.assignment
    );

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "The related assignment could not be found.",
      });
    }

    const marks = Number(marksAwarded);

    if (
      marks < 0 ||
      marks > assignment.totalMarks
    ) {
      return res.status(400).json({
        success: false,
        message: `Marks must be between 0 and ${assignment.totalMarks}.`,
      });
    }

    submission.marksAwarded = marks;
    submission.instructorFeedback = String(
      instructorFeedback || ""
    ).trim();
    submission.status = "graded";
    submission.gradedBy = req.user._id;
    submission.gradedAt = new Date();

    await submission.save();

    return res.status(200).json({
      success: true,
      message: "Assignment graded successfully.",
      submission,
    });
  } catch (error) {
    console.error("Grade submission error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to grade submission.",
    });
  }
};

// =====================================================
// ADMIN — REQUEST RESUBMISSION
// =====================================================

const requestResubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const feedback = String(
      req.body.instructorFeedback || ""
    ).trim();

    if (!isValidId(submissionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid submission ID.",
      });
    }

    if (!feedback) {
      return res.status(400).json({
        success: false,
        message: "Please explain what the student needs to improve.",
      });
    }

    const submission = await AssignmentSubmission.findById(
      submissionId
    );

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: "Submission not found.",
      });
    }

    const assignment = await Assignment.findById(
      submission.assignment
    );

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    if (!assignment.allowResubmission) {
      return res.status(400).json({
        success: false,
        message: "Resubmission is disabled for this assignment.",
      });
    }

    const submissionCount = await AssignmentSubmission.countDocuments({
      assignment: assignment._id,
      student: submission.student,
    });

    if (submissionCount >= assignment.maxSubmissions) {
      return res.status(400).json({
        success: false,
        message: "The student has reached the maximum number of submissions.",
      });
    }

    if (
      !["submitted", "under_review", "graded"].includes(
        submission.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "This submission cannot be returned for resubmission.",
      });
    }

    submission.status = "resubmission_required";
    submission.instructorFeedback = feedback;
    submission.marksAwarded = null;
    submission.gradedBy = null;
    submission.gradedAt = null;

    await submission.save();

    return res.status(200).json({
      success: true,
      message: "Resubmission requested successfully.",
      submission,
    });
  } catch (error) {
    console.error("Request resubmission error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to request resubmission.",
    });
  }
};

module.exports = {
  submitAssignment,
  getMySubmissions,
  getAssignmentSubmissions,
  markSubmissionUnderReview,
  gradeSubmission,
  requestResubmission,
};
