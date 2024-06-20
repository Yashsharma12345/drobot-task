// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const { firestore } = require("firebase-functions");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError } = require("firebase-functions/v2/https");

// The Firebase Admin SDK to access Firestore.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { Timestamp } = require("firebase-admin/firestore");
const { admin } = require("firebase-admin");

initializeApp();

const db = getFirestore();
db.settings({
  host: "localhost:8080",
  ssl: false,
});

// Function to toggle availability of bot to true when someone releases a bot
exports.releaseBot = onCall(async (data, context) => {
  const botName = data.botName;
  let botRef, botDoc, botData, botToUpdateName;

  if (botName != null) {
    // If bot name is provided, toggle that specific bot
    botRef = db.collection("bots").doc(botName);
    botDoc = await botRef.get();
    if (!botDoc.exists) {
      throw new HttpsError("not-found", "Bot not found.");
    }
    botData = botDoc.data();
    if (!botData.inUse) {
      throw new HttpsError("not-in-use", "Bot not-in-use.");
    }
    botToUpdateName = botName;
  } else {
    // If a bot with the given name is not found we simply
    //give an error that no such bot was found
    throw new HttpsError("not-found", "No such bot found.");
  }

  let updateData = { inUse: false };
  updateData.endTime = Timestamp.now();

  await botDoc.ref.update(updateData);
  return { botName: botToUpdateName, inUse: false };
});


// Function to toggle the availability of bot to false when someone calls
exports.useBot = onCall(async (data, context) => {
  const botName = data.botName;
  let botRef, botDoc, botData, botToUpdateName;

  if (botName != null) {
    // If bot name is provided, toggle that specific bot
    botRef = db.collection("bots").doc(botName);
    botDoc = await botRef.get();
    if (!botDoc.exists) {
      throw new HttpsError("not-available", "Bot not available.");
    }

    botData = botDoc.data();
    if (botData.inUse) {
      throw new HttpsError("not-available", "Bot not available.");
    }

    botToUpdateName = botName;
  } else {
    // If bot name is not provided, find an available bot that is
    // not in use and has a battery level > 25%
    const botsSnapshot = await db
      .collection("bots")
      .where("inUse", "==", false)
      .where("battery", ">", 25)
      .limit(1)
      .get();
    if (botsSnapshot.empty) {
      throw new HttpsError("not-found", "No available bot found.");
    }
    botDoc = botsSnapshot.docs[0];
    botToUpdateName = botDoc.id;
    botData = botDoc.data();
  }

  let updateData = { inUse: true };
  updateData.startTime = Timestamp.now();

  await botDoc.ref.update(updateData);
  return { botName: botToUpdateName, inUse: true };
});


// Function to calculate the runtime of the bot
// when the bot availability is toggled to false
exports.calculateBotRunTime = firestore
  .document("bots/{botId}")
  .onUpdate((change, context) => {
    const newValue = change.after.data();
    const previousValue = change.before.data();

    // Check to see if the inUse field was changed from true to false
    if (previousValue.inUse && !newValue.inUse) {
      const startTime = previousValue.startTime.toDate();
      const endTime = new Date();
      const runTime = endTime - startTime;
      const currentruntime = previousValue.totalBotRuntime;
      let updateData = { totalBotRuntime: currentruntime + runTime };

      return change.after.ref.update(updateData);
    } else {
      return null;
    }
  });
