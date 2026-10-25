require("dotenv").config();

const mongoose = require("mongoose");
const User = require("./models/User");

async function fixUserIndex() {
  try {
    await mongoose.connect(process.env.MONGO_URI)

    console.log("MongoDB connected.");

    const indexes = await User.collection.indexes();

    const oldIndex = indexes.find(
      (index) =>
        index.name ===
        "authProvider_1_authProviderId_1"
    );

    if (oldIndex) {
      console.log("Existing index:", oldIndex);

      await User.collection.dropIndex(
        "authProvider_1_authProviderId_1"
      );

      console.log("Old index removed.");
    } else {
      console.log("Old index was not found.");
    }

    await User.createIndexes();

    console.log("Updated User indexes:", 
      await User.collection.indexes()
    );
  } catch (error) {
    console.error("Index repair failed:", error.message)
  } finally {
    await mongoose.disconnect();
  }
}

fixUserIndex();