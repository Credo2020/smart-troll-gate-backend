const admin = require("firebase-admin");

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (error) {
    console.error("Invalid FIREBASE_SERVICE_ACCOUNT JSON:", error);
    throw error;
  }
} else {
  serviceAccount = require("./smart-toll-gate-d834d-firebase-adminsdk-fbsvc-5ac3f30bd3.json");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

module.exports = db;