
const express = require("express");

const {
    forgotPassword,
    resetPassword,
} = require("../controllers/passwordResetController");


const { registerUser, loginUser,
    verifyEmailOtp, resendEmailOtp } = require("../controllers/authController");
const {
    googleLogin,

} = require("../controllers/socialAuthController");


const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/google", googleLogin)

router.post("/verify-email", verifyEmailOtp);
router.post("/resend-otp", resendEmailOtp);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
