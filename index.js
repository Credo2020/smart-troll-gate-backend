const express = require("express");
const cors = require("cors");
const db = require("./src/config/firebase");
const mqtt = require("mqtt");

const app = express();

app.use(cors());
app.use(express.json());

// =========================
// MQTT SETUP
// =========================
const MQTT_BROKER = "mqtt://broker.hivemq.com";
const client = mqtt.connect(MQTT_BROKER);

// Topics
const SCAN_TOPIC = "toll/gate/scan";
const RESPONSE_TOPIC = "toll/gate/response";

// =========================
// MQTT CONNECT
// =========================
client.on("connect", () => {
  console.log(`MQTT Connected to ${MQTT_BROKER}`);

  client.subscribe(SCAN_TOPIC, (err) => {
    if (err) {
      console.log("MQTT Subscribe error", err);
    } else {
      console.log(`Subscribed to topic: ${SCAN_TOPIC}`);
    }
  });
});

// =========================
// CORE LOGIC (THIS IS YOUR BRAIN)
// =========================
client.on("message", async (topic, message) => {
  try {
    console.log(`MQTT message received on topic: ${topic}`);
    console.log("Raw payload:", message.toString());

    if (topic !== SCAN_TOPIC) return;

    const data = JSON.parse(message.toString());
    const cardUID = data.cardUID;
    const gateId = data.gateId || "gate_1";

    console.log(`Card received: ${cardUID} from gate: ${gateId}`);

    // =========================
    // 1. FIND USER
    // =========================
    const snapshot = await db
      .collection("users")
      .where("cardUID", "==", cardUID)
      .get();

    if (snapshot.empty) {
      return sendResponse({
        status: "denied",
        reason: "card_not_found"
      });
    }

    let userDoc;
    snapshot.forEach(doc => {
      userDoc = { id: doc.id, ...doc.data() };
    });

    // =========================
    // 2. CHECK STATUS
    // =========================
    if (userDoc.status !== "active") {
      return sendResponse({
        status: "denied",
        reason: "card_blocked"
      });
    }

    // =========================
    // 3. GET TOLL FEE
    // =========================
    const configSnap = await db
      .collection("system_config")
      .doc("settings")
      .get();

    const tollFee = configSnap.data()?.tollFee || 2000;

    // =========================
    // 4. CHECK BALANCE
    // =========================
    if (userDoc.balance < tollFee) {
      return sendResponse({
        status: "denied",
        reason: "insufficient_balance"
      });
    }

    const balanceBefore = userDoc.balance;
    const balanceAfter = balanceBefore - tollFee;

    // =========================
    // 5. UPDATE USER BALANCE
    // =========================
    await db.collection("users").doc(userDoc.id).update({
      balance: balanceAfter
    });

    // =========================
    // 6. LOG TRANSACTION
    // =========================
    await db.collection("transactions").add({
      cardUID,
      userId: userDoc.id,
      amount: tollFee,
      balanceBefore,
      balanceAfter,
      gateId,
      status: "success",
      timestamp: new Date().toISOString()
    });

    // =========================
    // 7. SUCCESS RESPONSE
    // =========================
    sendResponse({
      status: "granted",
      gateId,
      balance: balanceAfter
    });

  } catch (error) {
    console.error(error);

    sendResponse({
      status: "error",
      message: error.message
    });
  }
});

// =========================
// SEND MQTT RESPONSE
// =========================
function sendResponse(payload) {
  const message = JSON.stringify(payload);
  console.log(`Something has been published to ${RESPONSE_TOPIC}`);
  console.log("Published JSON:", JSON.stringify(payload, null, 2));
  client.publish(RESPONSE_TOPIC, message, (err) => {
    if (err) {
      console.log("MQTT publish error:", err);
    } else {
      console.log("Response published successfully");
    }
  });
}

// =========================
// BASIC SERVER (OPTIONAL)
// =========================
app.get("/", (req, res) => {
  res.send("SMART TOLL MQTT BACKEND RUNNING");
});

// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
