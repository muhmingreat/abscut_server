
const mongoose = require("mongoose");

const Assignment = require("../models/Assignment");
const Course = require("../models/Course");
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

const validateModule = (course, moduleId) => {
  if (!moduleId) return true;

  return Boolean(course.modules.id(moduleId));
};

const cleanResources = (resources) => {
  if (!Array.isArray(resources)) return [];

  return resources
    .filter((resource) => resource?.title && resource?.url)
    .map((resource) => ({
      title: String(resource.title).trim(),
      url: String(resource.url).trim(),
      type: resource.type || "other",
    }));
};

// =====================================================
// ADMIN — CREATE ASSIGNMENT
// =====================================================

const createAssignment = async (req, res) => {
  try {
    const {
      courseId,
      moduleId,
      title,
      instructions,
      submissionType,
      resources,
      totalMarks,
      passingMarks,
      dueDate,
      allowResubmission,
      maxSubmissions,
    } = req.body;

    if (!courseId || !isValidId(courseId)) {
      return res.status(400).json({
        success: false,
        message: "A valid course is required.",
      });
    }

    if (!title?.trim() || !instructions?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Assignment title and instructions are required.",
      });
    }

    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    if (moduleId && !validateModule(course, moduleId)) {
      return res.status(400).json({
        success: false,
        message: "The selected module does not belong to this course.",
      });
    }

    const marks = Number(totalMarks ?? 100);
    const passMarks = Number(passingMarks ?? 50);
    const attempts = Number(maxSubmissions ?? 3);

    if (
      !Number.isFinite(marks) ||
      marks < 1 ||
      !Number.isFinite(passMarks) ||
      passMarks < 0 ||
      passMarks > marks
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid assignment marks.",
      });
    }

    if (
      !Number.isInteger(attempts) ||
      attempts < 1 ||
      attempts > 20
    ) {
      return res.status(400).json({
        success: false,
        message: "Maximum submissions must be between 1 and 20.",
      });
    }

    const validTypes = ["image", "video", "document", "mixed"];

    if (
      submissionType &&
      !validTypes.includes(submissionType)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid submission type.",
      });
    }

    const assignment = await Assignment.create({
      course: course._id,
      moduleId: moduleId || null,
      title: title.trim(),
      instructions: instructions.trim(),
      submissionType: submissionType || "image",
      resources: cleanResources(resources),
      totalMarks: marks,
      passingMarks: passMarks,
      dueDate: dueDate || null,
      allowResubmission: allowResubmission !== false,
      maxSubmissions: attempts,
      status: "draft",
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Assignment created successfully.",
      assignment,
    });
  } catch (error) {
    console.error("Create assignment error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create assignment.",
    });
  }
};

// =====================================================
// ADMIN — GET ALL ASSIGNMENTS
// =====================================================

const getAdminAssignments = async (req, res) => {
  try {
    const { courseId, status } = req.query;

    const filter = {};

    if (courseId) {
      if (!isValidId(courseId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid course ID.",
        });
      }

      filter.course = courseId;
    }

    if (status) {
      if (!["draft", "published", "closed"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid assignment status.",
        });
      }

      filter.status = status;
    }

    const assignments = await Assignment.find(filter)
      .populate("course", "title slug thumbnail")
      .populate("createdBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: assignments.length,
      assignments,
    });
  } catch (error) {
    console.error("Get admin assignments error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load assignments.",
    });
  }
};

// =====================================================
// ADMIN — UPDATE ASSIGNMENT
// =====================================================

const updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignment ID.",
      });
    }

    const assignment = await Assignment.findById(id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    const {
      courseId,
      moduleId,
      title,
      instructions,
      submissionType,
      resources,
      totalMarks,
      passingMarks,
      dueDate,
      allowResubmission,
      maxSubmissions,
    } = req.body;

    let course = null;

    if (courseId) {
      if (!isValidId(courseId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid course ID.",
        });
      }

      course = await Course.findById(courseId);

      if (!course) {
        return res.status(404).json({
          success: false,
          message: "Course not found.",
        });
      }

      assignment.course = course._id;
    } else {
      course = await Course.findById(assignment.course);
    }

    if (moduleId !== undefined) {
      if (moduleId && !validateModule(course, moduleId)) {
        return res.status(400).json({
          success: false,
          message: "The selected module does not belong to this course.",
        });
      }

      assignment.moduleId = moduleId || null;
    } else if (courseId && assignment.moduleId) {
      if (!validateModule(course, assignment.moduleId)) {
        return res.status(400).json({
          success: false,
          message: "Select a module belonging to the new course.",
        });
      }
    }

    if (title !== undefined) assignment.title = title.trim();
    if (instructions !== undefined) {
      assignment.instructions = instructions.trim();
    }

    if (submissionType !== undefined) {
      assignment.submissionType = submissionType;
    }

    if (resources !== undefined) {
      assignment.resources = cleanResources(resources);
    }

    if (totalMarks !== undefined) {
      assignment.totalMarks = Number(totalMarks);
    }

    if (passingMarks !== undefined) {
      assignment.passingMarks = Number(passingMarks);
    }

    if (dueDate !== undefined) {
      assignment.dueDate = dueDate || null;
    }

    if (allowResubmission !== undefined) {
      assignment.allowResubmission = allowResubmission === true ||
        allowResubmission === "true";
    }

    if (maxSubmissions !== undefined) {
      assignment.maxSubmissions = Number(maxSubmissions);
    }

    await assignment.save();

    return res.status(200).json({
      success: true,
      message: "Assignment updated successfully.",
      assignment,
    });
  } catch (error) {
    console.error("Update assignment error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Unable to update assignment.",
    });
  }
};

// =====================================================
// ADMIN — PUBLISH ASSIGNMENT
// =====================================================

const publishAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignment ID.",
      });
    }

    const assignment = await Assignment.findById(id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    if (assignment.status === "closed") {
      return res.status(400).json({
        success: false,
        message: "A closed assignment cannot be published again.",
      });
    }

    assignment.status = "published";
    await assignment.save();

    return res.status(200).json({
      success: true,
      message: "Assignment published successfully.",
      assignment,
    });
  } catch (error) {
    console.error("Publish assignment error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to publish assignment.",
    });
  }
};

// =====================================================
// ADMIN — CLOSE ASSIGNMENT
// =====================================================

const closeAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignment ID.",
      });
    }

    const assignment = await Assignment.findByIdAndUpdate(
      id,
      { status: "closed" },
      { new: true, runValidators: true }
    );

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Assignment closed successfully.",
      assignment,
    });
  } catch (error) {
    console.error("Close assignment error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to close assignment.",
    });
  }
};

// =====================================================
// STUDENT — GET COURSE ASSIGNMENTS
// =====================================================

const getCourseAssignments = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!isValidId(courseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid course ID.",
      });
    }

    const enrollment = await getActiveEnrollment(
      req.user._id,
      courseId
    );

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "An active course enrollment is required.",
      });
    }

    const assignments = await Assignment.find({
      course: courseId,
      status: "published",
    })
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      assignments,
    });
  } catch (error) {
    console.error("Get course assignments error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load course assignments.",
    });
  }
};

// =====================================================
// STUDENT — GET ASSIGNMENT DETAILS
// =====================================================

const getAssignmentDetails = async (req, res) => {
  try {
    const { assignmentId } = req.params;

    if (!isValidId(assignmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid assignment ID.",
      });
    }

    const assignment = await Assignment.findOne({
      _id: assignmentId,
      status: "published",
    }).populate("course", "title slug thumbnail");

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found or is not published.",
      });
    }

    const enrollment = await getActiveEnrollment(
      req.user._id,
      assignment.course._id
    );

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "An active course enrollment is required.",
      });
    }

    return res.status(200).json({
      success: true,
      assignment,
    });
  } catch (error) {
    console.error("Get assignment details error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load assignment details.",
    });
  }
};

module.exports = {
  createAssignment,
  getAdminAssignments,
  updateAssignment,
  publishAssignment,
  closeAssignment,
  getCourseAssignments,
  getAssignmentDetails,
};
