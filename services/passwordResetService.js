const crypto = require("crypto");
const { sendEmail } = require("./emailService");

const hashResetCode = (code) =>
  crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(String(code))
    .digest("hex");

async function sendPasswordResetCode({ email, firstName, code }) {
  await sendEmail({
    to: email,
    subject: "Reset your ABS CUT password",
    text: [
      `Hello ${firstName || "Customer"},`,
      "",
      "Use this code to reset your ABS CUT password:",
      code,
      "",
      "This code expires in 10 minutes.",
      "If you did not request a password reset, ignore this email.",
    ].join("\n"),
    html: `
      <div style="background:#f8f5ed;padding:30px;font-family:Arial,sans-serif;color:#1e2924">
        <div style="max-width:520px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dedbd2">
          <header style="background:#0b3d2e;color:#fff;padding:24px;border-bottom:4px solid #c9a227">
            <div style="color:#c9a227;font-weight:bold;letter-spacing:3px">ABS CUT</div>
            <h2>Reset your password</h2>
          </header>
          <main style="padding:26px">
            <p>Hello ${String(firstName || "Customer").replace(/[&<>"']/g, "")},</p>
            <p>Enter this code to reset your ABS CUT password:</p>
            <div style="padding:22px;text-align:center;background:#f8f5ed;border:1px dashed #c9a227;border-radius:12px">
              <strong style="font-size:32px;letter-spacing:8px;color:#0b3d2e">${code}</strong>
            </div>
            <p>This code expires in 10 minutes.</p>
            <p>If you didn't request this, you can ignore this email.</p>
          </main>
        </div>
      </div>
    `,
  });
}

module.exports = {
  hashResetCode,
  sendPasswordResetCode,
};