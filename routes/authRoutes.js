const express = require("express");

const { registerUser, loginUser } = require("../controllers/authController");
const { googleLogin,facebookLogin } = require("../controllers/socialAuthController");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/google", googleLogin);
router.post("/facebook", facebookLogin);

module.exports = router;
