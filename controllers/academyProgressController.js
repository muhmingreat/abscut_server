const Course = require("../models/Course");
const CourseEnrollment = require("../models/CourseEnrollment");

// =====================================================
// ACCESS HELPERS
// =====================================================

function hasValidCourseAccess(enrollment) {
  if (!enrollment) return false;

  const allowedStatuses = ["active", "completed"];

  const allowedPaymentStatuses = [
    "paid",
    "partially_paid",
    "not_required",
  ];

  if (!allowedStatuses.includes(enrollment.status)) {
    return false;
  }

  if (!allowedPaymentStatuses.includes(enrollment.paymentStatus)) {
    return false;
  }

  if (
    enrollment.accessExpiresAt &&
    new Date(enrollment.accessExpiresAt) < new Date()
  ) {
    return false;
  }

  return true;
}

function isFullyPaid(enrollment) {
  return (
    enrollment.paymentStatus === "paid" ||
    enrollment.paymentStatus === "not_required"
  );
}

// =====================================================
// FIND THE FINAL LESSON
// Uses module and lesson order, with array position
// as a fallback.
// =====================================================

function getFinalLesson(course) {
  const lessons = [];

  (course.modules || []).forEach((module, moduleIndex) => {
    (module.lessons || []).forEach((lesson, lessonIndex) => {
      lessons.push({
        lesson,
        moduleOrder: Number.isFinite(Number(module.order))
          ? Number(module.order)
          : moduleIndex,
        lessonOrder: Number.isFinite(Number(lesson.order))
          ? Number(lesson.order)
          : lessonIndex,
        originalPosition: lessons.length,
      });
    });
  });

  if (!lessons.length) return null;

  lessons.sort((a, b) => {
    if (a.moduleOrder !== b.moduleOrder) {
      return a.moduleOrder - b.moduleOrder;
    }

    if (a.lessonOrder !== b.lessonOrder) {
      return a.lessonOrder - b.lessonOrder;
    }

    return a.originalPosition - b.originalPosition;
  });

  return lessons[lessons.length - 1].lesson;
}

// =====================================================
// COURSE LESSON STATISTICS
// =====================================================

function getCourseLessonStats(course, completedLessonIds = []) {
  const allLessons = (course.modules || []).flatMap(
    (module) => module.lessons || []
  );

  const totalLessons = allLessons.length;

  const completedIds = new Set(
    completedLessonIds.map((id) => String(id))
  );

  const completedCount = allLessons.filter((lesson) =>
    completedIds.has(String(lesson._id))
  ).length;

  const progressPercentage =
    totalLessons > 0
      ? Math.round((completedCount / totalLessons) * 100)
      : 0;

  return {
    totalLessons,
    completedLessons: completedCount,
    progressPercentage,
    remainingLessons: totalLessons - completedCount,
  };
}

// =====================================================
// GET COURSE PROGRESS
// GET /api/academy/enrollments/:enrollmentId/progress
// =====================================================

const getCourseProgress = async (req, res) => {
  try {
    const enrollment = await CourseEnrollment.findOne({
      _id: req.params.enrollmentId,
      user: req.user._id,
    });

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Course enrollment not found.",
      });
    }

    if (!hasValidCourseAccess(enrollment)) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this course.",
      });
    }

    const course = await Course.findById(enrollment.course);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    const stats = getCourseLessonStats(
      course,
      enrollment.completedLessonIds
    );

    const finalLesson = getFinalLesson(course);

    const finalLessonCompleted = finalLesson
      ? enrollment.completedLessonIds.some(
          (id) => String(id) === String(finalLesson._id)
        )
      : false;

    return res.status(200).json({
      success: true,

      enrollment: {
        id: enrollment._id,
        status: enrollment.status,
        paymentStatus: enrollment.paymentStatus,
        amountDue: enrollment.amountDue,
        amountPaid: enrollment.amountPaid,
        remainingBalance: Math.max(
          0,
          enrollment.amountDue - enrollment.amountPaid
        ),
        progressPercentage: stats.progressPercentage,
        completedLessons: stats.completedLessons,
        totalLessons: stats.totalLessons,
        remainingLessons: stats.remainingLessons,
        completedLessonIds: enrollment.completedLessonIds,
        lastAccessedAt: enrollment.lastAccessedAt,
        completedAt: enrollment.completedAt,
      },

      access: {
        isFullyPaid: isFullyPaid(enrollment),
        isPartiallyPaid:
          enrollment.paymentStatus === "partially_paid",
        finalLessonLocked:
          !isFullyPaid(enrollment) && !finalLessonCompleted,
      },
    });
  } catch (error) {
    console.error("Get course progress error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve course progress.",
    });
  }
};

// =====================================================
// MARK LESSON AS COMPLETED
// POST /api/academy/enrollments/:enrollmentId/lessons/:lessonId/complete
// =====================================================

  const completeLesson = async (req, res) => {
  try {
    const { enrollmentId, lessonId } = req.params;

    // 1. Find the student's enrollment.
    const enrollment = await CourseEnrollment.findOne({
      _id: enrollmentId,
      user: req.user._id,
    });

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Course enrollment not found.",
      });
    }

    // 2. Verify access, including partially paid access.
    if (!hasValidCourseAccess(enrollment)) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this course.",
      });
    }

    // 3. Load the course.
    const course = await Course.findById(enrollment.course);

    if (
      !course ||
      !["published", "archived"].includes(course.status)
    ) {
      return res.status(404).json({
        success: false,
        message: "Course is unavailable.",
      });
    }

    // 4. Find the requested lesson.
    const allLessons = (course.modules || []).flatMap(
      (module) => module.lessons || []
    );

    const lesson = allLessons.find(
      (item) => String(item._id) === String(lessonId)
    );

    if (!lesson) {
      return res.status(404).json({
        success: false,
        message: "Lesson does not belong to this course.",
      });
    }

    // 5. Block completion of the final lesson until full payment.
    const finalLesson = getFinalLesson(course);

    const isFinalLesson =
      finalLesson &&
      String(finalLesson._id) === String(lesson._id);

    if (isFinalLesson && !isFullyPaid(enrollment)) {
      return res.status(403).json({
        success: false,
        code: "FINAL_LESSON_PAYMENT_REQUIRED",
        message:
          "Complete your outstanding course payment before completing the final lesson.",
        amountDue: enrollment.amountDue,
        amountPaid: enrollment.amountPaid,
        remainingBalance: Math.max(
          0,
          enrollment.amountDue - enrollment.amountPaid
        ),
      });
    }

    // 6. Prevent duplicate completion entries.
    const alreadyCompleted = enrollment.completedLessonIds.some(
      (id) => String(id) === String(lesson._id)
    );

    if (!alreadyCompleted) {
      enrollment.completedLessonIds.push(lesson._id);
    }

    // 7. Update last accessed time.
    enrollment.lastAccessedAt = new Date();

    // 8. Calculate progress.
    const stats = getCourseLessonStats(
      course,
      enrollment.completedLessonIds
    );

    enrollment.progressPercentage = stats.progressPercentage;

    // 9. Complete the course only when every lesson is
    // complete AND the enrollment is fully paid.
    const courseFullyCompleted =
      stats.totalLessons > 0 &&
      stats.completedLessons === stats.totalLessons;

    if (courseFullyCompleted && isFullyPaid(enrollment)) {
      enrollment.status = "completed";

      if (!enrollment.completedAt) {
        enrollment.completedAt = new Date();
      }
    }

    await enrollment.save();

    return res.status(200).json({
      success: true,
      message: alreadyCompleted
        ? "Lesson was already completed."
        : "Lesson completed successfully.",

      lessonId: lesson._id,

      enrollment: {
        id: enrollment._id,
        status: enrollment.status,
        paymentStatus: enrollment.paymentStatus,
        progressPercentage: enrollment.progressPercentage,
        completedLessons: stats.completedLessons,
        totalLessons: stats.totalLessons,
        remainingLessons: stats.remainingLessons,
        completedLessonIds: enrollment.completedLessonIds,
        completedAt: enrollment.completedAt,
      },
    });
  } catch (error) {
    console.error("Complete lesson error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to complete lesson.",
    });
  }
};

module.exports = {
  getCourseProgress,
  completeLesson,
};

