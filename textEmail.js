
require("dotenv").config();

const {
  sendEmail,
  verifyEmailConnection,
} = require("./services/emailService");

async function testEmail() {
  const connected = await verifyEmailConnection();

  if (!connected) {
    console.error("Fix the SMTP connection before sending.");
    process.exitCode = 1;
    return;
  }

  try {
    const result = await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: "ABS CUT — Email Test",
      text: "Your ABS CUT email service is working.",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2 style="color: #0b3d2e;">ABS CUT</h2>
          <p>Your email service is connected successfully.</p>
          <p>You can now test your order notifications.</p>
        </div>
      `,
    });

    console.log("Email accepted:", result.messageId);
  } catch (error) {
    console.error("Email test failed:", error.message);
    process.exitCode = 1;
  }
}

testEmail();
