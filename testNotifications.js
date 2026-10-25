require("dotenv").config();

const {
  notifyWelcome,
} = require(
  "./services/notificationService"
);

async function testNotifications() {
  console.log("");
  console.log(
    "======================================"
  );
  console.log(
    "ABS CUT NOTIFICATION TEST"
  );
  console.log(
    "======================================"
  );
  console.log("");

  try {
    const result =
      await notifyWelcome({
        name:
          "ABS CUT Test Customer",

        email:
          "YOUR_EMAIL@example.com",

        phone:
          "08012345678",
      });

    console.log("");
    console.log(
      "======================================"
    );
    console.log(
      "TEST RESULT"
    );
    console.log(
      "======================================"
    );
    console.dir(
      result,
      {
        depth:
          null,
      }
    );
    console.log("");

  } catch (error) {
    console.error("");
    console.error(
      "❌ ABS CUT notification test failed:"
    );
    console.error(
      error
    );
    console.error("")
  }
}

testNotifications();



