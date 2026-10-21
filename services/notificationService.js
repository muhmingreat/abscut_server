const {
  sendEmail,
} = require("./emailService");

const {
  sendSms,
} = require("./smsService");

// =====================================================
// ABS CUT — NOTIFICATION SERVICE
// =====================================================

// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHtml(
  value = ""
) {
  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

// =====================================================
// CUSTOMER NAME
// =====================================================

function customerName(
  data = {}
) {
  return (
    data.name ||
    data.firstName ||
    "Customer"
  );
}

// =====================================================
// FORMAT NIGERIAN CURRENCY
// =====================================================

function formatMoney(
  amount
) {
  const numericAmount =
    Number(
      amount || 0
    );

  return new Intl.NumberFormat(
    "en-NG",
    {
      style:
        "currency",

      currency:
        "NGN",

      maximumFractionDigits:
        0,
    }
  ).format(
    numericAmount
  );
}

// =====================================================
// EMAIL TEMPLATE WRAPPER
// =====================================================

function wrapEmail(
  title,
  content
) {
  return `
    <div
      style="
        margin:0;
        padding:32px 16px;
        background:#f8f5ed;
        font-family:Arial,sans-serif;
        color:#1e2924;
      "
    >

      <div
        style="
          max-width:620px;
          margin:0 auto;
          background:#ffffff;
          border:1px solid #dedbd2;
          border-radius:18px;
          overflow:hidden;
          box-shadow:0 12px 35px rgba(16,37,29,.10);
        "
      >

        <div
          style="
            padding:24px 28px;
            background:#0b3d2e;
            color:#ffffff;
            border-bottom:4px solid #c9a227;
          "
        >

          <div
            style="
              font-size:12px;
              letter-spacing:2px;
              font-weight:700;
              color:#c9a227;
            "
          >
            ABS CUT
          </div>

          <h1
            style="
              margin:8px 0 0;
              font-size:26px;
              line-height:1.2;
            "
          >
            ${escapeHtml(title)}
          </h1>

        </div>

        <div
          style="
            padding:28px;
            line-height:1.7;
          "
        >
          ${content}
        </div>

        <div
          style="
            padding:18px 28px;
            background:#f8f5ed;
            border-top:1px solid #dedbd2;
            font-size:13px;
            color:#66736d;
          "
        >
          Thank you for choosing ABS CUT.
        </div>

      </div>

    </div>
  `;
}

// =====================================================
// WELCOME NOTIFICATION
// =====================================================

async function notifyWelcome({
  name,
  email,
  phone,
}) {
  const safeName =
    escapeHtml(
      customerName({
        name,
      })
    );

  // -----------------------------------------------
  // EMAIL
  // -----------------------------------------------

  const emailResult =
    await sendEmail({
      to:
        email,

      subject:
        "Welcome to ABS CUT",

      text:
        `Welcome to ABS CUT, ${name || "Customer"}! Your account has been created successfully.`,

      html:
        wrapEmail(
          "Welcome to ABS CUT",

          `
            <p>
              Hello ${safeName},
            </p>

            <p>
              Your ABS CUT account has been
              created successfully.
            </p>

            <p>
              You can now shop our ready-to-wear
              collection and submit custom
              tailoring requests.
            </p>
          `
        ),
    });

  // -----------------------------------------------
  // SMS
  // -----------------------------------------------

  const smsResult =
    await sendSms({
      to:
        phone,

      message:
        `ABS CUT: Welcome ${name || "Customer"}! Your account has been created successfully.`,
    });

  return {
    email:
      emailResult,

    sms:
      smsResult,
  };
}

// =====================================================
// ORDER PLACED
// =====================================================

async function notifyOrderPlaced({
  name,
  email,
  phone,
  orderId,
  total,
}) {
  const displayId =
    String(
      orderId || ""
    )
      .slice(-8)
      .toUpperCase();

  const safeName =
    escapeHtml(
      customerName({
        name,
      })
    );

  const money =
    formatMoney(
      total
    );

  // -----------------------------------------------
  // EMAIL
  // -----------------------------------------------

  const emailResult =
    await sendEmail({
      to:
        email,

      subject:
        `ABS CUT Order Received #${displayId}`,

      text:
        `Your ABS CUT order #${displayId} has been received. Total: ${money}.`,

      html:
        wrapEmail(
          "Order Received",

          `
            <p>
              Hello ${safeName},
            </p>

            <p>
              We have received your ABS CUT
              order successfully.
            </p>

            <p>
              <strong>
                Order:
              </strong>
              #${escapeHtml(
                displayId
              )}
            </p>

            <p>
              <strong>
                Total:
              </strong>
              ${escapeHtml(
                money
              )}
            </p>

            <p>
              We will keep you updated as
              your order moves through
              processing.
            </p>
          `
        ),
    });

  // -----------------------------------------------
  // SMS
  // -----------------------------------------------

  const smsResult =
    await sendSms({
      to:
        phone,

      message:
        `ABS CUT: Order #${displayId} received. Total ${money}. We will update you as processing continues.`,
    });

  return {
    email:
      emailResult,

    sms:
      smsResult,
  };
}

// =====================================================
// NORMAL ORDER STATUS
// =====================================================

async function notifyOrderStatus({
  name,
  email,
  phone,
  orderId,
  status,
}) {
  const displayId =
    String(
      orderId || ""
    )
      .slice(-8)
      .toUpperCase();

  const safeName =
    escapeHtml(
      customerName({
        name,
      })
    );

  const safeStatus =
    escapeHtml(
      status ||
        "updated"
    );

  // -----------------------------------------------
  // EMAIL
  // -----------------------------------------------

  const emailResult =
    await sendEmail({
      to:
        email,

      subject:
        `ABS CUT Order #${displayId} Update`,

      text:
        `Your ABS CUT order #${displayId} is now ${status}.`,

      html:
        wrapEmail(
          "Order Status Updated",

          `
            <p>
              Hello ${safeName},
            </p>

            <p>
              Your ABS CUT order
              <strong>
                #${escapeHtml(
                  displayId
                )}
              </strong>
              is now:
            </p>

            <p
              style="
                display:inline-block;
                padding:10px 14px;
                border-radius:10px;
                background:#f8f5ed;
                color:#0b3d2e;
                font-weight:700;
              "
            >
              ${safeStatus}
            </p>
          `
        ),
    });

  // -----------------------------------------------
  // SMS
  // -----------------------------------------------

  const smsResult =
    await sendSms({
      to:
        phone,

      message:
        `ABS CUT: Order #${displayId} status: ${status}.`,
    });

  return {
    email:
      emailResult,

    sms:
      smsResult,
  };
}

// =====================================================
// CUSTOM ORDER SUBMITTED
// =====================================================

async function notifyCustomOrderSubmitted({
  name,
  email,
  phone,
  customOrderId,
}) {
  const displayId =
    String(
      customOrderId || ""
    )
      .slice(-8)
      .toUpperCase();

  const safeName =
    escapeHtml(
      customerName({
        name,
      })
    );

  // -----------------------------------------------
  // EMAIL
  // -----------------------------------------------

  const emailResult =
    await sendEmail({
      to:
        email,

      subject:
        `ABS CUT Custom Order Received #${displayId}`,

      text:
        `Your ABS CUT custom order #${displayId} has been received and is pending review.`,

      html:
        wrapEmail(
          "Custom Order Received",

          `
            <p>
              Hello ${safeName},
            </p>

            <p>
              Your custom tailoring request
              has been received successfully.
            </p>

            <p>
              Your request is now
              <strong>
                pending review
              </strong>
              by ABS CUT.
            </p>

            <p>
              <strong>
                Request:
              </strong>
              #${escapeHtml(
                displayId
              )}
            </p>

            <p>
              We will contact you when
              your quotation or next step
              is ready.
            </p>
          `
        ),
    });

  // -----------------------------------------------
  // SMS
  // -----------------------------------------------

  const smsResult =
    await sendSms({
      to:
        phone,

      message:
        `ABS CUT: Custom order #${displayId} received. Your request is pending review.`,
    });

  return {
    email:
      emailResult,

    sms:
      smsResult,
  };
}

// =====================================================
// CUSTOM ORDER STATUS
// =====================================================

async function notifyCustomOrderStatus({
  name,
  email,
  phone,
  customOrderId,
  status,
}) {
  const displayId =
    String(
      customOrderId || ""
    )
      .slice(-8)
      .toUpperCase();

  const safeName =
    escapeHtml(
      customerName({
        name,
      })
    );

  const safeStatus =
    escapeHtml(
      status ||
        "updated"
    );

  // -----------------------------------------------
  // EMAIL
  // -----------------------------------------------

  const emailResult =
    await sendEmail({
      to:
        email,

      subject:
        `ABS CUT Custom Order #${displayId} Update`,

      text:
        `Your ABS CUT custom order #${displayId} is now ${status}.`,

      html:
        wrapEmail(
          "Custom Order Updated",

          `
            <p>
              Hello ${safeName},
            </p>

            <p>
              Your custom order
              <strong>
                #${escapeHtml(
                  displayId
                )}
              </strong>
              is now:
            </p>

            <p
              style="
                display:inline-block;
                padding:10px 14px;
                border-radius:10px;
                background:#f8f5ed;
                color:#0b3d2e;
                font-weight:700;
              "
            >
              ${safeStatus}
            </p>
          `
        ),
    });

  // -----------------------------------------------
  // SMS
  // -----------------------------------------------

  const smsResult =
    await sendSms({
      to:
        phone,

      message:
        `ABS CUT: Custom order #${displayId} status: ${status}.`,
    });

  return {
    email:
      emailResult,

    sms:
      smsResult,
  };
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  notifyWelcome,

  notifyOrderPlaced,

  notifyOrderStatus,

  notifyCustomOrderSubmitted,

  notifyCustomOrderStatus,
};