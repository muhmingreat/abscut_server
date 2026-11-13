
const mongoose = require("mongoose");

const LiveClass = require("../models/LiveClass");
const Course = require("../models/Course");
const User = require("../models/User");

// =====================================================
// HELPERS
// =====================================================

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const findCourseLesson = (course, lessonId) => {
  if (!Array.isArray(course.modules)) return null;

  for (const module of course.modules) {
    if (!Array.isArray(module.lessons)) continue;

    const lesson = module.lessons.find(
      (item) => String(item._id) === String(lessonId)
    );

    if (lesson) {
      return lesson;
    }
  }

  return null;
};

const validateSchedule = (scheduledAt) => {
  const date = new Date(scheduledAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

// =====================================================
// CREATE LIVE CLASS
// ADMIN ONLY
// =====================================================

const createLiveClass = async (req, res) => {
  try {
    const {
      courseId,
      lessonId,
      title,
      description,
      instructorId,
      scheduledAt,
      durationMinutes,
      timezone,
      participantLimit,
      settings,
    } = req.body;

    if (
      !courseId ||
      !lessonId ||
      !title ||
      !instructorId ||
      !scheduledAt
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Course, lesson, title, instructor and scheduled date are required.",
      });
    }

    if (
      !isValidObjectId(courseId) ||
      !isValidObjectId(lessonId) ||
      !isValidObjectId(instructorId)
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more supplied IDs are invalid.",
      });
    }

    const course = await Course.findById(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    const lesson = findCourseLesson(course, lessonId);

    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "The selected lesson does not belong to this course.",
      });
    }

    const instructor = await User.findById(instructorId).select(
      "firstName lastName email role"
    );

    if (!instructor || instructor.role !== "staff") {
      return res.status(400).json({
        success: false,
        message: "Please select a valid staff instructor.",
      });
    }

    const parsedSchedule = validateSchedule(scheduledAt);

    if (!parsedSchedule || parsedSchedule <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "The live class must be scheduled for a future date and time.",
      });
    }

    const parsedDuration = Number(durationMinutes || 60);
    const parsedLimit = Number(participantLimit || 100);

    if (
      !Number.isInteger(parsedDuration) ||
      parsedDuration < 15 ||
      parsedDuration > 480
    ) {
      return res.status(400).json({
        success: false,
        message: "Duration must be between 15 and 480 minutes.",
      });
    }

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 2 ||
      parsedLimit > 500
    ) {
      return res.status(400).json({
        success: false,
        message: "Participant limit must be between 2 and 500.",
      });
    }

    const liveClass = await LiveClass.create({
      course: course._id,
      lesson: lesson._id,
      title: String(title).trim(),
      description: description ? String(description).trim() : "",
      instructor: instructor._id,
      createdBy: req.user._id,
      scheduledAt: parsedSchedule,
      durationMinutes: parsedDuration,
      timezone: timezone || "Africa/Lagos",
      participantLimit: parsedLimit,
      settings: {
        waitingRoomEnabled: settings?.waitingRoomEnabled ?? true,
        studentMicrophoneEnabled:
          settings?.studentMicrophoneEnabled ?? false,
        studentCameraEnabled: settings?.studentCameraEnabled ?? false,
        screenShareEnabled: settings?.screenShareEnabled ?? false,
        chatEnabled: settings?.chatEnabled ?? true,
      },
      status: "scheduled",
    });

    const populatedClass = await LiveClass.findById(liveClass._id)
      .populate("course", "title slug")
      .populate("instructor", "firstName lastName email")
      .populate("createdBy", "firstName lastName");

    return res.status(201).json({
      success: true,
      message: "Live class scheduled successfully.",
      liveClass: populatedClass,
    });
  } catch (error) {
    console.error("Create live class error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to schedule live class.",
    });
  }
};

// =====================================================
// GET LIVE CLASSES
// ADMIN: ALL CLASSES
// STAFF: ASSIGNED CLASSES ONLY
// =====================================================

const getLiveClasses = async (req, res) => {
  try {
    const filter = {};

    if (req.user.role === "staff") {
      filter.instructor = req.user._id;
    } else if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view these live classes.",
      });
    }

    if (req.query.status) {
      const allowedStatuses = [
        "scheduled",
        "live",
        "ended",
        "cancelled",
      ];

      if (!allowedStatuses.includes(req.query.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid live class status.",
        });
      }

      filter.status = req.query.status;
    }

    if (req.query.courseId) {
      if (!isValidObjectId(req.query.courseId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid course ID.",
        });
      }

      filter.course = req.query.courseId;
    }

    const liveClasses = await LiveClass.find(filter)
      .populate("course", "title slug")
      .populate("instructor", "firstName lastName email")
      .populate("createdBy", "firstName lastName")
      .sort({ scheduledAt: 1 });

    return res.status(200).json({
      success: true,
      count: liveClasses.length,
      liveClasses,
    });
  } catch (error) {
    console.error("Get live classes error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve live classes.",
    });
  }
};

// =====================================================
// GET SINGLE LIVE CLASS
// ADMIN OR ASSIGNED INSTRUCTOR
// =====================================================

const getLiveClassById = async (req, res) => {
  try {
    const { liveClassId } = req.params;

    if (!isValidObjectId(liveClassId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid live class ID.",
      });
    }

    const liveClass = await LiveClass.findById(liveClassId)
      .populate("course", "title slug")
      .populate("instructor", "firstName lastName email")
      .populate("createdBy", "firstName lastName");

    if (!liveClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found.",
      });
    }

    const isAdmin = req.user.role === "admin";
    const isAssignedInstructor =
      String(liveClass.instructor._id) === String(req.user._id);

    if (!isAdmin && !isAssignedInstructor) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to view this live class.",
      });
    }

    return res.status(200).json({
      success: true,
      liveClass,
    });
  } catch (error) {
    console.error("Get live class error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve live class.",
    });
  }
};

// =====================================================
// UPDATE / RESCHEDULE LIVE CLASS
// ADMIN ONLY
// =====================================================

const updateLiveClass = async (req, res) => {
  try {
    const { liveClassId } = req.params;

    if (!isValidObjectId(liveClassId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid live class ID.",
      });
    }

    const liveClass = await LiveClass.findById(liveClassId);

    if (!liveClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found.",
      });
    }

    if (liveClass.status !== "scheduled") {
      return res.status(400).json({
        success: false,
        message: "Only scheduled classes can be updated.",
      });
    }

    const {
      title,
      description,
      instructorId,
      scheduledAt,
      durationMinutes,
      timezone,
      participantLimit,
      settings,
    } = req.body;

    if (title !== undefined) {
      if (!String(title).trim()) {
        return res.status(400).json({
          success: false,
          message: "Class title cannot be empty.",
        });
      }

      liveClass.title = String(title).trim();
    }

    if (description !== undefined) {
      liveClass.description = String(description).trim();
    }

    if (instructorId !== undefined) {
      if (!isValidObjectId(instructorId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid instructor ID.",
        });
      }

      const instructor = await User.findById(instructorId).select("role");

      if (!instructor || instructor.role !== "staff") {
        return res.status(400).json({
          success: false,
          message: "Please select a valid staff instructor.",
        });
      }

      liveClass.instructor = instructor._id;
    }

    if (scheduledAt !== undefined) {
      const parsedSchedule = validateSchedule(scheduledAt);

      if (!parsedSchedule || parsedSchedule <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "The live class must be scheduled for a future date and time.",
        });
      }

      liveClass.scheduledAt = parsedSchedule;
    }

    if (durationMinutes !== undefined) {
      const value = Number(durationMinutes);

      if (!Number.isInteger(value) || value < 15 || value > 480) {
        return res.status(400).json({
          success: false,
          message: "Duration must be between 15 and 480 minutes.",
        });
      }

      liveClass.durationMinutes = value;
    }

    if (participantLimit !== undefined) {
      const value = Number(participantLimit);

      if (!Number.isInteger(value) || value < 2 || value > 500) {
        return res.status(400).json({
          success: false,
          message: "Participant limit must be between 2 and 500.",
        });
      }

      liveClass.participantLimit = value;
    }

    if (timezone !== undefined) {
      liveClass.timezone = timezone;
    }

    if (settings !== undefined) {
      const allowedSettings = [
        "waitingRoomEnabled",
        "studentMicrophoneEnabled",
        "studentCameraEnabled",
        "screenShareEnabled",
        "chatEnabled",
      ];

      for (const key of allowedSettings) {
        if (settings[key] !== undefined) {
          liveClass.settings[key] = Boolean(settings[key]);
        }
      }
    }

    await liveClass.save();

    const updatedClass = await LiveClass.findById(liveClass._id)
      .populate("course", "title slug")
      .populate("instructor", "firstName lastName email")
      .populate("createdBy", "firstName lastName");

    return res.status(200).json({
      success: true,
      message: "Live class updated successfully.",
      liveClass: updatedClass,
    });
  } catch (error) {
    console.error("Update live class error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update live class.",
    });
  }
};

// =====================================================
// CANCEL LIVE CLASS
// ADMIN ONLY
// =====================================================

const cancelLiveClass = async (req, res) => {
  try {
    const { liveClassId } = req.params;

    if (!isValidObjectId(liveClassId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid live class ID.",
      });
    }

    const liveClass = await LiveClass.findById(liveClassId);

    if (!liveClass) {
      return res.status(404).json({
        success: false,
        message: "Live class not found.",
      });
    }

    if (liveClass.status === "live") {
      return res.status(400).json({
        success: false,
        message: "A live class must be ended before it can be cancelled.",
      });
    }

    if (liveClass.status === "ended") {
      return res.status(400).json({
        success: false,
        message: "An ended class cannot be cancelled.",
      });
    }

    if (liveClass.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "This live class is already cancelled.",
      });
    }

    liveClass.status = "cancelled";
    await liveClass.save();

    return res.status(200).json({
      success: true,
      message: "Live class cancelled successfully.",
      liveClass,
    });
  } catch (error) {
    console.error("Cancel live class error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to cancel live class.",
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  createLiveClass,
  getLiveClasses,
  getLiveClassById,
  updateLiveClass,
  cancelLiveClass,
};
