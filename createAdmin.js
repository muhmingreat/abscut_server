
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("./models/User");

dotenv.config();

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected.");

    const email = process.argv[2];

    if (!email) {
      console.log(
        "Usage: node createAdmin.js your-email@example.com"
      );
      process.exit(1);
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      console.log(
        "User not found. Register the account first."
      );
      process.exit(1);
    }

    user.role = "admin";

    await user.save();

    // console.log(
    //   `Admin role assigned successfully to ${user.email}`
    // );
    console.log(
      `Admin role assigned successfully to ${user.email}`
    );

    process.exit(0);
  } catch (error) {
    console.error("Create admin error:", error);
    process.exit(1);
  }
};

createAdmin();

