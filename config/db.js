
const mongoose = require("mongoose");

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error(
      "ABS CUT: MONGO_URI is missing from the environment variables."
    );
  }

  try {
    console.log("ABS CUT: Connecting to MongoDB Atlas...");

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 1500,
      connectTimeoutMS: 1000,
    });

    console.log("ABS CUT: MongoDB connected successfully.");
    console.log("ABS CUT: Database:", mongoose.connection.name);
    console.log("ABS CUT: Host:", mongoose.connection.host);

    return mongoose.connection;
  } catch (error) {
    console.error("\n========================================");
    console.error("ABS CUT: MONGODB CONNECTION FAILED");
    console.error("========================================");

    console.error("Error name:", error.name || "Unknown");
    console.error("Error message:", error.message || "No message available");
    console.error("Error code:", error.code ?? "Not provided");

    if (error.reason) {
      console.error("\nMongoDB topology type:", error.reason.type);

      if (error.reason.servers) {
        console.error("\nMongoDB server status:");

        for (const [address, server] of error.reason.servers) {
          console.error("----------------------------------------");
          console.error("Server:", address);
          console.error("Status:", server.type);
          console.error(
            "Error:",
            server.error?.message || "No individual server error reported"
          );
        }
      }
    }

    console.error("\nPossible causes:");

    if (
      /whitelist|ip address|not authorized|access denied/i.test(
        error.message
      )
    ) {
      console.error(
        "- Your current public IP may not be allowed in MongoDB Atlas."
      );
    }

    if (
      /ESERVFAIL|ENOTFOUND|querySrv|EAI_AGAIN/i.test(
        error.message
      )
    ) {
      console.error(
        "- DNS resolution failed. Check your DNS settings and Atlas SRV records."
      );
    }

    if (
      /timed out|server selection|ReplicaSetNoPrimary|ECONNREFUSED|ETIMEDOUT/i.test(
        error.message
      )
    ) {
      console.error(
        "- MongoDB servers may be unreachable due to network restrictions, Atlas access rules, or cluster availability."
      );
    }

    console.error(
      "- Verify MongoDB Atlas Network Access, cluster status, and MONGO_URI.",
    )

    console.error("\nABS CUT: Full error details:");
    console.error(error);

    console.error("\n========================================\n")

    throw error;
  }
};

module.exports = connectDB;
