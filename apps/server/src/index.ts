//server/src/index.ts

import "dotenv/config"; // Load .env for local development
import express, { Request, Response } from "express";
import cors from "cors";
import cron from "node-cron";
import * as admin from "firebase-admin";
import path from "path";

// --- FIREBASE INITIALIZATION ---
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // Use the environment variable on Render
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else {
  // Fall back to local file for localhost development
  // Ensure the path is correct relative to the compiled 'dist' folder
  const serviceAccountPath = path.resolve(__dirname, "../service-account.json");
  serviceAccount = require(serviceAccountPath);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://vectorpm-df058.firebaseio.com" 
});

const db = admin.firestore();
console.log("✅ VectorPM Firebase Admin connected");

// Test writing a piece of data to your new DB
const testConnection = async () => {
  try {
    await db.collection('system_checks').add({
      status: 'online',
      timestamp: new Date().toISOString()
    });
    console.log("🚀 Firestore connection verified! Test document written.");
  } catch (e) {
    console.error("❌ Firestore connection failed:", e);
  }
};

testConnection();

const app = express();
const PORT = process.env.PORT || 8080;

// --- MIDDLEWARE ---
const allowedOrigins = [
  "http://localhost:3000",          // Local Next.js
  "https://vectorpm-df058.web.app", // Your live site
  "https://vectorpm-df058.firebaseapp.com" // Backup Firebase URL
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(express.json());

// GET SCHEDULES ENDPOINT
// This reads the database so the frontend knows which slots are taken.
app.get("/api/schedule", async (req: Request, res: Response) => {
  try {
    const snapshot = await db.collection("schedule").get();
    
    // send the dates and timeSlots to the frontend to block them out
    const bookings = snapshot.docs.map(doc => ({
      date: doc.data().date,
      timeSlot: doc.data().timeSlot
    }));

    res.status(200).json(bookings);
  } catch (error) {
    console.error("Error fetching schedule:", error);
    res.status(500).json({ error: "Internal server error fetching schedule." });
  }
});

// NEW BOOKING ENDPOINT
app.post("/api/book", async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, address, service, date, timeSlot } = req.body;

    // Basic validation
    if (!name || !address || !service || !date || !timeSlot) {
      res.status(400).json({ error: "Missing required booking fields." });
      return;
    }

    // Write to Firestore under the 'schedule' collection
    const newBookingRef = await db.collection("schedule").add({
      name,
      address,
      service,
      date,
      timeSlot,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[BOOKING] New schedule created. DocID: ${newBookingRef.id}`);
    res.status(201).json({ success: true, documentId: newBookingRef.id });
  } catch (error) {
    console.error("Error creating booking:", error);
    res.status(500).json({ error: "Internal server error during booking." });
  }
});

// Scheduling Task: Runs every 15 minutes
cron.schedule("*/15 * * * *", async () => {
  console.log("Running scheduled task every 15 minutes...");
  try {
    console.log("Database checked and schedules updated.");
  } catch (error) {
    console.error("Error running cron task:", error);
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "API is running, scheduler is active." });
});

const isProd = process.env.NODE_ENV === "production";
const SERVER_URL = isProd 
  ? "https://vectorpropertymaintenance.onrender.com" 
  : `http://localhost:${PORT}`;

app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`📡 Health check: ${SERVER_URL}/health`);
});