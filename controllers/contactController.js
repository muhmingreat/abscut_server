
const ContactMessage = require("../models/ContactMessage");

const createContactMessage = async (req, res) => {
  try {
    const { name, phone, email, subject, message } = req.body;

    // Validate required fields on the server.
    if (
      !name?.trim() ||
      !phone?.trim() ||
      !subject?.trim() ||
      !message?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please complete all required fields.",
      });
    }

    if (
      name.trim().length > 100 ||
      phone.trim().length > 30 ||
      subject.trim().length > 100 ||
      message.trim().length > 5000 ||
      (email && email.trim().length > 254)
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more fields exceed the allowed length.",
      });
    }

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    const savedMessage = await ContactMessage.create({
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim() || "",
      subject: subject.trim(),
      message: message.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Your message has been received by ABS CUT.",
      contactMessage: {
        id: savedMessage._id,
        createdAt: savedMessage.createdAt,
      },
    });
  } catch (error) {
    console.error("Contact message submission failed:", error);

    return res.status(500).json({
      success: false,
      message:
        "We could not send your message right now. Please try again later.",
    });
  }
};

module.exports = { createContactMessage };
