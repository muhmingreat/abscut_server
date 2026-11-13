
const Course = require("../models/Course");
const CourseEnrollment = require("../models/CourseEnrollment");

const {
  createNotification,
  notifyAdmins,
} = require("../services/notificationService");

// =====================================================
// NOTIFICATION HELPERS
// =====================================================

const getSocketIO = (req) => {
  return req.app.get("io");
};

const runNotifications = async (tasks) => {
  const results = await Promise.allSettled(tasks);

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error(
        "Academy enrolment notification error:",
        result.reason
      );
    }
  });
};

// =====================================================
// ENROL IN COURSE
// POST /api/academy/enrollments/:courseId
// =====================================================

const enrollInCourse = async (req, res) => {
  try {
    const userId = req.user._id;
    const { courseId } = req.params;

    const course = await Course.findOne({
      _id: courseId,
      status: "published",
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found or unavailable.",
      });
    }

    const existingEnrollment =
      await CourseEnrollment.findOne({
        user: userId,
        course: course._id,
      });

    if (existingEnrollment) {
      return res.status(409).json({
        success: false,
        message: "You are already enrolled in this course.",
        enrollment: existingEnrollment,
      });
    }

    const isFree = course.isFree === true;

    // =================================================
    // CREATE ENROLMENT
    // =================================================

    const enrollment = await CourseEnrollment.create({
      user: userId,
      course: course._id,

      courseSnapshot: {
        title: course.title,
        price: course.price,
        currency: course.currency,
        isFree,
      },

      status: isFree ? "active" : "pending_payment",

      paymentStatus: isFree
        ? "not_required"
        : "pending",

      amountDue: course.price,
      amountPaid: 0,
      currency: course.currency,

      paymentPlan: null,
      installmentsPaid: 0,

      enrolledAt: new Date(),

      accessExpiresAt: course.accessDurationDays
        ? new Date(
            Date.now() +
              course.accessDurationDays *
                24 *
                60 *
                60 *
                1000
          )
        : null,
    });

    // =================================================
    // IN-APP NOTIFICATIONS
    // =================================================

    const io = getSocketIO(req);

    const courseTitle = course.title || "your selected course";

    const studentTitle = isFree
      ? "Course Enrolment Successful"
      : "Course Enrolment Created";

    const studentMessage = isFree
      ? `You have successfully enrolled in ${courseTitle}. You can now access your course lessons.`
      : `Your enrolment for ${courseTitle} has been created. Complete your payment to activate full course access.`;

    const adminMessage =
      `${req.user.name || req.user.firstName || "A student"} has enrolled in ${courseTitle}. ` +
      (isFree
        ? "The course is free and the enrolment is active."
        : "The enrolment is awaiting payment.");

    const courseLink = course.slug
      ? `/academy/courses/${course.slug}`
      : "/academy";

    const notificationTasks = [
      // Student notification
      createNotification({
        io,
        userId,
        title: studentTitle,
        message: studentMessage,
        type: "academy-enrollment",
        link: courseLink,
        metadata: {
          enrollmentId: String(enrollment._id),
          courseId: String(course._id),
          courseTitle,
          isFree,
          paymentStatus: enrollment.paymentStatus,
        },
      }),

      // Administrator notification
      notifyAdmins({
        io,
        title: "New Academy Enrolment",
        message: adminMessage,
        type: "academy-enrollment",
        link: "/admin",
        metadata: {
          enrollmentId: String(enrollment._id),
          courseId: String(course._id),
          courseTitle,
          studentId: String(userId),
          studentName:
            req.user.name ||
            req.user.firstName ||
            "Student",
          isFree,
          paymentStatus: enrollment.paymentStatus,
        },
      }),
    ];

    // Do not let notification errors affect enrolment.
    await runNotifications(notificationTasks);

    // =================================================
    // RESPONSE
    // =================================================

    return res.status(201).json({
      success: true,
      message: isFree
        ? "You have successfully enrolled in this course."
        : "Your enrolment has been created. Choose a payment option to access the course.",
      enrollment,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You are already enrolled in this course.",
      });
    }

    console.error("Academy enrolment error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to enrol in course.",
    });
  }
};

// =====================================================
// MY ENROLMENTS
// GET /api/academy/enrollments/me
// =====================================================

const getMyEnrollments = async (req, res) => {
  try {
    const enrollments = await CourseEnrollment.find({
      user: req.user._id,
    })
      .populate({
        path: "course",
        select:
          "title slug shortDescription thumbnail category level instructorName estimatedDurationHours certificateEnabled status",
      })
      .sort({ enrolledAt: -1 });

    return res.json({
      success: true,
      enrollments,
    });
  } catch (error) {
    console.error("My Academy enrolments error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve your courses.",
    });
  }
};

// =====================================================
// LOCK FINAL LESSON FOR PARTIALLY PAID STUDENTS
// =====================================================

const protectFinalLesson = (course, enrollment) => {
  const courseData = course.toObject();

  const isFullyPaid =
    enrollment.paymentStatus === "paid" ||
    enrollment.paymentStatus === "not_required";

  // Fully paid and free students get every lesson.
  if (isFullyPaid) {
    return courseData;
  }

  // Find all lessons and their positions.
  const lessons = [];

  courseData.modules.forEach((module, moduleIndex) => {
    (module.lessons || []).forEach(
      (lesson, lessonIndex) => {
        lessons.push({
          moduleIndex,
          lessonIndex,
          moduleOrder:
            module.order ?? moduleIndex,
          lessonOrder:
            lesson.order ?? lessonIndex,
          id: String(lesson._id),
        });
      }
    );
  });

  if (!lessons.length) {
    return courseData;
  }

  // Identify the final lesson by module and lesson order.
  lessons.sort((a, b) => {
    if (a.moduleOrder !== b.moduleOrder) {
      return a.moduleOrder - b.moduleOrder;
    }

    return a.lessonOrder - b.lessonOrder;
  });

  const finalLesson = lessons[lessons.length - 1];

  // Lock the final lesson, including preview lessons.
  const lesson =
    courseData.modules[finalLesson.moduleIndex]
      .lessons[finalLesson.lessonIndex];

  lesson.isLocked = true;

  lesson.lockReason =
    "Complete your remaining 50% course payment to unlock this final lesson.";

  // Remove protected lesson content from the API response.
  lesson.videoUrl = "";
  lesson.content = "";
  lesson.resources = [];

  // Mark all other lessons as accessible.
  courseData.modules.forEach((module) => {
    (module.lessons || []).forEach((item) => {
      if (String(item._id) !== finalLesson.id) {
        item.isLocked = false;
        item.lockReason = "";
      }
    });
  });

  return courseData;
};

// =====================================================
// ACCESS COURSE LESSONS
// GET /api/academy/enrollments/:enrollmentId/course
// =====================================================

const getEnrolledCourse = async (req, res) => {
  try {
    const enrollment = await CourseEnrollment.findOne({
      _id: req.params.enrollmentId,
      user: req.user._id,
      status: {
        $in: ["active", "completed"],
      },
      paymentStatus: {
        $in: [
          "not_required",
          "partially_paid",
          "paid",
        ],
      },
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have active course access. Please complete your enrolment or make the required first payment.",
      });
    }

    if (
      enrollment.accessExpiresAt &&
      enrollment.accessExpiresAt < new Date()
    ) {
      return res.status(403).json({
        success: false,
        message: "Your course access has expired.",
      });
    }

    const course = await Course.findOne({
      _id: enrollment.course,
      status: {
        $in: ["published", "archived"],
      },
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course content is unavailable.",
      });
    }

    enrollment.lastAccessedAt = new Date();
    await enrollment.save();

    const protectedCourse = protectFinalLesson(
      course,
      enrollment
    );

    return res.json({
      success: true,
      enrollment,
      course: protectedCourse,

      access: {
        isFullyPaid:
          enrollment.paymentStatus === "paid" ||
          enrollment.paymentStatus === "not_required",

        isPartiallyPaid:
          enrollment.paymentStatus === "partially_paid",

        finalLessonLocked:
          enrollment.paymentStatus === "partially_paid",

        amountDue: enrollment.amountDue,
        amountPaid: enrollment.amountPaid,

        remainingBalance: Math.max(
          0,
          enrollment.amountDue - enrollment.amountPaid
        ),
      },
    });
  } catch (error) {
    console.error("Academy course access error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to access course.",
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  enrollInCourse,
  getMyEnrollments,
  getEnrolledCourse,
};