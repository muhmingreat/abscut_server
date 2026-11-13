
const cloudinary = require("../config/cloudinary");

const AIOutfitPreviewUsage = require("../models/AIOutfitPreviewUsage");

const {
  DAILY_PREVIEW_LIMIT,
  getDateKey,
} = require("./aiOutfitPreviewUsageController");

const CLOUDFLARE_MODEL =
  "@cf/black-forest-labs/flux-1-schnell";

const ALLOWED_OUTFITS = [
  "Agbada",
  "Caftan",
  "Senator",
  "Native Wear",
  "Other",
];

const ALLOWED_FABRICS = [
  "Linen",
  "Cotton",
  "Wool",
  "Silk",
  "Ankara",
  "Lace",
  "Other",
];

const ALLOWED_COLORS = [
  "Black",
  "White",
  "Green",
  "Gold",
  "Blue",
  "Brown",
  "Cream",
  "Wine",
  "Other",
];

// ==========================================
// RESERVE ONE DAILY PREVIEW
// ==========================================

const reservePreview = async (userId, dateKey) => {
  const filter = {
    user: userId,
    dateKey,
  };

  try {
    await AIOutfitPreviewUsage.updateOne(
      filter,
      {
        $setOnInsert: {
          count: 0,
        },
      },
      {
        upsert: true,
      }
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }
  }

  return AIOutfitPreviewUsage.findOneAndUpdate(
    {
      ...filter,
      count: {
        $lt: DAILY_PREVIEW_LIMIT,
      },
    },
    {
      $inc: {
        count: 1,
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );
};

// ==========================================
// RELEASE RESERVED PREVIEW
// ==========================================

const releasePreview = async (userId, dateKey) => {
  await AIOutfitPreviewUsage.updateOne(
    {
      user: userId,
      dateKey,
      count: {
        $gt: 0,
      },
    },
    {
      $inc: {
        count: -1,
      },
    }
  );
};

// ==========================================
// CLOUDFLARE IMAGE GENERATION
// ==========================================

const generateCloudflareImage = async (prompt) => {
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID;

  const apiToken =
    process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      "Cloudflare AI credentials are missing."
    );
  }

  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/` +
    `${accountId}/ai/run/${CLOUDFLARE_MODEL}`;

  const response = await fetch(endpoint, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      prompt,
      steps: 4,
    }),
  });

  const contentType =
    response.headers.get("content-type") || "";

  let imageBase64;

  if (contentType.includes("application/json")) {
    const data = await response.json();

    if (!response.ok || data.success === false) {
      const providerMessage =
        data.errors
          ?.map((item) => item.message)
          .filter(Boolean)
          .join(", ");

      const error = new Error(
        providerMessage ||
        "Cloudflare image generation failed."
      );

      error.status = response.status;

      throw error;
    }

    imageBase64 = data.result?.image;

  } else if (
    contentType.startsWith("image/")
  ) {
    if (!response.ok) {
      const error = new Error(
        "Cloudflare image generation failed."
      );

      error.status = response.status;

      throw error;
    }

    const imageBuffer = Buffer.from(
      await response.arrayBuffer()
    );

    imageBase64 = imageBuffer.toString("base64");

  } else {
    const error = new Error(
      "Unexpected response from Cloudflare AI."
    );

    error.status = response.status;

    throw error;
  }

  if (!imageBase64) {
    throw new Error(
      "Cloudflare returned no generated image."
    );
  }

  return imageBase64;
};

// ==========================================
// GENERATE AI OUTFIT PREVIEW
// ==========================================

const generateOutfitPreview = async (req, res) => {
  let reservationMade = false;

  let dateKey;
  let userId;

  try {
    // Check Cloudflare configuration

    if (
      !process.env.CLOUDFLARE_ACCOUNT_ID ||
      !process.env.CLOUDFLARE_API_TOKEN
    ) {
      return res.status(500).json({
        success: false,
        message:
          "AI preview is not configured on the server.",
      });
    }

    // Check authentication

    userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Please sign in to generate an outfit preview.",
      });
    }

    // Extract request data

    const {
      outfitType,
      fabric,
      color,
      embroidery,
      designDetails,
    } = req.body;

    const safeDesignDetails =
      designDetails ?? "";

    // Validate outfit

    if (
      !ALLOWED_OUTFITS.includes(outfitType) ||
      !ALLOWED_FABRICS.includes(fabric) ||
      !ALLOWED_COLORS.includes(color)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please select a valid outfit, fabric, and colour.",
      });
    }

    // Validate design details

    if (
      typeof safeDesignDetails !== "string" ||
      safeDesignDetails.trim().length > 500
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Design details must be 500 characters or fewer.",
      });
    }

    // Validate embroidery

    if (
      embroidery !== undefined &&
      typeof embroidery !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Embroidery must be true or false.",
      });
    }

    // Reserve daily usage

    dateKey = getDateKey();

    const reservation = await reservePreview(
      userId,
      dateKey
    );

    if (!reservation) {
      return res.status(429).json({
        success: false,
        message:
          "You have reached your daily limit of 3 outfit previews. Please try again tomorrow.",

        usage: {
          used: DAILY_PREVIEW_LIMIT,
          limit: DAILY_PREVIEW_LIMIT,
          remaining: 0,
          dateKey,
        },
      });
    }

    reservationMade = true;

    // ======================================
    // BUILD FASHION GENERATION PROMPT
    // ======================================

    const prompt = `
Create one original, photorealistic luxury
fashion design concept for the Nigerian fashion
brand ABS CUT.

OUTFIT:
${outfitType}

FABRIC:
${fabric}

MAIN COLOUR:
${color}

EMBROIDERY:
${
  embroidery
    ? "Include elegant, detailed embroidery."
    : "Do not include embroidery."
}

CUSTOMER DESIGN PREFERENCES:
${
  safeDesignDetails.trim() ||
  "Use your professional creative judgment."
}

DESIGN REQUIREMENTS:

Show the complete outfit clearly on a
professional adult fashion model.

The outfit must be the main focus.

Use realistic fabric texture, authentic
Nigerian fashion aesthetics, accurate
garment construction, refined tailoring,
and carefully designed proportions.

Use premium fashion photography lighting
and an elegant luxury studio background.

Ensure the outfit looks professionally
designed and suitable for a premium
Nigerian fashion brand.

Create an original design.

Do not include logos, watermarks,
captions, or text in the image.

This is a visual design concept,
not a photograph of a finished garment.
`.trim();

    // ======================================
    // GENERATE IMAGE WITH CLOUDFLARE
    // ======================================

    const imageBase64 =
      await generateCloudflareImage(prompt);

    // ======================================
    // UPLOAD IMAGE TO CLOUDINARY
    // ======================================

    const uploaded =
      await cloudinary.uploader.upload(
        `data:image/jpeg;base64,${imageBase64}`,
        {
          folder: "abs-cut/ai-outfit-previews",
          resource_type: "image",
        }
      );

    // Generation and upload succeeded.
    // Keep the reserved usage.

    reservationMade = false;

    // Get latest usage

    const usage =
      await AIOutfitPreviewUsage.findOne({
        user: userId,
        dateKey,
      }).lean();

    const used = usage?.count ?? 1;

    // ======================================
    // RETURN RESPONSE
    // ======================================

    return res.status(200).json({
      success: true,

      message:
        "Outfit concept generated successfully.",

      preview: {
        url: uploaded.secure_url,
        publicId: uploaded.public_id,

        outfitType,
        fabric,
        color,

        embroidery: Boolean(embroidery),

        designDetails:
          safeDesignDetails.trim(),
      },

      usage: {
        used,
        limit: DAILY_PREVIEW_LIMIT,

        remaining: Math.max(
          0,
          DAILY_PREVIEW_LIMIT - used
        ),

        dateKey,
      },
    });

  } catch (error) {
    console.error(
      "ABS CUT Cloudflare AI preview error:",
      error.message
    );

    // Restore reserved usage if generation failed

    if (
      reservationMade &&
      userId &&
      dateKey
    ) {
      try {
        await releasePreview(userId, dateKey);
      } catch (releaseError) {
        console.error(
          "Could not release AI preview reservation:",
          releaseError.message
        );
      }
    }

    // Provider rate limit or free quota exhausted

    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        message:
          "The AI image service has reached its current usage limit. Please try again later.",
      });
    }

    // Other provider errors

    return res.status(502).json({
      success: false,
      message:
        "We could not generate your outfit preview. Please try again later.",
    });
  }
};

// ==========================================
// EXPORT CONTROLLER
// ==========================================

module.exports = {
  generateOutfitPreview,
};

// const OpenAI = require("openai");
// const cloudinary = require("../config/cloudinary");
// const AIOutfitPreviewUsage = require("../models/AIOutfitPreviewUsage");
// const {
//   DAILY_PREVIEW_LIMIT,
//   getDateKey,
// } = require("./aiOutfitPreviewUsageController");

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// const ALLOWED_OUTFITS = [
//   "Agbada",
//   "Caftan",
//   "Senator",
//   "Native Wear",
//   "Other",
// ];

// const ALLOWED_FABRICS = [
//   "Linen",
//   "Cotton",
//   "Wool",
//   "Silk",
//   "Ankara",
//   "Lace",
//   "Other",
// ];

// const ALLOWED_COLORS = [
//   "Black",
//   "White",
//   "Green",
//   "Gold",
//   "Blue",
//   "Brown",
//   "Cream",
//   "Wine",
//   "Other",
// ];

// // Reserve one preview atomically to prevent concurrent requests
// // from exceeding the daily limit.
// const reservePreview = async (userId, dateKey) => {
//   const filter = { user: userId, dateKey };

//   try {
//     await AIOutfitPreviewUsage.updateOne(
//       filter,
//       { $setOnInsert: { count: 0 } },
//       { upsert: true }
//     );
//   } catch (error) {
//     // Another simultaneous request may have created the record.
//     if (error.code !== 11000) {
//       throw error;
//     }
//   }

//   return AIOutfitPreviewUsage.findOneAndUpdate(
//     {
//       ...filter,
//       count: { $lt: DAILY_PREVIEW_LIMIT },
//     },
//     {
//       $inc: { count: 1 },
//     },
//     {
//       new: true,
//       runValidators: true,
//     }
//   );
// };

// // Return a reserved preview if generation or upload fails.
// const releasePreview = async (userId, dateKey) => {
//   await AIOutfitPreviewUsage.updateOne(
//     {
//       user: userId,
//       dateKey,
//       count: { $gt: 0 },
//     },
//     {
//       $inc: { count: -1 },
//     }
//   );
// };

// const generateOutfitPreview = async (req, res) => {
//   let reservationMade = false;
//   let dateKey;
//   let userId;

//   try {
//     if (!process.env.OPENAI_API_KEY) {
//       return res.status(500).json({
//         message: "AI preview is not configured on the server.",
//       });
//     }

//     userId = req.user?._id;

//     if (!userId) {
//       return res.status(401).json({
//         message: "Please sign in to generate an outfit preview.",
//       });
//     }

//     const {
//       outfitType,
//       fabric,
//       color,
//       embroidery,
//       designDetails,
//     } = req.body;

//     const safeDesignDetails = designDetails ?? "";

//     if (
//       !ALLOWED_OUTFITS.includes(outfitType) ||
//       !ALLOWED_FABRICS.includes(fabric) ||
//       !ALLOWED_COLORS.includes(color)
//     ) {
//       return res.status(400).json({
//         message: "Please select a valid outfit, fabric, and colour.",
//       });
//     }

//     if (
//       typeof safeDesignDetails !== "string" ||
//       safeDesignDetails.trim().length > 500
//     ) {
//       return res.status(400).json({
//         message: "Design details must be 500 characters or fewer.",
//       });
//     }

//     if (
//       embroidery !== undefined &&
//       typeof embroidery !== "boolean"
//     ) {
//       return res.status(400).json({
//         message: "Embroidery must be true or false.",
//       });
//     }

//     // Reserve quota only after validating the request.
//     dateKey = getDateKey();

//     const reservation = await reservePreview(userId, dateKey);

//     if (!reservation) {
//       return res.status(429).json({
//         message: "You have reached your daily limit of 3 outfit previews. Please try again tomorrow.",
//         usage: {
//           used: DAILY_PREVIEW_LIMIT,
//           limit: DAILY_PREVIEW_LIMIT,
//           remaining: 0,
//           dateKey,
//         },
//       });
//     }

//     reservationMade = true;

//     const prompt = `
// Create one original, photorealistic fashion design concept
// for the Nigerian fashion brand ABS CUT.

// Outfit: ${outfitType}
// Fabric: ${fabric}
// Main colour: ${color}
// Embroidery: ${embroidery ? "Include elegant embroidery" : "No embroidery"}
// Customer design preferences: ${safeDesignDetails.trim() || "Use your creative judgment"}

// Show the complete outfit clearly on a professional fashion model.
// Use realistic fabric texture, accurate garment construction,
// refined tailoring, elegant lighting, and a premium fashion-studio
// background. Keep the outfit as the main focus.

// Create an original design. Do not include logos, watermarks,
// captions, or text in the image.
// This is a visual concept, not a photograph of a finished garment.
// `.trim();

//     const result = await openai.images.generate({
//       model: "gpt-image-2.5-flare",
//       prompt,
//       size: "1024x1024",
//       quality: "medium",
//       n: 1,
//     });

//     const imageBase64 = result.data?.[0]?.b64_json;

//     if (!imageBase64) {
//       throw new Error("The image service returned no image.");
//     }

//     const uploaded = await cloudinary.uploader.upload(
//       `data:image/png;base64,${imageBase64}`,
//       {
//         folder: "abs-cut/ai-outfit-previews",
//         resource_type: "image",
//       }
//     );

//     reservationMade = false;

//     const usage = await AIOutfitPreviewUsage.findOne({
//       user: userId,
//       dateKey,
//     }).lean();

//     return res.status(200).json({
//       message: "Outfit concept generated successfully.",
//       preview: {
//         url: uploaded.secure_url,
//         publicId: uploaded.public_id,
//         outfitType,
//         fabric,
//         color,
//         embroidery: Boolean(embroidery),
//         designDetails: safeDesignDetails.trim(),
//       },
//       usage: {
//         used: usage?.count ?? 1,
//         limit: DAILY_PREVIEW_LIMIT,
//         remaining: Math.max(
//           0,
//           DAILY_PREVIEW_LIMIT - (usage?.count ?? 1)
//         ),
//         dateKey,
//       },
//     });
//   } catch (error) {
//     console.error(
//       "ABS CUT AI preview error:",
//       error.message
//     );

//     if (reservationMade && userId && dateKey) {
//       try {
//         await releasePreview(userId, dateKey);
//       } catch (releaseError) {
//         console.error(
//           "Could not release AI preview reservation:",
//           releaseError.message
//         );
//       }
//     }

//     if (error.status === 429) {
//       return res.status(429).json({
//         message: "The AI service is busy or its usage limit has been reached. Please try again later.",
//       });
//     }

//     return res.status(502).json({
//       message: "We could not generate your outfit preview. Please try again later.",
//     });
//   }
// };

// module.exports = {
//   generateOutfitPreview,
// };


// // const OpenAI = require("openai");
// // const cloudinary = require("../config/cloudinary");

// // const openai = new OpenAI({
// //   apiKey: process.env.OPENAI_API_KEY,
// // });

// // const ALLOWED_OUTFITS = [
// //   "Agbada",
// //   "Caftan",
// //   "Senator",
// //   "Native Wear",
// //   "Other",
// // ];

// // const ALLOWED_FABRICS = [
// //   "Linen",
// //   "Cotton",
// //   "Wool",
// //   "Silk",
// //   "Ankara",
// //   "Lace",
// //   "Other",
// // ];

// // const ALLOWED_COLORS = [
// //   "Black",
// //   "White",
// //   "Green",
// //   "Gold",
// //   "Blue",
// //   "Brown",
// //   "Cream",
// //   "Wine",
// //   "Other",
// // ];

// // const generateOutfitPreview = async (req, res) => {
// //   try {
// //     if (!process.env.OPENAI_API_KEY) {
// //       return res.status(500).json({
// //         message: "AI preview is not configured on the server.",
// //       });
// //     }

// //     const {
// //       outfitType,
// //       fabric,
// //       color,
// //       embroidery,
// //       designDetails,
// //     } = req.body;

// //     if (
// //       !ALLOWED_OUTFITS.includes(outfitType) ||
// //       !ALLOWED_FABRICS.includes(fabric) ||
// //       !ALLOWED_COLORS.includes(color)
// //     ) {
// //       return res.status(400).json({
// //         message: "Please select a valid outfit, fabric, and colour.",
// //       });
// //     }

// //     if (
// //       typeof designDetails !== "string" ||
// //       designDetails.trim().length > 500
// //     ) {
// //       return res.status(400).json({
// //         message: "Design details must be 500 characters or fewer.",
// //       });
// //     }

// //     if (
// //       embroidery !== undefined &&
// //       typeof embroidery !== "boolean"
// //     ) {
// //       return res.status(400).json({
// //         message: "Embroidery must be true or false.",
// //       });
// //     }

// //     const prompt = `
// // Create one original, photorealistic fashion design concept
// // for the Nigerian fashion brand ABS CUT.

// // Outfit: ${outfitType}
// // Fabric: ${fabric}
// // Main colour: ${color}
// // Embroidery: ${embroidery ? "Include elegant embroidery" : "No embroidery"}
// // Customer design preferences: ${designDetails.trim() || "Use your creative judgment"}

// // Show the complete outfit clearly on a professional fashion model.
// // Use realistic fabric texture, accurate garment construction,
// // refined tailoring, elegant lighting, and a premium fashion-studio
// // background. Keep the outfit as the main focus.

// // Create an original design. Do not include logos, watermarks,
// // captions, or text in the image.
// // This is a visual concept, not a photograph of a finished garment.
// // `.trim();

// //     const result = await openai.images.generate({
// //       model: "gpt-image-2.5-flare",
// //       prompt,
// //       size: "1024x1024",
// //       quality: "medium",
// //       n: 1,
// //     });

// //     const imageBase64 = result.data?.[0]?.b64_json;

// //     if (!imageBase64) {
// //       throw new Error("The image service returned no image.");
// //     }

// //     const uploaded = await cloudinary.uploader.upload(
// //       `data:image/png;base64,${imageBase64}`,
// //       {
// //         folder: "abs-cut/ai-outfit-previews",
// //         resource_type: "image",
// //       }
// //     );

// //     return res.status(200).json({
// //       message: "Outfit concept generated successfully.",
// //       preview: {
// //         url: uploaded.secure_url,
// //         publicId: uploaded.public_id,
// //         outfitType,
// //         fabric,
// //         color,
// //         embroidery: Boolean(embroidery),
// //         designDetails: designDetails.trim(),
// //       },
// //     });
// //   } catch (error) {
// //     console.error(
// //       "ABS CUT AI preview error:",
// //       error.message
// //     );

// //     if (error.status === 429) {
// //       return res.status(429).json({
// //         message: "The AI service is busy or its usage limit has been reached. Please try again later.",
// //       });
// //     }

// //     return res.status(502).json({
// //       message: "We could not generate your outfit preview. Please try again later.",
// //     });
// //   }
// // };

// // module.exports = {
// //   generateOutfitPreview,
// // };
