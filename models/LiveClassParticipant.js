
const mongoose = require("mongoose");

// =====================================================
// ABS CUT LIVE — CLASS PARTICIPANT
// =====================================================

const liveClassParticipantSchema = new mongoose.Schema(
  {
    liveClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LiveClass",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    enrollment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseEnrollment",
      required: true,
    },

    // ---------------------------------------------------
    // WAITING ROOM & ADMISSION
    // ---------------------------------------------------

    admissionStatus: {
      type: String,
      enum: [
        "waiting",
        "admitted",
        "rejected",
        "removed",
      ],
      default: "waiting",
    },

    requestedAt: {
      type: Date,
      default: Date.now,
    },

    admittedAt: {
      type: Date,
      default: null,
    },

    admittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ---------------------------------------------------
    // PARTICIPANT PERMISSIONS
    // ---------------------------------------------------

    microphonePermission: {
      type: Boolean,
      default: false,
    },

    cameraPermission: {
      type: Boolean,
      default: false,
    },

    screenSharePermission: {
      type: Boolean,
      default: false,
    },

    // ---------------------------------------------------
    // ATTENDANCE
    // ---------------------------------------------------

    firstJoinedAt: {
      type: Date,
      default: null,
    },

    lastJoinedAt: {
      type: Date,
      default: null,
    },

    lastLeftAt: {
      type: Date,
      default: null,
    },

    totalAttendanceSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },

    isCurrentlyConnected: {
      type: Boolean,
      default: false,
    },

    // ---------------------------------------------------
    // PARTICIPATION
    // ---------------------------------------------------

    raisedHand: {
      type: Boolean,
      default: false,
    },

    raisedHandAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One participant record per user per class.
liveClassParticipantSchema.index(
  {
    liveClass: 1,
    user: 1,
  },
  {
    unique: true,
  }
);

liveClassParticipantSchema.index({
  liveClass: 1,
  admissionStatus: 1,
});

module.exports = mongoose.model(
  "LiveClassParticipant",
  liveClassParticipantSchema
);
