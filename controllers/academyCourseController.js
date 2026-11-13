const Course = require("../models/Course");

// =====================================================
// HELPERS
// =====================================================

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const getLessonCount = (course) =>
  course.modules.reduce(
    (total, module) => total + module.lessons.length,
    0
  );

const getDuration = (course) =>
  course.modules.reduce(
    (total, module) =>
      total +
      module.lessons.reduce(
        (lessonTotal, lesson) =>
          lessonTotal + Number(lesson.durationSeconds || 0),
        0
      ),
    0
  );

// Remove private lesson URLs/content from public course responses.
const publicCourse = (course) => {
  const data = course.toObject();

  data.modules = data.modules.map((module) => ({
    ...module,
    lessons: module.lessons.map((lesson) => {
      const lessonData = { ...lesson };

      if (!lessonData.isPreview) {
        lessonData.videoUrl = "";
        lessonData.content = "";
        lessonData.resources = [];
      }

      return lessonData;
    }),
  }));

  return data;
};

// =====================================================
// PUBLIC — LIST PUBLISHED COURSES
// GET /api/academy/courses
// =====================================================

const getPublishedCourses = async (req, res) => {
  try {
    const {
      category,
      level,
      search,
      page = 1,
      limit = 12,
    } = req.query;

    const filter = {
      status: "published",
    };

    if (category) filter.category = category;
    if (level) filter.level = level;

    if (search) {
      filter.$text = {
        $search: search,
      };
    }

    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(
      30,
      Math.max(1, Number(limit) || 12)
    );

    const [courses, total] = await Promise.all([
      Course.find(filter)
        .select(
          "title slug shortDescription category level thumbnail instructorName price currency isFree estimatedDurationHours certificateEnabled createdAt"
        )
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),

      Course.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      courses,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    console.error("Academy courses error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve Academy courses.",
    });
  }
};

// =====================================================
// PUBLIC — COURSE DETAILS
// GET /api/academy/courses/:slug
// =====================================================

const getPublishedCourse = async (req, res) => {
  try {
    const course = await Course.findOne({
      slug: req.params.slug,
      status: "published",
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    return res.json({
      success: true,
      course: publicCourse(course),
    });
  } catch (error) {
    console.error("Academy course details error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve course.",
    });
  }
};

// =====================================================
// ADMIN — LIST ALL COURSES
// GET /api/academy/admin/courses
// =====================================================

const getAdminCourses = async (req, res) => {
  try {
    const courses = await Course.find()
      .sort({ createdAt: -1 })
      .populate("createdBy", "firstName lastName email");

    return res.json({
      success: true,
      courses,
    });
  } catch (error) {
    console.error("Admin Academy courses error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve Academy courses.",
    });
  }
};

// =====================================================
// ADMIN — CREATE COURSE
// POST /api/academy/admin/courses
// =====================================================

const createCourse = async (req, res) => {
  try {
    const {
      title,
      shortDescription,
      description,
      category,
      level,
      thumbnail,
      instructorName,
      instructorBio,
      price,
      isFree,
      modules,
      requirements,
      learningOutcomes,
      estimatedDurationHours,
      certificateEnabled,
      accessDurationDays,
      language,
    } = req.body;

    if (
      !title ||
      !shortDescription ||
      !description ||
      !category
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Title, short description, description and category are required.",
      });
    }

    const free = isFree === true;

    const coursePrice = free ? 0 : Number(price);

    if (
      !free &&
      (!Number.isFinite(coursePrice) || coursePrice <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: "Paid courses must have a valid price.",
      });
    }

    const baseSlug = slugify(title);

    if (!baseSlug) {
      return res.status(400).json({
        success: false,
        message: "A valid course title is required.",
      });
    }

    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const course = await Course.create({
      title,
      slug,
      shortDescription,
      description,
      category,
      level,
      thumbnail,
      instructorName,
      instructorBio,
      price: coursePrice,
      isFree: free,
      modules: modules || [],
      requirements: requirements || [],
      learningOutcomes: learningOutcomes || [],
      estimatedDurationHours,
      certificateEnabled,
      accessDurationDays,
      language,
      createdBy: req.user._id,
      status: "draft",
    });

    return res.status(201).json({
      success: true,
      message: "Academy course created successfully.",
      course,
    });
  } catch (error) {
    console.error("Create Academy course error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create course.",
    });
  }
};

// =====================================================
// ADMIN — UPDATE COURSE
// PUT /api/academy/admin/courses/:id
// =====================================================

const updateCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    const allowedFields = [
      "title",
      "shortDescription",
      "description",
      "category",
      "level",
      "thumbnail",
      "instructorName",
      "instructorBio",
      "modules",
      "requirements",
      "learningOutcomes",
      "estimatedDurationHours",
      "certificateEnabled",
      "accessDurationDays",
      "language",
    ]

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        course[field] = req.body[field];
      }
    }

    if (req.body.isFree !== undefined) {
      course.isFree = req.body.isFree === true;
    }

    if (req.body.price !== undefined) {
      course.price = Number(req.body.price);
    }

    if (course.isFree) {
      course.price = 0;
    }

    await course.save();

    return res.json({
      success: true,
      message: "Course updated successfully.",
      course,
    });
  } catch (error) {
    console.error("Update Academy course error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update course.",
    });
  }
};

// =====================================================
// ADMIN — PUBLISH COURSE
// PATCH /api/academy/admin/courses/:id/publish
// =====================================================

const publishCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    if (
      !course.modules.some(
        (module) => module.lessons.length > 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Add at least one lesson before publishing.",
      });
    }

    if (!course.isFree && course.price <= 0) {
      return res.status(400).json({
        success: false,
        message: "Set a valid course price before publishing.",
      });
    }

    course.status = "published";
    course.publishedAt = new Date();

    await course.save();

    return res.json({
      success: true,
      message: "Course published successfully.",
      course,
    });
  } catch (error) {
    console.error("Publish Academy course error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to publish course.",
    });
  }
};

// =====================================================
// ADMIN — ARCHIVE COURSE
// PATCH /api/academy/admin/courses/:id/archive
// =====================================================

const archiveCourse = async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(
      req.params.id,
      {
        status: "archived",
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found.",
      });
    }

    return res.json({
      success: true,
      message: "Course archived successfully.",
      course,
    });
  } catch (error) {
    console.error("Archive Academy course error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to archive course.",
    });
  }
};

module.exports = {
  getPublishedCourses,
  getPublishedCourse,
  getAdminCourses,
  createCourse,
  updateCourse,
  publishCourse,
  archiveCourse,
};