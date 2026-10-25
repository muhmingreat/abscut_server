
const crypto = require("crypto");
const { sendEmail } = require("./emailService");

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOtp(otp) {
  return crypto
    .createHash("sha256")
    .update(String(otp))
    .digest("hex");
}

async function sendVerificationOtp({ email, firstName, otp }) {
  const safeName = escapeHtml(firstName || "Customer");

  return sendEmail({
    to: email,
    subject: "Verify your email — ABS CUT",
    text: [
      `Hello ${firstName || "Customer"},`,
      "",
      "Use the following code to verify your ABS CUT account:",
      otp,
      "",
      "This code expires in 10 minutes.",
      "If you did not request this code, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="background:#f8f5ed;padding:32px 16px;font-family:Arial,sans-serif;color:#1e2924">
        <div style="max-width:560px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #dedbd2">
          <header style="background:#0b3d2e;color:#fff;padding:25px;border-bottom:4px solid #c9a227">
            <div style="color:#c9a227;font-weight:bold;letter-spacing:3px">ABS CUT</div>
            <h1 style="margin-bottom:0">Verify your email</h1>
          </header>

          <main style="padding:28px">
            <p>Hello ${safeName},</p>
            <p>Enter this verification code to complete your ABS CUT registration.</p>

            <div style="margin:28px 0;padding:22px;background:#f8f5ed;border:1px dashed #c9a227;border-radius:12px;text-align:center">
              <div style="font-size:12px;color:#66736d;letter-spacing:2px">YOUR VERIFICATION CODE</div>
              <div style="font-size:34px;font-weight:bold;letter-spacing:9px;color:#0b3d2e;margin-top:10px">${otp}</div>
            </div>

            <p>This code expires in <strong>10 minutes</strong>.</p>
            <p>If you did not request this code, you can safely ignore this email.</p>
          </main>

          <footer style="padding:18px 28px;background:#f8f5ed;color:#66736d;font-size:13px">
            Thank you for choosing ABS CUT.
          </footer>
        </div>
      </div>
    `,
  });
}

module.exports = {
  generateOtp,
  hashOtp,
  sendVerificationOtp,
};
