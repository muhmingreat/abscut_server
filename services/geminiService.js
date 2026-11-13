
const { GoogleGenAI } = require("@google/genai");

// =====================================================
// ABS CUT — GEMINI AI SERVICE
// =====================================================

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const PRIMARY_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODEL = "gemini-2.5-flash-lite";

const SYSTEM_INSTRUCTION = `
You are ABS CUT AI Guide, the official virtual assistant
for the ABS CUT fashion and clothing platform.

Help customers with:
- Shopping and products.
- Custom clothing orders.
- Checkout, payments and delivery.
- Order tracking.
- Account settings.
- Fashion Academy courses and lessons.
- Assignments and certificates.
- Platform navigation.

IMPORTANT RULES:

- Be friendly, professional and concise.
- Adapt answers to the current page.
- Give clear step-by-step instructions.
- Never invent prices, policies or order statuses.
- Admit when information is unavailable.
- Never request passwords, API keys or payment credentials.
- Never claim to have completed an action you did not perform.
- Recommend ABS CUT support when human assistance is needed.
`;

// =====================================================
// RETRY HELPER
// =====================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTemporaryError(error) {
  const message = String(error?.message || error);

  return (
    message.includes("503") ||
    message.includes("UNAVAILABLE") ||
    message.includes("429") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("500") ||
    message.includes("INTERNAL")
  );
}

// =====================================================
// GENERATE RESPONSE
// =====================================================

async function generateWithRetry(model, contents) {
  const delays = [1000, 2500];

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.4,
          maxOutputTokens: 700,
        },
      });
    } catch (error) {
      if (!isTemporaryError(error) || attempt === delays.length) {
        throw error;
      }

      await sleep(delays[attempt]);
    }
  }

  throw new Error("AI generation failed.");
}

// =====================================================
// PUBLIC AI FUNCTION
// =====================================================

async function generateAssistantReply({
  message,
  page = "/",
  history = [],
}) {
  if (
    !message ||
    typeof message !== "string" ||
    !message.trim()
  ) {
    throw new Error("Please provide a message.");
  }

  const safeHistory = Array.isArray(history)
    ? history.slice(-8).filter(
        (item) =>
          item &&
          ["user", "model"].includes(item.role) &&
          typeof item.text === "string"
      )
    : [];

  const contents = safeHistory.map((item) => ({
    role: item.role,
    parts: [
      {
        text: item.text.slice(0, 1500),
      },
    ],
  }));

  contents.push({
    role: "user",
    parts: [
      {
        text: `
Current ABS CUT page: ${String(page).slice(0, 120)}

User question:
${message.trim().slice(0, 2000)}
`,
      },
    ],
  });

  let response;

  try {
    response = await generateWithRetry(
      PRIMARY_MODEL,
      contents
    );
  } catch (primaryError) {
    console.error(
      "ABS CUT primary Gemini model failed:",
      primaryError.message
    );

    if (!isTemporaryError(primaryError)) {
      throw primaryError;
    }

    response = await generateWithRetry(
      FALLBACK_MODEL,
      contents
    );
  }

  const reply = response.text?.trim();

  if (!reply) {
    throw new Error("Gemini returned an empty response.");
  }

  return reply;
}

module.exports = {
  generateAssistantReply,
}
