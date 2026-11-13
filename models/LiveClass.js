
const mongoose = require("mongoose");

// =====================================================
// ABS CUT FASHION ACADEMY — LIVE CLASS
// =====================================================

const liveClassSchema = new mongoose.Schema(
  {
    // ---------------------------------------------------
    // COURSE & LESSON
    // ---------------------------------------------------

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },

    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    // ---------------------------------------------------
    // CLASS INFORMATION
    // ---------------------------------------------------

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },

    // ---------------------------------------------------
    // INSTRUCTOR
    // ---------------------------------------------------

    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ---------------------------------------------------
    // SCHEDULING
    // ---------------------------------------------------

    scheduledAt: {
      type: Date,
      required: true,
      index: true,
    },

    durationMinutes: {
      type: Number,
      required: true,
      min: 15,
      max: 480,
      default: 60,
    },

    timezone: {
      type: String,
      default: "Africa/Lagos",
    },

    // ---------------------------------------------------
    // CLASS STATUS
    // ---------------------------------------------------

    status: {
      type: String,
      enum: [
        "scheduled",
        "live",
        "ended",
        "cancelled",
      ],
      default: "scheduled",
      index: true,
    },

    // ---------------------------------------------------
    // LIVE SESSION
    // ---------------------------------------------------

    startedAt: {
      type: Date,
      default: null,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    liveKitRoomName: {
      type: String,
      unique: true,
      sparse: true,
    },

    // ---------------------------------------------------
    // CLASSROOM SETTINGS
    // ---------------------------------------------------

    settings: {
      waitingRoomEnabled: {
        type: Boolean,
        default: true,
      },

      studentMicrophoneEnabled: {
        type: Boolean,
        default: false,
      },

      studentCameraEnabled: {
        type: Boolean,
        default: false,
      },

      screenShareEnabled: {
        type: Boolean,
        default: false,
      },

      chatEnabled: {
        type: Boolean,
        default: true,
      },
    },

    // ---------------------------------------------------
    // PARTICIPANT COUNTS
    // ---------------------------------------------------

    participantLimit: {
      type: Number,
      min: 2,
      max: 500,
      default: 100,
    },
  },
  {
    timestamps: true,
  }
);

// -------------------------------------------------------
// INDEXES
// -------------------------------------------------------

liveClassSchema.index({
  course: 1,
  scheduledAt: 1,
});

liveClassSchema.index({
  instructor: 1,
  status: 1,
  scheduledAt: 1,
});

// -------------------------------------------------------
// EXPORT
// -------------------------------------------------------

module.exports = mongoose.model("LiveClass", liveClassSchema);
